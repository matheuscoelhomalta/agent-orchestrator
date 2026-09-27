import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAcpRuntime, createFileSessionStore, createAgentRegistry } from 'acpx/runtime';
import { Store } from './store.mjs';
import { agyTurn } from './agy.mjs';
import { classify, configure, taskPrompt, timestamp } from './core.mjs';

export async function runWorker(stateDir, id, requestId) {
  const store = new Store(stateDir, { lockWaitMs: 2000 });
  let record = store.get(id);
  if (record.requestId !== requestId || record.state !== 'starting') return;
  let runtime, turn, timer;
  let output = '', execution, failure, permissionBlocked = false, promptDispatched = false, toolActivity = false;
  let responseOutput = '', responseMessageId, framedOutput = true, finalResponse;
  const messageIds = new Set();
  const patch = changes => store.update(id, current => current.requestId === requestId && ['starting', 'running', 'cancelling', 'unknown'].includes(current.state) ? { ...current, ...changes, updatedAt: timestamp() } : current);
  const event = value => {
    // Set before persisting: a failed write must not hide that a tool started.
    if (['tool_call', 'permission_denied'].includes(value.type)) toolActivity = true;
    const entry = store.appendEvent(id, { requestId, at: timestamp(), ...value });
    if (['text_delta', 'tool_call', 'status'].includes(value.type)) patch({ lastProgressAt: entry.at, lastEventSeq: entry.seq });
    return entry;
  };
  const cancelPath = path.join(stateDir, 'cancel', `${id}-${requestId}.json`);
  let cancelling = false;
  const checkCancel = async () => {
    if (cancelling || !fs.existsSync(cancelPath)) return;
    cancelling = true;
    event({ type: 'cancel_requested' });
    if (turn) await turn.cancel({ reason: 'Coordinator cancellation' });
  };
  try {
    patch({ runnerPid: process.pid, heartbeatAt: timestamp() });
    event({ type: 'runner_started', pid: process.pid });
    timer = setInterval(() => {
      try { patch({ heartbeatAt: timestamp() }); } catch (error) { failure = error; }
      checkCancel().catch(error => { failure = error; });
    }, 500);
    if (record.spec.protocol === 'agy-print') {
      await checkCancel();
      if (cancelling) { execution = { status: 'cancelled' }; return; }
      turn = await agyTurn({ record, text: taskPrompt(record, record.prompt), timeoutMs: record.timeoutMs, event,
        onInit: ({ conversationId, permissionMode }) => {
          // Model and effort are passed as flags but not reported back; only the permission mode is observable.
          const configuration = { requestedModel: record.spec.model, effort: record.spec.effort, mode: permissionMode ?? null };
          patch({ nativeSessionId: conversationId, configuration });
          event({ type: 'configuration_reported', ...configuration });
        },
        onSpawned: pid => { promptDispatched = true; patch({ adapterPid: pid, admission: 'dispatched' }); event({ type: 'adapter_spawned', pid }); event({ type: 'prompt_dispatched' }); },
        onExited: ({ pid, code, signal }) => { patch({ adapterPid: null }); event({ type: 'adapter_exited', pid, code, signal }); },
        onText: text => { output += text; event({ type: 'text_delta', text }); } });
      patch({ state: 'running', heartbeatAt: timestamp() });
      // A cancel seen while the process was spawning found no turn to signal.
      if (cancelling) await turn.cancel(); else await checkCancel();
      const settled = await turn.result;
      execution = settled.execution;
      finalResponse = settled.response;
      for (const action of settled.deniedActions) { permissionBlocked = true; event({ type: 'permission_denied', title: typeof action === 'string' ? action : action?.display_name ?? action?.action ?? JSON.stringify(action) }); }
      return;
    }
    runtime = createAcpRuntime({
      cwd: record.cwd,
      agentRegistry: createAgentRegistry({ overrides: { [record.harness]: record.spec.command } }),
      sessionStore: createFileSessionStore({ stateDir: path.join(stateDir, 'native', id) }),
      agentProcessEnv: record.spec.env || {},
      permissionMode: 'deny-all', nonInteractivePermissions: 'fail', timeoutMs: 30000,
      fs: false, terminal: false,
      onPermissionRequest: async request => {
        permissionBlocked = true;
        event({ type: 'permission_denied', title: request.raw.toolCall?.title, kind: request.inferredKind });
        return { outcome: 'reject_once' };
      },
      processLifecycle: {
        onSpawned: info => { patch({ adapterPid: info.pid }); event({ type: 'adapter_spawned', pid: info.pid, launchId: info.launchId }); },
        onExit: info => { try { patch({ adapterPid: null }); event({ type: 'adapter_exited', pid: info.pid, launchId: info.launchId }); } catch {} },
      },
    });
    if (record.nativeSessionId && !await runtime.findSession({ sessionKey: id, agent: record.harness })) throw Object.assign(new Error('Native runtime record missing; refusing a fresh session.'), { code: 'SESSION_RESUME_REQUIRED' });
    const handle = await runtime.ensureSession({ sessionKey: id, agent: record.harness, mode: 'persistent', cwd: record.cwd });
    if (record.nativeSessionId && handle.backendSessionId !== record.nativeSessionId) throw Object.assign(new Error('Native session identity changed; no prompt dispatched.'), { code: 'SESSION_ID_CHANGED' });
    patch({ nativeSessionId: handle.backendSessionId, handle });
    const verified = await configure(runtime, handle, record.spec);
    patch({ configuration: verified });
    event({ type: 'configuration_verified', ...verified });
    await checkCancel();
    if (cancelling) { execution = { status: 'cancelled' }; return; }
    turn = runtime.startTurn({ handle, text: taskPrompt(record, record.prompt), mode: 'prompt', requestId, timeoutMs: record.timeoutMs });
    patch({ state: 'running', heartbeatAt: timestamp() });
    const dispatched = turn.promptStarted.then(() => { promptDispatched = true; patch({ admission: 'dispatched' }); event({ type: 'prompt_dispatched' }); }, error => event({ type: 'prompt_not_confirmed', code: error.code }));
    const consumption = (async () => {
      for await (const item of turn.events) {
        if (item.type === 'text_delta' && item.stream !== 'thought') {
          output += item.text;
          // Codex and Claude emit progress notes and the final answer as separate producer messages.
          // Missing or interleaved IDs leave the whole stream subject to validation.
          if (framedOutput) {
            if (typeof item.messageId !== 'string' || !item.messageId.trim()) framedOutput = false;
            else {
              if (item.messageId !== responseMessageId) {
                if (messageIds.has(item.messageId)) framedOutput = false;
                else { messageIds.add(item.messageId); responseMessageId = item.messageId; responseOutput = ''; }
              }
              responseOutput += item.text;
            }
          }
        }
        // Do not persist thoughts or tool payloads; the native harness owns its full history.
        if (item.type === 'text_delta' && item.stream !== 'thought') event({ type: 'text_delta', text: item.text, ...(item.messageId ? { messageId: item.messageId } : {}) });
        else if (item.type === 'tool_call') event({ type: 'tool_call', title: item.title, status: item.status, kind: item.kind });
        else if (item.type === 'status') event({ type: 'status', text: item.text });
      }
    })();
    const consumed = consumption.catch(error => { failure = error; turn.cancel({ reason: 'Observer persistence failed' }).catch(() => {}); });
    execution = await turn.result;
    await consumed;
    await dispatched;
  } catch (error) {
    failure = error;
  } finally {
    clearInterval(timer);
    try { await runtime?.shutdown(); } catch (error) { failure ||= error; }
    execution ||= { status: 'failed', error: { code: failure?.code || 'RUNNER_FAILED', message: failure?.message || 'No settled result.' } };
    if (failure) execution = { status: 'failed', error: { code: failure.code || 'RUNNER_FAILED', message: failure.message } };
    // agy reports its final answer separately from progress text, like a framed ACP final message.
    if (finalResponse !== undefined) { responseOutput = finalResponse; responseMessageId = null; }
    else if (!framedOutput || !responseMessageId) { responseOutput = output; responseMessageId = null; }
    const result = classify(responseOutput, execution);
    // Side effects need tools. A dispatched turn that failed without any tool activity cannot have changed anything.
    if (execution.status === 'failed' && promptDispatched && toolActivity) result.state = 'unknown';
    // Codex ends a turn as cancelled after a refused permission; only a coordinator cancel is a real cancellation.
    if (permissionBlocked && result.state !== 'unknown' && !(result.state === 'cancelled' && cancelling)) {
      result.state = 'needs_input';
      result.response = { status: 'needs_input', question: 'A native tool permission request was denied. Review the recorded request and authorization before continuing; this CLI cannot approve a suspended dialog.' };
    }
    patch({ ...result, execution, output, responseOutput, responseMessageId, runnerDone: true, error: execution.error || null, heartbeatAt: timestamp() });
    event({ type: 'turn_settled', execution, taskState: result.state });
    try { fs.unlinkSync(cancelPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  runWorker(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

import fs from 'node:fs';
import path from 'node:path';
import { createAcpRuntime, createFileSessionStore, createAgentRegistry } from 'acpx/runtime';
import { Store } from './store.mjs';
import { classify, configure, taskPrompt, timestamp } from './core.mjs';

export async function runWorker(stateDir, id, requestId) {
  const store = new Store(stateDir);
  let record = store.get(id);
  if (record.requestId !== requestId || record.state !== 'starting') return;
  let runtime, turn, timer;
  let output = '', execution, failure, permissionBlocked = false, promptDispatched = false;
  const patch = changes => store.update(id, current => current.requestId === requestId && ['starting', 'running', 'cancelling', 'unknown'].includes(current.state) ? { ...current, ...changes, updatedAt: timestamp() } : current);
  const event = value => {
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
        onSpawned: info => event({ type: 'adapter_spawned', pid: info.pid, launchId: info.launchId }),
        onExit: info => { try { event({ type: 'adapter_exited', pid: info.pid, launchId: info.launchId }); } catch {} },
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
        if (item.type === 'text_delta' && item.stream !== 'thought') output += item.text;
        // Do not persist thoughts or tool payloads; the native harness owns its full history.
        if (item.type === 'text_delta' && item.stream !== 'thought') event({ type: 'text_delta', text: item.text });
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
    const result = classify(output, execution);
    if (execution.status === 'failed' && promptDispatched) result.state = 'unknown';
    if (permissionBlocked && result.state !== 'cancelled' && result.state !== 'unknown') {
      result.state = 'needs_input';
      result.response = { status: 'needs_input', question: 'A native tool permission request was denied. Review the recorded request and authorization before continuing; this CLI cannot approve a suspended dialog.' };
    }
    patch({ ...result, execution, output, runnerDone: true, error: execution.error || null, heartbeatAt: timestamp() });
    event({ type: 'turn_settled', execution, taskState: result.state });
    try { fs.unlinkSync(cancelPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runWorker(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fail } from './core.mjs';

// Antigravity has no ACP mode; its documented headless interface is `--print --output-format stream-json`.
// Each turn is one process. `--conversation` resumes the native conversation.
export async function agyTurn({ record, text, event, onSpawned, onExited, onInit, onText }) {
  const { spec, timeoutMs } = record;
  const args = [...spec.command.slice(1), '--print', text, '--output-format', 'stream-json', '--model', spec.model, '--effort', spec.effort, '--print-timeout', `${Math.ceil(timeoutMs / 1000)}s`];
  if (record.nativeSessionId) args.push('--conversation', record.nativeSessionId);
  const child = spawn(spec.command[0], args, { cwd: record.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let cancelled = false, stderr = '', timeoutNotice, result, failure, session;
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const spawned = await new Promise(resolve => { child.once('spawn', () => resolve(true)); child.once('error', error => { failure = error; resolve(false); }); });
  if (!spawned) throw Object.assign(failure, { code: 'SPAWN_FAILED' });
  // The prompt travels in argv, so it is delivered once the process exists.
  try { onSpawned(child.pid); } catch (error) { child.kill('SIGKILL'); throw error; }
  // Backstop for a CLI that ignores its own --print-timeout.
  const guard = setTimeout(() => { failure ||= fail('TIMEOUT', `Timed out after ${timeoutMs}ms`); child.kill('SIGKILL'); }, timeoutMs + 15000);
  child.stderr.on('data', chunk => {
    stderr += chunk;
    timeoutNotice ||= /\[agy\] print timeout[^\n]*/.exec(stderr)?.[0];
    stderr = stderr.slice(-4000);
  });
  // Bind the conversation once, from init or (if init was unreadable) the result.
  const identify = (conversationId, permissionMode) => {
    if (!conversationId) return true;
    const expected = session || record.nativeSessionId;
    if (expected && conversationId !== expected) {
      failure = fail('SESSION_ID_CHANGED', 'Native conversation identity changed.');
      child.kill('SIGKILL');
      return false;
    }
    if (!session) { session = conversationId; onInit({ conversationId, permissionMode }); }
    return true;
  };
  const turn = {
    cancel: async () => {
      cancelled = true;
      child.kill('SIGINT');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    },
    result: (async () => {
      try {
        for await (const line of readline.createInterface({ input: child.stdout })) {
          let item;
          try { item = JSON.parse(line); } catch { continue; }
          if (!item || typeof item !== 'object') continue;
          if (item.event === 'init') { if (!identify(item.conversation_id, item.init?.permission_mode)) break; }
          else if (item.event === 'step_update') {
            const step = item.step_update || {};
            if (step.step_type === 'agent_response' && typeof step.text_delta === 'string') onText(step.text_delta);
            // A started tool counts as activity even if the process dies before it finishes.
            else if (step.step_type === 'tool') event({ type: 'tool_call', title: step.tool_name, status: String(step.state || '').toLowerCase() });
          } else if (item.event === 'result') {
            result = item.result;
            if (!identify(result?.conversation_id)) break;
          }
        }
      } catch (error) {
        // Never leave agy running unobserved after the observer fails.
        failure ||= error;
        child.kill('SIGKILL');
      }
      const { code, signal } = await exited;
      clearTimeout(guard);
      try { onExited({ pid: child.pid, code, signal }); } catch (error) { failure ||= error; }
      const deniedActions = Array.isArray(result?.denied_actions) ? result.denied_actions : [];
      if (cancelled) return { execution: { status: 'cancelled' }, deniedActions };
      if (failure) return { execution: { status: 'failed', error: { code: failure.code, message: failure.message } }, deniedActions };
      // agy reports its own print timeout as SUCCESS with a partial response and only a stderr notice.
      if (timeoutNotice) return { execution: { status: 'failed', error: { code: 'TIMEOUT', message: timeoutNotice } }, deniedActions };
      if (code === 0 && result?.status === 'SUCCESS') return { execution: { status: 'completed', usage: result.usage }, response: result.response ?? '', deniedActions };
      const detail = /AGY_ERROR: (.*)/.exec(stderr)?.[1];
      return { execution: { status: 'failed', error: { code: 'AGY_FAILED', message: (detail || stderr.trim() || `agy exited ${code ?? signal}${result?.status ? ` with ${result.status}` : ''}`).slice(0, 1000) } }, deniedActions };
    })(),
  };
  return turn;
}

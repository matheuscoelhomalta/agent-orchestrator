import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const activeStates = new Set(['starting', 'running', 'cancelling']);
export function fail(code, message) { return Object.assign(new Error(message), { code }); }
export const timestamp = () => new Date().toISOString();
export function executable(name) {
  if (path.isAbsolute(name) || name.includes(path.sep)) {
    try { fs.accessSync(name, fs.constants.X_OK); return fs.statSync(name).isFile() ? path.resolve(name) : null; } catch { return null; }
  }
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(directory, name);
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate; } catch {}
  }
  return null;
}

export function defaults() {
  const modules = fileURLToPath(new URL('../node_modules/', import.meta.url));
  return {
    codex: { command: [process.execPath, path.join(modules, '@agentclientprotocol/codex-acp/dist/index.js')], model: 'gpt-5.6-sol', effort: 'high', effortKey: 'reasoning_effort', mode: 'agent', nativeCommand: 'codex', env: { ...(executable('codex') ? { CODEX_PATH: executable('codex') } : {}), INITIAL_AGENT_MODE: 'agent', NO_BROWSER: '1' } },
    claude: { command: [process.execPath, path.join(modules, '@agentclientprotocol/claude-agent-acp/dist/index.js')], model: 'claude-opus-5-5', modelAlias: 'opus', effort: 'medium', effortKey: 'effort', mode: 'auto', nativeCommand: 'claude', env: { ...(executable('claude') ? { CLAUDE_CODE_EXECUTABLE: executable('claude') } : {}) } },
  };
}

export function readConfig(filename) {
  if (!filename) return defaults();
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!config || typeof config !== 'object' || Array.isArray(config) || !Object.keys(config).length) throw fail('INVALID_INPUT', 'Config must be a nonempty harness map.');
  for (const spec of Object.values(config)) validateSpec(spec);
  return config;
}

export function validateSpec(spec) {
  if (!spec || !Array.isArray(spec.command) || !spec.command.length || spec.command.some(x => typeof x !== 'string' || !x)) throw fail('INVALID_INPUT', 'Harness command must be a nonempty argv array.');
  for (const key of ['model', 'effort', 'effortKey', 'mode']) if (typeof spec[key] !== 'string' || !spec[key]) throw fail('INVALID_INPUT', `Harness requires ${key}.`);
  if (['bypassPermissions', 'dontAsk', 'full-access', 'agent-full-access', 'yolo'].includes(spec.mode) || spec.env?.INITIAL_AGENT_MODE === 'agent-full-access') throw fail('INVALID_INPUT', 'Permission bypass modes are unsupported.');
  if (spec.env && (typeof spec.env !== 'object' || Array.isArray(spec.env) || Object.values(spec.env).some(x => typeof x !== 'string'))) throw fail('INVALID_INPUT', 'Harness env values must be strings.');
  for (const key of Object.keys(spec.env || {})) if (!['CODEX_PATH','CLAUDE_CODE_EXECUTABLE','INITIAL_AGENT_MODE','NO_BROWSER'].includes(key)) throw fail('INVALID_INPUT', `Unsupported persisted environment key ${key}. Credentials must stay in native login stores.`);
  if (spec.command.some(x => /--(dangerously-skip-permissions|always-approve|yolo|full-access|dangerously-bypass-approvals-and-sandbox)/.test(x))) throw fail('INVALID_INPUT', 'Permission bypass arguments are unsupported.');
}

export function defaultStateDir() { return path.join(os.homedir(), '.local/state/agent-orchestrator'); }

export function classify(output, execution) {
  if (execution.status === 'cancelled') return { state: 'cancelled', response: null };
  if (execution.status !== 'completed') {
    const code = `${execution.error?.code || ''} ${execution.error?.detailCode || ''}`;
    return { state: /UNKNOWN|DISCONNECT|CONNECTION|BACKEND_UNAVAILABLE/.test(code) ? 'unknown' : 'failed', response: null };
  }
  let response;
  try { response = JSON.parse(output.trim()); } catch { return { state: 'invalid_output', response: null }; }
  if (!response || typeof response !== 'object' || Array.isArray(response)) return { state: 'invalid_output', response: null };
  if (response.status === 'completed' && typeof response.summary === 'string' && response.summary.trim() && Array.isArray(response.evidence) && response.evidence.every(x => typeof x === 'string')) return { state: 'needs_review', response };
  if (response.status === 'needs_input' && typeof response.question === 'string' && response.question.trim()) return { state: 'needs_input', response };
  if (response.status === 'failed' && typeof response.reason === 'string' && response.reason.trim()) return { state: 'failed', response };
  return { state: 'invalid_output', response: null };
}

export function taskPrompt(record, text) {
  return `You are a delegated worker. Objective: ${record.objective}\nAcceptance criteria: ${record.criteria}\nAuthorized scope: ${record.scope}\n${text}\nReturn exactly one JSON object, without markdown fences. For completion: {"status":"completed","summary":"...","evidence":["..."]}. Evidence must reference checks or artifacts supporting acceptance. For a material missing decision: {"status":"needs_input","question":"..."}. For failure: {"status":"failed","reason":"..."}. Do not expand scope or bypass permissions. Your completion claim will be reviewed by the coordinator.`;
}

export async function configure(runtime, handle, spec) {
  await runtime.setModel({ handle, model: spec.model });
  await runtime.setConfigOption({ handle, key: spec.effortKey, value: spec.effort });
  const accepted = await runtime.setConfigOption({ handle, key: 'mode', value: spec.mode });
  if (accepted?.configOptions?.find(x => x.id === 'mode')?.currentValue !== spec.mode) throw fail('CONFIG_MISMATCH', 'Native permission mode was not acknowledged.');
  const status = await runtime.getStatus({ handle });
  const options = status.details?.configOptions || [];
  for (const [key, value] of [['mode', spec.mode], [spec.effortKey, spec.effort]]) if (options.find(x => x.id === key)?.currentValue !== value) throw fail('CONFIG_MISMATCH', `Native ${key} does not match requested value.`);
  const current = status.models?.currentModelId;
  if (typeof current !== 'string' || (current !== spec.model && (!spec.modelAlias || current !== spec.modelAlias))) throw fail('CONFIG_MISMATCH', `Native model ${current || 'unknown'} differs from ${spec.model}.`);
  return { model: current, requestedModel: spec.model, effort: spec.effort, mode: spec.mode };
}

export function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

export function reconcile(store, id) {
  const record = store.get(id);
  if (!activeStates.has(record.state)) return record;
  const stale = Date.now() - Date.parse(record.heartbeatAt || record.updatedAt) > 45000;
  const dead = record.runnerPid && !alive(record.runnerPid);
  if (!stale && !dead) return record;
  return store.update(id, current => {
    if (current.requestId !== record.requestId || !activeStates.has(current.state)) return current;
    const latestStale = Date.now() - Date.parse(current.heartbeatAt || current.updatedAt) > 45000;
    if (!latestStale && !(current.runnerPid && !alive(current.runnerPid))) return current;
    return { ...current, state: 'unknown', updatedAt: timestamp(), error: { code: 'RUNNER_OUTCOME_UNKNOWN', message: 'Runner disappeared or its heartbeat expired. Inspect side effects before explicitly resolving; no work was resubmitted.' } };
  });
}

export function summarize(record) {
  const fields = ['id','requestId','harness','state','admission','nativeSessionId','configuration','turn','corrections','runnerPid','runnerDone','createdAt','updatedAt','heartbeatAt','lastProgressAt','lastEventSeq','error','acceptance','resolution'];
  const result = Object.fromEntries(fields.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
  if (record.response) result.response = { status: record.response.status, ...(record.response.question ? { question: record.response.question } : {}), ...(record.response.reason ? { reason: record.response.reason } : {}) };
  return result;
}

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

let sessionId, pending, permission;
let model = 'fixture-model';
const values = { mode: 'default', effort: 'low', model };
const configOptions = () => Object.entries(values).map(([id, currentValue]) => ({ id, name: id, type: 'select', currentValue, options: [{ value: currentValue, name: currentValue }] }));
const send = value => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
const result = (id, value) => send({ id, result: value });
const session = () => ({ sessionId, configOptions: configOptions(), models: { currentModelId: model, availableModels: [{ modelId: model, name: model }] }, modes: { currentModeId: values.mode, availableModes: [{ id: values.mode, name: values.mode }] } });
const finish = (id, output) => {
  send({ method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: output } } } });
  result(id, { stopReason: 'end_turn' });
};
const lines = readline.createInterface({ input: process.stdin });
lines.on('close', () => process.exit(0));
lines.on('line', line => {
  const message = JSON.parse(line);
  const { id, method, params = {} } = message;
  if (!method && permission && id === permission.id) {
    const rejected = message.result?.outcome?.outcome === 'selected' && message.result.outcome.optionId === 'reject';
    fs.writeFileSync(path.join(process.cwd(), `permission-${sessionId}.json`), JSON.stringify(message.result));
    if (permission.timeout) { pending = permission.promptId; permission = null; return; }
    finish(permission.promptId, JSON.stringify({ status: rejected ? 'failed' : 'completed', reason: 'permission rejected', summary: 'permission allowed', evidence: ['permission protocol'] }));
    permission = null;
    return;
  }
  if (method === 'initialize') result(id, { protocolVersion: 1, agentCapabilities: { loadSession: true }, agentInfo: { name: 'fixture', version: '1' } });
  else if (method === 'session/new') {
    sessionId = randomUUID();
    fs.writeFileSync(path.join(process.cwd(), `session-${sessionId}.json`), JSON.stringify({ sessionId }));
    result(id, session());
  } else if (method === 'session/load') {
    sessionId = params.sessionId;
    if (!fs.existsSync(path.join(process.cwd(), `session-${sessionId}.json`)) || fs.existsSync(path.join(process.cwd(), 'fail-resume'))) send({ id, error: { code: -32000, message: 'Fixture session unavailable' } });
    else result(id, session());
  } else if (method === 'session/set_model') { model = params.modelId; values.model = model; result(id, { configOptions: configOptions() }); }
  else if (method === 'session/set_config_option') { values[params.configId] = params.value; result(id, { configOptions: configOptions() }); }
  else if (method === 'session/set_mode') { values.mode = params.modeId; result(id, { configOptions: configOptions() }); }
  else if (method === 'session/prompt') {
    const text = params.prompt.map(x => x.text || '').join('');
    const scenario = [...text.matchAll(/CASE:(\w+)/g)].at(-1)?.[1];
    fs.appendFileSync(path.join(process.cwd(), `prompts-${sessionId}.ndjson`), JSON.stringify({ text, pid: process.pid }) + '\n');
    if (scenario === 'disconnect') process.exit(7);
    if (scenario === 'long') { pending = id; return; }
    if (['framed', 'unframed', 'interleaved', 'badframe'].includes(scenario)) {
      const chunk = (text, messageId) => send({ method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text }, ...(messageId ? { messageId } : {}) } } });
      const answer = JSON.stringify({ status: 'completed', summary: 'Framed answer', evidence: ['fixture inspected'] });
      chunk('Inspecting fixture.', 'progress');
      if (scenario === 'unframed') chunk(answer);
      else {
        chunk(scenario === 'badframe' ? 'extra prose' + answer : answer.slice(0, 20), 'answer');
        if (scenario === 'interleaved') chunk('more progress', 'progress');
        if (scenario !== 'badframe') chunk(answer.slice(20), 'answer');
      }
      result(id, { stopReason: 'end_turn' }); return;
    }
    if (scenario === 'permission' || scenario === 'permission_timeout') {
      permission = { id: 'fixture-permission', promptId: id, timeout: scenario === 'permission_timeout' };
      send({ id: permission.id, method: 'session/request_permission', params: { sessionId, toolCall: { toolCallId: 'fixture-tool', title: 'fixture write', kind: 'edit', status: 'pending' }, options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject once', kind: 'reject_once' }] } });
    } else if (scenario === 'malformed') finish(id, 'malformed output');
    else if (scenario === 'input') finish(id, JSON.stringify({ status: 'needs_input', question: 'Which fixture choice?' }));
    else finish(id, JSON.stringify({ status: 'completed', summary: 'Fixture completed', evidence: [`native session ${sessionId}`] }));
  } else if (method === 'session/cancel') { if (pending !== undefined) { result(pending, { stopReason: 'cancelled' }); pending = undefined; } }
  else if (id !== undefined) send({ id, error: { code: -32601, message: `Unsupported method ${method}` } });
});

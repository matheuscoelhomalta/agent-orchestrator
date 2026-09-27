import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Mimics `agy --print TEXT --output-format stream-json [--conversation ID]`.
const args = process.argv.slice(2);
const flag = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const text = flag('--print');
const scenario = [...text.matchAll(/CASE:(\w+)/g)].at(-1)?.[1];
const resumed = flag('--conversation');
fs.appendFileSync(path.join(process.cwd(), 'agy-calls.ndjson'), JSON.stringify({ args }) + '\n');
if (resumed && !fs.existsSync(path.join(process.cwd(), `conversation-${resumed}`))) {
  process.stderr.write('AGY_ERROR: {"status":"NOT_FOUND","message":"conversation not found"}\n');
  process.exit(3);
}
const conversation_id = resumed || randomUUID();
fs.writeFileSync(path.join(process.cwd(), `conversation-${conversation_id}`), '');
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const step = (step_index, fields) => emit({ event: 'step_update', step_update: { conversation_id, step_index, ...fields } });
emit({ event: 'init', conversation_id, init: { cwd: process.cwd(), tools: [], permission_mode: 'always-proceed' } });
step(0, { state: 'DONE', step_type: 'user_input' });
if (scenario === 'long') { process.on('SIGINT', () => process.exit(130)); setInterval(() => {}, 1000); }
else if (scenario === 'timeout') {
  step(1, { state: 'ACTIVE', step_type: 'agent_response', text_delta: 'partial' });
  process.stderr.write('[agy] print timeout after 1s with turn in progress; returning partial output\n');
  emit({ event: 'result', result: { conversation_id, status: 'SUCCESS', response: 'partial' } });
}
else if (scenario === 'activecrash') { step(1, { state: 'ACTIVE', step_type: 'tool', tool_name: 'run_command' }); process.exit(9); }
else if (scenario === 'switch') emit({ event: 'result', result: { conversation_id: randomUUID(), status: 'SUCCESS', response: JSON.stringify({ status: 'completed', summary: 'x', evidence: [] }) } });
else if (scenario === 'toolfail') { step(1, { state: 'DONE', step_type: 'tool', tool_name: 'run_command' }); process.stderr.write('AGY_ERROR: {"status":"UNAVAILABLE","message":"backend unavailable"}\n'); process.exit(3); }
else if (scenario === 'fail') { process.stderr.write('AGY_ERROR: {"status":"UNAVAILABLE","message":"backend unavailable"}\n'); process.exit(3); }
else {
  const answer = scenario === 'malformed' ? 'not json' : scenario === 'input' ? JSON.stringify({ status: 'needs_input', question: 'Which fixture choice?' })
    : JSON.stringify({ status: 'completed', summary: 'Fixture completed', evidence: [`conversation ${conversation_id}`] });
  step(1, { state: 'DONE', step_type: 'agent_response', text_delta: 'Inspecting fixture.\n' });
  step(2, { state: 'DONE', step_type: 'tool', tool_name: 'view_file' });
  step(3, { state: 'DONE', step_type: 'agent_response', text_delta: answer });
  emit({ event: 'result', result: { conversation_id, status: 'SUCCESS', response: answer, ...(scenario === 'denied' ? { denied_actions: [{ action: 'command', display_name: 'RunCommand' }] } : {}) } });
}

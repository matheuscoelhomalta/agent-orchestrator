import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { supportedNode, classify, configure, reconcile, validateSpec, strict } from '../src/core.mjs';
import { main } from '../src/cli.mjs';
import { Store } from '../src/store.mjs';

test('execution and task acceptance remain separate', () => {
  const completed = { status: 'completed' };
  assert.equal(classify('{"status":"completed","summary":"done","evidence":[]}', completed).state, 'needs_review');
  assert.equal(classify('{"status":"needs_input","question":"Which directory?"}', completed).state, 'needs_input');
  for (const value of ['', '```json\n{}\n```', 'null', '[]', '{"status":"completed"}', '{"status":"completed","summary":"ok","evidence":[{}]}']) assert.equal(classify(value, completed).state, 'invalid_output');
  assert.equal(classify('{}', { status: 'cancelled' }).state, 'cancelled');
  assert.equal(classify('', { status: 'failed', error: { code: 'WATCH_OUTCOME_UNKNOWN' } }).state, 'unknown');
  assert.equal(classify('', { status: 'failed', error: { code: 'SESSION_RESUME_REQUIRED' } }).state, 'failed');
});

test('configuration is verified before prompting and accepts only explicit canonical alias', async () => {
  const spec = { model: 'requested', modelAlias: 'canonical', mode: 'auto', effortKey: 'effort', effort: 'low' };
  const options = [{ id: 'mode', currentValue: 'auto' }, { id: 'effort', currentValue: 'low' }];
  const runtime = { setModel: async () => {}, setConfigOption: async () => ({ configOptions: options }), getStatus: async () => ({ models: { currentModelId: 'canonical' }, details: { configOptions: options } }) };
  assert.equal((await configure(runtime, {}, spec)).model, 'canonical');
  runtime.getStatus = async () => ({ models: { currentModelId: 'other' }, details: { configOptions: options } });
  await assert.rejects(configure(runtime, {}, spec), { code: 'CONFIG_MISMATCH' });
  runtime.setConfigOption = async () => ({ configOptions: [{ id: 'mode', currentValue: 'default' }] });
  await assert.rejects(configure(runtime, {}, spec), { code: 'CONFIG_MISMATCH' });
});

test('heartbeat expiry produces unknown instead of resubmitting work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-reconcile-'));
  try {
    const store = new Store(dir);
    store.create({ id: 'worker', state: 'running', requestId: 'r1', runnerPid: process.pid, updatedAt: new Date(0).toISOString() });
    const next = reconcile(store, 'worker');
    assert.equal(next.state, 'unknown');
    assert.equal(next.requestId, 'r1');
    assert.equal(next.error.code, 'RUNNER_OUTCOME_UNKNOWN');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('configuration excludes persisted credentials and permission bypass', () => {
  const spec = { command: ['node', 'adapter.js'], model: 'm', effort: 'low', effortKey: 'effort', mode: 'default' };
  validateSpec(spec);
  assert.throws(() => validateSpec({ ...spec, env: { API_KEY: 'redacted-fixture' } }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateSpec({ ...spec, mode: 'yolo' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateSpec({ ...spec, mode: 'agent-full-access' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateSpec({ ...spec, env: { INITIAL_AGENT_MODE: 'agent-full-access' } }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateSpec({ ...spec, command: ['agent', '--dangerously-skip-permissions'] }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateSpec({ ...spec, command: ['grok', 'agent', '--always-approve', 'stdio'] }), { code: 'INVALID_INPUT' });
});

test('configuration refuses unknown model without a declared alias', async () => {
  const options = [{ id: 'mode', currentValue: 'default' }, { id: 'effort', currentValue: 'low' }];
  const runtime = { setModel: async () => {}, setConfigOption: async () => ({ configOptions: options }), getStatus: async () => ({ details: { configOptions: options } }) };
  await assert.rejects(configure(runtime, {}, { model: 'expected', mode: 'default', effort: 'low', effortKey: 'effort' }), { code: 'CONFIG_MISMATCH' });
});

test('doctor refuses missing custom executable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-doctor-'));
  try {
    const config = path.join(dir, 'config.json');
    fs.writeFileSync(config, JSON.stringify({ missing: { command: [path.join(dir, 'missing-executable')], model: 'm', mode: 'default', effort: 'low', effortKey: 'effort' } }));
    assert.equal((await main(['doctor', '--config', config])).ok, false);
    fs.writeFileSync(config, '{}');
    await assert.rejects(main(['doctor', '--config', config]), { code: 'INVALID_INPUT' });
    const native = path.join(dir, 'not-executable'); fs.writeFileSync(native, 'fixture', { mode: 0o600 });
    fs.writeFileSync(config, JSON.stringify({ missing: { command: [process.execPath], model: 'm', mode: 'default', effort: 'low', effortKey: 'effort', env: { CODEX_PATH: native } } }));
    assert.equal((await main(['doctor', '--config', config])).ok, false);
  } finally { fs.rmSync(dir, { recursive: true }); }
});


test('Node support matches the pinned runtime minimum', () => {
  for (const version of ['v20.19.0', 'v22.12.9', 'invalid']) assert.equal(supportedNode(version), false);
  for (const version of ['v22.13.0', 'v22.13.1', 'v26.9.0']) assert.equal(supportedNode(version), true);
});

test('doctor checks every native executable override', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-overrides-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ fixture: { command: [process.execPath], model: 'm', mode: 'default', effort: 'low', effortKey: 'effort', env: { CODEX_PATH: process.execPath, CLAUDE_CODE_EXECUTABLE: path.join(dir, 'missing') } } }));
  const result = await main(['doctor', '--config', config]);
  assert.equal(result.ok, false); assert.equal(result.harnesses[0].nativeOverridePresent, false);
});

test('strict settings map each built-in harness to its verified native boundary', () => {
  const base = { command: ['x'], model: 'm', effort: 'e', effortKey: 'k', mode: 'agent', env: { NO_BROWSER: '1' } };
  assert.deepEqual(strict('codex', base), { ...base, mode: 'read-only', env: { NO_BROWSER: '1', INITIAL_AGENT_MODE: 'read-only' } });
  assert.equal(strict('claude', { ...base, mode: 'auto' }).mode, 'acceptEdits');
  assert.deepEqual(strict('agy', { ...base, protocol: 'agy-print', command: ['/bin/agy'] }).command, ['/bin/agy', '--sandbox']);
  for (const spec of [strict('codex', base), strict('claude', base)]) validateSpec(spec);
  assert.throws(() => strict('opencode', base), /no verified settings/);
});

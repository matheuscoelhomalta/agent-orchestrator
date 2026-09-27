import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { main } from '../src/cli.mjs';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixture-agent.mjs', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const active = new Set(['starting', 'running', 'cancelling']);
async function setup(t, harness = 'fixture') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-cli-test-'));
  const state = path.join(root, 'state');
  const cwd = path.join(root, 'work'); fs.mkdirSync(cwd);
  const config = path.join(root, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ [harness]: { command: [process.execPath, fixture], model: 'fixture-model', effort: 'low', effortKey: 'effort', mode: 'default' } }));
  let serial = 0;
  const prompt = text => { const filename = path.join(root, `prompt-${serial++}`); fs.writeFileSync(filename, text); return filename; };
  const run = async (...args) => {
    try { const { stdout } = await exec(process.execPath, [cli, ...args, '--state-dir', state, '--json'], { timeout: 15000 }); return JSON.parse(stdout).data; }
    catch (error) { error.response = JSON.parse(error.stderr || error.stdout || '{}'); throw error; }
  };
  const start = (text, ...args) => run('start', '--harness', harness, '--config', config, '--cwd', cwd, '--prompt-file', prompt(text), '--criteria', 'Fixture protocol observed', '--scope', cwd, ...args);
  const poll = async (id, predicate = r => !active.has(r.state)) => {
    const until = Date.now() + 20000;
    let record;
    while (Date.now() < until) { record = await run('status', id); if (predicate(record)) return record; await sleep(70); }
    assert.fail(`Timed out: ${JSON.stringify(record)}; logs ${fs.readdirSync(state).filter(x => x.endsWith('.log')).map(x => fs.readFileSync(path.join(state, x), 'utf8')).join('\n')}`);
  };
  t.after(async () => {
    if (fs.existsSync(path.join(state, 'records'))) {
      for (const filename of fs.readdirSync(path.join(state, 'records'))) {
        const record = JSON.parse(fs.readFileSync(path.join(state, 'records', filename)));
        if (active.has(record.state)) { try { await run('cancel', record.id); await poll(record.id); } catch {} }
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { run, start, poll, prompt, cwd, state, config };
}

test('real CLI starts durably, reviews completion, accepts explicitly, and rejects stale acceptance', async t => {
  const h = await setup(t); const started = await h.start('CASE:complete');
  assert.match(started.id, /^[a-f0-9-]+$/); assert.equal(started.runnerDone, false);
  assert.ok(fs.existsSync(path.join(h.state, 'records', `${started.id}.json`)));
  const done = await h.poll(started.id); assert.equal(done.state, 'needs_review');
  const result = await h.run('result', started.id); assert.equal(result.acceptance, null); assert.equal(result.execution.status, 'completed'); assert.ok(result.response.evidence.length);
  await assert.rejects(h.run('accept', started.id, '--request', 'stale', '--note', 'checked'), e => e.response.error.code === 'INVALID_STATE');
  const accepted = await h.run('accept', started.id, '--request', done.requestId, '--note', 'Verified fixture evidence'); assert.equal(accepted.state, 'accepted');
  const next = await h.run('reply', started.id, '--prompt-file', h.prompt('CASE:complete followup')); const continued = await h.poll(next.id);
  assert.equal(continued.nativeSessionId, done.nativeSessionId); assert.notEqual(continued.requestId, done.requestId);
  await assert.rejects(h.run('accept', started.id, '--request', done.requestId, '--note', 'old result'), e => e.response.error.code === 'INVALID_STATE');
});

test('parallel tasks have isolated native sessions', async t => {
  const h = await setup(t); const starts = await Promise.all([h.start('CASE:complete one'), h.start('CASE:complete two')]);
  const results = await Promise.all(starts.map(x => h.poll(x.id))); assert.equal(results[0].state, 'needs_review'); assert.equal(results[1].state, 'needs_review'); assert.notEqual(results[0].nativeSessionId, results[1].nativeSessionId);
});

test('invalid output allows only one format correction', async t => {
  const h = await setup(t); const first = await h.start('CASE:malformed'); const bad = await h.poll(first.id); assert.equal(bad.state, 'invalid_output');
  await assert.rejects(h.run('reply', first.id, '--prompt-file', h.prompt('CASE:malformed')), e => e.response.error.code === 'INVALID_STATE');
  await h.run('reply', first.id, '--correction', '--prompt-file', h.prompt('CASE:malformed')); const again = await h.poll(first.id); assert.equal(again.state, 'invalid_output'); assert.equal(again.corrections, 1); assert.equal(again.nativeSessionId, bad.nativeSessionId);
  await assert.rejects(h.run('reply', first.id, '--correction', '--prompt-file', h.prompt('CASE:complete')), e => e.response.error.code === 'INVALID_STATE');
  await assert.rejects(h.run('reply', first.id, '--prompt-file', h.prompt('CASE:malformed')), e => e.response.error.code === 'INVALID_STATE');
});

test('active cancellation settles before same-session followup', async t => {
  const h = await setup(t); const first = await h.start('CASE:long'); const running = await h.poll(first.id, r => r.state === 'running' && r.admission === 'dispatched');
  const cancel = await h.run('cancel', first.id); assert.equal(cancel.cancellationRequested, true); const cancelled = await h.poll(first.id); assert.equal(cancelled.state, 'cancelled');
  await h.run('reply', first.id, '--prompt-file', h.prompt('CASE:complete')); const done = await h.poll(first.id); assert.equal(done.state, 'needs_review'); assert.equal(done.nativeSessionId, running.nativeSessionId);
});

test('needs_input resumes after coordinator reply', async t => {
  const h = await setup(t); const first = await h.start('CASE:input'); const waiting = await h.poll(first.id); assert.equal(waiting.state, 'needs_input'); assert.equal(waiting.response.question, 'Which fixture choice?');
  await h.run('reply', first.id, '--prompt-file', h.prompt('CASE:complete choice A')); const done = await h.poll(first.id); assert.equal(done.state, 'needs_review'); assert.equal(done.nativeSessionId, waiting.nativeSessionId);
});

test('real ACP permission request is rejected and surfaced', async t => {
  const h = await setup(t); const first = await h.start('CASE:permission'); const done = await h.poll(first.id); assert.equal(done.state, 'needs_input');
  const events = await h.run('events', first.id); assert.ok(events.events.some(x => x.type === 'permission_denied'));
  const callback = JSON.parse(fs.readFileSync(path.join(h.cwd, `permission-${done.nativeSessionId}.json`))); assert.deepEqual(callback.outcome, { outcome: 'selected', optionId: 'reject' });
});

test('abrupt runner loss is unknown and blocks blind resubmission', async t => {
  const h = await setup(t); const first = await h.start('CASE:long'); const running = await h.poll(first.id, r => r.state === 'running' && r.admission === 'dispatched');
  process.kill(running.runnerPid, 'SIGKILL'); const unknown = await h.poll(first.id); assert.equal(unknown.state, 'unknown'); assert.equal(unknown.error.code, 'RUNNER_OUTCOME_UNKNOWN');
  await assert.rejects(h.run('reply', first.id, '--prompt-file', h.prompt('CASE:complete')), e => e.response.error.code === 'INVALID_STATE');
  const prompts = fs.readFileSync(path.join(h.cwd, `prompts-${running.nativeSessionId}.ndjson`), 'utf8').trim().split('\n'); assert.equal(prompts.length, 1);
});

test('failed native resume never silently creates a new session', async t => {
  const h = await setup(t); const first = await h.start('CASE:complete'); const done = await h.poll(first.id); fs.writeFileSync(path.join(h.cwd, 'fail-resume'), '1');
  await h.run('reply', first.id, '--prompt-file', h.prompt('CASE:complete')); const failed = await h.poll(first.id); assert.notEqual(failed.state, 'needs_review'); assert.equal(failed.nativeSessionId, done.nativeSessionId);
  assert.equal(fs.readdirSync(h.cwd).filter(x => x.startsWith('session-')).length, 1); assert.equal(fs.readFileSync(path.join(h.cwd, `prompts-${done.nativeSessionId}.ndjson`), 'utf8').trim().split('\n').length, 1);
});

test('adapter transport loss after dispatch is unknown even when the runner settles', async t => {
  const h = await setup(t); const first = await h.start('CASE:disconnect'); const done = await h.poll(first.id);
  assert.equal(done.state, 'unknown'); assert.equal(done.runnerDone, true); assert.equal(done.admission, 'dispatched');
  const result = await h.run('result', first.id); assert.equal(result.execution.status, 'failed');
  await assert.rejects(h.run('reply', first.id, '--prompt-file', h.prompt('CASE:complete')), e => e.response.error.code === 'INVALID_STATE');
  assert.equal(fs.readFileSync(path.join(h.cwd, `prompts-${done.nativeSessionId}.ndjson`), 'utf8').trim().split('\n').length, 1);
});

test('permission denial cannot hide a subsequent turn timeout', async t => {
  const h = await setup(t);
  const first = await h.start('CASE:permission_timeout', '--timeout', '1');
  const done = await h.poll(first.id);
  const result = await h.run('result', first.id);
  assert.equal(result.execution.status, 'failed');
  assert.equal(result.execution.error.code, 'TIMEOUT');
  assert.equal(done.state, 'unknown');
  await assert.rejects(h.run('reply', first.id, '--prompt-file', h.prompt('CASE:complete')), e => e.response.error.code === 'INVALID_STATE');
});

test('a live runner with an unknown outcome can still be cancelled', async t => {
  const h = await setup(t);
  const first = await h.start('CASE:long', '--timeout', '10');
  await h.poll(first.id, r => r.state === 'running' && r.admission === 'dispatched');
  new Store(h.state).update(first.id, current => ({ ...current, state: 'unknown' }));
  try {
    assert.equal((await h.run('cancel', first.id)).cancellationRequested, true);
    assert.equal((await h.poll(first.id, r => r.runnerDone === true)).state, 'cancelled');
  } finally {
    // Request-scoped marker cleans up this test's runner even when the regression fails.
    const folder = path.join(h.state, 'cancel'); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `${first.id}-${first.requestId}.json`), '{}');
    await h.poll(first.id, r => r.runnerDone === true);
  }
});

test('launch does not relabel a spawned runner as failed on parent checkpoint contention', async t => {
  const h = await setup(t);
  const original = Store.prototype.update;
  let injected = false, start;
  Store.prototype.update = function (...args) {
    if (!injected) {
      injected = true;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
      throw Object.assign(new Error('injected launch checkpoint contention'), { code: 'LOCKED' });
    }
    return original.apply(this, args);
  };
  try {
    start = await main(['start', '--harness', 'fixture', '--config', h.config, '--cwd', h.cwd, '--prompt-file', h.prompt('CASE:complete'), '--criteria', 'Fixture', '--scope', h.cwd, '--state-dir', h.state]);
  } finally { Store.prototype.update = original; }
  const done = await h.poll(start.id);
  assert.equal(done.state, 'needs_review');
});

test('resolve is request-scoped, visible, and preserved in reply history', async t => {
  const h = await setup(t);
  const start = await h.start('CASE:disconnect');
  const first = await h.poll(start.id, r => r.state === 'unknown' && r.runnerDone);
  await assert.rejects(h.run('resolve', start.id, '--request', 'stale', '--note', 'Reviewed stale work'), e => e.response.error.code === 'INVALID_STATE');
  const resolved = await h.run('resolve', start.id, '--request', first.requestId, '--note', 'Reviewed first request side effects');
  assert.equal(resolved.resolution.requestId, first.requestId);
  assert.equal((await h.run('result', start.id)).resolution.note, 'Reviewed first request side effects');
  await h.run('reply', start.id, '--prompt-file', h.prompt('CASE:complete'));
  await h.poll(start.id);
  const next = await h.run('result', start.id);
  assert.equal(next.resolution, null);
  assert.equal(next.history[0].resolution.requestId, first.requestId);
  assert.equal(next.history[0].resolution.note, 'Reviewed first request side effects');
  assert.equal(next.history[0].error.code, 'RUNTIME');
  await h.run('reply', start.id, '--prompt-file', h.prompt('CASE:disconnect'));
  const second = await h.poll(start.id, r => r.state === 'unknown' && r.runnerDone);
  await assert.rejects(h.run('resolve', start.id, '--request', first.requestId, '--note', 'Reviewed first request side effects'), e => e.response.error.code === 'INVALID_STATE');
  assert.equal((await h.run('status', start.id)).state, 'unknown');
  assert.notEqual(second.requestId, first.requestId);
});

test('unhealthy doctor uses the JSON failure envelope', async t => {
  const h = await setup(t);
  const bad = path.join(h.cwd, 'bad-config.json');
  fs.writeFileSync(bad, JSON.stringify({ missing: { command: ['/definitely/not-an-adapter'], model: 'm', mode: 'default', effort: 'low', effortKey: 'effort' } }));
  await assert.rejects(h.run('doctor', '--config', bad), e => e.response.ok === false && e.response.error.code === 'DOCTOR_FAILED' && e.response.data.ok === false);
  await assert.rejects(exec(process.execPath, [cli, 'doctor', '--config', bad, '--state-dir', h.state]), e => e.stdout === '' && JSON.parse(e.stderr).error.code === 'DOCTOR_FAILED');
});

test('Codex message framing keeps progress auditable and validates only unambiguous final messages', async t => {
  const h = await setup(t, 'codex');
  const start = await h.start('CASE:framed');
  assert.equal((await h.poll(start.id)).state, 'needs_review');
  const result = await h.run('result', start.id);
  assert.ok(result.output.startsWith('Inspecting fixture.'));
  assert.equal(result.responseMessageId, 'answer');
  assert.deepEqual(JSON.parse(result.responseOutput), result.response);
  const events = await h.run('events', start.id);
  assert.ok(events.events.some(e => e.type === 'text_delta' && e.messageId === 'progress'));
  for (const scenario of ['unframed', 'interleaved', 'badframe']) {
    const next = await h.start(`CASE:${scenario}`);
    assert.equal((await h.poll(next.id)).state, 'invalid_output');
  }
  await h.run('reply', start.id, '--prompt-file', h.prompt('CASE:complete'));
  await h.poll(start.id);
  const replied = await h.run('result', start.id);
  assert.equal(replied.responseMessageId, null);
  assert.equal(replied.history[0].responseMessageId, 'answer');
});


test('explicit blank objectives fail before creating a worker', async t => {
  const h = await setup(t);
  for (const objective of ['', '   ']) await assert.rejects(h.start('CASE:complete', '--objective', objective), e => e.response.error.code === 'INVALID_INPUT');
  assert.deepEqual(new Store(h.state).list(), []);
  const started = await h.start('CASE:complete');
  assert.equal(new Store(h.state).get(started.id).objective, 'CASE:complete');
  assert.equal((await h.poll(started.id)).state, 'needs_review');
});

test('runner tolerates lock contention across heartbeat and cancellation', async t => {
  const h = await setup(t); const started = await h.start('CASE:long');
  await h.poll(started.id, r => r.state === 'running' && r.admission === 'dispatched');
  const moduleURL = new URL('../src/store.mjs', import.meta.url).href;
  const holder = spawn(process.execPath, ['--input-type=module', '-e', `import { Store } from ${JSON.stringify(moduleURL)}; const store = new Store(${JSON.stringify(h.state)}); store.update(${JSON.stringify(started.id)}, current => { console.log('locked'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 900); return current; });`]);
  await new Promise((resolve, reject) => { holder.stdout.once('data', resolve); holder.once('error', reject); });
  const exited = new Promise((resolve, reject) => { holder.once('exit', code => code === 0 ? resolve() : reject(new Error('lock holder failed'))); });
  await h.run('cancel', started.id);
  await exited;
  const done = await h.poll(started.id); assert.equal(done.state, 'cancelled');
  const result = await h.run('result', started.id); assert.equal(result.execution.status, 'cancelled'); assert.equal(result.error, null);
  const events = await h.run('events', started.id);
  assert.ok(events.events.some(e => e.type === 'cancel_requested'));
  assert.ok(events.events.some(e => e.type === 'turn_settled' && e.taskState === 'cancelled'));
});

test('CLI and worker entrypoints work from a path with URL punctuation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator#entry?'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.dirname(path.dirname(cli));
  fs.cpSync(path.join(project, 'src'), path.join(root, 'src'), { recursive: true });
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(root, 'node_modules'));
  const alternate = path.join(root, 'src/cli.mjs');
  const help = await exec(process.execPath, [alternate, '--help']); assert.match(help.stdout, /task supervision/);
  const h = await setup(t);
  const { stdout } = await exec(process.execPath, [alternate, 'start', '--harness', 'fixture', '--config', h.config, '--cwd', h.cwd, '--prompt-file', h.prompt('CASE:complete'), '--criteria', 'completion', '--scope', h.cwd, '--state-dir', h.state, '--json']);
  const started = JSON.parse(stdout).data;
  assert.equal((await h.poll(started.id)).state, 'needs_review');
});

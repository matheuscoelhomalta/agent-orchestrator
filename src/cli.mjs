#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store } from './store.mjs';
import { activeStates, defaultStateDir, fail, readConfig, reconcile, timestamp, validateSpec, alive, executable, summarize, supportedNode, strict } from './core.mjs';

const help = `agent-orchestrator — task supervision over ACPX

  doctor                         Inspect adapters/config without model calls
  start --harness NAME --prompt-file FILE --criteria TEXT --scope TEXT
  status [ID]                    List workers or reconcile one worker
  wait [ID...] [--timeout N]     Block until those (or all) workers stop running; default 300s
  events ID [--after N] [--limit N]   Read a bounded event page
  result ID                      Read output, execution outcome, and task state
  reply ID --prompt-file FILE [--correction]   Continue the same native session
  cancel ID                      Request cancellation; poll status for settlement
  accept ID --request REQUEST --note TEXT     Record independently verified acceptance
  resolve ID --request REQUEST --note TEXT    Reconcile that unknown request after side-effect review

Common: --state-dir DIR, --json, --help
Start: --cwd DIR, --config FILE, --objective TEXT, --timeout SECONDS (default 300)
       --strict  use the harness's verified native settings that block writes outside --cwd
Reply: --correction consumes the one allowed formatting-correction attempt
Results remain needs_review until accept; valid JSON alone never accepts a task.
Config is trusted executable argv; credentials come from native harness login.
`;

const options = Object.fromEntries(['state-dir','harness','prompt-file','criteria','scope','cwd','config','objective','timeout','after','limit','request','note'].map(name => [name, { type: 'string' }]));
for (const name of ['json','help','correction','strict']) options[name] = { type: 'boolean' };

function number(value, fallback, min, max) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw fail('INVALID_INPUT', `Expected integer ${min}..${max}.`);
  return parsed;
}
function required(value, name) { if (typeof value !== 'string' || !value.trim()) throw fail('INVALID_INPUT', `${name} is required.`); return value; }
function privateWrite(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
}
async function launch(store, record, stateDir) {
  const log = path.join(stateDir, `${record.id}-${record.requestId}.log`);
  let fd, child;
  try {
    fd = fs.openSync(log, 'wx', 0o600);
    child = spawn(process.execPath, [fileURLToPath(new URL('./worker.mjs', import.meta.url)), stateDir, record.id, record.requestId], { detached: true, stdio: ['ignore', fd, fd] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    // The runner owns PID registration. A parent checkpoint can race its first write.
    child.unref();
  } catch (error) {
    store.update(record.id, current => current.requestId === record.requestId && current.state === 'starting' ? { ...current, state: 'failed', runnerDone: true, error: { code: 'SPAWN_FAILED', message: error.message }, updatedAt: timestamp() } : current);
    throw error;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
  return { ...record, runnerPid: child.pid };
}

export async function main(argv = process.argv.slice(2)) {
  const { values: flags, positionals } = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  if (flags.help || !positionals.length) { console.log(help); return; }
  const [command, id, ...extra] = positionals;
  if ((extra.length && command !== 'wait') || (!['status','doctor','start','wait'].includes(command) && !id)) throw fail('INVALID_INPUT', 'Unexpected or missing arguments; use --help.');
  const stateDir = path.resolve(flags['state-dir'] || defaultStateDir());
  if (command === 'doctor') {
    const harnesses = Object.entries(readConfig(flags.config)).map(([name, spec]) => {
      const commandPresent = Boolean(executable(spec.command[0]));
      const adapterPresent = commandPresent && spec.command.slice(1).filter(x => x.endsWith('.js') || x.endsWith('.mjs')).every(x => { try { return fs.statSync(x).isFile(); } catch { return false; } });
      const nativeOverrides = [spec.env?.CODEX_PATH, spec.env?.CLAUDE_CODE_EXECUTABLE].filter(x => x !== undefined);
      return { name, commandPresent, adapterPresent, nativePresent: spec.nativeCommand ? Boolean(executable(spec.nativeCommand)) : null, model: spec.model, effort: spec.effort, mode: spec.mode, authSource: 'native harness login', authVerified: false, nativeOverridePresent: nativeOverrides.length ? nativeOverrides.every(x => Boolean(executable(x))) : null };
    });
    return { ok: supportedNode(process.version) && harnesses.every(x => x.adapterPresent && x.nativeOverridePresent !== false && x.nativePresent !== false), node: process.version, nodeSupported: supportedNode(process.version), stateDir, harnesses, note: 'Static inspection only. No native session launched or authentication verified.' };
  }
  const store = new Store(stateDir);
  if (command === 'start') {
    if (id) throw fail('INVALID_INPUT', 'start takes flags, not an ID.');
    const harness = required(flags.harness, '--harness');
    const config = readConfig(flags.config);
    if (!Object.hasOwn(config, harness)) throw fail('INVALID_INPUT', `Unknown harness ${harness}; configured: ${Object.keys(config).join(', ')}.`);
    const spec = flags.strict ? strict(harness, config[harness]) : config[harness];
    validateSpec(spec);
    const prompt = required(fs.readFileSync(required(flags['prompt-file'], '--prompt-file'), 'utf8'), 'Prompt');
    const cwd = fs.realpathSync(flags.cwd || process.cwd());
    if (!fs.statSync(cwd).isDirectory()) throw fail('INVALID_INPUT', '--cwd must be a directory.');
    const record = { schema: 1, id: randomUUID(), requestId: randomUUID(), harness, spec,
      objective: flags.objective === undefined ? prompt : required(flags.objective, '--objective'), criteria: required(flags.criteria, '--criteria'), scope: required(flags.scope, '--scope'), prompt, cwd,
      timeoutMs: number(flags.timeout, 300, 1, 3600) * 1000, state: 'starting', admission: 'not_confirmed', corrections: 0, turn: 1, runnerDone: false,
      createdAt: timestamp(), updatedAt: timestamp() };
    store.create(record);
    return summarize(await launch(store, record, stateDir));
  }
  if (command === 'wait') {
    const ids = positionals.slice(1);
    const deadline = Date.now() + number(flags.timeout, 300, 1, 3600) * 1000;
    for (;;) {
      const workers = (ids.length ? ids : store.list().map(x => x.id)).map(x => summarize(reconcile(store, x)));
      // A stale-heartbeat unknown whose runner still lives can still change state.
      const settled = !workers.some(x => activeStates.has(x.state) || (x.state === 'unknown' && !x.runnerDone && alive(x.runnerPid)));
      if (settled || Date.now() >= deadline) return { settled, workers };
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  if (command === 'status') return id ? summarize(reconcile(store, id)) : store.list().map(x => summarize(reconcile(store, x.id)));
  const record = reconcile(store, id);
  if (command === 'events') return store.events(id, { after: number(flags.after, 0, 0, Number.MAX_SAFE_INTEGER), limit: number(flags.limit, 100, 1, 1000) });
  if (command === 'result') return { id, requestId: record.requestId, nativeSessionId: record.nativeSessionId, state: record.state, execution: record.execution || null, response: record.response || null, output: record.output || '', responseOutput: record.responseOutput ?? record.output ?? '', responseMessageId: record.responseMessageId || null, acceptance: record.acceptance || null, resolution: record.resolution || null, history: record.history || [], error: record.error || null };
  if (command === 'cancel') {
    if (!activeStates.has(record.state) && !(record.state === 'unknown' && !record.runnerDone && alive(record.runnerPid))) throw fail('INVALID_STATE', `Cannot cancel ${record.state}.`);
    const cancelPath = path.join(stateDir, 'cancel', `${id}-${record.requestId}.json`);
    try { privateWrite(cancelPath, { requestId: record.requestId, at: timestamp() }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    return { id, requestId: record.requestId, cancellationRequested: true, note: 'Cancellation is not settled yet; poll status/result.' };
  }
  if (command === 'accept') {
    required(flags.request, '--request'); required(flags.note, '--note');
    return summarize(store.update(id, current => {
      if (current.requestId !== flags.request || current.state !== 'needs_review' || !current.runnerDone) throw fail('INVALID_STATE', 'Only the current settled needs_review result can be accepted.');
      return { ...current, state: 'accepted', acceptance: { requestId: current.requestId, note: flags.note, at: timestamp() }, updatedAt: timestamp() };
    }));
  }
  if (command === 'resolve') {
    required(flags.request, '--request'); required(flags.note, '--note');
    return summarize(store.update(id, current => {
      if (current.state !== 'unknown' || current.requestId !== flags.request) throw fail('INVALID_STATE', 'Only the specified current unknown request can be resolved.');
      if (alive(current.runnerPid)) throw fail('INVALID_STATE', 'Runner still exists; inspect or cancel it before resolving.');
      if (alive(current.adapterPid)) throw fail('INVALID_STATE', `Native adapter process ${current.adapterPid} still exists; stop it before resolving.`);
      return { ...current, state: 'failed', runnerDone: true, resolution: { requestId: current.requestId, note: flags.note, at: timestamp() }, updatedAt: timestamp() };
    }));
  }
  if (command === 'reply') {
    const prompt = required(fs.readFileSync(required(flags['prompt-file'], '--prompt-file'), 'utf8'), 'Prompt');
    const next = store.update(id, current => {
      if (activeStates.has(current.state) || current.state === 'unknown' || !current.runnerDone) throw fail('INVALID_STATE', 'Worker is active or has an unresolved outcome.');
      if (!current.nativeSessionId) throw fail('INVALID_STATE', 'No native session is available to resume.');
      if (current.state === 'invalid_output' && !flags.correction) throw fail('INVALID_STATE', 'Replies to invalid_output require --correction and consume the correction budget.');
      if (flags.correction && (current.corrections >= 1 || current.state !== 'invalid_output')) throw fail('INVALID_STATE', 'One formatting correction is allowed, only after invalid_output.');
      const previous = { requestId: current.requestId, state: current.state, execution: current.execution, response: current.response, output: current.output, responseOutput: current.responseOutput, responseMessageId: current.responseMessageId, acceptance: current.acceptance, error: current.error, resolution: current.resolution };
      return { ...current, state: 'starting', requestId: randomUUID(), prompt: flags.correction ? `Correct only the response format. Do not redo task work or use tools. ${prompt}` : prompt,
        history: [...(current.history || []), previous],
        turn: current.turn + 1, corrections: current.corrections + (flags.correction ? 1 : 0), runnerPid: null, adapterPid: null, runnerDone: false, admission: 'not_confirmed', heartbeatAt: timestamp(), updatedAt: timestamp(),
        output: '', responseOutput: '', responseMessageId: null, response: null, execution: null, error: null, acceptance: null, resolution: null };
    });
    return summarize(await launch(store, next, stateDir));
  }
  throw fail('INVALID_INPUT', `Unknown command ${command}. Use --help.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then(data => { if (data !== undefined) {
    const payload = data.ok === false ? { ok: false, error: { code: 'DOCTOR_FAILED', message: 'Static installation checks failed.' }, data } : { ok: true, data };
    const print = data.ok === false && !process.argv.includes('--json') ? console.error : console.log;
    print(JSON.stringify(payload, null, process.argv.includes('--json') ? 0 : 2));
    if (data.ok === false) process.exitCode = 1;
  } }).catch(error => {
    const print = process.argv.includes('--json') ? console.log : console.error;
    print(JSON.stringify({ ok: false, error: { code: error.code || 'ERROR', message: error.message } }));
    process.exitCode = 1;
  });
}

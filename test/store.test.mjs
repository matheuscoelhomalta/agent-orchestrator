import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Store } from '../src/store.mjs';

const moduleURL = new URL('../src/store.mjs', import.meta.url).href;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: new Store(dir) };
}
function child(dir, body) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {Store} from ${JSON.stringify(moduleURL)}; const s=new Store(${JSON.stringify(dir)}); ${body}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('create preserves fields, rejects collision, and get reports absence', t => {
  const { store } = fixture(t);
  const value = { id: 'worker-1', metadata: { a: true }, status: 'queued' };
  assert.deepEqual(store.create(value), value);
  assert.deepEqual(store.get(value.id), value);
  assert.throws(() => store.create(value), { code: 'ALREADY_EXISTS' });
  assert.throws(() => store.get('absent'), { code: 'NOT_FOUND' });
});

test('rejects traversal and malformed input before touching disk', t => {
  const { store } = fixture(t);
  for (const id of ['../escape', 'a/b', '', '.', '..', 'a b', null]) {
    for (const run of [() => store.get(id), () => store.create({ id }), () => store.update(id, x => x), () => store.events(id), () => store.appendEvent(id, {})]) {
      assert.throws(run, { code: 'INVALID_INPUT' });
    }
  }
  assert.throws(() => store.create([]), { code: 'INVALID_INPUT' });
});

test('directories and persisted files have private permissions', t => {
  const { dir, store } = fixture(t);
  store.create({ id: 'a' });
  store.appendEvent('a', { type: 'started' });
  for (const name of ['', 'records', 'events', 'locks']) assert.equal(fs.statSync(path.join(dir, name)).mode & 0o777, 0o700);
  for (const name of ['records/a.json', 'events/a.ndjson']) assert.equal(fs.statSync(path.join(dir, name)).mode & 0o777, 0o600);
});

test('updates publish atomically and clean up on mutator or serialization failure', t => {
  const { dir, store } = fixture(t);
  store.create({ id: 'a', count: 0 });
  const inode = fs.statSync(path.join(dir, 'records/a.json')).ino;
  assert.equal(store.update('a', current => { current.count++; }).count, 1);
  assert.notEqual(fs.statSync(path.join(dir, 'records/a.json')).ino, inode);
  assert.throws(() => store.update('a', current => { current.count = 9; throw new Error('failed'); }), /failed/);
  assert.throws(() => store.update('a', current => ({ ...current, circular: current, big: 1n })), { code: 'INVALID_INPUT' });
  assert.throws(() => store.update('a', () => ({ id: 'b' })), { code: 'INVALID_INPUT' });
  assert.throws(() => store.update('a', () => ({ id: 'a', toJSON: () => ({ id: 'b' }) })), { code: 'INVALID_INPUT' });
  assert.equal(store.get('a').count, 1);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'locks')), []);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'records')), ['a.json']);
});

test('cross-process contention refuses create, update, and append without overwriting', t => {
  const { dir, store } = fixture(t);
  store.create({ id: 'a', count: 0 });
  store.update('a', current => {
    for (const expression of ["s.create({id:'a'})", "s.update('a', x=>({...x,count:99}))", "s.appendEvent('a', {})"]) {
      assert.equal(child(dir, `try { ${expression}; process.exit(1); } catch(e) { console.log(e.code); }`), 'LOCKED');
    }
    current.count++;
  });
  assert.equal(store.get('a').count, 1);
  assert.equal(child(dir, "try { s.create({id:'a'}); process.exit(1); } catch(e) {console.log(e.code)}"), 'ALREADY_EXISTS');
});

test('stale locks remain conservative and are not removed', t => {
  const { dir, store } = fixture(t);
  store.create({ id: 'a' });
  const lock = path.join(dir, 'locks/a.lock');
  fs.writeFileSync(lock, '1234', { mode: 0o600 });
  assert.throws(() => store.update('a', x => x), { code: 'LOCKED' });
  assert.equal(fs.readFileSync(lock, 'utf8'), '1234');
});

test('list is deterministic, excludes nonrecords, and reports corrupt records', t => {
  const { dir, store } = fixture(t);
  store.create({ id: 'z' }); store.create({ id: 'a' });
  fs.writeFileSync(path.join(dir, 'records/temp.tmp'), 'broken');
  fs.mkdirSync(path.join(dir, 'records/directory.json'));
  assert.deepEqual(store.list().map(x => x.id), ['a', 'z']);
  fs.writeFileSync(path.join(dir, 'records/z.json'), '{');
  assert.throws(() => store.get('z'), { code: 'CORRUPT_DATA' });
  assert.throws(() => store.list(), { code: 'CORRUPT_DATA' });
  fs.writeFileSync(path.join(dir, 'records/z.json'), '{"id":"other"}');
  assert.throws(() => store.get('z'), { code: 'CORRUPT_DATA' });
});

test('events assign sequences and paginate by bounded numeric cursor', t => {
  const { store } = fixture(t);
  store.create({ id: 'a' });
  assert.deepEqual(store.events('a'), { events: [], nextCursor: 0 });
  for (let i = 1; i <= 5; i++) assert.equal(store.appendEvent('a', { seq: 99, type: 'progress', value: i }).seq, i);
  const first = store.events('a', { limit: 2 });
  assert.deepEqual(first.events.map(e => e.seq), [1, 2]);
  assert.equal(first.nextCursor, 2);
  assert.deepEqual(store.events('a', { after: first.nextCursor, limit: 2 }).events.map(e => e.seq), [3, 4]);
  assert.deepEqual(store.events('a', { after: 5 }), { events: [], nextCursor: 5 });
  for (const options of [{ limit: 0 }, { limit: 1001 }, { limit: 1.5 }, { after: -1 }, { after: '2' }]) assert.throws(() => store.events('a', options), { code: 'INVALID_INPUT' });
});

test('event corruption is explicit and append leaves damaged log untouched', t => {
  const { dir, store } = fixture(t);
  store.create({ id: 'a' });
  const file = path.join(dir, 'events/a.ndjson');
  for (const contents of ['{\n', '{"seq":1}', '{"seq":1}\n{"seq":1}\n', '{"seq":0}\n']) {
    fs.writeFileSync(file, contents);
    assert.throws(() => store.events('a'), { code: 'CORRUPT_DATA' });
    assert.throws(() => store.appendEvent('a', {}), { code: 'CORRUPT_DATA' });
    assert.equal(fs.readFileSync(file, 'utf8'), contents);
  }
});

test('concurrent processes append without losing events or sequence uniqueness', async t => {
  const { dir, store } = fixture(t);
  store.create({ id: 'a' });
  await Promise.all(Array.from({ length: 4 }, (_, worker) => new Promise((resolve, reject) => {
    const code = `import {Store} from ${JSON.stringify(moduleURL)}; const s=new Store(${JSON.stringify(dir)}); for(let i=0;i<15;i++){ for(;;){try{s.appendEvent('a',{worker:${worker},value:i});break}catch(e){if(e.code!=='LOCKED')throw e;await new Promise(r=>setTimeout(r,2))}}}`;
    const proc = spawn(process.execPath, ['--input-type=module', '-e', code]);
    let stderr = ''; proc.stderr.on('data', x => { stderr += x; });
    proc.on('error', reject); proc.on('exit', status => status === 0 ? resolve() : reject(new Error(stderr)));
  })));
  const events = store.events('a').events;
  assert.equal(events.length, 60);
  assert.deepEqual(events.map(e => e.seq), Array.from({ length: 60 }, (_, i) => i + 1));
  assert.equal(new Set(events.map(e => `${e.worker}:${e.value}`)).size, 60);
});

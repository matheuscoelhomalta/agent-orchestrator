import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) fail('INVALID_INPUT', 'Invalid worker id');
  return id;
}

function record(value, id, code = 'INVALID_INPUT') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== id) {
    fail(code, 'Worker record must be an object with the matching id');
  }
  return value;
}

export class Store {
  constructor(stateDir) {
    if (typeof stateDir !== 'string' || !stateDir) fail('INVALID_INPUT', 'A state directory is required');
    this.stateDir = path.resolve(stateDir);
    for (const directory of [this.stateDir, ...['records', 'events', 'locks'].map(name => path.join(this.stateDir, name))]) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (!fs.lstatSync(directory).isDirectory()) fail('INVALID_INPUT', 'State paths must be real directories');
      fs.chmodSync(directory, 0o700);
    }
  }

  _path(kind, id, suffix) {
    return path.join(this.stateDir, kind, `${validId(id)}.${suffix}`);
  }

  _locked(id, fn) {
    const lock = this._path('locks', id, 'lock');
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      // Never infer ownership or signal a PID from a persisted lock.
      if (error.code === 'EEXIST') fail('LOCKED', `Worker ${id} is locked; inspect stale locks manually`);
      throw error;
    }
    try { return fn(); }
    finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }

  _write(destination, value, exclusive = false) {
    let serialized;
    try { serialized = JSON.stringify(value); }
    catch { fail('INVALID_INPUT', 'Record must be JSON serializable'); }
    if (serialized === undefined) fail('INVALID_INPUT', 'Record must be JSON serializable');
    record(JSON.parse(serialized), value.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${serialized}\n`, { flag: 'wx', mode: 0o600 });
      if (exclusive) fs.linkSync(temporary, destination);
      else fs.renameSync(temporary, destination);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  create(value) {
    const id = validId(value?.id);
    record(value, id);
    return this._locked(id, () => {
      try { this._write(this._path('records', id, 'json'), value, true); }
      catch (error) { if (error.code === 'EEXIST') fail('ALREADY_EXISTS', `Worker ${id} already exists`); throw error; }
      return this.get(id);
    });
  }

  get(id) {
    const filename = this._path('records', id, 'json');
    let contents;
    try { contents = fs.readFileSync(filename, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') fail('NOT_FOUND', `Unknown worker ${id}`); throw error; }
    let value;
    try { value = JSON.parse(contents); }
    catch { fail('CORRUPT_DATA', `Invalid JSON in worker ${id}`); }
    return record(value, id, 'CORRUPT_DATA');
  }

  list() {
    return fs.readdirSync(path.join(this.stateDir, 'records'), { withFileTypes: true })
      .filter(entry => entry.isFile() && /^[a-zA-Z0-9_-]+\.json$/.test(entry.name))
      .map(entry => entry.name.slice(0, -5)).sort().map(id => this.get(id));
  }

  update(id, mutator) {
    validId(id);
    if (typeof mutator !== 'function') fail('INVALID_INPUT', 'A synchronous mutator is required');
    return this._locked(id, () => {
      const current = this.get(id);
      const result = mutator(current);
      const next = result === undefined ? current : result;
      record(next, id);
      this._write(this._path('records', id, 'json'), next);
      return this.get(id);
    });
  }

  _events(id) {
    this.get(id);
    let contents;
    try { contents = fs.readFileSync(this._path('events', id, 'ndjson'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    if (!contents) return [];
    if (!contents.endsWith('\n')) fail('CORRUPT_DATA', `Incomplete event log for ${id}`);
    let previous = 0;
    return contents.slice(0, -1).split('\n').map(line => {
      let event;
      try { event = JSON.parse(line); } catch { fail('CORRUPT_DATA', `Invalid event JSON for ${id}`); }
      if (!event || typeof event !== 'object' || Array.isArray(event) || !Number.isSafeInteger(event.seq) || event.seq <= previous) {
        fail('CORRUPT_DATA', `Invalid event sequence for ${id}`);
      }
      previous = event.seq;
      return event;
    });
  }

  events(id, { after = 0, limit = 100 } = {}) {
    validId(id);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      fail('INVALID_INPUT', 'Event cursor and limit are out of range');
    }
    const events = this._events(id).filter(event => event.seq > after).slice(0, limit);
    return { events, nextCursor: events.at(-1)?.seq ?? after };
  }

  appendEvent(id, event) {
    validId(id);
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail('INVALID_INPUT', 'Event must be an object');
    return this._locked(id, () => {
      const existing = this._events(id);
      const seq = (existing.at(-1)?.seq ?? 0) + 1;
      if (!Number.isSafeInteger(seq)) fail('CORRUPT_DATA', 'Event sequence exhausted');
      let serialized;
      try { serialized = JSON.stringify({ ...event, seq }); }
      catch { fail('INVALID_INPUT', 'Event must be JSON serializable'); }
      const next = JSON.parse(serialized);
      if (next?.seq !== seq) fail('INVALID_INPUT', 'Event must retain its assigned sequence');
      const destination = this._path('events', id, 'ndjson');
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, [...existing.map(value => JSON.stringify(value)), serialized].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, destination);
      } finally {
        try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return next;
    });
  }
}

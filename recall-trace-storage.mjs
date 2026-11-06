import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import core from './core.cjs';
import traces from './recall-traces.cjs';
import { safeDirectory, readSafe, sameFile, missing } from './memory-files.mjs';

const { ROOT, MEMORY_ROOT } = core;
const { TRACE_ROOT, TRACE_MAX_BYTES, TRACE_LIMIT, TRACE_SCAN_LIMIT, TRACE_FILENAME,
  makeRecallTrace, validateRecallTrace, traceFilename, compareRecallTraces } = traces;
const queues = new Map();
const failure = code => new Error(code);

function checkpoint({ signal, isCurrent }) {
  signal?.throwIfAborted();
  if (isCurrent && !isCurrent()) throw failure('STALE_RECALL_TRACE');
}
function steps(options) {
  return async operation => {
    checkpoint(options);
    try { return await operation(); } finally { checkpoint(options); }
  };
}
async function assertDirectories(cwd, pinned, step) {
  for (const [name, info] of pinned) {
    if (!sameFile(info, await step(() => safeDirectory(cwd, name)))) throw failure('CONTEXT_CHANGED');
  }
}
async function ensureDirectories(cwd, step) {
  const pinned = new Map();
  try { pinned.set(ROOT, await step(() => safeDirectory(cwd, ROOT))); }
  catch (error) { if (missing(error)) return null; throw error; }
  for (const name of [MEMORY_ROOT, TRACE_ROOT]) {
    await assertDirectories(cwd, pinned, step);
    try { await step(() => fs.mkdir(path.join(cwd, name), { mode: 0o700 })); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    pinned.set(name, await step(() => safeDirectory(cwd, name)));
  }
  await assertDirectories(cwd, pinned, step);
  return pinned;
}
async function scan(cwd, pinned, step) {
  await assertDirectories(cwd, pinned, step);
  let directory;
  const files = [];
  try {
    await step(async () => { directory = await fs.opendir(path.join(cwd, TRACE_ROOT)); });
    for (let count = 0; ; count += 1) {
      const file = await step(() => directory.read());
      if (!file) break;
      // Fail closed at the cap: proving completeness would scan one more entry.
      if (count + 1 >= TRACE_SCAN_LIMIT) throw failure('TRACE_DIRECTORY_LIMIT');
      if (file.isSymbolicLink()) throw failure('UNSAFE_CONTEXT_FILE');
      if (!TRACE_FILENAME.test(file.name)) continue;
      if (!file.isFile()) throw failure('UNSAFE_CONTEXT_FILE');
      files.push(file.name);
    }
  } finally { if (directory) await directory.close(); }
  await assertDirectories(cwd, pinned, step);
  const result = [];
  for (const filename of files) {
    const name = `${TRACE_ROOT}/${filename}`;
    const info = await step(() => fs.lstat(path.join(cwd, name)));
    if (info.isSymbolicLink() || !info.isFile()) throw failure('UNSAFE_CONTEXT_FILE');
    let trace = null;
    if (info.size <= TRACE_MAX_BYTES) {
      const raw = await step(() => readSafe(cwd, name, TRACE_MAX_BYTES));
      try { trace = JSON.parse(raw); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      if (!validateRecallTrace(trace) || traceFilename(trace) !== filename) trace = null;
    }
    result.push({ name, info, trace });
  }
  await assertDirectories(cwd, pinned, step);
  return result;
}
async function removeOwned(cwd, pinned, item, step) {
  await assertDirectories(cwd, pinned, step);
  let actual;
  try { actual = await step(() => fs.lstat(path.join(cwd, item.name))); }
  catch (error) { if (missing(error)) return; throw error; }
  if (!actual.isFile() || actual.isSymbolicLink() || !sameFile(actual, item.info)
    || actual.size !== item.info.size || actual.mtimeMs !== item.info.mtimeMs) throw failure('CONTEXT_CHANGED');
  await assertDirectories(cwd, pinned, step);
  await step(() => fs.unlink(path.join(cwd, item.name)));
}
async function store(cwd, trace, options) {
  const step = steps(options);
  const pinned = await ensureDirectories(cwd, step);
  if (!pinned) return null;
  const target = `${TRACE_ROOT}/${traceFilename(trace)}`;
  const temporary = `${TRACE_ROOT}/.trace-${randomUUID()}.tmp`;
  const raw = JSON.stringify(trace);
  if (Buffer.byteLength(raw) > TRACE_MAX_BYTES) throw failure('TRACE_FILE_LIMIT');
  let handle; let owned; let completed = false; let originalError;
  try {
    await assertDirectories(cwd, pinned, step);
    // Keep ownership even if cancellation occurs as open resolves.
    await step(async () => {
      handle = await fs.open(path.join(cwd, temporary), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      owned = { name: temporary };
    });
    owned.info = await step(() => handle.stat());
    await assertDirectories(cwd, pinned, step);
    await step(() => handle.writeFile(raw, 'utf8'));
    await step(() => handle.sync());
    owned.info = await step(() => handle.stat());
    if (!owned.info.isFile() || owned.info.size !== Buffer.byteLength(raw)) throw failure('CONTEXT_CHANGED');
    await step(async () => { await handle.close(); handle = null; });
    await assertDirectories(cwd, pinned, step);
    const actual = await step(() => fs.lstat(path.join(cwd, temporary)));
    if (!actual.isFile() || actual.isSymbolicLink() || !sameFile(actual, owned.info)
      || actual.size !== owned.info.size || actual.mtimeMs !== owned.info.mtimeMs) throw failure('CONTEXT_CHANGED');
    try { await step(() => fs.lstat(path.join(cwd, target))); throw failure('TRACE_COLLISION'); }
    catch (error) { if (!missing(error)) throw error; }
    await assertDirectories(cwd, pinned, step);
    await step(async () => {
      await fs.rename(path.join(cwd, temporary), path.join(cwd, target));
      owned.name = target;
    });
    await assertDirectories(cwd, pinned, step);
    if (options.validateReferences && !await step(() => options.validateReferences())) throw failure('STALE_RECALL_REFERENCES');
    // Scan after publication so independent writers also see committed peers.
    const existing = await scan(cwd, pinned, step);
    const rows = [...existing.filter(row => row.trace && row.name !== target), { trace, name: target, info: owned.info }];
    rows.sort((a, b) => compareRecallTraces(a.trace, b.trace));
    const retained = new Set(rows.slice(0, TRACE_LIMIT).map(row => row.name));
    for (const item of existing) {
      if (item.name !== target && (!item.trace || !retained.has(item.name))) await removeOwned(cwd, pinned, item, step);
    }
    if (!retained.has(target)) await removeOwned(cwd, pinned, owned, step);
    checkpoint(options);
    completed = true;
    return trace;
  } catch (error) { originalError = error; throw error; }
  finally {
    let cleanupError;
    if (handle) {
      try { if (owned) owned.info = await handle.stat(); }
      catch (error) { cleanupError = error; }
      try { await handle.close(); } catch (error) { cleanupError ||= error; }
    }
    if (!completed && owned?.info) {
      // Cleanup owns a single exclusive inode; cancellation must not block it.
      try { await removeOwned(cwd, pinned, owned, operation => operation()); }
      catch (error) { cleanupError ||= error; }
    }
    if (cleanupError) throw new AggregateError([originalError, cleanupError].filter(Boolean), 'TRACE_CLEANUP_FAILED');
  }
}

export async function writeRecallTrace(cwd, explanation, options = {}) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || path.normalize(cwd) !== cwd) throw failure('INVALID_TRACE_WORKSPACE');
  checkpoint(options);
  const trace = makeRecallTrace(explanation, options);
  const previous = queues.get(cwd) || Promise.resolve();
  const pending = previous.catch(() => {}).then(() => { checkpoint(options); return store(cwd, trace, options); });
  queues.set(cwd, pending);
  try { return await pending; } finally { if (queues.get(cwd) === pending) queues.delete(cwd); }
}

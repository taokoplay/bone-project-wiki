import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import core from './core.cjs';
import diagnostics from './memory-diagnostics.cjs';
import traces from './recall-traces.cjs';
import presentation from './memory-presentation.cjs';
import { writeRecallTrace } from './recall-trace-storage.mjs';
import { safeDirectory, readSafe, sameFile, missing } from './memory-files.mjs';

const { ROOT } = core;
const { memoryKey } = diagnostics;
const { makeRecallTrace, validateRecallTrace, readRecallTraces, purgeTraceReferences,
  TRACE_ROOT, TRACE_MAX_BYTES, TRACE_LIMIT, TRACE_SCAN_LIMIT, TRACE_MAX_TOTAL,
  TRACE_MAX_SCORE, TRACE_FILENAME, AUTO_BUDGET, traceFilename, compareRecallTraces } = traces;
const digest = value => createHash('sha256').update(value).digest('hex');
const NOW = Date.parse('2026-12-01T12:00:00.000Z');
const options = { sessionId: 'session-private-value', now: () => NOW };
const clone = value => JSON.parse(JSON.stringify(value));
function explanation(total = 2, prefix = 'memory') {
  const decisions = Array.from({ length: total }, (_, index) => {
    const selected = index < 2;
    return { key: memoryKey({ kind: 'memory', id: `${prefix}-${index}`, category: 'memory' }),
      id: `${prefix}-${index}`, title: 'Private title', status: 'confirmed', revision: digest(`revision-${index}`),
      sourceState: 'standalone', sourceRevision: '', score: index < 2 ? 10 : 0,
      matchedFields: ['title'], coreReserved: index === 0, eligible: true, selected,
      rank: selected ? index + 1 : null, presentation: selected ? (index ? 'pointer' : 'fact') : 'omitted',
      reasons: selected ? ['relevance_match'] : ['entry_limit'], content: 'Private body',
      topics: ['Private topic'], paths: ['/private/path'] };
  });
  const selected = Math.min(total, 2);
  return { schemaVersion: 1, selectionVersion: 1, mode: 'automatic', budget: { ...AUTO_BUDGET },
    usedChars: 400, textChars: 400, contextHash: digest('Private context'), snapshotHash: digest(`snapshot-${total}`),
    counts: { total, eligible: total, selected, facts: Math.min(total, 1), pointers: Number(total > 1), omitted: total - selected },
    decisions, query: 'Private query', text: 'Private context', source: '/private/source' };
}
async function fixture(t, wiki = true) {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'bone-recall-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (wiki) await fs.mkdir(path.join(root, ROOT));
  let current = root;
  const calls = [];
  const absent = error => { if (error.code === 'ENOENT') error.code = 'NOT_FOUND'; throw error; };
  // Match the host contract: root-relative names, canonical scope checks, files-only
  // stat, sorted/capped listing, no lstat metadata, and nonrecursive removal.
  async function admit(name, mode = 'read') {
    core.relative(name);
    const base = await fs.realpath(current);
    const full = await fs.realpath(path.join(base, name)).catch(absent);
    const relative = path.relative(base, full).split(path.sep).join('/');
    const scope = mode === 'delete' ? `${ROOT}/memory/` : `${ROOT}/`;
    if (relative !== ROOT && !relative.startsWith(scope)) throw Object.assign(new Error('Denied private path'), { code: 'PERMISSION_DENIED' });
    return full;
  }
  const api = { workspace: { get: async () => ({ path: current, name: 'Test' }) }, fs: {
    list: async name => {
      calls.push(['list', name]);
      const dir = await admit(name);
      const result = [];
      for (const child of (await fs.readdir(dir)).sort()) {
        if (result.length >= 1000) break;
        let info;
        try { info = await fs.stat(path.join(dir, child)); } catch { continue; }
        result.push({ name: child, path: `${name}/${child}`, isDirectory: info.isDirectory(),
          ...(info.isDirectory() ? {} : { size: info.size, mtimeMs: info.mtimeMs }) });
      }
      return result;
    },
    stat: async name => {
      calls.push(['stat', name]);
      const info = await fs.stat(await admit(name)).catch(absent);
      if (!info.isFile()) throw Object.assign(new Error('Files only'), { code: 'INVALID_ARGUMENT' });
      return { size: info.size, mtimeMs: info.mtimeMs };
    },
    readText: async name => { calls.push(['read', name]); return fs.readFile(await admit(name), 'utf8'); },
    remove: async name => { calls.push(['remove', name]); await fs.rm(await admit(name, 'delete'), { recursive: false, force: false }); },
  } };
  const put = async (name, raw) => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), raw);
  };
  return { root, api, calls, put, switchTo: value => { current = value; } };
}
async function persist(f, trace, raw = JSON.stringify(trace)) {
  const name = `${TRACE_ROOT}/${traceFilename(trace)}`;
  await f.put(name, raw);
  return name;
}
function defer() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('allowlist constructors remove all private explanation fields and hash the session', () => {
  const source = explanation();
  source.decisions[0].toJSON = () => ({ text: 'PRIVATE SERIALIZER' });
  source.budget.query = 'Private nested query';
  source.counts.title = 'Private nested title';
  const trace = makeRecallTrace(source, options);
  assert.equal(validateRecallTrace(trace), true);
  assert.equal(trace.sessionKey, digest(options.sessionId));
  assert.equal(trace.preparedAt, new Date(NOW).toISOString());
  assert.match(traceFilename(trace), TRACE_FILENAME);
  const raw = JSON.stringify(trace);
  assert.doesNotMatch(raw, /Private|private|PRIVATE|query|title|content|topics|paths|matchedFields|"id"|"source"/);
  assert.deepEqual(Object.keys(trace.decisions[0]).sort(), ['key','revision','sourceRevision','score','coreReserved','eligible','selected','rank','presentation','reasons'].sort());
  assert.equal(source.decisions[0].title, 'Private title');
  assert.notEqual(makeRecallTrace(source, options).traceId, trace.traceId);
});

test('strict validator rejects unknown fields, versions, paths, hashes, counts, scores and configuration', () => {
  const original = makeRecallTrace(explanation(), options);
  const mutations = [
    value => { value.title = 'Private'; }, value => { value.decisions[0].path = '../memory.md'; },
    value => { value.budget.path = '/private'; }, value => { value.counts.query = 'Private'; },
    value => { value.schemaVersion = 2; }, value => { value.selectionVersion = 2; },
    value => { value.mode = 'manual'; }, value => { value.contextHash = '../private'; },
    value => { value.snapshotHash += '\n'; }, value => { value.sessionKey = 'a'.repeat(63); },
    value => { value.traceId += '\n'; }, value => { value.preparedAt = '2026-02-30T00:00:00.000Z'; },
    value => { value.decisions[0].revision = '/private'; }, value => { value.decisions[0].sourceRevision = 'b'.repeat(65); },
    value => { value.decisions[0].reasons = ['not_a_reason']; }, value => { value.decisions[0].reasons = ['draft', 'draft']; },
    value => { value.decisions[0].score = Infinity; }, value => { value.decisions[0].score = TRACE_MAX_SCORE + 1; },
    value => { value.decisions[0].score = -1; }, value => { value.counts.total = TRACE_MAX_TOTAL + 1; },
    value => { value.counts.total = 1.5; }, value => { value.counts.selected = 0; },
    value => { value.detailsOmitted = 1; }, value => { value.decisions[0].selected = 'true'; },
    value => { value.decisions[0].key = 'c'.repeat(64) + '\n'; },
    value => { value.decisions[1].key = value.decisions[0].key; }, value => { value.decisions[1].rank = 1; },
    value => { value.budget.maxChars = 10000; }, value => { value.usedChars = 1201; },
    value => { value.textChars = -1; }, value => { value.decisions.extra = 'Private'; },
    value => { value.decisions[0].reasons.extra = 'Private'; },
    value => { delete value.decisions[0]; value.decisions.extra = {}; },
    value => { Object.defineProperty(value.decisions, 'private', { value: '/private' }); },
    value => { value.decisions[0].reasons[Symbol('private')] = '/private'; },
  ];
  for (const mutate of mutations) {
    const value = clone(original); mutate(value);
    assert.equal(validateRecallTrace(value), false, mutate.toString());
  }
  assert.equal(validateRecallTrace(null), false);
  const getter = clone(original);
  Object.defineProperty(getter, 'text', { get() { throw new Error('Private getter'); } });
  assert.equal(validateRecallTrace(getter), false);
  for (const mutate of [value => { value.mode = 'manual'; }, value => { value.decisions[0].reasons = ['bad']; },
    value => { value.decisions[0].score = NaN; }, value => { value.decisions[0].revision = '../path'; }]) {
    const value = explanation(); mutate(value);
    assert.throws(() => makeRecallTrace(value, options), /INVALID_RECALL_TRACE/);
  }
});

test('large explanations trim only decision details and preserve real totals below 20 KiB', () => {
  const source = explanation(TRACE_MAX_TOTAL);
  const trace = makeRecallTrace(source, options);
  assert.ok(Buffer.byteLength(JSON.stringify(trace)) <= TRACE_MAX_BYTES);
  assert.ok(trace.decisions.length > 0 && trace.decisions.length < source.decisions.length);
  assert.equal(trace.detailsOmitted, source.decisions.length - trace.decisions.length);
  assert.deepEqual(trace.counts, source.counts);
  assert.equal(trace.contextHash, source.contextHash);
  assert.equal(validateRecallTrace(trace), true);
  const unbounded = explanation(TRACE_MAX_TOTAL + 1);
  assert.throws(() => makeRecallTrace(unbounded, options), /INVALID_RECALL_TRACE/);
  assert.equal(source.decisions.length, TRACE_MAX_TOTAL);
});

test('user path: native automatic preparation writes a private trace which the host API reads without writes', async t => {
  const f = await fixture(t);
  const trace = await writeRecallTrace(f.root, explanation(), options);
  const result = await readRecallTraces(f.api, f.root);
  assert.deepEqual(result, { schemaVersion: 1, traces: [trace], warnings: [] });
  const files = await fs.readdir(path.join(f.root, TRACE_ROOT));
  assert.deepEqual(files, [traceFilename(trace)]);
  assert.ok(f.calls.some(([kind]) => kind === 'read'));
  assert.ok(f.calls.every(([kind]) => kind !== 'remove'));
  assert.doesNotMatch(await fs.readFile(path.join(f.root, TRACE_ROOT, files[0]), 'utf8'), /Private|session-private-value/);
  assert.equal((await fs.stat(path.join(f.root, TRACE_ROOT, files[0]))).mode & 0o777, 0o600);
});

test('writes serialize per workspace and retain the latest ten by timestamp and UUID', async t => {
  const f = await fixture(t);
  const order = [9, 1, 7, 3, 13, 0, 5, 12, 11, 2, 8, 6, 10, 4];
  const all = await Promise.all(order.map(index => writeRecallTrace(f.root, explanation(), { ...options, now: () => NOW + Math.floor(index / 2) })));
  const expected = [...all].sort(compareRecallTraces).slice(0, TRACE_LIMIT);
  const result = await readRecallTraces(f.api, f.root);
  assert.deepEqual(result.traces.map(row => row.traceId), expected.map(row => row.traceId));
  assert.equal((await fs.readdir(path.join(f.root, TRACE_ROOT))).length, TRACE_LIMIT);
  assert.deepEqual(result.warnings, []);
});

test('malformed, future-version, oversized and filename-mismatched traces are skipped read-only', async t => {
  const f = await fixture(t);
  const good = await writeRecallTrace(f.root, explanation(), options);
  await persist(f, makeRecallTrace(explanation(), { ...options, now: NOW + 1 }), '{"text":"Private body"');
  const future = makeRecallTrace(explanation(), { ...options, now: NOW + 2 }); future.schemaVersion = 2;
  await persist(f, future);
  const big = makeRecallTrace(explanation(), { ...options, now: NOW + 3 });
  const bigName = await persist(f, big, 'x'.repeat(TRACE_MAX_BYTES + 1));
  const mismatch = makeRecallTrace(explanation(), { ...options, now: NOW + 4 });
  await persist(f, mismatch, JSON.stringify(good));
  const before = await fs.readdir(path.join(f.root, TRACE_ROOT));
  const result = await readRecallTraces(f.api, f.root);
  assert.deepEqual(result.traces, [good]);
  assert.deepEqual(result.warnings, ['trace_invalid', 'trace_oversize']);
  assert.ok(!f.calls.some(([kind, name]) => kind === 'read' && name === bigName));
  assert.deepEqual(await fs.readdir(path.join(f.root, TRACE_ROOT)), before);
  assert.ok(result.warnings.every(code => /^[a-z_]{1,40}$/.test(code)));
});

test('actual oversized API response and read failures expose only bounded warning codes', async t => {
  const f = await fixture(t);
  await writeRecallTrace(f.root, explanation(), options);
  f.api.fs.readText = async () => 'x'.repeat(TRACE_MAX_BYTES + 1);
  assert.deepEqual((await readRecallTraces(f.api, f.root)).warnings, ['trace_oversize']);
  f.api.fs.readText = async () => { throw new Error('Private body /private/secret'); };
  assert.deepEqual(await readRecallTraces(f.api, f.root), { schemaVersion: 1, traces: [], warnings: ['trace_read_failed'] });
  f.api.fs.list = async () => { throw new Error('Private body /private/secret'); };
  assert.deepEqual((await readRecallTraces(f.api, f.root)).warnings, ['trace_unavailable']);
});

test('missing wiki never initializes a project; missing trace directory reads and purges as empty', async t => {
  const f = await fixture(t, false);
  assert.equal(await writeRecallTrace(f.root, explanation(), options), null);
  assert.deepEqual(await fs.readdir(f.root), []);
  assert.deepEqual(await readRecallTraces(f.api, f.root), { schemaVersion: 1, traces: [], warnings: [] });
  assert.deepEqual(await purgeTraceReferences(f.api, f.root, memoryKey({ id: 'missing' })), { removed: 0 });
  await fs.mkdir(path.join(f.root, ROOT));
  assert.deepEqual(await readRecallTraces(f.api, f.root), { schemaVersion: 1, traces: [], warnings: [] });
  assert.deepEqual(await fs.readdir(path.join(f.root, ROOT)), []);
});

test('bounded scans stop before reading or removing files when more than 500 entries exist', async t => {
  const f = await fixture(t);
  await f.put(`${TRACE_ROOT}/keep.txt`, 'untouched');
  for (let index = 0; index < TRACE_SCAN_LIMIT; index += 1) await f.put(`${TRACE_ROOT}/other-${index}.txt`, 'untouched');
  await assert.rejects(writeRecallTrace(f.root, explanation(), options), /TRACE_DIRECTORY_LIMIT/);
  assert.deepEqual((await readRecallTraces(f.api, f.root)).warnings, ['trace_directory_limit']);
  await assert.rejects(purgeTraceReferences(f.api, f.root, memoryKey({ id: 'missing' })), /TRACE_DIRECTORY_LIMIT/);
  assert.ok(f.calls.every(([kind]) => kind === 'list'));
});

test('API traversal, mismatched paths and non-files are never opened or removed', async t => {
  const f = await fixture(t);
  const good = await writeRecallTrace(f.root, explanation(), options);
  const list = f.api.fs.list;
  f.api.fs.list = async name => [...await list(name),
    { name: '../outside.json', path: '../outside.json', isDirectory: false, size: 1 },
    { name: traceFilename(makeRecallTrace(explanation(), options)), path: `${ROOT}/memory/real.md`, isDirectory: false, size: 1 },
    { name: traceFilename(makeRecallTrace(explanation(), options)), path: '/outside.json', isDirectory: false, size: 1 }];
  const result = await readRecallTraces(f.api, f.root);
  assert.deepEqual(result.traces, [good]);
  assert.deepEqual(result.warnings, ['trace_unsafe_entry']);
  assert.ok(f.calls.every(([, name]) => name === TRACE_ROOT || name === `${TRACE_ROOT}/${traceFilename(good)}`));
  await assert.rejects(purgeTraceReferences(f.api, f.root, good.decisions[0].key), /TRACE_PURGE_UNSAFE/);
  assert.ok(f.calls.every(([kind]) => kind !== 'remove'));
  assert.throws(() => traceFilename({ ...good, traceId: `${good.traceId}\n` }), /INVALID_RECALL_TRACE/);
  await assert.rejects(writeRecallTrace(`${f.root}/../escape`, explanation(), options), /INVALID_TRACE_WORKSPACE/);
});

test('native helpers preserve traversal, symlink, size and missing-file error semantics', async t => {
  const f = await fixture(t);
  await f.put(`${TRACE_ROOT}/small.json`, 'small');
  assert.equal(await readSafe(f.root, `${TRACE_ROOT}/small.json`, 5), 'small');
  await assert.rejects(readSafe(f.root, `${TRACE_ROOT}/small.json`, 4), /UNSAFE_CONTEXT_FILE/);
  await assert.rejects(readSafe(f.root, `${ROOT}/../outside`, 10), /UNSAFE_PATH/);
  await assert.rejects(safeDirectory(f.root, 'outside'), /UNSAFE_CONTEXT_PATH/);
  assert.equal(missing(Object.assign(new Error(), { code: 'ENOENT' })), true);
  assert.equal(missing(new Error('ENOENT')), false);
  const info = await safeDirectory(f.root, TRACE_ROOT);
  assert.equal(sameFile(info, await safeDirectory(f.root, TRACE_ROOT)), true);
  await fs.symlink(path.join(f.root, TRACE_ROOT, 'small.json'), path.join(f.root, TRACE_ROOT, 'link.json'));
  await assert.rejects(readSafe(f.root, `${TRACE_ROOT}/link.json`, 10), /UNSAFE_CONTEXT_FILE/);
  await assert.rejects(writeRecallTrace(f.root, explanation(), options), /UNSAFE_CONTEXT_FILE/);
});

test('native writes reject symlink wiki roots, memory directories and trace directories', async t => {
  for (const name of [ROOT, `${ROOT}/memory`, TRACE_ROOT]) {
    const f = await fixture(t, false);
    await fs.mkdir(path.dirname(path.join(f.root, name)), { recursive: true });
    const external = path.join(f.root, 'external'); await fs.mkdir(external);
    await fs.symlink(external, path.join(f.root, name));
    await assert.rejects(writeRecallTrace(f.root, explanation(), options), /UNSAFE_(?:WIKI_ROOT|CONTEXT_DIRECTORY)/);
    assert.deepEqual(await fs.readdir(external), []);
  }
});

test('host-shaped metadata cannot prove a symlink is regular; invalid targets fail closed during purge', async t => {
  const f = await fixture(t);
  const trace = makeRecallTrace(explanation(), options);
  await f.put(`${ROOT}/memory/real.md`, 'Private memory body');
  await fs.mkdir(path.join(f.root, TRACE_ROOT));
  await fs.symlink(path.join(f.root, ROOT, 'memory/real.md'), path.join(f.root, TRACE_ROOT, traceFilename(trace)));
  assert.deepEqual((await readRecallTraces(f.api, f.root)).warnings, ['trace_invalid']);
  await assert.rejects(purgeTraceReferences(f.api, f.root, trace.decisions[0].key), /TRACE_PURGE_UNVERIFIED/);
  assert.equal(await fs.readFile(path.join(f.root, ROOT, 'memory/real.md'), 'utf8'), 'Private memory body');
  assert.ok(f.calls.every(([kind]) => kind !== 'remove'));
});

test('canceled and stale writes never publish and clean their exclusively created temporary file', async t => {
  const f = await fixture(t);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(writeRecallTrace(f.root, explanation(), { ...options, signal: aborted.signal }), { name: 'AbortError' });
  await assert.rejects(writeRecallTrace(f.root, explanation(), { ...options, isCurrent: () => false }), /STALE_RECALL_TRACE/);
  assert.deepEqual(await fs.readdir(path.join(f.root, ROOT)), []);
  await fs.mkdir(path.join(f.root, TRACE_ROOT), { recursive: true });
  for (const mode of ['abort', 'stale']) {
    const controller = new AbortController(); let current = true; let intercepted = false;
    const open = fs.open;
    fs.open = async (...args) => {
      const handle = await open(...args);
      if (String(args[0]).endsWith('.tmp')) {
        intercepted = true;
        if (mode === 'abort') controller.abort(); else current = false;
      }
      return handle;
    };
    try {
      await assert.rejects(writeRecallTrace(f.root, explanation(), { ...options, signal: controller.signal, isCurrent: () => current }),
        mode === 'abort' ? { name: 'AbortError' } : /STALE_RECALL_TRACE/);
    } finally { fs.open = open; }
    assert.equal(intercepted, true);
    assert.deepEqual(await fs.readdir(path.join(f.root, TRACE_ROOT)), []);
  }
});

test('cancellation at the rename boundary removes the newly committed inode', async t => {
  const f = await fixture(t);
  const controller = new AbortController(); const rename = fs.rename;
  fs.rename = async (...args) => { await rename(...args); controller.abort(); };
  try {
    await assert.rejects(writeRecallTrace(f.root, explanation(), { ...options, signal: controller.signal }), { name: 'AbortError' });
  } finally { fs.rename = rename; }
  assert.deepEqual(await fs.readdir(path.join(f.root, TRACE_ROOT)), []);
});

test('workspace switch during an awaited API read rejects stale results', async t => {
  const f = await fixture(t);
  await writeRecallTrace(f.root, explanation(), options);
  const read = f.api.fs.readText; const entered = defer(); const release = defer();
  f.api.fs.readText = async name => { const raw = await read(name); entered.resolve(); await release.promise; return raw; };
  const pending = readRecallTraces(f.api, f.root);
  await entered.promise;
  f.switchTo(`${f.root}/other`); release.resolve();
  await assert.rejects(pending, /WORKSPACE_CHANGED/);
  assert.ok(f.calls.every(([kind]) => kind !== 'remove'));
});

test('purge removes only matching verified traces and conservatively removes trimmed traces', async t => {
  const f = await fixture(t);
  const wanted = makeRecallTrace(explanation(), options);
  const unrelated = makeRecallTrace(explanation(2, 'unrelated'), { ...options, now: NOW + 1 });
  const trimmed = makeRecallTrace(explanation(TRACE_MAX_TOTAL, 'trimmed'), { ...options, now: NOW + 2 });
  const wantedName = await persist(f, wanted); const otherName = await persist(f, unrelated); const trimmedName = await persist(f, trimmed);
  await f.put(`${ROOT}/memory/real.md`, 'Private real memory');
  await f.put(`${TRACE_ROOT}/notes.txt`, 'Other file');
  await fs.mkdir(path.join(f.root, TRACE_ROOT, 'nested'));
  assert.deepEqual(await purgeTraceReferences(f.api, f.root, wanted.decisions[0].key), { removed: 2 });
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'remove').map(([, name]) => name).sort(), [wantedName, trimmedName].sort());
  assert.equal(await fs.readFile(path.join(f.root, ROOT, 'memory/real.md'), 'utf8'), 'Private real memory');
  assert.equal(await fs.readFile(path.join(f.root, TRACE_ROOT, 'notes.txt'), 'utf8'), 'Other file');
  assert.deepEqual(await readRecallTraces(f.api, f.root), { schemaVersion: 1, traces: [unrelated], warnings: [] });
  assert.ok(await fs.stat(path.join(f.root, otherName)));
});

test('purge failures, failed deletion verification and workspace switches stay observable', async t => {
  const f = await fixture(t);
  const trace = await writeRecallTrace(f.root, explanation(), options); const key = trace.decisions[0].key;
  const remove = f.api.fs.remove;
  f.api.fs.remove = async () => { throw new Error('Private path error'); };
  await assert.rejects(purgeTraceReferences(f.api, f.root, key), /TRACE_PURGE_FAILED/);
  f.api.fs.remove = async () => {};
  await assert.rejects(purgeTraceReferences(f.api, f.root, key), /TRACE_PURGE_FAILED/);
  f.api.fs.remove = async name => { await remove(name); f.switchTo(`${f.root}/other`); };
  await assert.rejects(purgeTraceReferences(f.api, f.root, key), /WORKSPACE_CHANGED/);
});

test('native writer prunes malformed derived files after inode checks and preserves unrelated data', async t => {
  const f = await fixture(t);
  await persist(f, makeRecallTrace(explanation(), options), '{broken');
  await persist(f, makeRecallTrace(explanation(), { ...options, now: NOW + 1 }), 'x'.repeat(TRACE_MAX_BYTES + 1));
  await f.put(`${ROOT}/memory/real.md`, 'Private memory');
  await f.put(`${TRACE_ROOT}/keep.txt`, 'Keep');
  const trace = await writeRecallTrace(f.root, explanation(), { ...options, now: NOW + 2 });
  assert.deepEqual((await fs.readdir(path.join(f.root, TRACE_ROOT))).sort(), ['keep.txt', traceFilename(trace)].sort());
  assert.equal(await fs.readFile(path.join(f.root, ROOT, 'memory/real.md'), 'utf8'), 'Private memory');
  assert.deepEqual((await readRecallTraces(f.api, f.root)).traces, [trace]);
});

test('read independently limits existing traces to ten without deleting older files', async t => {
  const f = await fixture(t);
  const all = [];
  for (let index = 0; index < 13; index += 1) {
    const trace = makeRecallTrace(explanation(), { ...options, now: NOW + index });
    all.push(trace); await persist(f, trace);
  }
  assert.deepEqual((await readRecallTraces(f.api, f.root)).traces, all.sort(compareRecallTraces).slice(0, TRACE_LIMIT));
  assert.equal((await fs.readdir(path.join(f.root, TRACE_ROOT))).length, 13);
  assert.ok(f.calls.every(([kind]) => kind !== 'remove'));
});

test('filesystem errors after exclusive creation remain observable and clean temporary bytes', async t => {
  const f = await fixture(t);
  const open = fs.open;
  fs.open = async (...args) => {
    const handle = await open(...args);
    if (String(args[0]).endsWith('.tmp')) handle.sync = async () => { throw Object.assign(new Error('Simulated I/O failure'), { code: 'EIO' }); };
    return handle;
  };
  try { await assert.rejects(writeRecallTrace(f.root, explanation(), options), { code: 'EIO' }); }
  finally { fs.open = open; }
  assert.deepEqual(await fs.readdir(path.join(f.root, TRACE_ROOT)), []);
});

test('a queued generation canceled behind an active write never opens a second temporary file', async t => {
  const f = await fixture(t);
  const open = fs.open; const entered = defer(); const release = defer(); let temporaries = 0;
  fs.open = async (...args) => {
    const handle = await open(...args);
    if (String(args[0]).endsWith('.tmp')) { temporaries += 1; entered.resolve(); await release.promise; }
    return handle;
  };
  try {
    const first = writeRecallTrace(f.root, explanation(), options);
    await entered.promise;
    const controller = new AbortController();
    const queued = writeRecallTrace(f.root, explanation(), { ...options, signal: controller.signal });
    controller.abort(); release.resolve();
    await first;
    await assert.rejects(queued, { name: 'AbortError' });
  } finally { release.resolve(); fs.open = open; }
  assert.equal(temporaries, 1);
  assert.equal((await fs.readdir(path.join(f.root, TRACE_ROOT))).length, 1);
});

test('workspace checks stop before I/O and reject a switch during a rejected list await', async t => {
  const f = await fixture(t);
  f.switchTo(`${f.root}/other`);
  await assert.rejects(readRecallTraces(f.api, f.root), /WORKSPACE_CHANGED/);
  assert.deepEqual(f.calls, []);
  f.switchTo(f.root);
  f.api.fs.list = async () => { f.switchTo(`${f.root}/other`); throw Object.assign(new Error('Private missing path'), { code: 'NOT_FOUND' }); };
  await assert.rejects(readRecallTraces(f.api, f.root), /WORKSPACE_CHANGED/);
});

test('host canonical path permissions reject symlink escapes during reads and purges', async t => {
  const f = await fixture(t);
  const trace = makeRecallTrace(explanation(), options);
  const outside = path.join(f.root, 'outside.json');
  await fs.writeFile(outside, JSON.stringify(trace));
  await fs.mkdir(path.join(f.root, TRACE_ROOT), { recursive: true });
  await fs.symlink(outside, path.join(f.root, TRACE_ROOT, traceFilename(trace)));
  assert.deepEqual((await readRecallTraces(f.api, f.root)).warnings, ['trace_read_failed']);
  await assert.rejects(purgeTraceReferences(f.api, f.root, trace.decisions[0].key), /TRACE_PURGE_FAILED/);
  assert.ok(f.calls.every(([kind]) => kind !== 'remove'));
  assert.equal(await fs.readFile(outside, 'utf8'), JSON.stringify(trace));
});

test('host bounded range reads cap allocation even if a file grows after metadata inspection', async t => {
  const f = await fixture(t);
  const trace = await writeRecallTrace(f.root, explanation(), options);
  f.api.fs.readText = async () => { throw new Error('Unbounded text reader must not run'); };
  const ranges = [];
  f.api.fs.readRange = async (name, offset, length) => {
    ranges.push({ offset, length });
    const handle = await fs.open(path.join(f.root, name), 'r');
    try {
      const buffer = Buffer.alloc(length); const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return { bytes: buffer.subarray(0, bytesRead), totalSize: (await handle.stat()).size };
    } finally { await handle.close(); }
  };
  assert.deepEqual((await readRecallTraces(f.api, f.root)).traces, [trace]);
  assert.deepEqual(ranges, [{ offset: 0, length: TRACE_MAX_BYTES + 1 }]);
  f.api.fs.readRange = async () => ({ bytes: new Uint8Array(TRACE_MAX_BYTES + 1), totalSize: 100 * TRACE_MAX_BYTES });
  assert.deepEqual((await readRecallTraces(f.api, f.root)).warnings, ['trace_oversize']);
  f.api.fs.readRange = async () => ({ bytes: new Uint8Array(), totalSize: 1 });
  assert.deepEqual((await readRecallTraces(f.api, f.root)).warnings, ['trace_invalid']);
  f.api.fs.readRange = async () => { f.switchTo(`${f.root}/other`); return { bytes: new Uint8Array(), totalSize: 0 }; };
  await assert.rejects(readRecallTraces(f.api, f.root), /WORKSPACE_CHANGED/);
});

test('a capped listing of exactly 500 entries is treated as potentially incomplete', async t=>{
  const f=await fixture(t);
  await writeRecallTrace(f.root,explanation(),options);
  const list=f.api.fs.list;
  f.api.fs.list=async name=>{
    const actual=await list(name);
    return [...actual,...Array.from({length:TRACE_SCAN_LIMIT-actual.length},(_,i)=>({name:`other-${i}.txt`,path:`${TRACE_ROOT}/other-${i}.txt`,isDirectory:false,size:1}))];
  };
  f.calls.length=0;
  assert.deepEqual((await readRecallTraces(f.api,f.root)).warnings,['trace_directory_limit']);
  await assert.rejects(purgeTraceReferences(f.api,f.root,memoryKey({id:'missing'})),/TRACE_DIRECTORY_LIMIT/);
  assert.ok(f.calls.every(([kind])=>kind==='list'));
});

test('selected records omitted by the automatic presentation budget still persist truthful diagnostics', async t=>{
  const f=await fixture(t);
  const entries=Array.from({length:6},(_,i)=>({id:`budget-${i}`,kind:'memory',category:'memory',title:`Qualified refund rule ${i}`,
    status:'confirmed',content:'Refund approval requires evidence.',updatedAt:'2026-01-01',revision:digest(`budget-${i}`),
    documentRef:{recordId:'11111111-1111-4111-8111-111111111111',readWhen:'Before changing refund exceptions and evidence. '.repeat(5)},
    documentLink:{state:'current',recordId:'11111111-1111-4111-8111-111111111111',readWhen:'Before changing refund exceptions and evidence. '.repeat(5)}}));
  const result=presentation.contextIndexResult(entries,{query:'refund'});
  assert.ok(result.explanation.decisions.some(row=>row.selected&&row.presentation==='omitted'));
  const trace=await writeRecallTrace(f.root,result.explanation,options);
  assert.equal(validateRecallTrace(trace),true);
  assert.deepEqual(trace.counts,result.explanation.counts);
  assert.ok(trace.decisions.some(row=>row.selected&&row.presentation==='omitted'&&row.reasons.includes('budget_limit')));
  assert.deepEqual((await readRecallTraces(f.api,f.root)).traces,[trace]);
});

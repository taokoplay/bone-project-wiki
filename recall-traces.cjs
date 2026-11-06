'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { isAbsolute } = require('node:path');
const { REASON_CODES } = require('./memory-diagnostics.cjs');

const TRACE_ROOT = '.bone-project-wiki/memory/recall-traces';
const TRACE_MAX_BYTES = 20 * 1024;
const TRACE_LIMIT = 10;
const TRACE_SCAN_LIMIT = 500;
const TRACE_MAX_TOTAL = 2000;
const TRACE_MAX_SCORE = 1536; // At most 96 query terms, with field weights totalling 16.
const HASH = /^[a-f0-9]{64}(?![\s\S])/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}(?![\s\S])/;
// Timestamp is canonical UTC with punctuation removed; UUIDs are generated internally.
const TRACE_FILENAME = /^\d{8}T\d{9}Z-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json(?![\s\S])/;
const AUTO_BUDGET = Object.freeze({ maxChars: 1200, maxEntries: 6, maxBodyChars: 180, scope: 'whole_context' });
const TRACE_FIELDS = ['schemaVersion','traceId','sessionKey','preparedAt','mode','selectionVersion','budget','usedChars','textChars','contextHash','snapshotHash','counts','detailsOmitted','decisions'];
const DECISION_FIELDS = ['key','revision','sourceRevision','score','coreReserved','eligible','selected','rank','presentation','reasons'];
const COUNT_FIELDS = ['total','eligible','selected','facts','pointers','omitted'];
const digest = value => createHash('sha256').update(value).digest('hex');
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const revision = value => value === '' || (typeof value === 'string' && HASH.test(value));
function array(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === value.length + 1 && keys.every(key => key === 'length' || (typeof key === 'string'
    && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')));
}
const invalid = () => new Error('INVALID_RECALL_TRACE');
function fields(value, names) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === names.length && keys.every(key => names.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
function validTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
function copyDecision(row) {
  return { key: row.key, revision: row.revision, sourceRevision: row.sourceRevision, score: row.score,
    coreReserved: row.coreReserved, eligible: row.eligible, selected: row.selected, rank: row.rank,
    presentation: row.presentation, reasons: Array.isArray(row.reasons) ? row.reasons.slice(0, REASON_CODES.length + 1) : null };
}
function copyCounts(counts) {
  return { total: counts.total, eligible: counts.eligible, selected: counts.selected,
    facts: counts.facts, pointers: counts.pointers, omitted: counts.omitted };
}
function copyBudget(budget) {
  return { maxChars: budget.maxChars, maxEntries: budget.maxEntries, maxBodyChars: budget.maxBodyChars, scope: budget.scope };
}
function validData(value, checkBytes = true) {
  if (!fields(value, TRACE_FIELDS) || value.schemaVersion !== 1 || value.selectionVersion !== 1 || value.mode !== 'automatic'
    || typeof value.traceId !== 'string' || !UUID.test(value.traceId) || typeof value.sessionKey !== 'string' || !HASH.test(value.sessionKey)
    || !validTime(value.preparedAt) || !fields(value.budget, Object.keys(AUTO_BUDGET))
    || !Object.entries(AUTO_BUDGET).every(([key, expected]) => value.budget[key] === expected)
    || !integer(value.usedChars, AUTO_BUDGET.maxChars) || !integer(value.textChars, AUTO_BUDGET.maxChars)
    || typeof value.contextHash !== 'string' || !HASH.test(value.contextHash) || typeof value.snapshotHash !== 'string' || !HASH.test(value.snapshotHash)
    || !fields(value.counts, COUNT_FIELDS) || !COUNT_FIELDS.every(key => integer(value.counts[key], TRACE_MAX_TOTAL))
    || !array(value.decisions, TRACE_MAX_TOTAL) || !integer(value.detailsOmitted, TRACE_MAX_TOTAL)) return false;
  const counts = value.counts;
  if (counts.total !== value.decisions.length + value.detailsOmitted || counts.eligible > counts.total
    || counts.selected > counts.eligible || counts.selected > AUTO_BUDGET.maxEntries
    || counts.facts + counts.pointers > counts.selected || counts.omitted + counts.facts + counts.pointers !== counts.total) return false;
  const keys = new Set(); const ranks = new Set();
  const actual = { total: value.decisions.length, eligible: 0, selected: 0, facts: 0, pointers: 0, omitted: 0 };
  for (const row of value.decisions) {
    if (!fields(row, DECISION_FIELDS) || typeof row.key !== 'string' || !HASH.test(row.key) || keys.has(row.key)
      || !revision(row.revision) || !revision(row.sourceRevision) || typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > TRACE_MAX_SCORE
      || !['coreReserved','eligible','selected'].every(key => typeof row[key] === 'boolean')
      || !['fact','pointer','omitted'].includes(row.presentation) || !array(row.reasons, REASON_CODES.length)
      || row.reasons.some(code => !REASON_CODES.includes(code)) || new Set(row.reasons).size !== row.reasons.length) return false;
    if (row.selected) {
      if (!row.eligible || !integer(row.rank, counts.selected) || row.rank < 1 || ranks.has(row.rank)) return false;
      ranks.add(row.rank);
    } else if (row.rank !== null || row.presentation !== 'omitted') return false;
    keys.add(row.key);
    actual.eligible += Number(row.eligible); actual.selected += Number(row.selected);
    actual.facts += Number(row.presentation === 'fact'); actual.pointers += Number(row.presentation === 'pointer');
    actual.omitted += Number(row.presentation === 'omitted');
  }
  if (!COUNT_FIELDS.every(key => counts[key] - actual[key] >= 0 && counts[key] - actual[key] <= value.detailsOmitted)) return false;
  return !checkBytes || Buffer.byteLength(JSON.stringify(value)) <= TRACE_MAX_BYTES;
}
function validateRecallTrace(value) {
  try { return validData(value); } catch { return false; }
}
function makeRecallTrace(explanation, { sessionId, now = Date.now } = {}) {
  if (!explanation || explanation.schemaVersion !== 1 || explanation.selectionVersion !== 1 || explanation.mode !== 'automatic'
    || typeof sessionId !== 'string' || !sessionId.length || sessionId.length > 32000
    || !explanation.budget || !explanation.counts || !array(explanation.decisions, TRACE_MAX_TOTAL)) throw invalid();
  const timestamp = new Date(typeof now === 'function' ? now() : now);
  if (!Number.isFinite(timestamp.getTime())) throw invalid();
  const trace = { schemaVersion: 1, traceId: randomUUID(), sessionKey: digest(sessionId), preparedAt: timestamp.toISOString(),
    mode: 'automatic', selectionVersion: 1, budget: copyBudget(explanation.budget), usedChars: explanation.usedChars,
    textChars: explanation.textChars, contextHash: explanation.contextHash, snapshotHash: explanation.snapshotHash,
    counts: copyCounts(explanation.counts), detailsOmitted: 0, decisions: explanation.decisions.map(copyDecision) };
  if (!validData(trace, false)) throw invalid();
  const decisions = trace.decisions;
  let low = 0; let high = decisions.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    trace.decisions = decisions.slice(0, middle); trace.detailsOmitted = decisions.length - middle;
    if (Buffer.byteLength(JSON.stringify(trace)) <= TRACE_MAX_BYTES) low = middle; else high = middle - 1;
  }
  trace.decisions = decisions.slice(0, low); trace.detailsOmitted = decisions.length - low;
  if (!validateRecallTrace(trace)) throw invalid();
  return trace;
}
function traceFilename(trace) {
  if (!validTime(trace?.preparedAt) || typeof trace?.traceId !== 'string' || !UUID.test(trace.traceId)) throw invalid();
  return `${trace.preparedAt.replace(/[-:.]/g, '')}-${trace.traceId}.json`;
}
const compareRecallTraces = (a, b) => b.preparedAt.localeCompare(a.preparedAt) || a.traceId.localeCompare(b.traceId);
const notFound = error => ['ENOENT', 'NOT_FOUND'].includes(error?.code ?? error?.errorCode);
async function workspace(api, workspacePath) {
  if (typeof workspacePath !== 'string' || !isAbsolute(workspacePath)) throw new Error('LOCAL_PROJECT_REQUIRED');
  let current;
  try { current = await api.workspace.get(); } catch { throw new Error('TRACE_WORKSPACE_UNAVAILABLE'); }
  if (!current || current.path !== workspacePath) throw new Error('WORKSPACE_CHANGED');
}
async function hostCall(api, workspacePath, operation) {
  await workspace(api, workspacePath);
  try { return await operation(); } finally { await workspace(api, workspacePath); }
}
function changed(error) {
  return ['WORKSPACE_CHANGED', 'TRACE_WORKSPACE_UNAVAILABLE', 'LOCAL_PROJECT_REQUIRED'].includes(error?.message);
}
async function traceFiles(api, workspacePath) {
  const listing = await hostCall(api, workspacePath, () => api.fs.list(TRACE_ROOT));
  if (!Array.isArray(listing) || listing.length >= TRACE_SCAN_LIMIT) throw new Error('TRACE_DIRECTORY_LIMIT');
  const files = []; let unsafe = false; const names = new Set();
  for (const item of listing) {
    if (!item || typeof item.name !== 'string' || !TRACE_FILENAME.test(item.name)) { unsafe ||= Boolean(item?.name?.endsWith?.('.json')); continue; }
    const name = `${TRACE_ROOT}/${item.name}`;
    if (item.path !== name || item.isDirectory !== false || item.isSymbolicLink === true || item.isFile === false || names.has(name)) { unsafe = true; continue; }
    names.add(name); files.push({ name, filename: item.name });
  }
  return { files, unsafe };
}
async function loadTrace(api, workspacePath, file) {
  const info = await hostCall(api, workspacePath, () => api.fs.stat(file.name));
  if (!integer(info?.size, TRACE_MAX_BYTES)) return { warning: 'trace_oversize' };
  if (!Number.isFinite(info.mtimeMs)) return { warning: 'trace_invalid' };
  let raw;
  if (typeof api.fs.readRange === 'function') {
    const range = await hostCall(api, workspacePath, () => api.fs.readRange(file.name, 0, TRACE_MAX_BYTES + 1));
    if (!(range?.bytes instanceof Uint8Array) || !integer(range.totalSize, TRACE_MAX_BYTES)
      || range.bytes.byteLength > TRACE_MAX_BYTES) return { warning: 'trace_oversize' };
    if (range.totalSize !== info.size || range.bytes.byteLength !== info.size) return { warning: 'trace_invalid' };
    raw = Buffer.from(range.bytes).toString('utf8');
  } else raw = await hostCall(api, workspacePath, () => api.fs.readText(file.name));
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > TRACE_MAX_BYTES) return { warning: 'trace_oversize' };
  const after = await hostCall(api, workspacePath, () => api.fs.stat(file.name));
  if (info.size !== after?.size || info.mtimeMs !== after?.mtimeMs || Buffer.byteLength(raw) !== info.size) return { warning: 'trace_invalid' };
  let trace;
  try { trace = JSON.parse(raw); } catch { return { warning: 'trace_invalid' }; }
  return validateRecallTrace(trace) && traceFilename(trace) === file.filename ? { trace } : { warning: 'trace_invalid' };
}
async function readRecallTraces(api, workspacePath) {
  await workspace(api, workspacePath);
  const warnings = new Set(); const traces = [];
  let listing;
  try { listing = await traceFiles(api, workspacePath); }
  catch (error) {
    if (changed(error)) throw error;
    if (!notFound(error)) warnings.add(error.message === 'TRACE_DIRECTORY_LIMIT' ? 'trace_directory_limit' : 'trace_unavailable');
    return { schemaVersion: 1, traces, warnings: [...warnings] };
  }
  if (listing.unsafe) warnings.add('trace_unsafe_entry');
  for (const file of listing.files) {
    try {
      const result = await loadTrace(api, workspacePath, file);
      if (result.trace) traces.push(result.trace); else warnings.add(result.warning);
    } catch (error) {
      if (changed(error)) throw error;
      warnings.add('trace_read_failed');
    }
  }
  await workspace(api, workspacePath);
  traces.sort(compareRecallTraces);
  return { schemaVersion: 1, traces: traces.slice(0, TRACE_LIMIT), warnings: [...warnings].sort() };
}
async function purgeTraceReferences(api, workspacePath, key) {
  if (typeof key !== 'string' || !HASH.test(key)) throw new Error('INVALID_MEMORY_KEY');
  await workspace(api, workspacePath);
  let listing;
  try { listing = await traceFiles(api, workspacePath); }
  catch (error) { if (notFound(error)) return { removed: 0 }; throw error; }
  if (listing.unsafe) throw new Error('TRACE_PURGE_UNSAFE');
  let removed = 0;
  for (const file of listing.files) {
    let result;
    try { result = await loadTrace(api, workspacePath, file); }
    catch (error) { if (changed(error)) throw error; if (notFound(error)) continue; throw new Error('TRACE_PURGE_FAILED'); }
    // The host has no lstat API. Invalid bytes could belong to a symlink target,
    // so only the native writer may prune malformed files after verifying inodes.
    if (!result.trace) throw new Error('TRACE_PURGE_UNVERIFIED');
    // Omitted details cannot prove absence of this key; all traces are disposable derived data.
    if (result.trace.detailsOmitted === 0 && !result.trace.decisions.some(row => row.key === key)) continue;
    try {
      await hostCall(api, workspacePath, () => api.fs.remove(file.name));
      try { await hostCall(api, workspacePath, () => api.fs.stat(file.name)); }
      catch (error) { if (notFound(error)) { removed += 1; continue; } throw error; }
      throw new Error('TRACE_PURGE_FAILED');
    } catch (error) { if (changed(error)) throw error; throw new Error('TRACE_PURGE_FAILED'); }
  }
  await workspace(api, workspacePath);
  return { removed };
}

module.exports = { makeRecallTrace, validateRecallTrace, readRecallTraces, purgeTraceReferences,
  TRACE_ROOT, TRACE_MAX_BYTES, TRACE_LIMIT, TRACE_SCAN_LIMIT, TRACE_MAX_TOTAL, TRACE_MAX_SCORE,
  TRACE_FILENAME, AUTO_BUDGET, traceFilename, compareRecallTraces };

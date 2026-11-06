'use strict';
const { createHash } = require('node:crypto');
const { memoryTitle } = require('./memory-policy.cjs');

const REASON_CODES = Object.freeze(['not_memory','unreadable','draft','archived','sensitive','request_only','empty','invalid_metadata','scope_mismatch','not_relevant','entry_limit','core_reserved','relevance_match','recent_fallback','source_current','source_stale','source_draft','source_archived','source_missing','source_unreadable','source_ambiguous','body_limit','budget_limit','no_read_route']);
const digest = value => createHash('sha256').update(value).digest('hex');
const memoryKey = entry => digest(JSON.stringify([entry.kind || 'memory', entry.id || entry.path || '', entry.category || 'memory']));
const sourceState = entry => entry.readable === false ? 'unreadable' : entry.documentLink?.state || (entry.documentRef ? 'unreadable' : 'standalone');
const revision = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : '';
function publicDecision(row) {
  const entry = row.entry;
  return {
    key: memoryKey(entry), id: entry.id || '', title: memoryTitle(entry.title),
    status: entry.readable === false ? 'unreadable' : entry.status,
    revision: revision(entry.revision), sourceState: sourceState(entry),
    sourceRevision: revision(entry.documentLink?.document?.revision),
    score: row.score, matchedFields: row.matchedFields || [], coreReserved: Boolean(row.coreReserved),
    eligible: Boolean(row.eligible), selected: Boolean(row.selected), rank: row.rank || null,
    presentation: row.presentation || 'omitted', reasons: [...new Set(row.reasons || [])].filter(code => REASON_CODES.includes(code))
  };
}
function explanationFor(rows, text, { mode, budget, usedChars }) {
  const memories = rows.filter(row => row.entry.kind === 'memory' || row.entry.category === 'memory');
  const decisions = memories.map(publicDecision);
  return {
    schemaVersion: 1, selectionVersion: 1, mode, budget, usedChars, textChars: text.length,
    contextHash: digest(text),
    snapshotHash: digest(JSON.stringify(decisions.map(row => [row.key,row.revision,row.sourceState,row.sourceRevision]).sort((a,b) => a[0].localeCompare(b[0])))),
    counts: { total: decisions.length, eligible: decisions.filter(row => row.eligible).length, selected: decisions.filter(row => row.selected).length,
      facts: decisions.filter(row => row.presentation === 'fact').length, pointers: decisions.filter(row => row.presentation === 'pointer').length,
      omitted: decisions.filter(row => row.presentation === 'omitted').length },
    decisions
  };
}
module.exports = { REASON_CODES, memoryKey, sourceState, publicDecision, explanationFor };

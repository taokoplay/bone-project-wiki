'use strict';
const { usableMemory, sensitiveMemory, normalizedText } = require('./memory-policy.cjs');
const { sourceState } = require('./memory-diagnostics.cjs');

const MAX_SCOPE_PATHS = 16;
const CORE_RESERVE = 2;
const STOP_WORDS = new Set('a an and are as at be before by can change check code continue could do does feature file for from help how i implement in is it me memory my next of on or please project should task that the this to turn update use using validation want we what when with work would you your apps packages src ts js md'.split(' '));
const GENERIC_HAN = /继续|开始|开发|实现|修改|检查|功能|项目|代码|规则|要求|记忆|一下|帮我|请你|如何|怎么|验证|测试/gu;

function normalizeScopePaths(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SCOPE_PATHS) throw new Error('INVALID_MEMORY_SCOPE');
  const paths = value.map(item => {
    if (typeof item !== 'string') throw new Error('INVALID_MEMORY_SCOPE');
    const name = item.trim();
    if (!name || name.length > 240 || name.startsWith('/') || /[\\:\x00-\x1f\x7f]/.test(name)
      || name.split('/').some(part => !part || part === '.' || part === '..') || sensitiveMemory(name)) throw new Error('INVALID_MEMORY_SCOPE');
    return name;
  });
  return [...new Set(paths)];
}

function normalizeMemoryMetadata(input, previous = {}) {
  const scopePaths = input.scopePaths === undefined ? previous.scopePaths : input.scopePaths;
  const importance = input.importance === undefined ? previous.importance : input.importance;
  if (importance !== undefined && !['normal', 'core'].includes(importance)) throw new Error('INVALID_MEMORY_IMPORTANCE');
  return {
    ...(scopePaths !== undefined ? { scopePaths: normalizeScopePaths(scopePaths) } : {}),
    ...(importance !== undefined ? { importance } : {}),
  };
}

function taskPaths(query, explicit = [], rootScopes = []) {
  const result = normalizeScopePaths(explicit);
  // Validate whole tokens so a relative-looking suffix in an absolute/URL token cannot gain scope.
  const tokens = String(query || '').slice(0, 32000).match(/[^\s`"'<>()[\]{},;，。!?]+/gu) || [];
  for (const token of tokens) {
    const name = token.replace(/[.:]+$/, '');
    if (!name.includes('/') && !name.includes('.') && !rootScopes.includes(name)) continue;
    try { result.push(...normalizeScopePaths([name])); } catch { /* Only safe project-relative tokens establish scope. */ }
    if (result.length >= MAX_SCOPE_PATHS) break;
  }
  return [...new Set(result)].slice(0, MAX_SCOPE_PATHS);
}

function queryTerms(query) {
  const value = normalizedText(query).normalize('NFKC').toLowerCase().slice(0, 32000);
  const terms = new Set();
  for (const match of value.matchAll(/[a-z0-9][a-z0-9_-]{1,63}/g)) if (!STOP_WORDS.has(match[0])) terms.add(match[0]);
  for (const match of value.replace(GENERIC_HAN, ' ').matchAll(/\p{Script=Han}{2,}/gu)) {
    const run = [...match[0]].slice(0, 120);
    for (let index = 0; index + 1 < run.length; index += 1) {
      const term = run.slice(index, index + 2).join('');
      terms.add(term);
    }
  }
  return [...terms].slice(0, 96);
}

function eligibility(entry, paths) {
  if (entry.kind !== 'memory' && entry.category !== 'memory') return { eligible:false, reasons:['not_memory'] };
  if (entry.readable === false) return { eligible:false, reasons:['unreadable'] };
  if (entry.status !== 'confirmed') return { eligible:false, reasons:[entry.status === 'archived' ? 'archived' : 'draft'] };
  let scopePaths;
  try { ({ scopePaths = [] } = normalizeMemoryMetadata(entry)); }
  catch { return { eligible:false, reasons:['invalid_metadata'] }; }
  if (scopePaths.length && !scopePaths.some(scope => paths.some(name => name === scope || name.startsWith(`${scope}/`)))) {
    return { eligible:false, reasons:['scope_mismatch'] };
  }
  const state = sourceState(entry);
  const reasons = state === 'standalone' ? [] : [`source_${state}`];
  if (entry.documentRef && !entry.documentLink) return { eligible:false, reasons:['source_unreadable'] };
  if (entry.documentLink && state !== 'current') {
    const known = ['stale','draft','archived','missing','unreadable','ambiguous'].includes(state);
    return { eligible:known, reasons:known ? reasons : ['source_unreadable'] };
  }
  if (usableMemory(entry)) return { eligible:true, reasons };
  return { eligible:false, reasons:[...reasons, sensitiveMemory(normalizedText(entry.content)) ? 'sensitive' : normalizedText(entry.content) ? 'request_only' : 'empty'] };
}

function relevance(entry, terms) {
  // Non-current source text must not influence the score or re-enter a fact.
  const body = entry.documentLink && sourceState(entry) !== 'current' ? '' : entry.content;
  const fields = [
    ['title',entry.title,5], ['readWhen',entry.documentRef?.readWhen,4],
    ['topics',(entry.topics || []).join(' '),4], ['tags',(entry.tags || []).join(' '),2],
    ['body',String(body || '').slice(0,4000),1]
  ];
  let score = 0;
  const matchedFields = [];
  for (const [name,text,weight] of fields) {
    const normalized = normalizedText(text).normalize('NFKC').toLowerCase();
    const hits = terms.filter(term => normalized.includes(term)).length;
    if (hits) { score += hits * weight; matchedFields.push(name); }
  }
  return { score, matchedFields };
}

function analyzeMemorySelection(entries, options = {}) {
  const rootScopes = entries.flatMap(entry => Array.isArray(entry.scopePaths) ? entry.scopePaths.filter(name => typeof name === 'string' && !name.includes('/')) : []);
  const paths = taskPaths(options.query, options.paths, rootScopes);
  const terms = queryTerms(options.query);
  const limit = Math.max(0, options.limit ?? 6);
  const decisions = entries.map(entry => {
    const result = eligibility(entry,paths);
    return { entry, ...result, ...(result.eligible ? relevance(entry,terms) : { score:0, matchedFields:[] }),
      selected:false, coreReserved:false, rank:null, presentation:'omitted' };
  });
  const ranked = decisions.filter(row => row.eligible);
  ranked.sort((a,b) => b.score-a.score
    || String(b.entry.updatedAt || '').localeCompare(String(a.entry.updatedAt || ''))
    || String(a.entry.id || a.entry.path || a.entry.title).localeCompare(String(b.entry.id || b.entry.path || b.entry.title)));
  const reserved = ranked.filter(row => row.entry.importance === 'core').slice(0,Math.min(CORE_RESERVE,limit));
  const reservedSet = new Set(reserved);
  const relevant = ranked.filter(row => !reservedSet.has(row) && (!terms.length || row.score > 0));
  const chosen = [...reserved,...relevant].slice(0,limit);
  chosen.forEach((row,index) => {
    row.selected = true; row.rank = index+1; row.coreReserved = reservedSet.has(row);
    row.reasons.push(row.coreReserved ? 'core_reserved' : terms.length ? 'relevance_match' : 'recent_fallback');
  });
  for (const row of ranked) if (!row.selected) row.reasons.push(terms.length && !row.score && !reservedSet.has(row) ? 'not_relevant' : 'entry_limit');
  return { decisions, chosen, applicable:ranked.map(row => row.entry) };
}

function applicableMemories(entries, options = {}) {
  return analyzeMemorySelection(entries,options).applicable;
}
function selectMemories(entries, options = {}) {
  return analyzeMemorySelection(entries,options).chosen.map(row => row.entry);
}

module.exports = { normalizeScopePaths, normalizeMemoryMetadata, taskPaths, queryTerms, applicableMemories, selectMemories, analyzeMemorySelection };

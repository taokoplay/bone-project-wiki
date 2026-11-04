'use strict';
const { usableMemory, sensitiveMemory, normalizedText } = require('./memory-policy.cjs');

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

function applicableMemories(entries, options = {}) {
  const rootScopes = entries.flatMap(entry => Array.isArray(entry.scopePaths) ? entry.scopePaths.filter(name => typeof name === 'string' && !name.includes('/')) : []);
  const paths = taskPaths(options.query, options.paths, rootScopes);
  return entries.filter(entry => {
    if ((entry.kind !== 'memory' && entry.category !== 'memory') || entry.status !== 'confirmed') return false;
    try {
      const { scopePaths = [] } = normalizeMemoryMetadata(entry);
      if (scopePaths.length && !scopePaths.some(scope => paths.some(name => name === scope || name.startsWith(`${scope}/`)))) return false;
    } catch { return false; }
    if (usableMemory(entry)) return true;
    // A verified unavailable link may supply a route and state, never its former facts.
    return entry.content === '' && entry.documentLink && entry.documentLink.state !== 'current';
  });
}

function relevance(entry, terms) {
  const fields = [
    [entry.title, 5],
    [entry.documentRef?.readWhen, 4],
    [(entry.topics || []).join(' '), 4],
    [(entry.tags || []).join(' '), 2],
    [String(entry.content || '').slice(0, 4000), 1],
  ].map(([text, weight]) => [normalizedText(text).normalize('NFKC').toLowerCase(), weight]);
  return terms.reduce((score, term) => score + fields.reduce((sum, [text, weight]) => sum + (text.includes(term) ? weight : 0), 0), 0);
}

function selectMemories(entries, options = {}) {
  const terms = queryTerms(options.query);
  const limit = options.limit ?? 6;
  const ranked = applicableMemories(entries, options).map(entry => ({ entry, score: relevance(entry, terms) }));
  ranked.sort((a, b) => b.score - a.score
    || String(b.entry.updatedAt || '').localeCompare(String(a.entry.updatedAt || ''))
    || String(a.entry.id || a.entry.path || a.entry.title).localeCompare(String(b.entry.id || b.entry.path || b.entry.title)));
  const reserved = ranked.filter(row => row.entry.importance === 'core').slice(0, Math.min(CORE_RESERVE, limit));
  const chosen = new Set(reserved.map(row => row.entry));
  const relevant = ranked.filter(row => !chosen.has(row.entry) && (!terms.length || row.score > 0));
  return [...reserved, ...relevant].slice(0, limit).map(row => row.entry);
}

module.exports = { normalizeScopePaths, normalizeMemoryMetadata, taskPaths, queryTerms, applicableMemories, selectMemories };

import fs from 'node:fs/promises';
import { safeDirectory, readSafe, sameFile, missing } from './memory-files.mjs';
import path from 'node:path';
import core from './core.cjs';
import policy from './memory-policy.cjs';
import presentation from './memory-presentation.cjs';
import overview from './memory-overview.cjs';

const { ROOT, MEMORY_ROOT, KNOWLEDGE_ROOT, decode, encode, normalize, recordPath, hash, relative, isKnowledgeCategory } = core;
const { MEMORY_CONTENT_LIMIT, normalizedText, sensitiveMemory, usableMemory, memoryRequest } = policy;
const { contextIndexResult } = presentation;
const { unavailableMemory } = overview;
const RECORD_PATH = new RegExp(`^\\${ROOT}/memory/[a-z0-9-]+\\.md$`);
const RECORD_LIMIT = 256000;
const INDEX_LIMIT = 4 * 1024 * 1024;
const LIBRARY_LIMIT = 48 * 1024 * 1024;

async function readMemoryIndex(base) {
  try {
    const parsed = JSON.parse(await readSafe(base, `${MEMORY_ROOT}/index.json`, INDEX_LIMIT));
    if (parsed?.version !== 1 || parsed.section !== 'memory' || !Array.isArray(parsed.entries) || parsed.entries.length > 2000) return null;
    const valid = row => row && typeof row.path === 'string' && RECORD_PATH.test(row.path) && !row.corrupted
      && typeof row.title === 'string' && row.category === 'memory' && typeof row.updatedAt === 'string' && Array.isArray(row.topics);
    if (!parsed.entries.every(valid)) return null;
    const before = await safeDirectory(base, MEMORY_ROOT);
    const files = await fs.readdir(path.join(base, MEMORY_ROOT), { withFileTypes: true });
    if (files.length > 2500) throw new Error('CONTEXT_DIRECTORY_LIMIT');
    if (!sameFile(before, await safeDirectory(base, MEMORY_ROOT))) throw new Error('CONTEXT_CHANGED');
    const actual = new Set(files.filter(file => file.isFile() && /^[a-z0-9-]+\.md$/.test(file.name)).map(file => `${MEMORY_ROOT}/${file.name}`));
    if (actual.size !== parsed.entries.length || parsed.entries.some(row => !actual.has(row.path))) return null;
    for (const row of parsed.entries) {
      if (typeof row.size !== 'number' || typeof row.mtimeMs !== 'number') continue;
      const info = await fs.lstat(path.join(base, row.path));
      if (info.size !== row.size || info.mtimeMs !== row.mtimeMs) return null;
    }
    return parsed.entries;
  } catch (error) {
    if (missing(error) || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function readMemoryRecords(base, reads, failures = []) {
  let info;
  try { info = await safeDirectory(base, MEMORY_ROOT); } catch (error) { if (missing(error)) return []; throw error; }
  const files = await fs.readdir(path.join(base, MEMORY_ROOT), { withFileTypes: true });
  if (files.filter(file=>file.name!=='recall-traces'||!file.isDirectory()).length > 500) throw new Error('CONTEXT_DIRECTORY_LIMIT');
  if (!sameFile(info, await safeDirectory(base, MEMORY_ROOT))) throw new Error('CONTEXT_CHANGED');
  const rows = files.filter(file => file.isFile() && /^[a-z0-9-]+\.md$/.test(file.name)).map(file => ({ path: `${MEMORY_ROOT}/${file.name}` }));
  return readMemoryRows(base, rows, reads, failures);
}

async function readMemoryRows(base, rows, reads, failures = []) {
  const entries = []; let bytes = 0;
  for (const row of rows) {
    try {
      const raw = await readSafe(base, row.path, RECORD_LIMIT);
      bytes += Buffer.byteLength(raw);
      if (bytes > LIBRARY_LIMIT) throw new Error('CONTEXT_LIBRARY_LIMIT');
      entries.push(decode(raw, row.path));
      reads.records += 1;
    } catch (error) {
      if (error.message === 'CONTEXT_LIBRARY_LIMIT') throw error;
      // A failed body read never promotes cached fields into a fact or scope.
      failures.push(unavailableMemory({ id:row.id || path.posix.basename(row.path,'.md'), path:row.path }));
    }
  }
  return entries;
}

function knowledgePath(value) {
  try {
    relative(value);
    const parts = value.split('/');
    return value.startsWith(`${KNOWLEDGE_ROOT}/`) && parts.length >= 4 && isKnowledgeCategory(parts[2]) && /\.md$/i.test(parts.at(-1));
  } catch { return false; }
}

async function readKnowledgeIndex(base, reads) {
  try {
    const parsed = JSON.parse(await readSafe(base, `${KNOWLEDGE_ROOT}/index.json`, INDEX_LIMIT));
    reads.knowledgeIndex = 1;
    if (parsed?.version !== 1 || parsed.section !== 'knowledge' || !Array.isArray(parsed.entries) || parsed.entries.length > 2000) return null;
    const rows = [];
    for (const row of parsed.entries) {
      if (!row || typeof row.path !== 'string') return null;
      relative(row.path);
      if (!row.path.startsWith(`${KNOWLEDGE_ROOT}/`)) return null;
      if (row.kind !== 'document' && !row.corrupted) continue;
      if (!knowledgePath(row.path) || !isKnowledgeCategory(row.category) || row.path !== recordPath(row)
        || typeof row.title !== 'string' || row.title.length > 200 || typeof row.createdAt !== 'string'
        || typeof row.updatedAt !== 'string' || !['confirmed', 'draft', 'archived'].includes(row.status)
        || !Array.isArray(row.topics) || !Array.isArray(row.tags)) return null;
      rows.push(row);
    }
    return new Map(rows.map(row => [row.path, row]));
  } catch (error) {
    if (missing(error) || error instanceof SyntaxError || /^UNSAFE_PATH/.test(error.message)) return null;
    throw error;
  }
}

async function listKnowledge(base) {
  const files = new Map(); const blocked = [];
  const pending = [KNOWLEDGE_ROOT]; let directories = 0; let bytes = 0;
  while (pending.length) {
    const directory = pending.pop();
    if (++directories > 500) throw new Error('CONTEXT_DIRECTORY_LIMIT');
    const before = await safeDirectory(base, directory);
    const children = await fs.readdir(path.join(base, directory), { withFileTypes: true });
    if (children.length > 1000) throw new Error('CONTEXT_DIRECTORY_LIMIT');
    if (!sameFile(before, await safeDirectory(base, directory))) throw new Error('CONTEXT_CHANGED');
    for (const child of children) {
      if (child.name.startsWith('.')) continue;
      const name = `${directory}/${child.name}`;
      if (directory === KNOWLEDGE_ROOT && child.isDirectory() && !isKnowledgeCategory(child.name)) continue;
      const info = await fs.lstat(path.join(base, name));
      if (info.isSymbolicLink()) { blocked.push(name); continue; }
      if (info.isDirectory()) { pending.push(name); continue; }
      if (!info.isFile() || !knowledgePath(name)) continue;
      files.set(name, { path: name, size: info.size, mtimeMs: info.mtimeMs });
      bytes += info.size;
      if (files.size > 2000) throw new Error('CONTEXT_DOCUMENT_LIMIT');
      if (bytes > LIBRARY_LIMIT) throw new Error('CONTEXT_LIBRARY_LIMIT');
    }
  }
  return { files, blocked };
}

async function projectLinkedMemories(base, memories, reads) {
  if (!memories.some(entry => entry.documentRef)) return memories;
  const { default: links } = await import('./document-links.cjs');
  const { stableRecordId, normalizeDocumentRef, projectDocumentMemory } = links;
  reads.knowledgeIndex = 0; reads.documents = 0;
  const refs = new Map(memories.filter(entry => entry.documentRef).map(entry => [entry, normalizeDocumentRef(entry.documentRef)]));
  const wanted = new Set([...refs.values()].map(ref => ref.recordId));
  const unavailable = new Set(); const documents = new Map();
  let unknownUnreadable = false;
  const markUnavailable = () => { for (const recordId of wanted) unavailable.add(recordId); };
  try {
    const index = await readKnowledgeIndex(base, reads);
    let listing;
    try { listing = await listKnowledge(base); }
    catch (error) { if (missing(error)) listing = { files: new Map(), blocked: [] }; else throw error; }
    for (const [name, row] of index || []) {
      if (!wanted.has(stableRecordId(row))) continue;
      if (listing.blocked.some(blocked => name === blocked || name.startsWith(`${blocked}/`))) unavailable.add(stableRecordId(row));
    }
    const readDocument = async file => {
      try {
        const raw = await readSafe(base, file.path, RECORD_LIMIT);
        reads.documents += 1;
        const document = decode(raw, file.path);
        if (document.kind !== 'document') return;
        documents.set(file.path, document);
      } catch {
        unknownUnreadable = true;
      }
    };
    // Cached identities are locators only: even unchanged files can contain a duplicate identity.
    for (const file of listing.files.values()) await readDocument(file);
    if (listing.blocked.length) unknownUnreadable = true;
  } catch (error) {
    if (!missing(error)) markUnavailable();
  }
  const actual = [...documents.values()];
  return memories.map(memory => {
    const ref = refs.get(memory);
    if (!ref) return memory;
    const projected = projectDocumentMemory(memory, actual);
    if (projected.documentLink?.state !== 'ambiguous'
      && (unavailable.has(ref.recordId) || unknownUnreadable)) {
      return { ...projected, content: '', documentLink: { state: 'unreadable', recordId: ref.recordId, readWhen: ref.readWhen } };
    }
    return projected;
  });
}

export async function memoryReferencesPresent(cwd, references) {
  if (!Array.isArray(references) || references.length > 2000 || references.some(name=>typeof name !== 'string' || !RECORD_PATH.test(name))) return false;
  if (!references.length) return true;
  try {
    const before = await safeDirectory(cwd,MEMORY_ROOT);
    for (const name of references) {
      const info = await fs.lstat(path.join(cwd,name));
      if (!info.isFile() || info.isSymbolicLink()) return false;
    }
    return sameFile(before,await safeDirectory(cwd,MEMORY_ROOT));
  } catch (error) { if (missing(error)) return false; throw error; }
}

export async function readProjectContextStats(cwd, options = {}) {
  const reads = { index: 0, records: 0 };
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return { text: null, reads };
  try { await safeDirectory(cwd, ROOT); } catch (error) { if (missing(error)) return { text: null, reads }; throw error; }
  const indexed = await readMemoryIndex(cwd);
  const failures = [];
  let entries;
  if (indexed) {
    reads.index = 1;
    entries = await readMemoryRows(cwd,indexed,reads,failures);
  } else entries = await readMemoryRecords(cwd,reads,failures);
  const memories = entries.filter(entry=>entry.status==='confirmed'&&usableMemory(entry));
  const included = new Set(memories);
  const projected = await projectLinkedMemories(cwd,memories,reads);
  const diagnosticEntries = [...projected,...entries.filter(entry=>!included.has(entry)),...failures];
  const result = contextIndexResult(projected,{...options,diagnosticEntries});
  return {text:result.text,reads,...(options.explain ? {explanation:result.explanation,references:diagnosticEntries.map(entry=>entry.path)} : {})};
}

export async function readProjectContext(cwd, options = {}) { return (await readProjectContextStats(cwd, options)).text; }

async function existingMemoryContents(cwd) {
  return new Set((await readMemoryRecords(cwd, { records: 0 })).map(entry => normalizedText(entry.content).toLowerCase()));
}

async function ensureMemoryDirectory(cwd) {
  const root = path.join(cwd, ROOT);
  try { await fs.mkdir(root); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await safeDirectory(cwd, ROOT);
  try { await fs.mkdir(path.join(cwd, MEMORY_ROOT)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await safeDirectory(cwd, MEMORY_ROOT);
}

export async function saveAutomaticMemories(cwd, candidates, signal) {
  if (!Array.isArray(candidates) || typeof cwd !== 'string' || !path.isAbsolute(cwd)) return 0;
  const valid = candidates.map(candidate => ({ ...candidate, content: normalizedText(candidate?.content) }))
    .filter(candidate => candidate.content.length <= MEMORY_CONTENT_LIMIT && usableMemory(candidate)
      && memoryRequest(`请记住：${candidate.content}`).content === candidate.content).slice(0, 3);
  if (!valid.length) return 0;
  signal?.throwIfAborted();
  await ensureMemoryDirectory(cwd);
  const existing = await existingMemoryContents(cwd); let saved = 0;
  for (const candidate of valid) {
    const key = candidate.content.toLowerCase();
    if (existing.has(key)) continue;
    const title = normalizedText(candidate.title);
    const entry = normalize({ title: (title && !sensitiveMemory(title) ? title : candidate.content).slice(0, 200), category: 'memory', kind: 'memory', status: 'confirmed', tags: ['automatic'], source: 'automatic-agent-memory', content: candidate.content });
    const raw = encode(entry); const target = path.join(cwd, recordPath(entry));
    const temporary = `${target}.tmp-${process.pid}-${hash(raw).slice(0, 12)}`;
    let created = false;
    try {
      signal?.throwIfAborted();
      await safeDirectory(cwd, MEMORY_ROOT);
      const handle = await fs.open(temporary, 'wx');
      created = true;
      try { await handle.writeFile(raw, 'utf8'); } finally { await handle.close(); }
      signal?.throwIfAborted();
      await safeDirectory(cwd, MEMORY_ROOT);
      await fs.rename(temporary, target);
    } finally { if (created) await fs.rm(temporary, { force: true }); }
    existing.add(key); saved += 1;
  }
  if (saved) {
    await safeDirectory(cwd, MEMORY_ROOT);
    await fs.rm(path.join(cwd, `${MEMORY_ROOT}/index.json`), { force: true });
  }
  return saved;
}

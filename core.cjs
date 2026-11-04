'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { stableRecordId, normalizeDocumentRef } = require('./document-links.cjs');
const { normalizeMemoryMetadata } = require('./memory-selection.cjs');
const { contextText, contextIndex } = require('./memory-presentation.cjs');
const ROOT = '.bone-project-wiki';
const KNOWLEDGE_ROOT = `${ROOT}/knowledge`;
const MEMORY_ROOT = `${ROOT}/memory`;
const DEVELOPMENT_ROOT = `${ROOT}/development`;
const KNOWLEDGE_CATEGORIES = ['general','notes','references','research','decisions','resources','prototypes','attachments','archive'];
const CATEGORIES = [...KNOWLEDGE_CATEGORIES, 'memory', 'development'];
const SECTIONS = ['knowledge','memory','development'];
const KINDS = ['document','memory','handoff','prototype','image','attachment','audio','video','pdf'];
const isCategory = value => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('./') || trimmed.startsWith('../')) return false;
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) return false;
  return true;
};
const isKnowledgeCategory = value => isCategory(value) && !['memory', 'development'].includes(value.trim().toLowerCase());
const hash = text => createHash('sha256').update(text).digest('hex');
function text(value, name, max = 200000) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`INVALID_INPUT: ${name}`);
  return value;
}
function strings(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) throw new Error(`INVALID_INPUT: ${name}`);
  return [...new Set(value.map(v => text(v, name, 120).trim()).filter(Boolean))];
}
function id(value) {
  if (typeof value !== 'string') throw new Error('INVALID_ID');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || /[/\\:\x00-\x1f]/.test(trimmed)) throw new Error('INVALID_ID');
  return trimmed;
}
function relative(value) {
  text(value, 'path', 500);
  if (!value || value.startsWith('/') || /[\\:\x00-\x1f]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('UNSAFE_PATH');
  return value;
}
function sectionForEntry(entry) {
  if (entry.kind === 'memory' || entry.category === 'memory') return 'memory';
  if (entry.kind === 'handoff' || entry.category === 'development') return 'development';
  return 'knowledge';
}
function sectionRoot(section) {
  if (section === 'memory') return MEMORY_ROOT;
  if (section === 'development') return DEVELOPMENT_ROOT;
  if (section === 'knowledge') return KNOWLEDGE_ROOT;
  throw new Error('INVALID_SECTION');
}
function safeFileId(name) {
  if (typeof name !== 'string') return randomUUID();
  const clean = name.trim().replace(/[/\\?%*:|"<>.\x00-\x1f]/g, '-').replace(/\s+/g, '-').slice(0, 80);
  return clean || randomUUID();
}
function recordPath(entry) {
  const section = sectionForEntry(entry);
  if (section === 'knowledge') return `${KNOWLEDGE_ROOT}/${entry.category}/${entry.id}.md`;
  return `${sectionRoot(section)}/${entry.id}.md`;
}
function indexPath(section) { return `${sectionRoot(section)}/index.json`; }
function encode(entry) {
  const { content = '', revision, path, section, documentLink, ...meta } = entry;
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n${content}`;
}
function decode(raw, path) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  let meta = null, content = raw;
  if (match) {
    try {
      meta = JSON.parse(match[1]);
      content = raw.slice(match[0].length);
    } catch {
      const titleMatch = /title:\s*(.+)/.exec(match[1]);
      const title = titleMatch ? titleMatch[1].replace(/^['"]|['"]$/g, '').trim() : '';
      meta = title ? { title } : null;
      content = raw.slice(match[0].length);
    }
  }
  const knowledgeMatch = /^\.bone-project-wiki\/knowledge\/([^/]+)\/(.+)\.md$/.exec(path);
  if (!meta || meta.schemaVersion !== 1) {
    if (knowledgeMatch && isKnowledgeCategory(knowledgeMatch[1])) {
      const category = knowledgeMatch[1];
      const docId = knowledgeMatch[2];
      const headingMatch = /^#\s+(.+)$/m.exec(content);
      const title = (meta?.title || headingMatch?.[1] || docId).trim();
      meta = {
        schemaVersion: 1,
        id: docId,
        recordId: stableRecordId({ kind: 'document', category, id: docId }),
        title: title.slice(0, 200),
        category,
        kind: 'document',
        status: 'draft',
        tags: [],
        topics: [],
        source: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      throw new Error(`INVALID_DOCUMENT: ${path}`);
    }
  }
  id(meta.id);
  if (meta.schemaVersion !== 1 || !KINDS.includes(meta.kind) || !isCategory(meta.category)) throw new Error(`UNSUPPORTED_DOCUMENT: ${path}`);
  if (!['draft','confirmed','archived'].includes(meta.status)) throw new Error(`INVALID_STATUS: ${path}`);
  text(meta.title, 'title', 200);
  meta.tags = strings(meta.tags, 'tags'); meta.topics = strings(meta.topics, 'topics');
  text(meta.updatedAt, 'updatedAt', 40); text(meta.createdAt, 'createdAt', 40);
  if (meta.scopePaths !== undefined || meta.importance !== undefined) {
    if (meta.kind !== 'memory') throw new Error('MEMORY_METADATA_REQUIRES_MEMORY');
    Object.assign(meta, normalizeMemoryMetadata(meta));
  }
  const persistedIdentity = meta.recordId !== undefined;
  if ((meta.kind === 'memory' && meta.category !== 'memory') || (meta.kind === 'handoff' && meta.category !== 'development')) throw new Error('INVALID_MEMORY_CATEGORY');
  if (meta.kind === 'document') meta.recordId = stableRecordId(meta);
  if (meta.documentRef !== undefined) {
    if (meta.kind !== 'memory') throw new Error('INVALID_DOCUMENT_REF');
    meta.documentRef = normalizeDocumentRef(meta.documentRef);
  }
  if (['prototype','image','attachment','audio','video','pdf'].includes(meta.kind)) meta.files = validateFiles(meta.files, meta.kind, meta.entryPath);
  else if (meta.files !== undefined) throw new Error('UNEXPECTED_FILES');
  if (path !== recordPath(meta)) {
    if (persistedIdentity && meta.kind === 'document' && knowledgeMatch && isKnowledgeCategory(knowledgeMatch[1])) {
      meta.category = knowledgeMatch[1]; meta.id = id(knowledgeMatch[2]);
    } else throw new Error(`DOCUMENT_PATH_MISMATCH: ${path}`);
  }
  return { ...meta, content, path, section: sectionForEntry(meta), revision: hash(raw) };
}
function summarize(entry) {
  const { content, files, ...meta } = entry;
  return meta;
}
function normalize(input, previous) {
  const kind = input.kind || previous?.kind || 'document';
  const defaultCategory = kind === 'memory' ? 'memory' : kind === 'handoff' ? 'development' : 'general';
  const category = input.category || previous?.category || defaultCategory;
  if ((kind === 'memory' && category !== 'memory') || (kind === 'handoff' && category !== 'development')) throw new Error('INVALID_MEMORY_CATEGORY');
  if (kind !== 'memory' && kind !== 'handoff' && !isKnowledgeCategory(category)) throw new Error('INVALID_KNOWLEDGE_CATEGORY');
  const status = input.status || previous?.status || 'draft';
  if (!['draft','confirmed','archived'].includes(status)) throw new Error('INVALID_CLASSIFICATION');
  if (!KINDS.includes(kind)) throw new Error('INVALID_CLASSIFICATION');
  if (previous && kind !== previous.kind) throw new Error('IMMUTABLE_KIND: record kind cannot change after creation');
  if (kind !== 'memory' && (input.scopePaths !== undefined || input.importance !== undefined)) throw new Error('MEMORY_METADATA_REQUIRES_MEMORY');
  const memoryMetadata = kind === 'memory' ? normalizeMemoryMetadata(input, previous) : {};
  const title = text(input.title, 'title', 200).trim();
  if (!title) throw new Error('TITLE_REQUIRED');
  const now = new Date().toISOString();
  let finalId;
  if (kind === 'document') {
    const isUuid = previous?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previous.id);
    if (!previous?.id || isUuid || (previous.title && previous.title !== title)) {
      finalId = safeFileId(title);
    } else {
      finalId = previous.id;
    }
  } else {
    finalId = previous?.id || (input.id ? id(input.id) : randomUUID());
  }
  const reference = input.documentRef === undefined ? previous?.documentRef : input.documentRef;
  if (reference != null && kind !== 'memory') throw new Error('INVALID_DOCUMENT_REF');
  return { schemaVersion: 1, id: finalId, title, category, kind, status,
    ...memoryMetadata,
    ...(kind === 'document' ? { recordId: previous ? stableRecordId(previous) : randomUUID() } : {}),
    ...(reference != null ? { documentRef: normalizeDocumentRef(reference) } : {}),
    tags: strings(input.tags, 'tags'), topics: strings(input.topics, 'topics'),
    source: text(input.source || '', 'source', 2000), createdAt: previous?.createdAt || now, updatedAt: now,
    content: text(input.content || '', 'content'), ...(previous?.files ? { files: previous.files, entryPath: previous.entryPath } : {}) };
}
function validateFiles(files, kind, entryPath) {
  if (!Array.isArray(files) || !files.length || files.length > 100) throw new Error('INVALID_FILES');
  const names = new Set(); let bytes = 0;
  const result = files.map(file => {
    const path = relative(file.path);
    if (names.has(path.toLowerCase())) throw new Error('DUPLICATE_FILE');
    names.add(path.toLowerCase());
    if (typeof file.content === 'string' && file.dataUrl === undefined) {
      if (!/\.(html?|css|js|mjs|json|md|txt)$/i.test(path)) throw new Error('UNSUPPORTED_TEXT_FILE');
      bytes += Buffer.byteLength(file.content);
      return { path, content: file.content };
    }
    if (typeof file.dataUrl === 'string' && file.content === undefined) {
      const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.dataUrl);
      if (!match || !match[2] || match[2].length % 4) throw new Error('UNSUPPORTED_IMAGE');
      const data = Buffer.from(match[2], 'base64');
      if (data.toString('base64') !== match[2]) throw new Error('INVALID_IMAGE_ENCODING');
      bytes += data.length;
      return { path, dataUrl: file.dataUrl, sha256: hash(data) };
    }
    throw new Error('INVALID_FILE_CONTENT');
  });
  if (bytes > 10 * 1024 * 1024) throw new Error('BUNDLE_TOO_LARGE');
  if (kind === 'prototype' && (!result.some(f => f.path === entryPath && /\.html?$/i.test(f.path) && typeof f.content === 'string'))) throw new Error('HTML_ENTRY_REQUIRED');
  if (kind === 'image' && (result.length !== 1 || !result[0].dataUrl)) throw new Error('SINGLE_IMAGE_REQUIRED');
  return result;
}
module.exports = { ROOT, KNOWLEDGE_ROOT, MEMORY_ROOT, DEVELOPMENT_ROOT, KNOWLEDGE_CATEGORIES, CATEGORIES, SECTIONS, KINDS, isCategory, isKnowledgeCategory, hash, text, id, relative, sectionForEntry, sectionRoot, recordPath, indexPath, encode, decode, summarize, normalize, validateFiles, contextText, contextIndex, safeFileId };

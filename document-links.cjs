'use strict';
const { createHash } = require('node:crypto');
const { sensitiveMemory, memoryTitle } = require('./memory-policy.cjs');
const digest = value => createHash('sha256').update(value).digest('hex');
const RECORD_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|legacy-[0-9a-f]{64})$/;
function validRecordId(value) { return typeof value === 'string' && RECORD_ID.test(value); }
function stableRecordId(entry) {
  if (entry.recordId !== undefined) {
    if (!validRecordId(entry.recordId)) throw new Error('INVALID_RECORD_ID');
    return entry.recordId;
  }
  return `legacy-${digest(JSON.stringify([entry.kind, entry.category, entry.id, entry.createdAt || '']))}`;
}
function documentContentHash(entry) { return digest(String(entry.content || '')); }
function normalizeDocumentRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validRecordId(value.recordId)
    || typeof value.contentHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.contentHash)
    || typeof value.readWhen !== 'string' || !value.readWhen.trim() || value.readWhen.length > 240
    || /[\x00-\x1f\x7f]/.test(value.readWhen) || sensitiveMemory(value.readWhen)) throw new Error('INVALID_DOCUMENT_REF');
  if (Object.keys(value).some(key => !['recordId', 'contentHash', 'readWhen'].includes(key))) throw new Error('INVALID_DOCUMENT_REF');
  return { recordId: value.recordId, contentHash: value.contentHash, readWhen: value.readWhen.trim() };
}
function documentMeta(entry, title) {
  return { id: entry.id, recordId: stableRecordId(entry), title, path: entry.path, revision: entry.revision, status: entry.status };
}
// A projection never changes persisted content or revisions. Only a matching,
// confirmed source may lend its summary to the current task context.
function projectDocumentMemory(memory, documents, sourceUnverified = false) {
  if (!memory.documentRef) return memory;
  const ref = normalizeDocumentRef(memory.documentRef);
  const matches = documents.filter(entry => entry.kind === 'document' && stableRecordId(entry) === ref.recordId);
  const active = matches.filter(entry => entry.status !== 'archived');
  let state, document;
  if (active.length > 1) state = 'ambiguous';
  else {
    document = active[0] || matches.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (sourceUnverified) state = 'unreadable';
    else if (!document) state = 'missing';
    else if (document.unreadable) state = 'unreadable';
    else if (document.status === 'archived') state = 'archived';
    else if (document.status !== 'confirmed') state = 'draft';
    else state = documentContentHash(document) === ref.contentHash ? 'current' : 'stale';
  }
  const title = memoryTitle(document?.title, memoryTitle(memory.title));
  return {
    ...memory,
    title,
    content: state === 'current' ? memory.content : '',
    documentLink: { state, recordId: ref.recordId, readWhen: ref.readWhen, ...(document ? { document: documentMeta(document, title) } : {}) },
  };
}
module.exports = { validRecordId, stableRecordId, documentContentHash, normalizeDocumentRef, projectDocumentMemory };

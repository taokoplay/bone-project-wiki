'use strict';
const { decode, text } = require('./core.cjs');
const { stableRecordId, documentContentHash, projectDocumentMemory } = require('./document-links.cjs');
const { usableMemory, memoryTitle } = require('./memory-policy.cjs');
const { normalizeMemoryMetadata } = require('./memory-selection.cjs');
const { unavailableMemory } = require('./memory-overview.cjs');
const changedWorkspace = error => /WORKSPACE_CHANGED|PLUGIN_UNLOADED|LOCAL_PROJECT_REQUIRED/.test(String(error?.message || error));
class DocumentMemories {
  constructor(service) { this.service = service; }
  async documents(recordIds, workspacePath, metadata) {
    const service = this.service;
    const rows = metadata || (await service.scan('knowledge', workspacePath)).rows;
    const documents = []; let unreadable = false;
    for (const meta of rows) {
      if (!meta.path.endsWith('.md')) continue;
      try {
        const document = decode(await service.readFile(meta.path, workspacePath), meta.path);
        if (document.kind === 'document' && recordIds.has(stableRecordId(document))) documents.push(document);
      } catch (error) {
        if (changedWorkspace(error)) throw error;
        unreadable = true;
      }
    }
    return { documents, unreadable };
  }
  async resolve(entry, workspacePath) {
    if (!entry.documentRef) return entry;
    const source = await this.documents(new Set([entry.documentRef.recordId]), workspacePath);
    return projectDocumentMemory(entry, source.documents, source.unreadable);
  }
  async projectRows(rows, metadata, workspacePath, { readBodies = false, includeUnreadable = false, automaticOnly = false } = {}) {
    if (!readBodies && !rows.some(row => row.documentRef)) return rows;
    const loaded = []; const failed = new Set();
    for (const row of rows) {
      if (!readBodies && !row.documentRef) { loaded.push(row); continue; }
      try {
        const entry = decode(await this.service.readFile(row.path, workspacePath), row.path);
        if (includeUnreadable) entry.automaticEligible = entry.status === 'confirmed' && usableMemory(entry);
        loaded.push(entry);
      }
      catch (error) {
        if (changedWorkspace(error)) throw error;
        if (includeUnreadable) { loaded.push(unavailableMemory(row)); continue; }
        if (!readBodies && row.documentRef) {
          const unavailable = { ...row, content: '', documentLink: { state: 'unreadable', recordId: row.documentRef.recordId, readWhen: row.documentRef.readWhen } };
          loaded.push(unavailable); failed.add(unavailable);
        }
      }
    }
    const canProject = row => row.documentRef && !failed.has(row) && (!automaticOnly || row.automaticEligible);
    const ids = new Set(loaded.filter(canProject).map(row => row.documentRef.recordId));
    if (!ids.size) return loaded;
    const source = await this.documents(ids, workspacePath, metadata);
    return loaded.map(row => canProject(row) ? projectDocumentMemory(row, source.documents, source.unreadable) : row);
  }
  async remember(input) {
    const summary = text(input.summary, 'summary', 800).trim();
    const readWhen = text(input.readWhen, 'readWhen', 240).trim();
    if (!summary || !usableMemory({ content: summary }) || !readWhen || !usableMemory({ content: readWhen }) || /[\x00-\x1f\x7f]/.test(readWhen)) throw new Error('INVALID_MEMORY_SUMMARY');
    if (input.status !== 'confirmed' || (input.kind && input.kind !== 'document')) throw new Error('CONFIRMED_DOCUMENT_REQUIRED');
    const memoryMetadata = normalizeMemoryMetadata(input);
    const service = this.service;
    const previous = input.id || input.recordId ? await service.read({ ...input, section: 'knowledge' }) : null;
    if (previous && previous.kind !== 'document') throw new Error('CONFIRMED_DOCUMENT_REQUIRED');
    const { scopePaths, importance, ...documentInput } = input;
    const payload = { ...previous, ...documentInput, kind: 'document', section: 'knowledge' };
    if (!text(payload.content, 'content').trim()) throw new Error('DOCUMENT_CONTENT_REQUIRED');
    const existing = (await service.scan('memory', input.workspacePath)).entries;
    const matches = previous ? existing.filter(row => row.documentRef?.recordId === previous.recordId) : [];
    if (matches.filter(row => row.status !== 'archived').length > 1) throw new Error('DUPLICATE_MEMORY_LINK');
    // save() verifies the full document before a separate memory write begins.
    const document = await service.save(payload);
    try {
      const old = matches.find(row => row.status !== 'archived') || matches[0];
      const memory = await service.save({
        workspacePath: input.workspacePath, section: 'memory', kind: 'memory', category: 'memory',
        ...(old ? { id: old.id, expectedRevision: old.revision } : {}),
        ...memoryMetadata,
        title: memoryTitle(document.title, summary), status: 'confirmed', content: summary, source: document.source,
        documentRef: { recordId: document.recordId, contentHash: documentContentHash(document), readWhen },
      });
      const projected = await this.resolve(memory, input.workspacePath);
      const linked = projected.documentLink.state === 'current';
      return { document, memory: projected, linked, ...(!linked ? { linkError: 'DOCUMENT_CHANGED: read the current document and refresh the summary' } : {}) };
    } catch (error) {
      if (changedWorkspace(error)) throw error;
      return { document, memory: null, linked: false, linkError: String(error?.message || error) };
    }
  }
}
module.exports = { DocumentMemories };

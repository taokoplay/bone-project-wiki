'use strict';
const { SECTIONS, text } = require('./core.cjs');
const { memoryOverview, unavailableMemory } = require('./memory-overview.cjs');
const { normalizeScopePaths } = require('./memory-selection.cjs');
const { contextIndexResult, contextTextResult } = require('./memory-presentation.cjs');

class MemoryViews {
  constructor(service) { this.service = service; }
  async records(workspacePath, scanned, automaticOnly = false) {
    scanned ||= await this.service.scanAll(workspacePath);
    const loaded = await this.service.documentMemories.projectRows(scanned.memory.entries,scanned.knowledge.rows,workspacePath,{readBodies:true,includeUnreadable:true,automaticOnly});
    const failed = scanned.memory.corrupted.map(unavailableMemory);
    return { scanned, loaded:[...loaded,...failed] };
  }
  async overview(input) {
    const {loaded} = await this.records(input.workspacePath);
    return memoryOverview(loaded);
  }
  async context(input) {
    if (input.explain !== undefined && typeof input.explain !== 'boolean') throw new Error('INVALID_MEMORY_EXPLAIN');
    const mode = input.memoryMode ?? 'manual';
    if (!['automatic','manual'].includes(mode)) throw new Error('INVALID_MEMORY_MODE');
    const scanned = await this.service.scanAll(input.workspacePath);
    const entries = SECTIONS.flatMap(section => scanned[section].entries);
    if (input.since !== undefined) {
      if (input.explain || input.memoryMode !== undefined) throw new Error('INVALID_MEMORY_QUERY');
      const since = Date.parse(String(input.since));
      if (!Number.isFinite(since)) throw new Error('INVALID_SINCE: use an ISO timestamp');
      return {since:new Date(since).toISOString(),count:entries.filter(entry=>Date.parse(entry.updatedAt)>since).length,changed:entries.filter(entry=>Date.parse(entry.updatedAt)>since)};
    }
    const {loaded} = await this.records(input.workspacePath,scanned,mode === 'automatic');
    const query = text(input.query || '', 'query', 32000);
    const paths = normalizeScopePaths(input.paths);
    let result;
    if (mode === 'automatic') {
      result = contextIndexResult(loaded.filter(row=>row.automaticEligible),{query,paths,diagnosticEntries:loaded});
    } else {
      const wanted = entries.filter(entry=>entry.kind!=='memory'&&entry.category!=='memory'&&entry.status!=='archived'
        && (entry.kind==='handoff'||entry.category==='overview'||(query&&`${entry.title} ${entry.topics.join(' ')}`.toLowerCase().includes(query.toLowerCase()))))
        .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,16);
      const records = [...loaded];
      for (const meta of wanted) {
        try { records.push(await this.service.loadRecord(meta,input.workspacePath)); }
        catch (error) { if (/WORKSPACE_CHANGED|PLUGIN_UNLOADED|LOCAL_PROJECT_REQUIRED/.test(String(error?.message || error))) throw error; }
      }
      result = contextTextResult(records,query,{paths});
    }
    return input.explain ? result : {text:result.text};
  }
}
module.exports = { MemoryViews };

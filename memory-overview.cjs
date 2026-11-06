'use strict';
const { normalizedText, usableMemory, sensitiveMemory, memoryTitle } = require('./memory-policy.cjs');
const { normalizeMemoryMetadata } = require('./memory-selection.cjs');
const { memoryKey, sourceState } = require('./memory-diagnostics.cjs');

function unavailableMemory(row) {
  return { id:row.id || '', kind:'memory', category:'memory', path:row.path || '', title:'不可读取的记忆',
    content:'', status:'unreadable', readable:false, revision:'', topics:[], tags:[] };
}
function memoryOverview(entries) {
  const memories = entries.filter(entry => entry.kind === 'memory' || entry.category === 'memory');
  const rows = memories.map(entry => {
    let metadata = {}, metadataValid = true;
    try { metadata = normalizeMemoryMetadata(entry); } catch { metadataValid = false; }
    const state = sourceState(entry);
    const usable = entry.status === 'confirmed' && entry.readable !== false && metadataValid
      && ['standalone','current'].includes(state) && usableMemory(entry);
    const body = String(entry.content || '');
    const summaryMode = !usable ? 'unavailable' : body.length <= 800 ? 'fact' : 'pointer';
    const source = entry.documentLink?.document;
    return {
      key:memoryKey(entry), id:entry.id || '', title:memoryTitle(entry.title), revision:entry.revision || '',
      status:entry.readable === false ? 'unreadable' : entry.status, sourceState:state,
      importance:metadata.importance || 'normal', scopePaths:metadata.scopePaths || [],
      topics:(entry.topics || []).filter(topic => typeof topic === 'string' && topic.trim() && !sensitiveMemory(topic)),
      summaryMode, summary:summaryMode === 'fact' ? body : '',
      readWhen:!sensitiveMemory(entry.documentRef?.readWhen || '') ? normalizedText(entry.documentRef?.readWhen) : '',
      ...(source && ['current','stale','draft','archived'].includes(state) ? {source:{recordId:source.recordId,title:memoryTitle(source.title),revision:source.revision,status:source.status}} : {})
    };
  });
  const groups = [];
  const confirmed = rows.filter(row => row.status === 'confirmed');
  const add = (id,type,list,topic) => { if (list.length) groups.push({id,type,...(topic ? {topic} : {}),keys:list.map(row => row.key)}); };
  add('core','core',confirmed.filter(row => row.importance === 'core'));
  const topics = [...new Set(confirmed.flatMap(row => row.topics))].sort((a,b)=>a.localeCompare(b));
  topics.forEach((topic,index) => add(`topic-${index}`,'topic',confirmed.filter(row => row.topics.includes(topic)),topic));
  add('ungrouped','ungrouped',confirmed.filter(row => !row.topics.length));
  add('candidates','candidates',rows.filter(row => row.status === 'draft'));
  const count = status => rows.filter(row=>row.status===status).length;
  return { schemaVersion:1, entries:rows, groups,
    counts:{total:rows.length,confirmed:count('confirmed'),draft:count('draft'),archived:count('archived'),
      unavailable:rows.filter(row=>row.status==='unreadable'||(row.status==='confirmed'&&row.summaryMode==='unavailable')).length} };
}
module.exports = { memoryOverview, unavailableMemory };

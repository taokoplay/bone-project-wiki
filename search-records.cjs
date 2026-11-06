'use strict';
const {SECTIONS,text,decode,summarize}=require('./core.cjs');
const {projectDocumentMemory}=require('./document-links.cjs');
const {isInterrupted:changedWorkspace}=require('./operation-errors.cjs');

// A search owns one verified body snapshot. No fact survives into a later request.
async function searchRecords(service,input) {
 const workspacePath=input.workspacePath;
 const query=text(input.query||'','query',500).trim().toLowerCase();
 const terms=query.split(/\s+/).filter(Boolean),loaded=[],bodies=new Map();
 const readBody=meta=>{
  if(!meta.path.endsWith('.md'))return Promise.resolve({...meta,content:''});
  if(!bodies.has(meta.path))bodies.set(meta.path,(async()=>decode(await service.readFile(meta.path,workspacePath),meta.path))());
  return bodies.get(meta.path);
 };
 let knowledgeRows;
 const sections=input.section&&SECTIONS.includes(input.section)?[input.section]:SECTIONS;
 for(const section of sections) {
  const scan=await service.scan(section,workspacePath);
  if(section==='knowledge')knowledgeRows=scan.rows;
  for(const meta of scan.entries) {
   if(meta.status==='archived')continue;
   try {loaded.push(await readBody(meta));}
   catch(error){if(changedWorkspace(error))throw error;}
  }
 }
 const ids=new Set(loaded.filter(entry=>entry.documentRef).map(entry=>entry.documentRef.recordId));
 let source;
 if(ids.size) {
  try {source=await service.documentMemories.documents(ids,workspacePath,knowledgeRows,readBody);}
  catch(error){
   if(changedWorkspace(error))throw error;
   // Match the existing per-record read fallback when source discovery fails.
   source=null;
  }
 }
 const results=[];
 for(let entry of loaded) {
  if(entry.documentRef) {
   if(!source)continue;
   entry=projectDocumentMemory(entry,source.documents,source.unreadable);
  }
  const title=`${entry.title} ${entry.tags.join(' ')} ${entry.topics.join(' ')}`.toLowerCase(),body=entry.content.toLowerCase();
  const score=terms.reduce((sum,term)=>sum+(title.includes(term)?5:0)+(body.includes(term)?1:0),0),at=Math.max(0,body.indexOf(terms[0]||''));
  results.push({...summarize(entry),excerpt:entry.content.slice(Math.max(0,at-60),at+220),score});
 }
 await service.workspace(workspacePath);
 return results.filter(entry=>!terms.length||entry.score>0).sort((a,b)=>b.score-a.score).slice(0,80);
}
module.exports={searchRecords};

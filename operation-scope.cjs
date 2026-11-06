'use strict';
const {ROOT,SECTIONS,sectionRoot,indexPath}=require('./core.cjs');
const {operationError}=require('./operation-errors.cjs');
class OperationScope {
 constructor(workspacePath,signal,cache=false){this.workspacePath=workspacePath;this.signal=signal;this.cache=cache;this.files=new Map();this.scans=new Map();this.closed=false;}
 check(workspacePath){
  if(this.closed||this.signal?.aborted)throw operationError('CANCELLED');
  if(workspacePath!==undefined){if(this.workspacePath===undefined)this.workspacePath=workspacePath;else if(this.workspacePath!==workspacePath)throw operationError('WORKSPACE_CHANGED');}
 }
 read(name,load,fresh=false){
  this.check();if(!this.cache)return load();
  if(!fresh&&this.files.has(name))return this.files.get(name);
  const pending=Promise.resolve().then(load);this.files.set(name,pending);
  const result=pending.catch(error=>{if(this.files.get(name)===pending)this.files.delete(name);throw error;});
  return result;
 }
 invalidate(name){
  if(!this.cache)return;this.files.delete(name);
  for(const section of SECTIONS){const root=sectionRoot(section);if(name.startsWith(root+'/')&&name!==indexPath(section))this.scans.delete(section);}
  if(name===`${ROOT}/project.json`)this.scans.clear();
 }
 getScan(section,reindex){this.check();if(!this.cache)return null;const hit=this.scans.get(section);return hit&&(!reindex||hit.reindex)?hit.result:null;}
 rememberScan(section,reindex,result){this.check();if(this.cache)this.scans.set(section,{reindex:Boolean(reindex),result});}
 close(){this.closed=true;this.files.clear();this.scans.clear();}
}
module.exports={OperationScope};

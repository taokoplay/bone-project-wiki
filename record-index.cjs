'use strict';
const {indexPath}=require('./core.cjs');const {isInterrupted}=require('./operation-errors.cjs');
function parse(raw,section){
 try{const doc=JSON.parse(raw);if(doc?.version!==1||doc.section!==section||!Array.isArray(doc.entries))return null;return doc;}catch{return null;}
}
function sameRows(left,right){
 if(left.length!==right.length)return false;const entries=new Map();
 for(const row of left){if(!row||typeof row.path!=='string'||entries.has(row.path))return false;entries.set(row.path,JSON.stringify(row));}
 return right.every(row=>row&&entries.get(row.path)===JSON.stringify(row));
}
class RecordIndex {
 constructor(service){this.service=service;}
 async read(section,workspacePath){const raw=await this.service.exists(indexPath(section),workspacePath),doc=raw===null?null:parse(raw,section);return doc?doc.entries.filter(row=>row&&typeof row.path==='string'):[];}
 async write(section,workspacePath,entries){
  try{
   const name=indexPath(section),raw=await this.service.exists(name,workspacePath),previous=raw===null?null:parse(raw,section);
   if(previous&&sameRows(previous.entries,entries))return;
   const body=JSON.stringify({version:1,section,generatedAt:new Date().toISOString(),entries});await this.service.writeFile(name,body,workspacePath);
  }catch(error){if(isInterrupted(error))throw error; /* Derived cache failures remain optional. */}
 }
}
module.exports={RecordIndex};

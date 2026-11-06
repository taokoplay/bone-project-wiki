'use strict';
const {hash}=require('./core.cjs');
const {notFound}=require('./operation-errors.cjs');
class WorkspaceIO {
 constructor(service){this.service=service;}
 async read(name,workspacePath,fresh=false){
  const service=this.service,scope=service.requests.operation;await service.workspace(workspacePath);
  const load=()=>service.pi.fs.readText(name),raw=scope?await scope.read(name,load,fresh):await load();
  await service.workspace(workspacePath);return raw;
 }
 async write(name,value,workspacePath){
  const service=this.service,scope=service.requests.operation;await service.workspace(workspacePath);scope?.invalidate(name);
  try{await service.pi.fs.writeText(name,value);}finally{scope?.invalidate(name);}
  await service.workspace(workspacePath);
 }
 async verified(name,raw,workspacePath){
  for(let attempt=0;attempt<2;attempt++){
   await this.write(name,raw,workspacePath);let actual;
   try{actual=await this.read(name,workspacePath,true);}catch(error){if(!notFound(error))throw error;actual=null;}
   if(actual!==null&&hash(actual)===hash(raw))return;
  }
  throw new Error(`WRITE_VERIFY_FAILED: ${name} was not written as expected; reload before saving again`);
 }
 async stat(name,workspacePath){const service=this.service;await service.workspace(workspacePath);const result=await service.pi.fs.stat(name);await service.workspace(workspacePath);return result;}
 async list(name,workspacePath){const service=this.service;await service.workspace(workspacePath);const result=await service.pi.fs.list(name);await service.workspace(workspacePath);return result;}
 async remove(name,workspacePath){
  const service=this.service,scope=service.requests.operation;await service.workspace(workspacePath);scope?.invalidate(name);
  try{await service.pi.fs.remove(name);}finally{scope?.invalidate(name);}
  await service.workspace(workspacePath);
 }
}
module.exports={WorkspaceIO};

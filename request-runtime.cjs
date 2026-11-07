'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {ProjectRequestQueues}=require('./project-request-queues.cjs');
const {RequestQueue}=require('./request-queue.cjs');
const {OperationScope}=require('./operation-scope.cjs');
const {operationError,isInterrupted}=require('./operation-errors.cjs');
class WikiRequests {
 constructor(service){
  this.service=service;this.context=new AsyncLocalStorage();
  this.settingsQueue=new RequestQueue();
  this.projects=new ProjectRequestQueues((input,signal,path)=>this.scoped(path,signal,false,()=>service.dispatch(input)));
 }
 get operation(){return this.context.getStore();}
 check(workspacePath){if(this.service.disposed)throw operationError('PLUGIN_UNLOADED');this.operation?.check(workspacePath);}
 async scoped(workspacePath,signal,cache,work){
  if(this.operation)throw operationError('OVERLAPPING_REQUEST');
  const scope=new OperationScope(workspacePath,signal,cache);
  return this.context.run(scope,async()=>{
   try{this.check();const result=await work();this.check();return result;}finally{scope.close();}
  });
 }
 async inProject(work){
  this.check();const workspace=await this.service.workspace();this.check();
  const project=this.projects.get(workspace.path);
  try{return await work(project,workspace.path);}finally{this.projects.trim();}
 }
 request(input,signal){
  const search=input?.action==='search';
  if(search&&signal?.aborted)return Promise.reject(operationError('CANCELLED'));
  return this.inProject((project,path)=>{
   const queue=['preferencesGet','preferencesSave'].includes(input?.action)?this.settingsQueue:project.queue;
   return queue.enqueue(active=>this.scoped(path,active,false,()=>this.service.dispatch(input)),{cancelable:search,signal:search?signal:undefined});
  });
 }
 save(input){
  if(!input||input.action!=='save'||typeof input.workspacePath!=='string')return Promise.reject(operationError('INVALID_REQUEST'));
  return this.inProject((project,path)=>project.queue.enqueue(()=>this.scoped(path,undefined,true,async()=>{
   await this.service.workspace(input.workspacePath);const entry=await this.service.save(input);
   try{return {entry,snapshot:await this.service.snapshot()};}
   catch(error){if(isInterrupted(error))throw error;return {entry,snapshot:null,refreshError:'REFRESH_FAILED'};}
  })));
 }
 search(input){return this.inProject(project=>project.latest.submit(input));}
 cancel(input){return this.inProject(project=>project.latest.cancel(input));}
 close(){this.projects.close();this.settingsQueue.close();}
}
module.exports={WikiRequests};

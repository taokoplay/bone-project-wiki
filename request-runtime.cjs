'use strict';
const {RequestQueue,LatestSearches}=require('./request-queue.cjs');const {OperationScope}=require('./operation-scope.cjs');const {operationError,isInterrupted}=require('./operation-errors.cjs');
class WikiRequests {
 constructor(service){this.service=service;this.queue=new RequestQueue();this.operation=null;this.latest=new LatestSearches(this.queue,(input,signal)=>this.scoped(input,signal,false,()=>service.dispatch(input)));}
 check(workspacePath){if(this.service.disposed)throw operationError('PLUGIN_UNLOADED');this.operation?.check(workspacePath);}
 async scoped(input,signal,cache,work){
  if(this.operation)throw operationError('OVERLAPPING_REQUEST');const scope=new OperationScope(typeof input?.workspacePath==='string'?input.workspacePath:undefined,signal,cache);this.operation=scope;
  try{this.check();const result=await work();this.check();return result;}finally{scope.close();this.operation=null;}
 }
 request(input,signal){const search=input?.action==='search';return this.queue.enqueue(active=>this.scoped(input,active,false,()=>this.service.dispatch(input)),{cancelable:search,signal:search?signal:undefined});}
 save(input){
  if(!input||input.action!=='save'||typeof input.workspacePath!=='string')return Promise.reject(operationError('INVALID_REQUEST'));
  return this.queue.enqueue(()=>this.scoped(input,undefined,true,async()=>{
   await this.service.workspace(input.workspacePath);const entry=await this.service.save(input);
   try{return {entry,snapshot:await this.service.snapshot()};}
   catch(error){if(isInterrupted(error))throw error;return {entry,snapshot:null,refreshError:'REFRESH_FAILED'};}
  }));
 }
 search(input){if(this.service.disposed)return Promise.reject(operationError('PLUGIN_UNLOADED'));return this.latest.submit(input);}
 cancel(input){if(this.service.disposed)throw operationError('PLUGIN_UNLOADED');return this.latest.cancel(input);}
 close(){this.latest.close();this.queue.close();}
}
module.exports={WikiRequests};

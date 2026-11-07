'use strict';
const {AsyncResource}=require('node:async_hooks');
const {operationError}=require('./operation-errors.cjs');
class RequestQueue {
 constructor(onIdle=()=>{}){this.pending=[];this.active=null;this.draining=false;this.closed=false;this.onIdle=onIdle;}
 get busy(){return this.active!==null||this.pending.length>0||this.draining;}
 enqueue(work,{cancelable=false,signal,key=null,generation=0}={}) {
  if(this.closed)return Promise.reject(operationError('PLUGIN_UNLOADED'));
  if(cancelable&&signal?.aborted)return Promise.reject(operationError('CANCELLED'));
  let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const context=new AsyncResource('WikiRequest',{requireManualDestroy:true});
  const job={work:signal=>context.runInAsyncScope(work,undefined,signal),key,generation,resolve,reject,settled:false,controller:cancelable?new AbortController():null,cleanup:()=>context.emitDestroy()};
  if(cancelable&&signal){const abort=()=>this.cancelJob(job,'CANCELLED');signal.addEventListener('abort',abort,{once:true});job.cleanup=()=>{signal.removeEventListener('abort',abort);context.emitDestroy();};}
  this.pending.push(job);
  if(cancelable&&signal?.aborted)this.cancelJob(job,'CANCELLED');
  if(!this.draining){this.draining=true;queueMicrotask(()=>{void this.drain();});}
  return result;
 }
 settle(job,error,value){if(job.settled)return;job.settled=true;if(error)job.reject(error);else job.resolve(value);}
 cancelJob(job,code){
  if(job.settled)return;
  const index=this.pending.indexOf(job);if(index>=0){this.pending.splice(index,1);job.cleanup();}
  job.controller?.abort();this.settle(job,operationError(code));
 }
 cancelBefore(key,generation){
  if(this.active?.key===key&&this.active.generation<generation)this.cancelJob(this.active,'CANCELLED');
  for(const job of [...this.pending])if(job.key===key&&job.generation<generation)this.cancelJob(job,'CANCELLED');
 }
 async drain(){
  try {
   while(!this.closed&&this.pending.length){
    const job=this.pending.shift();this.active=job;
    try {if(job.controller?.signal.aborted)throw operationError('CANCELLED');const value=await job.work(job.controller?.signal);if(job.controller?.signal.aborted)throw operationError('CANCELLED');this.settle(job,null,value);}
    catch(error){this.settle(job,error);}
    finally{job.cleanup();this.active=null;}
   }
  } finally {this.draining=false;this.onIdle();}
 }
 close(){if(this.closed)return;this.closed=true;for(const job of [...this.pending])this.cancelJob(job,'PLUGIN_UNLOADED');if(this.active)this.cancelJob(this.active,'PLUGIN_UNLOADED');}
}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function command(input){if(!input||typeof input.clientId!=='string'||!UUID.test(input.clientId)||!Number.isSafeInteger(input.sequence)||input.sequence<0)throw operationError('INVALID_SEARCH_CONTROL');return {clientId:input.clientId,sequence:input.sequence};}
class LatestSearches {
 constructor(queue,run){this.queue=queue;this.run=run;this.clients=new Map();}
 state(clientId){
  let state=this.clients.get(clientId);
  if(!state){if(this.clients.size>=32){const oldest=this.clients.keys().next().value;this.queue.cancelBefore(`panel-search:${oldest}`,Infinity);this.clients.delete(oldest);}state={minimum:0,lastRun:-1};}
  this.clients.delete(clientId);this.clients.set(clientId,state);return state;
 }
 cancel(input){
  const {clientId,sequence}=command(input),state=this.state(clientId);if(sequence<state.minimum)return {cancelled:false};
  state.minimum=sequence;this.queue.cancelBefore(`panel-search:${clientId}`,sequence);return {cancelled:true};
 }
 submit(input){
  try {
   const {clientId,sequence}=command(input);if(input.action!=='search'||typeof input.workspacePath!=='string')throw operationError('INVALID_SEARCH_CONTROL');
   const state=this.state(clientId);if(sequence<state.minimum||sequence<=state.lastRun)throw operationError('CANCELLED');
   state.minimum=sequence;state.lastRun=sequence;this.queue.cancelBefore(`panel-search:${clientId}`,sequence);
   const {clientId:unusedClient,sequence:unusedSequence,...payload}=input;
   return this.queue.enqueue(signal=>this.run(payload,signal),{cancelable:true,key:`panel-search:${clientId}`,generation:sequence});
  }catch(error){return Promise.reject(error);}
 }
 close(){this.clients.clear();}
}
module.exports={RequestQueue,LatestSearches};

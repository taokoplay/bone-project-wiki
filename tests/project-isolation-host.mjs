// Run with PI_DESKTOP_ROOT=<host source candidate> node --experimental-strip-types
// tests/project-isolation-host.mjs. Uses only real plugin processes and temporary projects.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs/promises';
import {register} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const desktop=process.env.PI_DESKTOP_ROOT;
if(!desktop)throw new Error('PI_DESKTOP_ROOT is required');
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR||process.env.TMPDIR||'/tmp','wiki-project-host-'));
process.env.PI_DESKTOP_DATA_DIR=path.join(temp,'data');
register(pathToFileURL(path.join(desktop,'apps/desktop/test/helpers/ts-import-hooks.mjs')));
const {PluginRuntime}=await import(pathToFileURL(path.join(desktop,'apps/desktop/electron/main/plugin-runtime.ts')));
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
const roots={alpha:path.join(temp,'alpha'),beta:path.join(temp,'beta'),visible:path.join(temp,'visible')};
for(const dir of Object.values(roots))await fs.mkdir(dir);
const sessions=new Map([['alpha',roots.alpha],['alpha-second',roots.alpha],['beta',roots.beta]]);
let visible=roots.visible,hold=null;const identities=new Map(),calls=[];
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve};};
async function within(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Independent project blocked by another project')),2500);})]);}finally{clearTimeout(timer);}}
const runtime=new PluginRuntime({
 hostEntry:path.join(desktop,'apps/desktop/electron/main/plugin-host-process.mjs'),
 getWorkspacePath:()=>visible,getWorkspacePathForSession:id=>sessions.get(id)??null,
 getWorkspaceInfo:(root=visible)=>root?{path:root,name:path.basename(root),projectId:path.basename(root),roots:[{path:root,name:path.basename(root),primary:true}]}:null,
 spawnProcess({entry}){
  const child=fork(entry,[],{stdio:['ignore','pipe','pipe','ipc']});
  return {
   postMessage(message){if(message.t==='call'&&message.method==='tool.execute')identities.set(message.invocationId,message.payload.sessionId);if(child.connected)child.send(message);},
   onMessage(handler){child.on('message',message=>{
    if(message.t==='call')calls.push({api:message.api,session:identities.get(message.invocationId),path:message.args?.[0]});
    if(hold&&message.t==='call'&&message.api==='fs.readText'&&identities.get(message.invocationId)===hold.session&&message.args[0]===hold.path){
     const gate=hold;hold=null;gate.deliver=()=>handler(message);gate.entered.resolve();return;
    }
    handler(message);
   });},
   onExit:handler=>child.on('exit',code=>handler(code??0)),kill:()=>child.kill(),
  };
 },
});
let delayed;
try{
 await runtime.loadFromPath(source,manifest.permissions);
 const tool=runtime.getTools().find(tool=>tool.name==='project_wiki');assert.ok(tool);
 const request=(session,action,input={},signal)=>tool.execute({action,workspacePath:roots[session]||roots.alpha,...input},{sessionId:session,signal});
 const [a,b]=await Promise.all([request('alpha','snapshot',{workspacePath:''}),request('beta','snapshot',{workspacePath:roots.alpha})]);
 assert.equal(a.workspacePath,roots.alpha);assert.equal(b.workspacePath,roots.beta);
 await Promise.all([request('alpha','init'),request('beta','init')]);
 const [alpha,beta]=await Promise.all([
  request('alpha','save',{title:'Same document title',category:'rules',kind:'document',content:'Alpha authoritative source.'}),
  request('beta','save',{title:'Same document title',category:'rules',kind:'document',content:'Beta authoritative source.'}),
 ]);
 assert.equal(alpha.path,beta.path);
 delayed={session:'alpha',path:alpha.path,entered:deferred(),deliver:null};hold=delayed;
 const first=request('alpha','read',{id:alpha.id});await delayed.entered.promise;
 const queued=request('alpha-second','read',{id:alpha.id});
 visible=roots.beta;
 const saved=await within(request('beta','save',{...beta,expectedRevision:beta.revision,content:'Beta saved while Alpha was held.'}));
 assert.equal(saved.content,'Beta saved while Alpha was held.');
 const panel=await within(runtime.invokePanelBridge(manifest.id,'wiki',{action:'snapshot'}));assert.equal(panel.workspacePath,roots.beta);
 visible=null;
 const refreshed=await within(request('beta','snapshot',{workspacePath:''}));assert.equal(refreshed.workspacePath,roots.beta);
 delayed.deliver();delayed=null;
 const [firstResult,queuedResult]=await Promise.all([first,queued]);
 assert.equal(firstResult.content,'Alpha authoritative source.');assert.equal(queuedResult.content,'Alpha authoritative source.');
 assert.ok(calls.some(call=>call.session==='alpha-second'&&call.api==='fs.readText'&&call.path===alpha.path));
 await assert.rejects(request('alpha','save',{workspacePath:roots.beta,title:'Wrong project',content:'Never persisted.'}),/WORKSPACE_CHANGED/);
 assert.equal((await request('alpha','read',{id:alpha.id})).content,'Alpha authoritative source.');
 assert.equal((await request('beta','read',{id:beta.id})).content,'Beta saved while Alpha was held.');
 const gate={session:'alpha',path:alpha.path,entered:deferred(),deliver:null};hold=gate;delayed=gate;
 const controller=new AbortController();
 const cancelled=request('alpha','search',{query:'authoritative'},controller.signal).then(value=>({value}),error=>({error}));await gate.entered.promise;
 const betaSearch=await within(request('beta','search',{query:'Beta'}));assert.equal(betaSearch.length,1);
 controller.abort(new Error('Intentional Alpha cancellation'));assert.match((await cancelled).error.message,/Intentional Alpha cancellation/);
 gate.deliver();delayed=null;
 const next=await request('alpha-second','read',{id:alpha.id});assert.equal(next.content,'Alpha authoritative source.');
 console.log('PASS: actual PluginRuntime -> plugin child -> per-project queues -> scoped filesystem; concurrent snapshots and saves; independent progress during held I/O; same-project queued invocation identity; visible-project switches/no visible project; wrong-target rejection; cancellation isolation and preserved original bytes');
}finally{
 delayed?.deliver?.();
 await runtime.unload(manifest.id);await fs.rm(temp,{recursive:true,force:true});
}

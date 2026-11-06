'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {WikiService}=require('../service.cjs');const core=require('../core.cjs');const links=require('../document-links.cjs');
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function fixture(t,{documents=12,linked=3}={}) {
 const root=await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR||os.tmpdir(),'wiki-operations-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const f={root,events:[],bodies:new Map(),writes:[],afterRead:null,beforeWrite:null,afterWrite:null,beforeList:null};let current=root;
 const api={workspace:{get:async()=>({path:current,name:'Operation fixture'})},plugin:{getSettings:async()=>({}),setSettings:async()=>{}},fs:{
  readText:async name=>{f.events.push(['read',name]);if(name.endsWith('.md'))f.bodies.set(name,(f.bodies.get(name)||0)+1);const value=await fs.readFile(path.join(current,name),'utf8');if(f.afterRead)await f.afterRead(name,value);return value;},
  writeText:async(name,value)=>{f.events.push(['write',name]);if(f.beforeWrite)await f.beforeWrite(name,value);const target=path.join(current,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,value);f.writes.push(name);if(f.afterWrite)await f.afterWrite(name,value);},
  stat:async name=>{f.events.push(['stat',name]);const x=await fs.stat(path.join(current,name));return {size:x.size,mtimeMs:x.mtimeMs};},
  list:async name=>{f.events.push(['list',name]);if(f.beforeList)await f.beforeList(name);return Promise.all((await fs.readdir(path.join(current,name),{withFileTypes:true})).map(async d=>{const rel=`${name}/${d.name}`,x=await fs.stat(path.join(current,rel));return {name:d.name,path:rel,isDirectory:d.isDirectory(),size:x.size,mtimeMs:x.mtimeMs};}));},
  remove:async name=>{f.events.push(['remove',name]);await fs.unlink(path.join(current,name));}
 }};
 f.api=api;f.service=new WikiService(api);t.after(()=>f.service.dispose());f.request=(action,input={})=>f.service.request({action,workspacePath:root,...input});
 f.put=async(input,previous)=>{const entry=core.normalize(input,previous),name=core.recordPath(entry),raw=core.encode(entry);await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),raw);await fs.utimes(path.join(root,name),new Date('2024-01-01'),new Date('2024-01-01'));return core.decode(raw,name);};
 f.switchTo=value=>{current=value;};f.reset=()=>{f.events.length=0;f.bodies.clear();f.writes.length=0;};
 await f.request('init');f.documents=[];
 for(let i=0;i<documents;i++)f.documents.push(await f.put({kind:'document',category:'rules',status:'confirmed',title:`Document ${String(i).padStart(3,'0')}`,content:`Original fixture body ${i}.`}));
 f.memories=[];
 for(let i=0;i<linked;i++){const doc=f.documents[i%documents];f.memories.push(await f.put({kind:'memory',category:'memory',status:'confirmed',title:`Memory ${i}`,content:`Confirmed summary ${i}.`,documentRef:{recordId:links.stableRecordId(doc),contentHash:links.documentContentHash(doc),readWhen:'Before changing fixture rules'}}));}
 await f.request('snapshot');f.reset();return f;
}
const savePayload=(f,entry,content)=>({action:'save',workspacePath:f.root,...entry,content,expectedRevision:entry.revision});
async function saveForPanel(f,payload){if(typeof f.service.saveAndSnapshot==='function')return f.service.saveAndSnapshot(payload);const entry=await f.service.request(payload),snapshot=await f.request('snapshot');return {entry,snapshot};}
module.exports={fixture,deferred,savePayload,saveForPanel,core,links};

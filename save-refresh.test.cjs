'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,savePayload,saveForPanel,core}=require('./tests/operation-fixture.cjs');

test('panel save plus full snapshot reuses verified bodies and writes one changed index',async t=>{
 const f=await fixture(t,{documents:20,linked:5}),doc=f.documents[0];
 const result=await saveForPanel(f,savePayload(f,doc,'Updated content retaining the source qualification.'));
 assert.equal(result.entry.content,'Updated content retaining the source qualification.');assert.equal(result.snapshot.workspacePath,f.root);
 assert.equal(result.snapshot.sections.memory.entries.find(x=>x.documentRef.recordId===doc.recordId).documentLink.state,'stale');
 assert.ok([...f.bodies.entries()].every(([name,count])=>!name.includes('/knowledge/')||count<=(name===doc.path?3:1)));
 assert.equal(f.writes.filter(name=>name.endsWith('/index.json')).length,1);
 assert.ok([...f.bodies.values()].reduce((a,b)=>a+b,0)<=28);
});

test('unchanged stable-identity verification still reads bodies but does not rewrite its index',async t=>{
 const f=await fixture(t,{documents:6,linked:0}),doc=f.documents[0];await f.request('read',{recordId:doc.recordId,section:'knowledge'});
 assert.ok(f.bodies.size>=6);assert.equal(f.writes.filter(name=>name.endsWith('/index.json')).length,0);
});

test('same-size same-mtime edits during save are caught by a fresh final revision guard',async t=>{
 const f=await fixture(t,{documents:4,linked:1}),doc=f.documents[0],last=f.documents.at(-1);let changed=false;
 const filename=path.join(f.root,doc.path),before=await fs.stat(filename);const external=core.encode({...doc,content:doc.content.replace('Original','Modified')});
 f.afterRead=async name=>{if(name===last.path&&!changed){changed=true;await fs.writeFile(filename,external);await fs.utimes(filename,before.atime,before.mtime);}};
 await assert.rejects(saveForPanel(f,savePayload(f,doc,'Attempted overwrite.')),/REVISION_CONFLICT/);
 assert.equal(await fs.readFile(filename,'utf8'),external);assert.equal((await fs.stat(filename)).size,before.size);
});

test('a new target appearing after collision lookup is preserved',async t=>{
 const f=await fixture(t,{documents:3,linked:0});const entry=core.normalize({kind:'document',category:'rules',status:'confirmed',title:'New target',content:'External content stays.'}),target=core.recordPath(entry),raw=core.encode(entry);let inserted=false;
 f.afterRead=async name=>{if(name==='.bone-project-wiki/knowledge/index.json'&&!inserted){inserted=true;await fs.writeFile(path.join(f.root,target),raw);}};
 await assert.rejects(saveForPanel(f,{action:'save',workspacePath:f.root,kind:'document',category:'rules',status:'confirmed',title:'New target',content:'New user draft.'}),/REVISION_CONFLICT/);
 assert.equal(await fs.readFile(path.join(f.root,target),'utf8'),raw);
});

test('a committed save with refresh failure returns its actual revision for safe retry',async t=>{
 const f=await fixture(t,{documents:4,linked:1}),doc=f.documents[0];assert.equal(typeof f.service.saveAndSnapshot,'function');let committed=false;
 f.afterWrite=async name=>{if(name===doc.path)committed=true;};f.beforeList=async name=>{if(committed&&name==='.bone-project-wiki/knowledge')throw Object.assign(new Error('Refresh fixture failure'),{code:'EIO'});};
 const result=await f.service.saveAndSnapshot(savePayload(f,doc,'Saved before refresh failed.'));
 assert.equal(result.snapshot,null);assert.equal(result.refreshError,'REFRESH_FAILED');assert.equal(result.entry.revision,core.hash(await fs.readFile(path.join(f.root,doc.path),'utf8')));
 f.afterWrite=null;f.beforeList=null;
 const retry=await f.service.saveAndSnapshot(savePayload(f,result.entry,'Newer input uses the returned revision.'));assert.equal(retry.entry.content,'Newer input uses the returned revision.');assert.ok(retry.snapshot);
});

test('save readback is never satisfied by cached expected bytes',async t=>{
 const f=await fixture(t,{documents:3,linked:0}),doc=f.documents[0];
 f.afterWrite=async(name,value)=>{if(name===doc.path)await fs.writeFile(path.join(f.root,name),value+'\ncorrupt');};
 await assert.rejects(saveForPanel(f,savePayload(f,doc,'Must verify actual readback.')),/WRITE_VERIFY_FAILED/);
});

test('panel save capabilities are additive and public save keeps its old record shape',async t=>{
 const f=await fixture(t,{documents:2,linked:0}),snapshot=await f.request('snapshot');
 assert.deepEqual(snapshot.requestCapabilities,{schemaVersion:1,latestSearch:true,saveSnapshot:true});
 const result=await f.request('save',savePayload(f,f.documents[0],'Public record result.'));
 assert.equal(result.kind,'document');assert.equal(result.entry,undefined);assert.equal(result.snapshot,undefined);
});

test('request-local save state cannot cross projects or survive a later operation',async t=>{
 const f=await fixture(t,{documents:3,linked:1}),doc=f.documents[0];
 const saved=await saveForPanel(f,savePayload(f,doc,'Fresh own write.'));const filename=path.join(f.root,doc.path),current=await fs.stat(filename);
 const external=core.encode({...saved.entry,content:saved.entry.content.replace('Fresh','Other')});await fs.writeFile(filename,external);await fs.utimes(filename,current.atime,current.mtime);
 await assert.rejects(saveForPanel(f,savePayload(f,saved.entry,'Stale second operation.')),/REVISION_CONFLICT/);
 f.switchTo(f.root+'/other');await assert.rejects(saveForPanel(f,savePayload(f,saved.entry,'Wrong project.')),/WORKSPACE_CHANGED/);
 assert.equal(await fs.readFile(filename,'utf8'),external);
});

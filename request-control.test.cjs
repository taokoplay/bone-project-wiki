'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,deferred,savePayload}=require('./tests/operation-fixture.cjs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const search=(f,clientId,sequence,query='Document')=>f.service.requestLatestSearch({action:'search',workspacePath:f.root,query,clientId,sequence});
const settled=promise=>promise.then(value=>({status:'fulfilled',value}),error=>({status:'rejected',error}));
function holdBody(f,name){const entered=deferred(),release=deferred();let held=false;f.afterRead=async file=>{if(file===name&&!held){held=true;entered.resolve();await release.promise;}};return {entered,release};}

test('latest searches stop old I/O, remove obsolete pending work and preserve queued writes',async t=>{
 const f=await fixture(t,{documents:5,linked:1});assert.equal(typeof f.service.requestLatestSearch,'function');
 const gate=holdBody(f,f.documents.at(-1).path);t.after(()=>gate.release.resolve());const first=settled(search(f,A,1));await gate.entered.promise;
 const write=settled(f.service.request(savePayload(f,f.documents[0],'Updated needle phrase.')));
 const second=settled(search(f,A,2)),latest=settled(search(f,A,3,'Updated needle'));
 assert.equal(f.writes.length,0);f.events.push(['release']);gate.release.resolve();
 const [old,pending,saved,rows]=await Promise.all([first,second,write,latest]);
 assert.match(old.error?.message||'',/CANCELLED/);assert.match(pending.error?.message||'',/CANCELLED/);assert.equal(saved.status,'fulfilled');assert.equal(rows.status,'fulfilled');assert.ok(rows.value.some(x=>x.id===saved.value.id&&x.excerpt.includes('Updated needle')));
 const boundary=f.events.findIndex(x=>x[0]==='release');assert.deepEqual(f.events.slice(boundary+1).find(x=>x[0]==='read'),['read','.bone-project-wiki/project.json']);
});

test('out-of-order cancellation cannot cancel the matching or a newer generation',async t=>{
 const f=await fixture(t,{documents:4,linked:0});assert.equal(typeof f.service.requestLatestSearch,'function');const gate=holdBody(f,f.documents.at(-1).path);t.after(()=>gate.release.resolve());
 const first=settled(search(f,A,1));await gate.entered.promise;
 f.service.cancelLatestSearch({clientId:A,sequence:2});const next=settled(search(f,A,2));f.service.cancelLatestSearch({clientId:A,sequence:2});f.service.cancelLatestSearch({clientId:A,sequence:1});
 const stale=settled(search(f,A,1));gate.release.resolve();const values=await Promise.all([first,next,stale]);
 assert.match(values[0].error?.message||'',/CANCELLED/);assert.equal(values[1].status,'fulfilled');assert.match(values[2].error?.message||'',/CANCELLED/);
});

test('one client cannot cancel another client or an independent tool search',async t=>{
 const f=await fixture(t,{documents:3,linked:0});assert.equal(typeof f.service.requestLatestSearch,'function');const gate=holdBody(f,f.documents.at(-1).path);t.after(()=>gate.release.resolve());
 const a=settled(search(f,A,1));await gate.entered.promise;const b=settled(search(f,B,1)),tool=settled(f.request('search',{query:'Document'}));
 f.service.cancelLatestSearch({clientId:A,sequence:2});gate.release.resolve();const values=await Promise.all([a,b,tool]);assert.match(values[0].error?.message||'',/CANCELLED/);assert.equal(values[1].status,'fulfilled');assert.equal(values[2].status,'fulfilled');
});

test('an AbortSignal removes a queued direct tool search without cancelling a write',async t=>{
 const f=await fixture(t,{documents:3,linked:0}),entered=deferred(),release=deferred();let held=false;t.after(()=>release.resolve());
 assert.equal(typeof f.service.requestLatestSearch,'function');
 f.beforeWrite=async name=>{if(name===f.documents[0].path&&!held){held=true;entered.resolve();await release.promise;}};
 const write=settled(f.service.request(savePayload(f,f.documents[0],'Write stays in order.')));await entered.promise;f.reset();
 const controller=new AbortController(),read=settled(f.service.request({action:'search',workspacePath:f.root,query:'Document'},controller.signal));controller.abort();
 const value=await read;assert.match(value.error?.message||'',/CANCELLED/);assert.equal(f.events.length,0);release.resolve();assert.equal((await write).status,'fulfilled');
});

test('cold scanning propagates cancellation instead of marking a source unreadable',async t=>{
 const f=await fixture(t,{documents:4,linked:1});assert.equal(typeof f.service.requestLatestSearch,'function');await fs.unlink(path.join(f.root,'.bone-project-wiki/knowledge/index.json'));
 const gate=holdBody(f,f.documents[0].path);t.after(()=>gate.release.resolve());const query=settled(search(f,A,1));await gate.entered.promise;f.reset();
 f.service.cancelLatestSearch({clientId:A,sequence:2});gate.release.resolve();assert.match((await query).error?.message||'',/CANCELLED/);
 assert.equal(f.events.filter(x=>x[0]==='read'&&x[1].endsWith('.md')).length,0);assert.equal(f.writes.length,0);
 assert.ok((await f.request('search',{query:'Document'})).length>0);
});

test('client bookkeeping is bounded and eviction rejects old queued searches',async t=>{
 const f=await fixture(t,{documents:1,linked:0});assert.equal(typeof f.service.requestLatestSearch,'function');const entered=deferred(),release=deferred();let held=false;t.after(()=>release.resolve());
 f.beforeWrite=async name=>{if(name===f.documents[0].path&&!held){held=true;entered.resolve();await release.promise;}};
 const write=settled(f.service.request(savePayload(f,f.documents[0],'Held mutation.')));await entered.promise;const queries=[];
 for(let i=1;i<=33;i++)queries.push(settled(search(f,`${String(i).padStart(8,'0')}-1111-4111-8111-111111111111`,1)));
 assert.match((await queries[0]).error?.message||'',/CANCELLED/);release.resolve();assert.equal((await write).status,'fulfilled');const rest=await Promise.all(queries.slice(1));assert.ok(rest.every(x=>x.status==='fulfilled'));
});

test('disposal rejects active and queued work and does not start queued mutations',async t=>{
 const f=await fixture(t,{documents:3,linked:0});assert.equal(typeof f.service.requestLatestSearch,'function');const gate=holdBody(f,f.documents.at(-1).path);t.after(()=>gate.release.resolve());
 const read=settled(search(f,A,1));await gate.entered.promise;const write=settled(f.service.request(savePayload(f,f.documents[0],'Never started.')));f.service.dispose();gate.release.resolve();
 const values=await Promise.all([read,write]);assert.ok(values.every(x=>/PLUGIN_UNLOADED/.test(x.error?.message||'')));assert.equal(f.writes.length,0);await assert.rejects(f.request('snapshot'),/PLUGIN_UNLOADED/);
});

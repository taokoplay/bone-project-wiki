'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {AsyncLocalStorage}=require('node:async_hooks');
const {WikiService}=require('./service.cjs');
const {ROOT}=require('./core.cjs');
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve};};
async function within(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Independent project did not progress before the held request was released')),1500);})]);}finally{clearTimeout(timer);}}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR||os.tmpdir(),'wiki-project-isolation-'));
 const context=new AsyncLocalStorage(),events=[];let afterRead=null,settings={};
 const caller=()=>{const c=context.getStore();if(!c)throw new Error('MISSING_CALLER');return c;};
 const target=name=>path.join(caller().root,name);
 const event=(operation,name)=>{const c=caller();events.push({operation,name,project:c.project,client:c.client});};
 const api={workspace:{get:async()=>({path:caller().root,name:caller().project})},plugin:{getSettings:async()=>settings,setSettings:async patch=>{settings={...settings,...patch};}},fs:{
  readText:async name=>{event('read',name);const raw=await fs.readFile(target(name),'utf8');if(afterRead)await afterRead(name,caller());return raw;},
  writeText:async(name,raw)=>{event('write',name);const file=target(name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,raw);},
  stat:async name=>{event('stat',name);const s=await fs.stat(target(name));return {size:s.size,mtimeMs:s.mtimeMs};},
  list:async name=>{event('list',name);const base=target(name);return Promise.all((await fs.readdir(base,{withFileTypes:true})).map(async d=>{const s=await fs.stat(path.join(base,d.name));return {name:d.name,path:name+'/'+d.name,isDirectory:d.isDirectory(),size:s.size,mtimeMs:s.mtimeMs};}));},
  remove:async name=>{event('remove',name);await fs.unlink(target(name));},
 }};
 const service=new WikiService(api),roots={};
 for(const project of ['alpha','beta']){roots[project]=path.join(root,project);await fs.mkdir(roots[project]);}
 const run=(project,client,work)=>context.run({project,client,root:roots[project]},work);
 const request=(project,client,action,input={},signal)=>run(project,client,()=>service.request({action,workspacePath:roots[project],...input},signal));
 t.after(async()=>{service.dispose();await fs.rm(root,{recursive:true,force:true});});
 const docs={};
 for(const project of Object.keys(roots)){await request(project,'setup','init');docs[project]=await request(project,'setup','save',{title:'Project evidence',category:'rules',kind:'document',content:project+' source evidence.'});}
 events.length=0;
 return {root,roots,run,request,docs,service,events,setAfterRead:fn=>{afterRead=fn;}};
}

test('different projects progress independently while one project read is held',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();
 f.setAfterRead(async(name,c)=>{if(c.client==='held-alpha'&&name.endsWith('.md')){entered.resolve();await release.promise;}});
 const first=f.request('alpha','held-alpha','read',{id:f.docs.alpha.id}).catch(error=>{throw error;});
 await entered.promise;
 try{
  const saved=await within(f.request('beta','save-beta','save',{...f.docs.beta,content:'beta independently saved.',expectedRevision:f.docs.beta.revision}));
  assert.equal(saved.content,'beta independently saved.');
  const read=await within(f.request('beta','read-beta','read',{recordId:saved.recordId}));assert.equal(read.content,saved.content);
 }finally{release.resolve();}
 assert.equal((await first).content,'alpha source evidence.');
 assert.ok(f.events.filter(x=>x.client.endsWith('beta')).every(x=>x.project==='beta'));
});

test('queued same-project requests preserve each caller async identity after the first settles',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();
 f.setAfterRead(async(name,c)=>{if(c.client==='first-alpha'&&name.endsWith('.md')){entered.resolve();await release.promise;}});
 const first=f.request('alpha','first-alpha','read',{id:f.docs.alpha.id});await entered.promise;
 const second=f.request('alpha','second-alpha','save',{...f.docs.alpha,expectedRevision:f.docs.alpha.revision,content:'Second caller owns this save.'});
 release.resolve();await first;const saved=await second;
 assert.equal(saved.content,'Second caller owns this save.');
 const writes=f.events.filter(x=>x.operation==='write'&&x.name.endsWith('.md'));
 assert.deepEqual(writes.map(x=>x.client),['second-alpha']);
 assert.ok(writes.every(x=>x.project==='alpha'));
});

test('latest-search generations and cancellation are isolated even when projects use the same client id',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred(),clientId='00000000-0000-4000-8000-000000000001';
 f.setAfterRead(async(name,c)=>{if(c.client==='search-alpha'&&name.endsWith('.md')){entered.resolve();await release.promise;}});
 const search=(project,client,sequence)=>f.run(project,client,()=>f.service.requestLatestSearch({action:'search',workspacePath:f.roots[project],query:'evidence',clientId,sequence}));
 const old=search('alpha','search-alpha',1).then(value=>({value}),error=>({error}));await entered.promise;
 try{
  const beta=await within(search('beta','search-beta',1));assert.equal(beta.length,1);assert.equal(beta[0].title,'Project evidence');
  await f.run('alpha','cancel-alpha',()=>f.service.cancelLatestSearch({clientId,sequence:2}));
  const again=await within(search('beta','second-beta',2));assert.equal(again.length,1);
 }finally{release.resolve();}
 assert.match((await old).error.message,/CANCELLED/);
});

test('same-project writes remain FIFO while another project uses its own operation scope',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();
 f.setAfterRead(async(name,c)=>{if(c.client==='hold'&&name===`${ROOT}/project.json`){entered.resolve();await release.promise;}});
 const hold=f.request('alpha','hold','snapshot');await entered.promise;
 const order=[],first=f.request('alpha','one','save',{title:'First queued rule',content:'First.',kind:'document'}).then(value=>{order.push('one');return value;});
 const second=f.request('alpha','two','save',{title:'Second queued rule',content:'Second.',kind:'document'}).then(value=>{order.push('two');return value;});
 try{const beta=await within(f.request('beta','beta','snapshot'));assert.equal(beta.workspacePath,f.roots.beta);}finally{release.resolve();}
 await Promise.all([hold,first,second]);assert.deepEqual(order,['one','two']);
 assert.ok(f.events.filter(x=>x.operation==='write'&&x.name.endsWith('.md')).every(x=>x.project==='alpha'));
});

test('snapshot ignores a stale hint but mutations never select another project by argument',async t=>{
 const f=await fixture(t);
 const snapshot=await f.request('alpha','discovery','snapshot',{workspacePath:f.roots.beta});assert.equal(snapshot.workspacePath,f.roots.alpha);
 f.events.length=0;
 await assert.rejects(f.request('alpha','wrong','save',{workspacePath:f.roots.beta,title:'Wrong project',content:'Never write this.'}),/WORKSPACE_CHANGED/);
 assert.equal(f.events.length,0);
});

test('disposal rejects active and queued operations across projects without starting queued writes',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();
 f.setAfterRead(async(name,c)=>{if(c.client.startsWith('hold-')&&name===`${ROOT}/project.json`){entered.resolve();await release.promise;}});
 const a=f.request('alpha','hold-a','snapshot').then(value=>({value}),error=>({error}));await entered.promise;
 const b=f.request('beta','hold-b','snapshot').then(value=>({value}),error=>({error}));
 const write=f.request('alpha','never','save',{title:'Never created',content:'Never persisted.'}).then(value=>({value}),error=>({error}));
 f.service.dispose();release.resolve();
 for(const result of await Promise.all([a,b,write]))assert.match(result.error.message,/PLUGIN_UNLOADED/);
 assert.equal(f.events.filter(x=>x.operation==='write').length,0);
});

test('plugin-wide personal preferences preserve revision conflicts across project queues',async t=>{
 const f=await fixture(t),initial=await f.request('alpha','preferences','preferencesGet');
 const updates=await Promise.allSettled([
  f.request('alpha','preferences-a','preferencesSave',{content:'First preference.',expectedRevision:initial.revision}),
  f.request('beta','preferences-b','preferencesSave',{content:'Second preference.',expectedRevision:initial.revision}),
 ]);
 assert.equal(updates.filter(result=>result.status==='fulfilled').length,1);
 assert.match(updates.find(result=>result.status==='rejected').reason.message,/REVISION_CONFLICT/);
});

test('idle project bookkeeping is bounded without evicting a held project queue',async()=>{
 const {ProjectRequestQueues}=require('./project-request-queues.cjs');
 const registry=new ProjectRequestQueues(async input=>input.query),entered=deferred(),release=deferred();
 try{
  const active=registry.get('/workspace/held');
  const work=active.queue.enqueue(async()=>{entered.resolve();await release.promise;return 'held completed';});
  await entered.promise;
  for(let i=0;i<40;i++){
   const project=registry.get(`/workspace/idle-${i}`);
   assert.equal(await project.latest.submit({action:'search',workspacePath:`/workspace/idle-${i}`,clientId:'00000000-0000-4000-8000-000000000001',sequence:1,query:'ready'}),'ready');
  }
  assert.equal(registry.get('/workspace/held'),active);
  assert.ok(registry.projects.size<=33);
  release.resolve();assert.equal(await work,'held completed');assert.ok(registry.projects.size<=32);
 }finally{release.resolve();registry.close();}
});

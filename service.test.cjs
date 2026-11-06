'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WikiService } = require('./service.cjs');
const { validateFiles, ROOT, normalize, encode } = require('./core.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(),'bone-wiki-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let workspacePath = root; let settings = {}; const reads = [];
  const api = {
    workspace:{get:async()=>({path:workspacePath,name:'Test Project'})},
    plugin:{getSettings:async()=>settings,setSettings:async patch=>{settings={...settings,...patch};}},
    fs:{
      readText:async p=>{reads.push(p);return fs.readFile(path.join(workspacePath,p),'utf8');},
      writeText:async(p,content)=>{const target=path.join(workspacePath,p);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content);},
      remove:async p=>fs.rm(path.join(workspacePath,p),{recursive:true,force:true}),
      stat:async p=>{const info=await fs.stat(path.join(workspacePath,p));return {size:info.size,mtimeMs:info.mtimeMs};},
      list:async dir=>{
        let entries;
        try{entries=await fs.readdir(path.join(workspacePath,dir),{withFileTypes:true});}
        catch(error){if(error.code==='ENOENT'){const missing=new Error(`cannot list ${dir}`);missing.code='NOT_FOUND';throw missing;}throw error;}
        const result=[];
        for(const entry of entries){
          const relative=`${dir}/${entry.name}`;
          if(entry.isDirectory()){result.push({name:entry.name,path:relative,isDirectory:true});continue;}
          const info=await fs.stat(path.join(workspacePath,dir,entry.name));
          result.push({name:entry.name,path:relative,isDirectory:false,size:info.size,mtimeMs:info.mtimeMs});
        }
        return result;
      }
    }
  };
  const service=new WikiService(api);
  const request=(action,input={})=>service.request({action,workspacePath:root,...input});
  return {root,api,service,request,reads,switchTo:p=>{workspacePath=p;}};
}
// Host-faithful fixture: fs.list returns at most `page` entries per directory
// and says nothing about the cut. This is PI-Desktop's fs.list behaviour.
async function listFixture(t, page = 1000) {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'bone-wiki-page-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let settings = {};
  const api = {
    workspace: { get: async () => ({ path: root, name: 'Large Project' }) },
    plugin: { getSettings: async () => settings, setSettings: async patch => { settings = { ...settings, ...patch }; } },
    fs: {
      readText: async p => fs.readFile(path.join(root, p), 'utf8'),
      writeText: async (p, content) => { const target = path.join(root, p); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); },
      remove: async p => fs.rm(path.join(root, p), { recursive: true, force: true }),
      stat: async p => { const info = await fs.stat(path.join(root, p)); return { size: info.size, mtimeMs: info.mtimeMs }; },
      list: async dir => {
        let entries;
        try { entries = await fs.readdir(path.join(root, dir), { withFileTypes: true }); }
        catch (error) { if (error.code === 'ENOENT') { const missing = new Error(`cannot list ${dir}`); missing.code = 'NOT_FOUND'; throw missing; } throw error; }
        const result = [];
        for (const entry of entries) {
          if (result.length >= page) break;
          const relative = `${dir}/${entry.name}`;
          if (entry.isDirectory()) { result.push({ name: entry.name, path: relative, isDirectory: true }); continue; }
          const info = await fs.stat(path.join(root, dir, entry.name));
          result.push({ name: entry.name, path: relative, isDirectory: false, size: info.size, mtimeMs: info.mtimeMs });
        }
        return result;
      }
    }
  };
  const service = new WikiService(api);
  service.racyWindowMs = 0;
  service.listPage = page;
  return { root, api, service, request: (action, input = {}) => service.request({ action, workspacePath: root, ...input }) };
}
async function seedRecords(root, category, count) {
  await fs.mkdir(path.join(root, ROOT, 'knowledge', category), { recursive: true });
  let last = null;
  for (let index = 0; index < count; index += 1) {
    last = normalize({ title: `${category} record ${index}`, category, kind: 'document', content: `body ${index}` });
    await fs.writeFile(path.join(root, ROOT, 'knowledge', category, `${last.id}.md`), encode(last));
  }
  return last;
}
test('user path: initialize, author, search, edit externally, resume, import and export',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('snapshot')).initialized,false);
  await f.request('init');
  const doc=await f.request('save',{title:'退款规则',category:'business',kind:'document',status:'confirmed',topics:['订单'],content:'部分退款不得超过已付款金额。',source:'Confirmed requirement'});
  assert.equal((await f.request('search',{query:'退款'}))[0].id,doc.id);
  await fs.appendFile(path.join(f.root,doc.path),'\n人工补充：保留审计记录。');
  await assert.rejects(f.request('save',{...doc,expectedRevision:doc.revision,content:'overwrite'}),/REVISION_CONFLICT/);
  assert.match((await f.request('read',{id:doc.id})).content,/人工补充/);
  await f.request('save',{title:'Task A',category:'development',kind:'handoff',content:'Branch: feature/refund\nVerified: unit tests\nNext: integration tests'});
  await f.request('save',{title:'Task B',category:'development',kind:'handoff',content:'Branch: feature/orders\nNext: implement validation'});
  const reopened=new WikiService(f.api);
  assert.match((await reopened.request({action:'context',workspacePath:f.root})).text,/Task A/);
  assert.match((await reopened.request({action:'context',workspacePath:f.root})).text,/Task B/);
  const prototype=await f.request('import',{title:'Refund flow',category:'prototypes',kind:'prototype',entryPath:'index.html',files:[{path:'index.html',content:'<button onclick="this.textContent=\'Done\'">Submit</button>'},{path:'style.css',content:'button{color:green}'}]});
  assert.equal((await f.request('read',{id:prototype.id})).files.length,2);
  const exported=await f.request('export');
  assert.match(exported.html,/退款规则/);
  assert.doesNotMatch(exported.html,/Branch: feature/);
  assert.doesNotMatch(exported.html,/<button/);
});
test('an empty library has no category directories and still loads',async t=>{
  const f=await fixture(t);
  const created=await f.request('init');
  assert.equal(created.initialized,true);
  assert.deepEqual(created.entries,[]);
  assert.deepEqual(created.corrupted,[]);
  // Every category directory is missing here; `fs.list` answers "cannot list"
  // with a NOT_FOUND code, which must read as "no records", not as a failure.
  assert.deepEqual((await f.request('snapshot')).entries,[]);
});
test('general knowledge accepts and discovers custom categories',async t=>{
  const f=await fixture(t); await f.request('init');
  const entry=await f.request('save',{title:'Field notes',category:'field-notes',content:'A domain-specific note'});
  const snapshot=await f.request('snapshot');
  assert.ok(snapshot.sections.knowledge.categories.includes('field-notes'));
  assert.equal((await f.request('read',{id:entry.id})).content,'A domain-specific note');
});

test('private preferences and forgotten memory never reappear in project context',async t=>{
  const f=await fixture(t);await f.request('init');
  const pref=await f.request('preferencesGet');
  await f.request('preferencesSave',{content:'Prefer concise Chinese',expectedRevision:pref.revision});
  await assert.rejects(f.request('preferencesSave',{content:'stale',expectedRevision:pref.revision}),/REVISION_CONFLICT/);
  const memory=await f.request('save',{title:'Development rules',category:'memory',kind:'memory',content:'Use explicit verification',status:'confirmed'});
  assert.match((await f.request('context')).text,/explicit verification/);
  await f.request('forget',{id:memory.id,expectedRevision:memory.revision});
  assert.doesNotMatch((await f.request('context')).text,/explicit verification/);
  const all=[ROOT];
  const files=[];
  while(all.length){
    const dir=all.pop();
    for(const item of await f.api.fs.list(dir)){ if(item.isDirectory)all.push(item.path); else files.push(item.path); }
  }
  for(const p of files)assert.doesNotMatch(await f.api.fs.readText(p),/Prefer concise Chinese/);
});
test('project switching rejects queued writes and prevents cross-project context',async t=>{
  const f=await fixture(t);await f.request('init');
  const other=path.join(f.root,'other');await fs.mkdir(other);
  f.switchTo(other);
  await assert.rejects(f.request('save',{title:'Wrong project',content:'x'}),/WORKSPACE_CHANGED/);
  assert.equal((await f.service.request({action:'snapshot'})).initialized,false);
});
test('concurrent updates preserve one winner and reject stale editors',async t=>{
  const f=await fixture(t);await f.request('init');
  const e=await f.request('save',{title:'Rule',category:'business',content:'original'});
  const results=await Promise.allSettled(['first','second'].map(content=>f.request('save',{...e,content,expectedRevision:e.revision})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await f.request('read',{id:e.id})).content,'first');
});
test('imports reject traversal, duplicate paths, executable image formats and missing entry',()=>{
  for(const p of ['../a.html','/a.html','a\\b.html','a/../b.html'])assert.throws(()=>validateFiles([{path:p,content:'x'}],'prototype',p),/UNSAFE_PATH/);
  assert.throws(()=>validateFiles([{path:'a.html',content:'x'},{path:'A.html',content:'x'}],'prototype','a.html'),/DUPLICATE_FILE/);
  assert.throws(()=>validateFiles([{path:'a.svg',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'}],'image'),/UNSUPPORTED_IMAGE/);
  assert.throws(()=>validateFiles([{path:'a.html',content:'x'}],'prototype','b.html'),/HTML_ENTRY_REQUIRED/);
  const dataUrl='data:image/png;base64,iVBORw0KGgo=';
  assert.equal(validateFiles([{path:'a.png',dataUrl}],'image')[0].dataUrl,dataUrl);
});
test('extension restores only bounded current project context without accumulating prompt additions',async t=>{
  const f=await fixture(t);await f.request('init');
  await f.request('save',{title:'Current rule',category:'memory',kind:'memory',content:'Check current branch',status:'confirmed'});
  const {default:extension,readProjectContext}=await import('./extension.mjs');
  const handlers={};extension({on:(name,handler)=>{handlers[name]=handler;}});
  const ctx={cwd:f.root,ui:{notify:()=>{throw new Error('unexpected warning');}}};
  const first=await handlers.before_agent_start({systemPrompt:'BASE'},ctx);
  const second=await handlers.before_agent_start({systemPrompt:'BASE'},ctx);
  assert.equal(first.systemPrompt,second.systemPrompt);
  assert.match(first.systemPrompt,/Check current branch/);
  // A turn-start injection is an index, not a body dump: no per-record hashes,
  // bounded size, and the tool guidance only appears once.
  assert.ok(first.systemPrompt.length - 'BASE'.length <= 1500, `injected ${first.systemPrompt.length - 'BASE'.length} chars`);
  assert.doesNotMatch(first.systemPrompt,/\b[a-f0-9]{64}\b/);
  assert.match(first.systemPrompt,/## Memory index \(1 active of 1 records\)/);
  assert.equal(await readProjectContext(path.join(f.root,'nonexistent')),null);
  await fs.rename(path.join(f.root,ROOT,'memory'),path.join(f.root,'private-memory'));
  await fs.symlink(path.join(f.root,'private-memory'),path.join(f.root,ROOT,'memory'));
  await assert.rejects(readProjectContext(f.root),/UNSAFE_CONTEXT_DIRECTORY/);
});
test('agent settled automatically remembers explicit user preferences and skips secrets',async t=>{
  const f=await fixture(t); await f.request('init');
  const handlers={};
  const {default:extension}=await import('./extension.mjs');
  extension({on:(name,handler)=>{handlers[name]=handler;}});
  const ctx={cwd:f.root,ui:{notify:()=>{throw new Error('unexpected warning');}}};
  await handlers.before_agent_start({systemPrompt:'BASE',prompt:'Please remember that I prefer concise answers.'},ctx);
  await handlers.agent_settled({type:'agent_settled'},ctx);
  await handlers.before_agent_start({systemPrompt:'BASE',prompt:'Please remember that my password is secret-123.'},ctx);
  await handlers.agent_settled({type:'agent_settled'},ctx);
  const snapshot=await f.request('snapshot');
  const memories=snapshot.sections.memory.entries;
  assert.equal(memories.length,1);
  assert.equal(memories[0].source,'automatic-agent-memory');
  assert.match((await f.request('read',{id:memories[0].id,section:'memory'})).content,/prefer concise/);
});
test('plugin lifecycle registers the public tool and panel dispatch uses the same service',async t=>{
  const f=await fixture(t);const tools=new Map();const commands=new Map();
  global.pi={...f.api,agent:{registerTool:async tool=>tools.set(tool.name,tool),unregisterTool:async name=>tools.delete(name)},commands:{register:async command=>commands.set(command.id,command),unregister:async id=>commands.delete(id)},ui:{openPanel:async()=>{}}};
  t.after(()=>{delete global.pi;});
  const manifest=require('./manifest.json');assert.equal(manifest.main,'main.js');const plugin=require(`./${manifest.main}`);await plugin.onLoad();
  const tool=tools.get('project_wiki');assert.ok(tool);
  await tool.execute({action:'init',workspacePath:f.root});
  const entry=await tool.execute({action:'save',workspacePath:f.root,title:'Agent requirement',category:'requirements',content:'A representative user path'});
  const read=await plugin.onPanelInvoke('wiki',{action:'read',workspacePath:f.root,id:entry.id});
  assert.equal(read.content,'A representative user path');
  await plugin.onUnload();assert.equal(tools.size,0);assert.equal(commands.size,0);
});
test('imported assets can be confirmed without changing original bytes',async t=>{
  const f=await fixture(t);await f.request('init');
  const imported=await f.request('import',{title:'Candidate',category:'assets',kind:'image',files:[{path:'asset.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}]});
  const updated=await f.request('save',{...imported,title:'Adopted',status:'confirmed',expectedRevision:imported.revision,topics:['orders']});
  assert.equal(updated.status,'confirmed');
  assert.equal(updated.files[0].dataUrl,imported.files[0].dataUrl);
  await assert.rejects(f.request('save',{title:'Wrong scope',category:'business',kind:'memory',content:'x'}),/INVALID_MEMORY_CATEGORY/);
});
test('a tampered record is isolated, reported and blocks export',async t=>{
  const f=await fixture(t);await f.request('init');
  const healthy=await f.request('save',{title:'Healthy rule',category:'business',content:'Keep this'});
  const imported=await f.request('import',{title:'Image',category:'assets',kind:'image',files:[{path:'asset.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}]});
  const target=path.join(f.root,imported.path);
  const raw=await fs.readFile(target,'utf8');
  await fs.writeFile(target,raw.replace('data:image/png;base64,iVBORw0KGgo=','data:text/html;base64,PHNjcmlwdD4='));
  const snapshot=await f.request('snapshot');
  assert.deepEqual(snapshot.corrupted.map(item=>item.id),[imported.id]);
  assert.ok(snapshot.entries.some(entry=>entry.id===healthy.id));
  assert.equal((await f.request('read',{id:healthy.id})).content,'Keep this');
  await assert.rejects(f.request('read',{id:imported.id}),/DOCUMENT_CORRUPTED/);
  await assert.rejects(f.request('save',{id:imported.id,expectedRevision:imported.revision,title:'Fix',content:'fixed'}),/DOCUMENT_CORRUPTED/);
  await assert.rejects(f.request('export'),/LIBRARY_CORRUPTED/);
});
test('a write that does not land as requested fails instead of reporting success',async t=>{
  const f=await fixture(t);await f.request('init');
  const write= f.api.fs.writeText;
  let attempts=0;
  f.api.fs.writeText=async(p,content)=>{attempts+=1;await write(p,content.slice(0,24));};
  await assert.rejects(f.request('save',{title:'Torn write',content:'x'.repeat(400)}),/WRITE_VERIFY_FAILED/);
  assert.equal(attempts,2);
});
test('context since reports only records updated after a timestamp',async t=>{
  const f=await fixture(t);await f.request('init');
  await f.request('save',{title:'Rule',category:'business',content:'body'});
  await assert.rejects(f.request('context',{since:'not-a-date'}),/INVALID_SINCE/);
  const all=await f.request('context',{since:'1970-01-01T00:00:00Z'});
  assert.equal(all.count,all.changed.length);
  assert.ok(all.count>=1);
  assert.ok(all.changed.every(entry=>entry.revision&&entry.path&&entry.title));
  const future=await f.request('context',{since:'2999-01-01T00:00:00Z'});
  assert.equal(future.count,0);
  assert.deepEqual(future.changed,[]);
  assert.match((await f.request('context')).text,/BoneProjectWiki project context/);
});
test('panel locale channel delegates to the public host locale API',async()=>{
  global.pi={app:{getLocale:async()=> 'zh-CN'}};
  try { assert.equal(await require(`./${require('./manifest.json').main}`).onPanelInvoke('app.getLocale'), 'zh-CN'); }
  finally { delete global.pi; }
});
test('a library larger than one listing page is read completely',async t=>{
  const f=await listFixture(t);
  await f.request('init');
  await seedRecords(f.root,'business',300);
  const last=await seedRecords(f.root,'technical',320);
  const returned=(await f.request('snapshot')).entries;
  assert.equal(returned.length,620);
  assert.ok(returned.some(entry=>entry.id===last.id));
  assert.equal((await f.request('read',{id:last.id})).content,'body 319');
});
test('a directory at the host listing page fails loudly instead of dropping records',async t=>{
  const f=await listFixture(t,20);
  await f.request('init');
  await seedRecords(f.root,'business',20);
  await assert.rejects(f.request('snapshot'),/LIBRARY_SCAN_LIMIT/);
});
test('turn-start context reads the index and only the rule bodies',async t=>{
  const f=await fixture(t); f.service.racyWindowMs=0;
  await f.request('init');
  for(let index=0;index<40;index+=1) await f.request('save',{title:`Handoff ${index}`,category:'development',kind:'handoff',content:`Branch: feat/${index}`});
  for(let index=0;index<3;index+=1) await f.request('save',{title:`Rule ${index}`,category:'memory',kind:'memory',status:'confirmed',content:`rule body ${index}`});
  const {readProjectContextStats}=await import('./extension.mjs');
  const warm=await readProjectContextStats(f.root);
  assert.match(warm.text,/rule body 2/);
  assert.match(warm.text,/## Memory index \(3 active of 3 records\)/);
  assert.deepEqual(warm.reads,{index:1,records:3});
  // Without the index the extension must still work, at the cost of reading the
  // context categories.
  for (const section of ['knowledge','memory','development']) await fs.rm(path.join(f.root,ROOT,section,'index.json'));
  const cold=await readProjectContextStats(f.root);
  assert.match(cold.text,/rule body 2/);
  assert.deepEqual(cold.reads,{index:0,records:3});
});

test('turn-start context is a budgeted index with rules inline and bodies by pointer',()=>{
  const {contextIndex}=require('./core.cjs');
  const rule=(index,content)=>({id:`m${index}`,title:`Rule ${index}`,category:'memory',kind:'memory',status:'confirmed',updatedAt:`2026-01-${String(index+1).padStart(2,'0')}T00:00:00.000Z`,content});
  const entries=[...Array(9)].map((_,index)=>rule(index,'short rule body'));
  entries.push({id:'d1',title:'Handoff A',category:'development',kind:'handoff',status:'confirmed',updatedAt:'2026-02-01T00:00:00.000Z',content:'x'.repeat(5000)});
  entries.push({id:'a1',title:'Archived rule',category:'memory',kind:'memory',status:'archived',updatedAt:'2026-03-01T00:00:00.000Z',content:'must not appear'});
  const block=contextIndex(entries);
  assert.ok(block.length<=1200,`block is ${block.length} chars`);
  assert.match(block,/## Agent memory \(6 of 9, relevance then recency\)/);
  assert.match(block,/Rule 8/);
  assert.doesNotMatch(block,/Rule 0:/);
  assert.doesNotMatch(block,/must not appear/);
  assert.match(block,/## Memory index \(10 active of 11 records\)/);
  assert.doesNotMatch(block,/Handoff A/);
  assert.match(block,/\{action:"read",id\}/);
  assert.doesNotMatch(block,/x{200}/);
  const pressure=contextIndex([3,2,1,0].map(index=>rule(index,'y'.repeat(5000))),{maxChars:700});
  assert.ok(pressure.length<=700,`pressure block is ${pressure.length} chars`);
  assert.match(pressure,/read full memory/);
  assert.doesNotMatch(pressure,/y{20}/);
  assert.match(contextIndex([]),/No automatic memory recorded yet/);
});
test('the record index reuses unchanged records and re-reads only what changed',async t=>{
  const f=await fixture(t); f.service.racyWindowMs=0;
  await f.request('init');
  await f.request('save',{title:'Rule',category:'memory',kind:'memory',status:'confirmed',content:'verify before delivery'});
  const target=await f.request('save',{title:'Handoff',category:'development',kind:'handoff',content:'Branch: feat/x'});
  const recordReads=()=>f.reads.filter(p=>!p.endsWith('/index.json')&&p.endsWith('.md'));
  f.reads.length=0;
  const warm=await f.request('snapshot');
  assert.equal(warm.entries.length,2);
  assert.deepEqual(recordReads(),[]);
  const file=path.join(f.root,target.path);
  await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('Branch: feat/x','Branch: feat/y'));
  f.reads.length=0;
  const after=await f.request('snapshot');
  assert.equal(after.entries.length,2);
  assert.deepEqual(recordReads(),[target.path]);
  f.reads.length=0;
  assert.match((await f.request('read',{id:target.id})).content,/feat\/y/);
  assert.equal(f.reads.filter(p=>p.endsWith('.md')).length,1);
});
test('the context brief reads only the records it can use',async t=>{
  const f=await fixture(t); f.service.racyWindowMs=0;
  await f.request('init');
  for(let index=0;index<10;index+=1) await f.request('save',{title:`Business ${index}`,category:'business',content:`business body ${index}`});
  await f.request('save',{title:'Rule',category:'memory',kind:'memory',status:'confirmed',content:'verify before delivery'});
  const categories=()=>f.reads.filter(p=>p.startsWith(`${ROOT}/`)&&!p.endsWith('index.json')).map(p=>p.split('/')[1]);
  f.reads.length=0;
  const brief=await f.request('context');
  assert.match(brief.text,/verify before delivery/);
  assert.deepEqual(categories(),['memory']);
});
test('a damaged index is rebuilt instead of failing the library',async t=>{
  const f=await fixture(t); f.service.racyWindowMs=0;
  await f.request('init');
  await f.request('save',{title:'Rule',category:'memory',kind:'memory',status:'confirmed',content:'x'});
  await fs.writeFile(path.join(f.root,ROOT,'memory','index.json'),'{not json');
  const snapshot=await f.request('snapshot');
  assert.equal(snapshot.entries.length,1);
  const index=JSON.parse(await fs.readFile(path.join(f.root,ROOT,'memory','index.json'),'utf8'));
  assert.equal(index.version,1);
  assert.equal(index.entries.length,1);
  assert.equal((await f.request('reindex')).sections.memory.records,1);
});

test('move, delete, and reveal operations manage files and index correctly', async t => {
  const f = await fixture(t);
  await f.request('init');
  const record = await f.request('save', { title: 'Moving note', category: 'general', content: 'hello' });
  assert.equal(record.category, 'general');
  const moved = await f.request('move', { id: record.id, targetCategory: 'design', expectedRevision: record.revision });
  assert.equal(moved.category, 'design');
  assert.equal((await f.request('read', { id: record.id })).category, 'design');
  const revealed = await f.request('reveal', { id: record.id });
  assert.equal(revealed.revealed, true);
  const deleted = await f.request('delete', { id: record.id, expectedRevision: moved.revision });
  assert.equal(deleted.deleted, true);
  await assert.rejects(f.request('read', { id: record.id }), /DOCUMENT_NOT_FOUND/);
});

test('document titles rename physical files and upgrade historical UUIDs to Chinese titles', async t => {
  const f = await fixture(t);
  await f.request('init');
  const doc = await f.request('save', { title: '经济环境很好科技', category: 'general', content: '第一版内容' });
  assert.equal(doc.id, '经济环境很好科技');
  assert.equal(doc.path, '.bone-project-wiki/knowledge/general/经济环境很好科技.md');
  const path1 = path.join(f.root, doc.path);
  assert.ok(await fs.stat(path1).then(() => true).catch(() => false));

  const renamed = await f.request('save', {
    id: doc.id,
    expectedRevision: doc.revision,
    title: '经济环境很好科技（升级版）',
    category: 'general',
    content: '第二版内容'
  });
  assert.equal(renamed.id, '经济环境很好科技（升级版）');
  assert.equal(renamed.path, '.bone-project-wiki/knowledge/general/经济环境很好科技（升级版）.md');
  assert.equal(await fs.stat(path1).then(() => true).catch(() => false), false);
  assert.ok(await fs.stat(path.join(f.root, renamed.path)).then(() => true).catch(() => false));

  const uuid = '832c0913-4912-403d-a836-56be41451828';
  const legacyPath = path.join(f.root, ROOT, 'knowledge', 'general', `${uuid}.md`);
  const legacyEntry = { schemaVersion: 1, id: uuid, title: '历史老笔记', category: 'general', kind: 'document', status: 'draft', tags: [], topics: [], source: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: '老内容' };
  await fs.writeFile(legacyPath, encode(legacyEntry));
  const readLegacy = await f.request('read', { id: uuid });
  assert.equal(readLegacy.id, uuid);

  const upgraded = await f.request('save', {
    id: uuid,
    expectedRevision: readLegacy.revision,
    title: '历史老笔记',
    category: 'general',
    content: '升级后的内容'
  });
  assert.equal(upgraded.id, '历史老笔记');
  assert.equal(upgraded.path, '.bone-project-wiki/knowledge/general/历史老笔记.md');
  assert.equal(await fs.stat(legacyPath).then(() => true).catch(() => false), false);
  assert.ok(await fs.stat(path.join(f.root, upgraded.path)).then(() => true).catch(() => false));
});

test('deleteCategory removes directory and clears contents from knowledge index', async t => {
  const f = await fixture(t);
  await f.request('init');
  await f.request('createCategory', { category: '废弃草稿' });
  const doc = await f.request('save', { title: '草稿笔记', category: '废弃草稿', content: '临时内容' });
  let snap = await f.request('snapshot');
  assert.ok(snap.sections.knowledge.categories.includes('废弃草稿'));
  assert.ok(snap.entries.some(e => e.id === doc.id));

  const res = await f.request('deleteCategory', { category: '废弃草稿' });
  assert.equal(res.deleted, true);
  assert.equal(res.category, '废弃草稿');

  snap = await f.request('snapshot');
  assert.equal(snap.sections.knowledge.categories.includes('废弃草稿'), false);
  assert.equal(snap.entries.some(e => e.id === doc.id), false);
});

test('externally added raw Markdown files are automatically recognized with inferred titles', async t => {
  const f = await fixture(t);
  await f.request('init');
  // 在磁盘直接创建目录和纯 Markdown 文件（模拟从操作系统访达直接拖入）
  const externalDir = path.join(f.root, ROOT, 'knowledge', '外部资料');
  await fs.mkdir(externalDir, { recursive: true });
  const rawNote = '# 我的自制架构笔记\n\n这是直接拷贝进来的普通 markdown。\n- 模块A\n- 模块B';
  await fs.writeFile(path.join(externalDir, '架构设计.md'), rawNote, 'utf8');

  // 重新获取 snapshot，验证自动被扫描识别
  const snap = await f.request('snapshot');
  assert.ok(snap.sections.knowledge.categories.includes('外部资料'));
  const found = snap.entries.find(e => e.id === '架构设计');
  assert.ok(found, 'Raw markdown file should be recognized');
  assert.equal(found.title, '我的自制架构笔记');
  assert.equal(found.category, '外部资料');

  // 验证可以正常 read
  const read = await f.request('read', { id: '架构设计' });
  assert.equal(read.title, '我的自制架构笔记');
  assert.match(read.content, /模块A/);
});

test('recognizes and handles Word, WPS, PDF, audio and video files properly', async t => {
  const f = await fixture(t);
  await f.request('init');
  const mediaDir = path.join(f.root, ROOT, 'knowledge', '多媒体与文档');
  await fs.mkdir(mediaDir, { recursive: true });

  // 放入不同格式的文件
  await fs.writeFile(path.join(mediaDir, '会议录音.mp3'), Buffer.from('fake-mp3-bytes'));
  await fs.writeFile(path.join(mediaDir, '产品演示.mp4'), Buffer.from('fake-mp4-bytes'));
  await fs.writeFile(path.join(mediaDir, '设计规范.pdf'), Buffer.from('fake-pdf-bytes'));
  await fs.writeFile(path.join(mediaDir, '项目合同.docx'), Buffer.from('fake-docx-bytes'));
  await fs.writeFile(path.join(mediaDir, '财务报表.et'), Buffer.from('fake-wps-et-bytes'));

  const snap = await f.request('snapshot');
  assert.ok(snap.sections.knowledge.categories.includes('多媒体与文档'));

  const mp3 = snap.entries.find(e => e.id === '会议录音.mp3');
  assert.ok(mp3);
  assert.equal(mp3.kind, 'audio');

  const mp4 = snap.entries.find(e => e.id === '产品演示.mp4');
  assert.ok(mp4);
  assert.equal(mp4.kind, 'video');

  const pdf = snap.entries.find(e => e.id === '设计规范.pdf');
  assert.ok(pdf);
  assert.equal(pdf.kind, 'pdf');

  const docx = snap.entries.find(e => e.id === '项目合同.docx');
  assert.ok(docx);
  assert.equal(docx.kind, 'attachment');

  const wps = snap.entries.find(e => e.id === '财务报表.et');
  assert.ok(wps);
  assert.equal(wps.kind, 'attachment');

  // 读取验证
  const readAudio = await f.request('read', { id: '会议录音.mp3' });
  assert.equal(readAudio.kind, 'audio');
  assert.equal(readAudio.files.length, 1);

  const readDoc = await f.request('read', { id: '项目合同.docx' });
  assert.equal(readDoc.kind, 'attachment');
  assert.equal(readDoc.files.length, 1);
});

test('captures automatic memory directly from before_agent_start prompt in real host environment without pi.session', async t => {
  const f = await fixture(t);
  await f.request('init');
  const handlers = {};
  const { default: extension, readProjectContext } = await import('./extension.mjs');
  // 真实宿主环境：pi 对象没有 session 属性
  extension({ on: (name, handler) => { handlers[name] = handler; } });

  // 1. 用户提出要求：before_agent_start 触发
  const prompt = '请记住：后续统一采用 TailwindCSS 进行前端样式开发';
  await handlers.before_agent_start({ type: 'before_agent_start', prompt, systemPrompt: 'Base system prompt' }, { cwd: f.root });

  // 2. 轮次结算：agent_settled 触发
  await handlers.agent_settled({ type: 'agent_settled' }, { cwd: f.root });

  // 3. 验证记忆被持久化落盘
  const snap = await f.request('snapshot');
  const memories = snap.sections.memory.entries;
  assert.equal(memories.length, 1);
  assert.equal(memories[0].source, 'automatic-agent-memory');
  const read = await f.request('read', { id: memories[0].id, section: 'memory' });
  assert.match(read.content, /TailwindCSS/);
  // 4. 下一次会话启动时，验证已被自动注入进上下文
  const context = await readProjectContext(f.root);
  assert.match(context, /TailwindCSS/);
});

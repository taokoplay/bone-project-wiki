'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {WikiService}=require('./service.cjs');
const {normalize,encode,decode,recordPath}=require('./core.cjs');
const {stableRecordId,documentContentHash}=require('./document-links.cjs');
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR||os.tmpdir(),'wiki-search-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let current=root,failRead='';const bodies=new Map(),previews=[],textReads=[];
 const api={workspace:{get:async()=>({path:current,name:'Search fixture'})},fs:{
  readText:async name=>{textReads.push(name);if(name.endsWith('.md'))bodies.set(name,(bodies.get(name)||0)+1);if(name===failRead)throw Object.assign(new Error('Unreadable fixture'),{code:'EIO'});return fs.readFile(path.join(current,name),'utf8');},
  writeText:async(name,raw)=>{await fs.mkdir(path.dirname(path.join(current,name)),{recursive:true});await fs.writeFile(path.join(current,name),raw);},
  stat:async name=>{const v=await fs.stat(path.join(current,name));return {size:v.size,mtimeMs:v.mtimeMs};},
  list:async name=>Promise.all((await fs.readdir(path.join(current,name),{withFileTypes:true})).map(async d=>{const rel=`${name}/${d.name}`,v=await fs.stat(path.join(current,rel));return {name:d.name,path:rel,isDirectory:d.isDirectory(),size:v.size,mtimeMs:v.mtimeMs};})),
  readPreview:async name=>{previews.push(name);return {dataUrl:'data:image/png;base64,'+(await fs.readFile(path.join(current,name))).toString('base64')};}
 }};
 const service=new WikiService(api),request=(action,input={})=>service.request({action,workspacePath:root,...input});await request('init');
 const put=async(entry,previous)=>{const normalized=normalize(entry,previous),name=recordPath(normalized),raw=encode(normalized);await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),raw);await fs.utimes(path.join(root,name),new Date('2024-01-01'),new Date('2024-01-01'));return decode(raw,name);};
 const asset=async(name,raw)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),raw);await fs.utimes(path.join(root,name),new Date('2024-01-01'),new Date('2024-01-01'));};
 const reset=()=>{bodies.clear();previews.length=0;textReads.length=0;};
 return {root,api,service,request,put,asset,bodies,previews,textReads,reset,unreadable:name=>{failRead=name;},switchTo:name=>{current=name;}};
}
const document=(title,content,extra={})=>({title,content,kind:'document',category:'rules',status:'confirmed',...extra});
async function linked(f,source,content='Unique summary fact.') {
 return f.put({title:'Stored memory label',kind:'memory',category:'memory',status:'confirmed',content,documentRef:{recordId:stableRecordId(source),contentHash:documentContentHash(source),readWhen:'Before changing the rule'}});
}
async function warm(f){await f.request('snapshot');f.reset();}

test('search verifies every actual body once per request and keeps linked memory results',async t=>{
 const f=await fixture(t),documents=[];
 for(let i=0;i<20;i++)documents.push(await f.put(document(`Source ${i}`,`Source fixture body ${i}.`)));
 const memories=[];for(let i=0;i<10;i++)memories.push(await linked(f,documents[i%5],`Unique summary fact ${i}.`));
 await warm(f);
 const rows=await f.request('search',{query:'Unique summary'});
 assert.equal(rows.length,10);assert.ok(rows.every(x=>x.kind==='memory'&&x.documentLink.state==='current'));
 assert.equal([...f.bodies.values()].reduce((a,b)=>a+b,0),30);
 assert.ok([...f.bodies.values()].every(count=>count===1));
 f.reset();await f.request('search',{section:'memory',query:'Unique summary'});
 assert.equal([...f.bodies.values()].reduce((a,b)=>a+b,0),30);
 assert.ok([...f.bodies.values()].every(count=>count===1));
});

test('search avoids media and HTML previews while explicit opens retain previews',async t=>{
 const f=await fixture(t),dir='.bone-project-wiki/knowledge/media';
 await f.asset(`${dir}/image.png`,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64'));
 await f.asset(`${dir}/page.html`,'<h1>Fixture</h1><link rel="stylesheet" href="style.css"><img src="image.png">');
 await f.asset(`${dir}/style.css`,'h1{color:green}');await warm(f);
 assert.deepEqual(await f.request('search',{query:'unmatched-token'}),[]);
 assert.deepEqual(f.previews,[]);assert.ok(!f.textReads.some(name=>/page\.html|style\.css/.test(name)));
 assert.ok((await f.request('read',{id:'image.png'})).files[0].dataUrl);
 assert.ok((await f.request('read',{id:'page.html'})).htmlPreview.files.some(x=>x.path==='style.css'));
 assert.ok(f.previews.length>0);
});

test('search preserves score, excerpt, scope, archived filtering and cross-section results',async t=>{
 const f=await fixture(t);
 const note=await f.put(document('Needle handbook','Leading text. needle body.'));
 const memory=await f.put({kind:'memory',category:'memory',status:'draft',title:'Candidate',content:'needle candidate.'});
 const handoff=await f.put({kind:'handoff',category:'development',status:'draft',title:'Checkpoint',content:'needle checkpoint.'});
 await f.put(document('Needle archived','needle archived.',{status:'archived'}));await warm(f);
 const rows=await f.request('search',{query:'needle'});
 assert.deepEqual(rows.map(x=>x.id),[note.id,memory.id,handoff.id]);assert.deepEqual(rows.map(x=>x.score),[6,1,1]);
 assert.equal(rows[0].excerpt,'Leading text. needle body.');
 assert.deepEqual((await f.request('search',{query:'needle',section:'knowledge'})).map(x=>x.id),[note.id]);
});

test('a fresh search does not reuse a previous request source body or stale summary',async t=>{
 const f=await fixture(t),source=await f.put(document('Policy','Original source body.'));
 const memory=await linked(f,source);await warm(f);
 assert.ok((await f.request('search',{query:'Unique summary'})).some(x=>x.id===memory.id));
 const filename=path.join(f.root,source.path),before=await fs.stat(filename);
 await fs.writeFile(filename,encode({...source,content:'Modified source body.'}));await fs.utimes(filename,before.atime,before.mtime);
 assert.equal((await fs.stat(filename)).size,before.size);
 assert.ok(!(await f.request('search',{query:'Unique summary'})).some(x=>x.id===memory.id));
 assert.equal((await f.request('search',{query:'Policy'})).find(x=>x.id===memory.id).documentLink.state,'stale');
});

test('unchanged metadata cannot hide duplicate source identity or unreadable candidates',async t=>{
 for(const mode of ['duplicate','unreadable'])await t.test(mode,async t=>{
  const f=await fixture(t),source=await f.put(document('Primary','Verified source body.')),other=await f.put(document('Other','Unrelated source body.'));
  const memory=await linked(f,source);await warm(f);
  if(mode==='duplicate') {
   const filename=path.join(f.root,other.path),before=await fs.stat(filename);
   await fs.writeFile(filename,encode({...other,recordId:source.recordId}));await fs.utimes(filename,before.atime,before.mtime);assert.equal((await fs.stat(filename)).size,before.size);
  } else f.unreadable(other.path);
  const rows=await f.request('search',{query:'Primary'}),row=rows.find(x=>x.id===memory.id);
  if(mode==='unreadable')assert.equal(row.documentLink.state,'unreadable');
  assert.ok(!(await f.request('search',{query:'Unique summary'})).some(x=>x.id===memory.id));
  assert.ok([...f.bodies.values()].every(count=>count<=2),'each of the two searches may read a candidate only once');
 });
});

test('an archived source is still checked for memory freshness even when excluded from search results',async t=>{
 const f=await fixture(t),source=await f.put(document('Archived policy','Saved source body.'));
 const memory=await linked(f,source);await f.put({...source,status:'archived'},source);await warm(f);
 const rows=await f.request('search',{query:'Archived policy'});
 assert.ok(!rows.some(x=>x.id===source.id));assert.equal(rows.find(x=>x.id===memory.id).documentLink.state,'archived');
 assert.ok(!(await f.request('search',{query:'Unique summary'})).some(x=>x.id===memory.id));
});

test('workspace changes during the final searched body reject stale results',async t=>{
 const f=await fixture(t),source=await f.put(document('Only document','Only body.'));await warm(f);
 const read=f.api.fs.readText;f.api.fs.readText=async name=>{const raw=await read(name);if(name===source.path)f.switchTo(f.root+'/other');return raw;};
 await assert.rejects(f.request('search',{query:'Only',section:'knowledge'}),/WORKSPACE_CHANGED/);
});

'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {WikiService}=require('./service.cjs');const {makeWorkbook}=require('./tests/xlsx-fixtures.cjs');
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR||os.tmpdir(),'wiki-xlsx-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let current=root;const reads=[];
 const api={workspace:{get:async()=>({path:current,name:'Spreadsheet fixture'})},fs:{
  readText:p=>fs.readFile(path.join(current,p),'utf8'),
  writeText:async(p,raw)=>{await fs.mkdir(path.dirname(path.join(current,p)),{recursive:true});await fs.writeFile(path.join(current,p),raw);},
  stat:async p=>{const v=await fs.stat(path.join(current,p));return {size:v.size,mtimeMs:v.mtimeMs};},
  readRange:async(p,offset,length)=>{reads.push({p,offset,length});const b=await fs.readFile(path.join(current,p));return {bytes:Uint8Array.from(b.subarray(offset,offset+length)),totalSize:b.length};},
  list:async p=>Promise.all((await fs.readdir(path.join(current,p),{withFileTypes:true})).map(async d=>{const rel=`${p}/${d.name}`,v=await fs.stat(path.join(current,rel));return {name:d.name,path:rel,isDirectory:d.isDirectory(),size:v.size,mtimeMs:v.mtimeMs};}))
 }};
 const service=new WikiService(api);service.racyWindowMs=0;
 const request=(action,input={})=>service.request({action,workspacePath:root,...input});await request('init');
 const put=async(name,raw)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),raw);};
 return {root,api,service,request,put,reads,switchTo:p=>{current=p;}};
}
test('user path: a Chinese XLSX file gets binary preview bytes without rewriting or changing its attachment identity',async t=>{
 const f=await fixture(t),name='.bone-project-wiki/knowledge/物料/采购清单.XLSX',bytes=makeWorkbook();await f.put(name,bytes);
 const meta=(await f.request('snapshot')).entries.find(x=>x.path===name);assert.equal(meta.kind,'attachment');
 const row=await f.request('read',{id:meta.id});
 assert.equal(row.spreadsheetPreview.fileName,'采购清单.XLSX');
 assert.deepEqual(Buffer.from(row.spreadsheetPreview.base64,'base64'),bytes);
 assert.equal(row.spreadsheetPreview.external,true);assert.equal(row.kind,'attachment');
 assert.deepEqual(await fs.readFile(path.join(f.root,name)),bytes);
 assert.ok(f.reads.every(x=>x.length<=65536));
 assert.ok(!(await f.request('snapshot')).entries.find(x=>x.id===row.id).spreadsheetPreview);
});
test('a legacy imported XLSX keeps its stored bytes and title-independent preview',async t=>{
 const f=await fixture(t),bytes=makeWorkbook();
 const saved=await f.request('import',{kind:'attachment',category:'物料',title:'已导入的物料',files:[{path:'bom.xlsx',dataUrl:`data:application/octet-stream;base64,${bytes.toString('base64')}`}]});
 const before=await f.api.fs.readText(saved.path);const row=await f.request('read',{id:saved.id});
 assert.equal(row.spreadsheetPreview.external,false);assert.equal(row.spreadsheetPreview.fileName,'bom.xlsx');
 assert.deepEqual(Buffer.from(row.spreadsheetPreview.base64,'base64'),bytes);assert.equal(await f.api.fs.readText(saved.path),before);
});
test('oversized, short-read and unavailable binary-reader paths show a preview error',async t=>{
 const f=await fixture(t),name='.bone-project-wiki/knowledge/物料/异常.xlsx';await f.put(name,makeWorkbook());
 const read=()=>f.request('read',{id:'异常.xlsx'});const range=f.api.fs.readRange;
 f.api.fs.readRange=async()=>({bytes:new Uint8Array(),totalSize:1});assert.equal((await read()).spreadsheetPreview.error,'SPREADSHEET_PREVIEW_UNAVAILABLE');
 delete f.api.fs.readRange;assert.equal((await read()).spreadsheetPreview.error,'SPREADSHEET_READER_UNAVAILABLE');
 f.api.fs.readRange=range;const stat=f.api.fs.stat;
 f.api.fs.stat=async p=>p===name?{size:10*1024*1024+1,mtimeMs:0}:stat(p);
 assert.equal((await read()).spreadsheetPreview.error,'SPREADSHEET_PREVIEW_LIMIT');
});
test('workspace changes during binary reads reject the old result',async t=>{
 const f=await fixture(t),name='.bone-project-wiki/knowledge/物料/切换.xlsx';await f.put(name,makeWorkbook());await f.request('snapshot');
 const range=f.api.fs.readRange;f.api.fs.readRange=async(...args)=>{const value=await range(...args);f.switchTo(f.root+'/other');return value;};
 await assert.rejects(f.request('read',{id:'切换.xlsx'}),/WORKSPACE_CHANGED/);
});
test('search and export do not read binary workbooks or retain derived preview payloads',async t=>{
 const f=await fixture(t),name='.bone-project-wiki/knowledge/采购.xlsx';await f.put(name,makeWorkbook());await f.request('snapshot');
 await f.request('search',{query:'采购'});const exported=await f.request('export');
 assert.deepEqual(f.reads,[]);assert.ok(!JSON.stringify(exported).includes('spreadsheetPreview'));
 assert.ok((await f.request('read',{id:'采购.xlsx'})).spreadsheetPreview.base64);assert.ok(f.reads.length>0);
});
test('a multi-workbook attachment exposes every workbook without losing original bytes',async t=>{
 const f=await fixture(t),a=makeWorkbook(),b=makeWorkbook(false);
 const saved=await f.request('import',{kind:'attachment',category:'物料',title:'两个工作簿',files:[{path:'a.xlsx',dataUrl:`data:application/octet-stream;base64,${a.toString('base64')}`},{path:'folder/b.xlsx',dataUrl:`data:application/octet-stream;base64,${b.toString('base64')}`}]});
 const row=await f.request('read',{id:saved.id});assert.equal(row.spreadsheetPreview.workbooks.length,2);
 assert.deepEqual(row.spreadsheetPreview.workbooks.map(x=>Buffer.from(x.base64,'base64')),[a,b]);
});

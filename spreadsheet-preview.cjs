'use strict';
const {relative,KNOWLEDGE_ROOT}=require('./core.cjs');
const MAX_BYTES=10*1024*1024,CHUNK=65536;
const changed=error=>/WORKSPACE_CHANGED|PLUGIN_UNLOADED|LOCAL_PROJECT_REQUIRED/.test(String(error?.message||error));
function embedded(file) {
 const value=file.dataUrl;
 if(typeof value!=='string'||value.length>MAX_BYTES*4/3+160)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
 const match=/^data:application\/(?:octet-stream|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
 if(!match)throw new Error('SPREADSHEET_PREVIEW_UNAVAILABLE');
 const bytes=Buffer.from(match[1],'base64');if(bytes.length>MAX_BYTES)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
 if(bytes.toString('base64')!==match[1])throw new Error('SPREADSHEET_PREVIEW_UNAVAILABLE');
 return {fileName:file.path.split('/').at(-1),label:file.path,base64:match[1]};
}
async function attachSpreadsheet(service,entry,workspacePath) {
 if(entry.kind!=='attachment')return entry;
 const external=/\.xlsx$/i.test(entry.path||'');
 const files=(entry.files||[]).filter(row=>/\.xlsx$/i.test(row.path));
 if(!external&&!files.length)return entry;
 const preview={fileName:external?entry.path.split('/').at(-1):files[0].path.split('/').at(-1),external};
 try {
  if(!external) {
   const workbooks=files.map(embedded);
   if(workbooks.reduce((sum,x)=>sum+Buffer.byteLength(x.base64,'base64'),0)>MAX_BYTES)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
   return {...entry,spreadsheetPreview:{...preview,...(workbooks.length===1?workbooks[0]:{workbooks})}};
  }
  relative(entry.path);if(!entry.path.startsWith(KNOWLEDGE_ROOT+'/'))throw new Error('UNSAFE_PATH');
  const call=async operation=>{await service.workspace(workspacePath);const result=await operation();await service.workspace(workspacePath);return result;};
  const before=await call(()=>service.pi.fs.stat(entry.path));
  if(!Number.isSafeInteger(before.size)||before.size<0||before.size>MAX_BYTES)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
  if(typeof service.pi.fs.readRange!=='function')throw new Error('SPREADSHEET_READER_UNAVAILABLE');
  const bytes=Buffer.alloc(before.size);
  for(let offset=0;offset<before.size;offset+=CHUNK) {
   const length=Math.min(CHUNK,before.size-offset);
   const part=await call(()=>service.pi.fs.readRange(entry.path,offset,length));
   if(!(part?.bytes instanceof Uint8Array)||part.totalSize!==before.size||part.bytes.byteLength!==length)throw new Error('SPREADSHEET_PREVIEW_UNAVAILABLE');
   bytes.set(part.bytes,offset);
  }
  const after=await call(()=>service.pi.fs.stat(entry.path));
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw new Error('SPREADSHEET_PREVIEW_UNAVAILABLE');
  return {...entry,spreadsheetPreview:{...preview,base64:bytes.toString('base64')}};
 } catch(error) {
  if(changed(error))throw error;
  return {...entry,spreadsheetPreview:{...preview,error:['SPREADSHEET_PREVIEW_LIMIT','SPREADSHEET_READER_UNAVAILABLE'].includes(error.message)?error.message:'SPREADSHEET_PREVIEW_UNAVAILABLE'}};
 }
}
module.exports={attachSpreadsheet};

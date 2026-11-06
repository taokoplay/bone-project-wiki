// Bounded, read-only ZIP reader. No extraction, executable code or external URLs.
export const ZIP_LIMITS=Object.freeze({file:10*1024*1024,expanded:32*1024*1024,part:8*1024*1024,entries:2048});
const fail=code=>{throw new Error(code);};
export function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function openArchive(base64,isCurrent=()=>true) {
 if(typeof base64!=='string'||base64.length>Math.ceil(ZIP_LIMITS.file/3)*4||base64.length%4||/[^A-Za-z0-9+/=]/.test(base64)||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))fail('SPREADSHEET_PREVIEW_LIMIT');
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 if(bytes.length>ZIP_LIMITS.file)fail('SPREADSHEET_PREVIEW_LIMIT');
 const view=new DataView(bytes.buffer),size=bytes.length;
 const check=()=>{if(!isCurrent())fail('SPREADSHEET_CANCELLED');};
 const u16=n=>view.getUint16(n,true),u32=n=>view.getUint32(n,true);
 const text=raw=>new TextDecoder('utf-8',{fatal:true}).decode(raw);
 let end=-1;
 for(let p=size-22;p>=Math.max(0,size-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===size){end=p;break;}
 if(end<0)fail('SPREADSHEET_PREVIEW_UNSUPPORTED');
 const count=u16(end+10),directory=u32(end+16);
 if(u16(end+4)||u16(end+6)||u16(end+8)!==count||!count||count>ZIP_LIMITS.entries||directory+u32(end+12)!==end)fail('SPREADSHEET_PREVIEW_LIMIT');
 const files=new Map(),cache=new Map(),spans=[];let p=directory,total=0,expanded=0;
 for(let i=0;i<count;i++) {
  if(p+46>end||u32(p)!==0x02014b50)fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
  const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),compressed=u32(p+20),length=u32(p+24),n=u16(p+28),local=u32(p+42);
  const next=p+46+n+u16(p+30)+u16(p+32);
  if(next>end||!n||flags&1||![0,8].includes(method)||u16(p+34)||length===0xffffffff||compressed===0xffffffff)fail('SPREADSHEET_PREVIEW_UNSUPPORTED');
  const name=text(bytes.subarray(p+46,p+46+n));
  if(name.length>500||name.startsWith('/')||/[\\:\x00-\x1f\x7f]/.test(name)||name.replace(/\/$/,'').split('/').some(x=>!x||x==='.'||x==='..')||files.has(name))fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
  total+=length;if(total>ZIP_LIMITS.expanded)fail('SPREADSHEET_PREVIEW_LIMIT');
  if(local+30>directory||u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method)fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
  const data=local+30+u16(local+26)+u16(local+28);
  if(data+compressed>directory||text(bytes.subarray(local+30,local+30+u16(local+26)))!==name)fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
  if(!(flags&8)&&(u32(local+14)!==crc||u32(local+18)!==compressed||u32(local+22)!==length))fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
  spans.push([local,data+compressed]);files.set(name,{data,compressed,length,method,crc});p=next;
 }
 if(p!==end)fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
 spans.sort((a,b)=>a[0]-b[0]);if(spans.some((x,i)=>i&&x[0]<spans[i-1][1]))fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
 return {
  has:name=>files.has(name),
  async read(name) {
   if(cache.has(name))return cache.get(name);
   check();const item=files.get(name);if(!item)fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
   if(item.length>ZIP_LIMITS.part||expanded+item.length>ZIP_LIMITS.expanded)fail('SPREADSHEET_PREVIEW_LIMIT');
   const source=bytes.subarray(item.data,item.data+item.compressed);let result;
   if(item.method===0)result=source;
   else {
    const reader=new Blob([source]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks=[];let actual=0,done=false;
    try {
     while(true) {
      const next=await reader.read();check();if(next.done){done=true;break;}
      actual+=next.value.byteLength;
      if(actual>item.length||actual>ZIP_LIMITS.part||expanded+actual>ZIP_LIMITS.expanded)fail('SPREADSHEET_PREVIEW_LIMIT');
      chunks.push(next.value);
     }
    } finally {if(!done)await reader.cancel().catch(()=>{});}
    result=new Uint8Array(actual);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
   }
   if(result.length!==item.length||crc32(result)!==item.crc)fail('SPREADSHEET_PREVIEW_UNAVAILABLE');
   expanded+=result.length;check();
   const utf16=result[0]===0xff&&result[1]===0xfe?'utf-16le':result[0]===0xfe&&result[1]===0xff?'utf-16be':'utf-8';
   const value=new TextDecoder(utf16,{fatal:true}).decode(result);
   if(/<!DOCTYPE|<!ENTITY/i.test(value))fail('SPREADSHEET_PREVIEW_UNSUPPORTED');
   cache.set(name,value);return value;
  }
 };
}

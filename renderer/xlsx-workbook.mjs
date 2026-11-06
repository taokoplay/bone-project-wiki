import {openArchive} from './xlsx-archive.mjs';
import {createValueFormatter,cellAddress} from './xlsx-values.mjs';
export const SHEET_LIMITS=Object.freeze({rows:2000,columns:100,cells:200000,sheets:100});
const fail=()=>{throw new Error('SPREADSHEET_PREVIEW_UNAVAILABLE');};
const list=(node,name)=>[...node.getElementsByTagNameNS('*',name)];
const child=(node,name)=>[...node.children].find(x=>x.localName===name);
function xml(value,root) {
 const doc=new DOMParser().parseFromString(value,'application/xml');
 if(doc.documentElement.localName!==root||list(doc,'parsererror').length)fail();return doc.documentElement;
}
function richText(node) {return list(node,'t').filter(x=>x.parentElement?.localName!=='rPh').map(x=>x.textContent).join('');}
function targetPath(base,target) {
 if(typeof target!=='string'||!target||/[\\:#?\x00-\x1f]/.test(target))fail();
 const parts=target.startsWith('/')?[]:base.split('/').slice(0,-1);
 for(const item of target.split('/')) {if(item==='..'){if(!parts.length)fail();parts.pop();}else if(item&&item!=='.')parts.push(item);}
 return parts.join('/');
}
function relationships(raw,base) {
 const rows=new Map();
 for(const row of list(xml(raw,'Relationships'),'Relationship')) {
  const id=row.getAttribute('Id');if(!id||rows.has(id))fail();
  const external=row.getAttribute('TargetMode')==='External';
  rows.set(id,{type:row.getAttribute('Type'),path:external?null:targetPath(base,row.getAttribute('Target'))});
 }
 return rows;
}
const relPath=name=>{const parts=name.split('/'),file=parts.pop();return [...parts,'_rels',file+'.rels'].join('/');};
function styles(raw) {
 if(!raw)return [];
 const root=xml(raw,'styleSheet'),formats=new Map(list(root,'numFmt').map(x=>[Number(x.getAttribute('numFmtId')),x.getAttribute('formatCode')]));
 const fonts=child(root,'fonts'),bold=fonts?[...fonts.children].map(x=>Boolean(child(x,'b')&&child(x,'b').getAttribute('val')!=='0')):[];
 return [...(child(root,'cellXfs')?.children||[])].map(x=>({formatId:Number(x.getAttribute('numFmtId')||0),format:formats.get(Number(x.getAttribute('numFmtId')))||'',bold:Boolean(bold[Number(x.getAttribute('fontId')||0)])}));
}
function parseSheet(raw,strings,formats,date1904,formatValue) {
 const root=xml(raw,'worksheet'),cells=new Map();let rows=0,columns=0,formulas=false,missingCache=false;
 const all=list(root,'c');if(all.length>SHEET_LIMITS.cells)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
 for(const cell of all) {
  const ref=cell.getAttribute('r'),address=cellAddress(ref);if(!address)fail();
  const {row,col}=address;rows=Math.max(rows,row);columns=Math.max(columns,col);
  if(row>SHEET_LIMITS.rows||col>SHEET_LIMITS.columns)continue;
  if(cells.has(ref))fail();
  const formula=child(cell,'f'),v=child(cell,'v'),type=cell.getAttribute('t')||'n';
  const index=Number(cell.getAttribute('s')||0),style=formats[index]||{};
  let value=v?.textContent||'';
  if(type==='s'){if(!/^\d+$/.test(value)||!Object.hasOwn(strings,value))fail();value=strings[Number(value)];}
  else if(type==='inlineStr')value=richText(cell);
  else if(type==='b')value=value==='1'?'TRUE':'FALSE';
  else if(type==='n'&&value)value=formatValue(value,style.formatId,style.format,date1904);
  if(formula) {formulas=true;if(!v){missingCache=true;value='='+formula.textContent;}}
  if(value.length>32767)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
  cells.set(ref,{value,bold:style.bold,formula:formula?.textContent||''});
 }
 const merges=[];let coverage=0;
 for(const node of list(root,'mergeCell')) {
  const [start,end]=String(node.getAttribute('ref')).split(':').map(cellAddress);
  if(!start||!end||start.row>end.row||start.col>end.col)fail();
  rows=Math.max(rows,end.row);columns=Math.max(columns,end.col);
  const r2=Math.min(end.row,SHEET_LIMITS.rows),c2=Math.min(end.col,SHEET_LIMITS.columns);
  if(start.row<=r2&&start.col<=c2){coverage+=(r2-start.row+1)*(c2-start.col+1);if(coverage>SHEET_LIMITS.cells)throw new Error('SPREADSHEET_PREVIEW_LIMIT');merges.push({...start,r2,c2});}
 }
 const widths=new Map();
 for(const node of list(root,'col')) {
  const min=Number(node.getAttribute('min')),max=Math.min(SHEET_LIMITS.columns,Number(node.getAttribute('max'))),width=Number(node.getAttribute('width'));
  if(!Number.isSafeInteger(min)||min<1||!Number.isFinite(width)||width<=0)continue;
  for(let i=min;i<=max;i++)widths.set(i,Math.min(40,Math.max(8,width)));
 }
 return {cells,merges,widths,rows:Math.min(rows,SHEET_LIMITS.rows),columns:Math.min(columns,SHEET_LIMITS.columns),truncated:rows>SHEET_LIMITS.rows||columns>SHEET_LIMITS.columns,formulas,missingCache};
}
export async function openWorkbook(base64,isCurrent) {
 const archive=openArchive(base64,isCurrent);
 const rootRelations=relationships(await archive.read('_rels/.rels'),'');
 const bookRef=[...rootRelations.values()].find(x=>x.type?.endsWith('/officeDocument'));
 if(!bookRef?.path)fail();
 const book=xml(await archive.read(bookRef.path),'workbook');
 const rels=relationships(await archive.read(relPath(bookRef.path)),bookRef.path);
 const ref=kind=>[...rels.values()].find(x=>x.type?.endsWith('/'+kind))?.path;
 const strings=ref('sharedStrings')?list(xml(await archive.read(ref('sharedStrings')),'sst'),'si').map(richText):[];
 if(strings.length>SHEET_LIMITS.cells)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
 const formats=styles(ref('styles')?await archive.read(ref('styles')):null);
 const sheets=list(book,'sheet').filter(x=>!['hidden','veryHidden'].includes(x.getAttribute('state'))).map(x=>{
  const id=x.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||x.getAttribute('r:id');
  const rel=rels.get(id);if(rel?.path&&rel.type?.endsWith('/chartsheet'))return null;
  if(!rel?.type?.endsWith('/worksheet')||!rel.path)fail();
  return {name:x.getAttribute('name')||'',path:rel.path};
 }).filter(Boolean);
 if(!sheets.length)throw new Error('SPREADSHEET_PREVIEW_UNSUPPORTED');
 if(sheets.length>SHEET_LIMITS.sheets)throw new Error('SPREADSHEET_PREVIEW_LIMIT');
 const date1904=['1','true'].includes(child(book,'workbookPr')?.getAttribute('date1904'));
 const cache=new Map(),formatValue=createValueFormatter();
 return {sheets,async sheet(index){if(!Number.isSafeInteger(index)||!sheets[index])fail();if(!cache.has(index))cache.set(index,parseSheet(await archive.read(sheets[index].path),strings,formats,date1904,formatValue));return cache.get(index);}};
}

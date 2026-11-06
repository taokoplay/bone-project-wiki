import {openWorkbook} from './xlsx-workbook.mjs';
import {columnName} from './xlsx-values.mjs';
import {createSelect} from './controls.mjs';
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const PAGE_SIZE=100;
export function spreadsheetPreview(entry,t,{isCurrent,onOpen,onReveal}) {
 const preview=entry.spreadsheetPreview,root=node('section',undefined,'spreadsheet');root.setAttribute('aria-label',t('spreadsheetTitle'));
 const sources=preview.workbooks||[preview];let selectedFile=0,bookGeneration=0;
 const current=()=>root.isConnected&&isCurrent();
 const head=node('div',undefined,'spreadsheet-head'),identity=node('div'),actions=node('div',undefined,'spreadsheet-actions');
 identity.append(node('h2',entry.title),node('p',t('spreadsheetReadOnly'),'hint'));
 const status=node('p',t('spreadsheetLoading'),'spreadsheet-status');status.setAttribute('role','status');
 const tabs=node('div',undefined,'spreadsheet-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',t('spreadsheetSheets'));
 const notes=node('p','', 'spreadsheet-notes'),viewport=node('div',undefined,'spreadsheet-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label',t('spreadsheetTable'));
 const footer=node('div',undefined,'spreadsheet-footer'),position=node('span'),selection=node('p','', 'spreadsheet-selection');selection.setAttribute('aria-live','polite');
 const action=(key,work)=>{const btn=node('button',t(key));btn.type='button';btn.addEventListener('click',()=>{void Promise.resolve().then(work).catch(()=>{if(current()){status.textContent=t('spreadsheetActionError');status.setAttribute('role','alert');}});});return btn;};
 const failure=error=>{if(!current())return;model=null;previous.disabled=true;next.disabled=true;viewport.replaceChildren();notes.textContent='';position.textContent='';status.textContent=t(['SPREADSHEET_PREVIEW_LIMIT','SPREADSHEET_PREVIEW_UNSUPPORTED','SPREADSHEET_READER_UNAVAILABLE'].includes(error?.message)?error.message:'SPREADSHEET_PREVIEW_UNAVAILABLE');status.setAttribute('role','alert');root.setAttribute('aria-busy','false');};
 if(preview.external)actions.append(action('openInSystem',onOpen));
 else if(sources.some(file=>file.base64))actions.append(action('spreadsheetDownload',()=>{
  const file=sources[selectedFile],bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=node('a');a.download=file.fileName;a.href=url;root.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }));
 actions.append(action('revealInFinder',onReveal));head.append(identity,actions);
 if(sources.length>1)head.append(createSelect({label:t('spreadsheetWorkbooks'),name:'workbook',value:'0',options:sources.map((file,i)=>({id:String(i),label:file.label||file.fileName})),onChange:value=>{void loadBook(Number(value));}}).element);
 root.append(head,tabs,status,notes,viewport,footer,selection);
 let workbook,index=0,page=0,generation=0,model;
 const previous=action('spreadsheetPrevious',()=>{if(model&&page>0){page--;draw();}}),next=action('spreadsheetNext',()=>{if(model&&(page+1)*PAGE_SIZE<model.rows){page++;draw();}});footer.append(previous,position,next);
 previous.disabled=true;next.disabled=true;
 function draw() {
  if(!model)return;
  const start=page*PAGE_SIZE+1,end=Math.min(model.rows,start+PAGE_SIZE-1),cols=model.columns;
  const table=node('table');table.setAttribute('aria-label',workbook.sheets[index].name);const caption=node('caption',workbook.sheets[index].name,'spreadsheet-caption');table.append(caption);
  const colgroup=node('colgroup');colgroup.append(node('col'));for(let c=1;c<=cols;c++){const col=node('col');col.style.width=`${model.widths.get(c)||14}ch`;colgroup.append(col);}table.append(colgroup);
  const header=node('thead'),titles=node('tr');titles.append(node('th',''));for(let c=1;c<=cols;c++){const th=node('th',columnName(c));th.scope='col';titles.append(th);}header.append(titles);table.append(header);
  const body=node('tbody'),spans=new Map(),covered=new Set();
  for(const merge of model.merges) {
   const top=Math.max(start,merge.row),bottom=Math.min(end,merge.r2);if(top>bottom)continue;
   const anchor=`${columnName(merge.col)}${top}`;
   spans.set(anchor,{rowSpan:bottom-top+1,colSpan:merge.c2-merge.col+1,source:`${columnName(merge.col)}${merge.row}`});
   for(let r=top;r<=bottom;r++)for(let c=merge.col;c<=merge.c2;c++){const key=`${columnName(c)}${r}`;if(key!==anchor)covered.add(key);}
  }
  for(let r=start;r<=end;r++) {
   const row=node('tr'),label=node('th',String(r));label.scope='row';row.append(label);
   for(let c=1;c<=cols;c++) {
    const ref=`${columnName(c)}${r}`;if(covered.has(ref))continue;
    const span=spans.get(ref),cell=model.cells.get(span?.source||ref),td=node('td',cell?.value||'');td.dataset.cell=ref;
    if(span){td.rowSpan=span.rowSpan;td.colSpan=span.colSpan;}
    if(cell?.bold)td.classList.add('spreadsheet-bold');
    td.title=cell?.formula?'='+cell.formula:cell?.value||'';
    td.addEventListener('click',()=>{selection.textContent=`${ref} · ${cell?.formula?'='+cell.formula:cell?.value||''}`;});row.append(td);
   }
   body.append(row);
  }
  table.append(body);viewport.replaceChildren(model.rows&&cols?table:node('p',t('spreadsheetEmpty'),'hint'));viewport.scrollTop=0;
  previous.disabled=page===0;next.disabled=end>=model.rows;
  position.textContent=t('spreadsheetRange').replace('{start}',model.rows?start:0).replace('{end}',end).replace('{total}',model.rows);
  notes.textContent=[t('spreadsheetValuesOnly'),model.truncated?t('spreadsheetTruncated'):'',model.formulas?t('spreadsheetFormulaCache'):'',model.missingCache?t('spreadsheetMissingCache'):''].filter(Boolean).join(' ');
  status.textContent='';selection.textContent='';root.setAttribute('aria-busy','false');
 }
 async function choose(nextIndex) {
  index=nextIndex;page=0;const serial=++generation;root.setAttribute('aria-busy','true');status.textContent=t('spreadsheetLoading');viewport.replaceChildren();selection.textContent='';
  model=null;notes.textContent='';position.textContent='';
  previous.disabled=true;next.disabled=true;status.setAttribute('role','status');
  for(const [i,button] of [...tabs.children].entries()){button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;}
  try {const result=await workbook.sheet(index);if(!current()||serial!==generation)return;model=result;draw();}catch(error){if(serial===generation)failure(error);}
 }
 async function loadBook(fileIndex) {
  if(!current()||!sources[fileIndex])return;
  selectedFile=fileIndex;const serial=++bookGeneration;
  const activeBook=()=>current()&&bookGeneration===serial;
  workbook=null;model=null;generation++;tabs.replaceChildren();viewport.replaceChildren();notes.textContent='';position.textContent='';selection.textContent='';previous.disabled=true;next.disabled=true;
  status.textContent=t('spreadsheetLoading');status.setAttribute('role','status');root.setAttribute('aria-busy','true');
  try {
   if(preview.error)throw new Error(preview.error);
   const result=await openWorkbook(sources[fileIndex].base64,activeBook);if(!activeBook())return;workbook=result;
   workbook.sheets.forEach((sheet,i)=>{
    const button=action('spreadsheetTitle',()=>choose(i));button.textContent=sheet.name;button.setAttribute('role','tab');button.addEventListener('keydown',event=>{
     if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
     const n=event.key==='Home'?0:event.key==='End'?workbook.sheets.length-1:(i+(event.key==='ArrowRight'?1:-1)+workbook.sheets.length)%workbook.sheets.length;
     tabs.children[n].focus();void choose(n);
    });tabs.append(button);
   });await choose(0);
  }catch(error){if(activeBook())failure(error);}
 }
 queueMicrotask(()=>{void loadBook(0);});
 return root;
}

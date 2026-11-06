'use strict';
const { deflateRawSync } = require('node:zlib');
function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(parts, compressed=true) {
  const locals=[],central=[];let offset=0;
  for(const [name,value] of Object.entries(parts)) {
    const n=Buffer.from(name),raw=Buffer.from(value),data=compressed?deflateRawSync(raw):raw,crc=crc32(raw);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(compressed?8:0,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);
    locals.push(h,n,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(compressed?8:0,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    central.push(c,n);offset+=h.length+n.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(locals.length/3,8);end.writeUInt16LE(locals.length/3,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
const XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function workbookParts() {
 return {
  '[Content_Types].xml':XML+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  '_rels/.rels':XML+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml':XML+`<workbook xmlns="${NS}" xmlns:r="${REL}"><workbookPr/><sheets><sheet name="物料清单" sheetId="1" r:id="sheet1"/><sheet name="补充数据" sheetId="2" r:id="sheet2"/><sheet name="隐藏工作表" sheetId="3" state="hidden" r:id="sheet3"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':XML+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="sheet1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="sheet2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="sheet3" Type="${REL}/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="strings" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="styles" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
  'xl/sharedStrings.xml':XML+`<sst xmlns="${NS}" count="2" uniqueCount="2"><si><t>底板 &amp; 固定件</t></si><si><r><t>第二张</t></r><r><t>工作表</t></r></si></sst>`,
  'xl/styles.xml':XML+`<styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font/><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/></cellXfs></styleSheet>`,
  'xl/worksheets/sheet1.xml':XML+`<worksheet xmlns="${NS}"><cols><col min="2" max="2" width="25" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" t="inlineStr" s="3"><is><t>采购物料表</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>序号</t></is></c><c r="B2" t="inlineStr"><is><t>物料名称</t></is></c><c r="C2" t="inlineStr"><is><t>数量</t></is></c><c r="D2" t="inlineStr"><is><t>单价</t></is></c><c r="E2" t="inlineStr"><is><t>金额</t></is></c><c r="F2" t="inlineStr"><is><t>日期</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>001</t></is></c><c r="B3" t="s"><v>0</v></c><c r="C3"><v>2</v></c><c r="D3" s="2"><v>12.5</v></c><c r="E3" s="2"><f>C3*D3</f><v>25</v></c><c r="F3" s="1"><v>45292</v></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>&lt;img src=x onerror=alert(1)&gt;</t></is></c><c r="C4" t="b"><v>0</v></c><c r="E4"><f>SUM(E3:E3)</f></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells></worksheet>`,
  'xl/worksheets/sheet2.xml':XML+`<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row><row r="101"><c r="A101" t="inlineStr"><is><t>分页数据</t></is></c></row></sheetData></worksheet>`,
  'xl/worksheets/sheet3.xml':XML+`<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Hidden fixture text</t></is></c></row></sheetData></worksheet>`
 };
}
module.exports={zip,workbookParts,makeWorkbook:(compressed=true)=>zip(workbookParts(),compressed),NS,XML};

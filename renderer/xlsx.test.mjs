import test from 'node:test';import assert from 'node:assert/strict';
import {openArchive} from './xlsx-archive.mjs';import {formatValue,cellAddress,columnName} from './xlsx-values.mjs';
import fixture from '../tests/xlsx-fixtures.cjs';
const {zip}=fixture;
test('stored and deflated XLSX parts validate their CRC and retain Unicode without extraction',async()=>{
 for(const compressed of [false,true]){const archive=openArchive(zip({'xl/test.xml':'<root>中文 &amp; 001</root>'},compressed).toString('base64'));assert.equal(await archive.read('xl/test.xml'),'<root>中文 &amp; 001</root>');assert.equal(await archive.read('xl/test.xml'),'<root>中文 &amp; 001</root>');}
});
test('ZIP traversal, duplicate/ambiguous headers, CRC damage and expansion limits fail closed',async()=>{
 assert.throws(()=>openArchive(zip({'../test.xml':'x'}).toString('base64')),/SPREADSHEET_PREVIEW/);
 const bytes=zip({'test.xml':'hello'},false);bytes[30+'test.xml'.length]^=1;
 await assert.rejects(openArchive(bytes.toString('base64')).read('test.xml'),/SPREADSHEET_PREVIEW/);
 const big=zip({'big.xml':'x'.repeat(8*1024*1024+1)});await assert.rejects(openArchive(big.toString('base64')).read('big.xml'),/SPREADSHEET_PREVIEW_LIMIT/);
 const bomb=zip({'test.xml':'x'.repeat(100000)});const central=bomb.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bomb.writeUInt32LE(10,22);bomb.writeUInt32LE(10,central+24);
 await assert.rejects(openArchive(bomb.toString('base64')).read('test.xml'),/SPREADSHEET_PREVIEW_LIMIT/);
});
test('XML entity declarations and expired views are never parsed as workbook content',async()=>{
 await assert.rejects(openArchive(zip({'test.xml':'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]><x/>'}).toString('base64')).read('test.xml'),/SPREADSHEET_PREVIEW_UNSUPPORTED/);
 await assert.rejects(openArchive(zip({'test.xml':'<x/>'}).toString('base64'),()=>false).read('test.xml'),/SPREADSHEET_CANCELLED/);
});
test('values retain leading-zero strings and display numeric/date styles without formula execution',()=>{
 assert.equal(formatValue('12.5',4),'12.50');assert.equal(formatValue('0.25',10),'25.00%');
 assert.equal(formatValue('45292',165,'yyyy-mm-dd'),'2024-01-01');assert.equal(formatValue('60',14),'1900-02-29');assert.equal(formatValue('0',14,'',true),'1904-01-01');
 assert.equal(formatValue('12345678901234567'),'12345678901234567');assert.equal(columnName(100),'CV');
 assert.deepEqual(cellAddress('XFD1048576'),{row:1048576,col:16384});assert.equal(cellAddress('XFE1'),null);
});

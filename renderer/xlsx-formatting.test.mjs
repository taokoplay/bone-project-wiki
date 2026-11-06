import test from 'node:test';
import assert from 'node:assert/strict';
import * as values from './xlsx-values.mjs';

test('a workbook reuses number formatters without caching cell values or mixing formats', t=>{
 assert.equal(typeof values.createValueFormatter,'function');
 const Original=Intl.NumberFormat;let created=0;
 t.mock.method(Intl,'NumberFormat',function(...args){created++;return new Original(...args);});
 const format=values.createValueFormatter();
 for(let i=0;i<10000;i++)assert.equal(format('1234.5',4),'1,234.50');
 assert.equal(created,1);
 assert.equal(format('25',4),'25.00');
 assert.equal(format('0.25',10),'25.00%');
 assert.equal(format('1234.5',0,'$#,##0.00'),'$1,234.50');
 assert.equal(format('1234.5',0,'¥#,##0.00'),'¥1,234.50');
 assert.equal(format('-12.5',2),'-12.50');
 assert.equal(format('001'),'001');
 assert.equal(format('45292',165,'yyyy-mm-dd'),'2024-01-01');
 assert.equal(format('0',14,'',true),'1904-01-01');
 assert.equal(created,2,'currency, percentage and date presentation must retain the same numeric options when applicable');
});

test('workbooks own independent formatter pools',t=>{
 assert.equal(typeof values.createValueFormatter,'function');
 const Original=Intl.NumberFormat;let created=0;
 t.mock.method(Intl,'NumberFormat',function(...args){created++;return new Original(...args);});
 const first=values.createValueFormatter(),second=values.createValueFormatter();
 assert.equal(first('1.5',2),'1.50');assert.equal(first('2.5',2),'2.50');
 assert.equal(second('3.5',2),'3.50');assert.equal(created,2);
});

test('many custom style strings reuse only bounded numeric option combinations',t=>{
 assert.equal(typeof values.createValueFormatter,'function');
 const Original=Intl.NumberFormat;let created=0;
 t.mock.method(Intl,'NumberFormat',function(...args){created++;return new Original(...args);});
 const format=values.createValueFormatter();
 for(let repeat=0;repeat<30;repeat++)for(const group of [false,true])for(let decimals=0;decimals<=10;decimals++) {
  const code=(group?'#,##0':'0')+(decimals?'.'+'0'.repeat(decimals):'')+`;[Red]${repeat}`;
  const expected=new Original('en-US',{useGrouping:group,minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(1234.5);
  assert.equal(format('1234.5',0,code),expected);
 }
 assert.equal(created,22);
});

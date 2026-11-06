'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { contextIndexResult, contextTextResult } = require('./memory-presentation.cjs');
const digest = text => createHash('sha256').update(text).digest('hex');
const record = (id, extra = {}) => ({ id, kind:'memory', category:'memory', title:`Refund rule ${id}`, content:`Refund ${id} requires a receipt.`, status:'confirmed', topics:[], tags:[], updatedAt:'2026-01-01', path:`.bone-project-wiki/memory/${id}.md`, revision:digest(id), ...extra });
function compatibilityEntries() {
  return Array.from({length:9},(_,i)=>record(`memory-${i}`, {
    title:i===0?'Core preference':`Refund rule ${i}`,
    content:i===0?'Use clear labels.':`Refund approval ${i} requires a receipt and preserves the audit exception.`,
    status:i===8?'draft':'confirmed', importance:i===0?'core':'normal', topics:['payments'],
    updatedAt:`2026-01-${String(i+1).padStart(2,'0')}`,revision:digest(String(i))
  }));
}

test('explanation extraction preserves the exact released automatic and manual context text', () => {
  const entries = compatibilityEntries();
  const automatic = contextIndexResult(entries, {query:'refund'});
  const manual = contextTextResult(entries, 'refund');
  assert.equal(digest(automatic.text), '4866db6a00abb8ba941aee674d7d1e3b8ff27302ab4693e5f48a91a80766d5c7');
  assert.equal(digest(manual.text), '58d983b5f9af233393e1b219384a78e374eb6bcfbd7cbdea8503e164fd47b20a');
  assert.equal(automatic.explanation.mode,'automatic');
  assert.equal(manual.explanation.mode,'manual');
  assert.equal(automatic.explanation.budget.maxEntries,6);
  assert.equal(manual.explanation.budget.maxEntries,16);
  assert.equal(automatic.explanation.counts.selected,6);
  assert.equal(manual.explanation.counts.selected,8);
  for(const result of [automatic,manual]) {
    assert.equal(result.explanation.contextHash,digest(result.text));
    assert.equal(result.explanation.textChars,result.text.length);
    assert.ok(result.explanation.usedChars<=result.explanation.budget.maxChars);
  }
});

test('decisions explain eligibility and selected records that the presentation budget omits', () => {
  const entries = [record('candidate',{status:'draft',content:'Draft should never be promoted.'}),
    record('restricted',{scopePaths:['apps/payments'],content:'Restricted rule.'}),
    record('sensitive',{content:'password is not a memory fact'}),
    ...Array.from({length:8},(_,i)=>record(`budget-${i}`))];
  const result=contextIndexResult(entries,{query:'refund',maxChars:350});
  const rows=new Map(result.explanation.decisions.map(row=>[row.id,row]));
  assert.ok(rows.get('candidate').reasons.includes('draft'));
  assert.ok(rows.get('restricted').reasons.includes('scope_mismatch'));
  assert.ok(rows.get('sensitive').reasons.includes('sensitive'));
  assert.ok(result.explanation.decisions.some(row=>row.selected&&row.presentation==='omitted'&&row.reasons.includes('budget_limit')));
  assert.ok(result.explanation.decisions.some(row=>row.reasons.includes('entry_limit')));
  assert.doesNotMatch(result.text,/Draft should|Restricted rule|password/);
  assert.doesNotMatch(JSON.stringify(result.explanation),/Draft should never|Restricted rule\.|password is/);
  assert.equal(result.explanation.counts.facts+result.explanation.counts.pointers,
    result.explanation.decisions.filter(row=>row.presentation!=='omitted').length);
});

test('long facts become complete read routes and stale sources cannot regain their cached fact', () => {
  const linked = record('stale',{content:'Old refund fact must never reappear.',
    documentRef:{recordId:'11111111-1111-4111-8111-111111111111',readWhen:'When changing refunds'},
    documentLink:{state:'stale',recordId:'11111111-1111-4111-8111-111111111111',readWhen:'When changing refunds'}});
  const long=record('long',{content:'Long refund exception. '.repeat(30)});
  const result=contextIndexResult([linked,long],{query:'refund'});
  assert.doesNotMatch(result.text,/Old refund fact|Long refund exception/);
  const rows=new Map(result.explanation.decisions.map(row=>[row.id,row]));
  assert.equal(rows.get('stale').presentation,'pointer');
  assert.ok(rows.get('stale').reasons.includes('source_stale'));
  assert.equal(rows.get('long').presentation,'pointer');
  assert.ok(rows.get('long').reasons.includes('body_limit'));
});

test('unreadable candidates do not inherit cached policy or facts', () => {
  const failed=record('failed',{readable:false,content:'Cached refund secret.',importance:'core'});
  const result=contextIndexResult([failed],{query:'refund'});
  assert.doesNotMatch(result.text,/Cached refund secret/);
  assert.deepEqual(result.explanation.decisions[0].reasons,['unreadable']);
  assert.equal(result.explanation.decisions[0].selected,false);
});

test('manual usage reports actual content characters at the exact budget boundary', () => {
  const entries = Array.from({length:6},(_,index)=>record(`handoff-${index}`,{
    kind:'handoff',category:'handoff',content:index<5?'x'.repeat(1800):''
  }));
  const content = result => result.text.slice(result.text.indexOf('\n\n')+2);
  const baseline = contextTextResult(entries);
  entries[5].content = 'x'.repeat(10000-content(baseline).length);
  const result = contextTextResult(entries);
  assert.equal(content(result).length,10000);
  assert.equal(result.explanation.usedChars,10000);
  assert.ok(result.explanation.textChars>result.explanation.usedChars);
});

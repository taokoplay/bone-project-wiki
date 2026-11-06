'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WikiService } = require('./service.cjs');
const { ROOT, encode, contextIndex } = require('./core.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'wiki-retrieval-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const api = {
    workspace: { get: async () => ({ path: root, name: 'Retrieval test' }) },
    fs: {
      readText: p => fs.readFile(path.join(root, p), 'utf8'),
      writeText: async (p, value) => { const target = path.join(root, p); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, value); },
      remove: p => fs.rm(path.join(root, p), { recursive: true, force: true }),
      stat: async p => { const info = await fs.stat(path.join(root, p)); return { size: info.size, mtimeMs: info.mtimeMs }; },
      list: async p => Promise.all((await fs.readdir(path.join(root, p), { withFileTypes: true })).map(async item => {
        const name = `${p}/${item.name}`; const info = await fs.stat(path.join(root, name));
        return { name: item.name, path: name, isDirectory: item.isDirectory(), size: info.size, mtimeMs: info.mtimeMs };
      })),
    },
  };
  const service = new WikiService(api); service.racyWindowMs = 0;
  const request = (action, input = {}) => service.request({ action, workspacePath: root, ...input });
  await request('init');
  const extension = await import('./extension.mjs');
  const handlers = {};
  extension.default({ on: (name, handler) => { handlers[name] = handler; } });
  const start = async prompt => (await handlers.before_agent_start({ prompt, systemPrompt: 'BASE' }, { cwd: root, sessionManager: { getSessionId: () => 'retrieval' } }))?.systemPrompt || 'BASE';
  return { root, api, request, start, extension };
}
const memory = (title, content, extra = {}) => ({ kind: 'memory', category: 'memory', status: 'confirmed', title, content, ...extra });
async function age(f, entry, date) {
  await f.api.fs.writeText(entry.path, encode({ ...entry, updatedAt: date }));
}

test('user path: an older relevant rule survives newer unrelated records in automatic and manual context', async t => {
  const f = await fixture(t);
  const old = await f.request('save', memory('Refund rules', 'Refunds cannot exceed the amount paid.'));
  await age(f, old, '2025-01-01T00:00:00.000Z');
  for (let index = 0; index < 18; index += 1) await f.request('save', memory(`Image export ${index}`, `Export image variant ${index} at its original resolution.`));
  const automatic = await f.start('Implement refund validation');
  const manual = (await f.request('context', { query: 'Implement refund validation' })).text;
  for (const text of [automatic, manual]) {
    assert.match(text, /Refunds cannot exceed the amount paid/);
    assert.doesNotMatch(text, /Export image variant/);
  }
  assert.ok(automatic.length <= 1205);
});

test('draft candidates stay readable in the library but are excluded until explicitly confirmed', async t => {
  const f = await fixture(t);
  const draft = await f.request('save', memory('Refund candidate', 'Candidate refund allowance is unlimited.', { status: 'draft' }));
  assert.ok((await f.request('snapshot')).sections.memory.entries.some(row => row.id === draft.id));
  assert.equal((await f.request('read', { id: draft.id, section: 'memory' })).content, draft.content);
  assert.doesNotMatch(await f.start('Implement refund validation'), /Candidate refund allowance/);
  assert.doesNotMatch((await f.request('context', { query: 'refund' })).text, /Candidate refund allowance/);
  await f.request('save', { ...draft, status: 'confirmed', expectedRevision: draft.revision });
  assert.match(await f.start('Implement refund validation'), /Candidate refund allowance/);
});

test('project-relative scope is persisted and matches path boundaries in both context paths', async t => {
  const f = await fixture(t);
  const saved = await f.request('save', memory('Payment scope', 'Refund authorization belongs to the payment module.', { scopePaths: ['apps/payments'], importance: 'core' }));
  assert.deepEqual(saved.scopePaths, ['apps/payments']);
  assert.equal(saved.importance, 'core');
  for (const query of ['Change apps/payments/refund.ts', 'Change `apps/payments`']) assert.match(await f.start(query), /Refund authorization belongs/);
  for (const query of ['Change apps/payments-other/refund.ts', 'Change apps/accounts/refund.ts', 'Implement refunds']) assert.doesNotMatch(await f.start(query), /Refund authorization belongs/);
  assert.match((await f.request('context', { paths: ['apps/payments/refund.ts'] })).text, /Refund authorization belongs/);
  assert.doesNotMatch((await f.request('context', { paths: ['apps/accounts/refund.ts'] })).text, /Refund authorization belongs/);
  const edited = await f.request('save', { ...saved, title: 'Renamed payment scope', expectedRevision: saved.revision });
  assert.deepEqual(edited.scopePaths, saved.scopePaths);
  assert.equal((await f.request('snapshot')).sections.memory.entries.find(row => row.id === edited.id).importance, 'core');
});

test('invalid memory scope and importance are rejected without writes', async t => {
  const f = await fixture(t);
  for (const scopePaths of [['../outside'], ['/home/example/private'], ['C:/Users/example/private'], ['apps\\payments'], ['apps/../payments'], ['apps\npayments'], ['.'], 'apps/payments', Array(17).fill('apps/payments')]) {
    await assert.rejects(f.request('save', memory('Invalid scope', 'This must not be saved.', { scopePaths })), /INVALID_MEMORY_SCOPE/);
  }
  await assert.rejects(f.request('save', memory('Invalid priority', 'This must not be saved.', { importance: 'highest' })), /INVALID_MEMORY_IMPORTANCE/);
  await assert.rejects(f.request('context', { paths: ['../outside'] }), /INVALID_MEMORY_SCOPE/);
  assert.equal((await f.request('snapshot')).sections.memory.entries.length, 0);
});

test('core rules keep reserved space even when the current query matches newer ordinary memories', async t => {
  const f = await fixture(t);
  const core = await f.request('save', memory('Delivery convention', 'Record validation results before delivery.', { importance: 'core' }));
  await age(f, core, '2025-01-01T00:00:00.000Z');
  for (let index = 0; index < 12; index += 1) await f.request('save', memory(`Refund topic ${index}`, `Refund case ${index} needs its transaction receipt.`));
  assert.match(await f.start('Implement refund validation'), /Record validation results before delivery/);
  assert.match((await f.request('context', { query: 'refund' })).text, /Record validation results before delivery/);
});

test('long rules retain their exception in storage and never inject an incomplete leading claim', async t => {
  const f = await fixture(t);
  const content = 'Refund processing is allowed. ' + 'Keep each approval record. '.repeat(9) + 'Except chargebacks, which require a separate review.';
  const saved = await f.request('save', memory('Refund review policy', content));
  const automatic = await f.start('Implement refund processing');
  assert.doesNotMatch(automatic, /Refund processing is allowed/);
  assert.match(automatic, new RegExp(saved.id));
  assert.match(automatic, /read.*full|full.*read/i);
  const manual = (await f.request('context', { query: 'refund' })).text;
  assert.match(manual, /Except chargebacks/);
  assert.equal((await f.request('read', { id: saved.id, section: 'memory' })).content, content);
});

test('remembered document policy is validated before writes and reading conditions are not truncated', async t => {
  const f = await fixture(t);
  const readWhen = 'When implementing refund processing, '.repeat(3) + 'only after checking whether the payment was settled.';
  const rule = { kind: 'document', category: 'business', status: 'confirmed', title: 'Refund limits', content: 'Refunds require settled payments.', summary: 'Check settlement before refunding.', readWhen, scopePaths: ['apps/payments'], importance: 'core' };
  await assert.rejects(f.request('remember', { ...rule, scopePaths: ['../outside'] }), /INVALID_MEMORY_SCOPE/);
  assert.equal((await f.request('snapshot')).sections.knowledge.entries.length, 0);
  const saved = await f.request('remember', rule);
  assert.deepEqual(saved.memory.scopePaths, ['apps/payments']);
  assert.equal(saved.memory.importance, 'core');
  assert.equal(saved.document.scopePaths, undefined);
  const context = await f.start('Implement apps/payments/refund.ts');
  assert.ok(context.includes(readWhen));
  assert.match(context, /only after checking whether/);
});

test('actual scope beats cached metadata even when size and timestamps are unchanged', async t => {
  const f = await fixture(t);
  const saved = await f.request('save', memory('Module authorization', 'Refund authorization stays in its owning module.', { scopePaths: ['apps/payments'] }));
  const name = path.join(f.root, saved.path); const old = new Date('2025-01-01T00:00:00.000Z');
  await fs.utimes(name, old, old);
  await f.request('reindex');
  const stat = await fs.stat(name);
  await fs.writeFile(name, (await fs.readFile(name, 'utf8')).replace('apps/payments', 'apps/accounts'));
  await fs.utimes(name, stat.atime, stat.mtime);
  assert.equal((await fs.stat(name)).size, stat.size);
  assert.doesNotMatch(await f.start('Implement apps/payments/refund.ts'), /Refund authorization stays/);
  assert.match(await f.start('Implement apps/accounts/refund.ts'), /Refund authorization stays/);
});

test('core context formatting stays bounded and uses a pointer when the full rule cannot fit', () => {
  const entry = { ...memory('Refund exception', 'Refunds may proceed only after manual review; chargebacks remain excluded.'), id: 'bounded-memory', path: `${ROOT}/memory/bounded-memory.md`, updatedAt: '2026-01-01' };
  const text = contextIndex([entry], { maxChars: 330, ruleChars: 40, query: 'refund' });
  assert.ok(text.length <= 330);
  assert.doesNotMatch(text, /Refunds may proceed/);
  assert.match(text, /bounded-memory/);
});

test('Chinese task terms find an older rule and generic continuation retains ordinary preferences', async t => {
  const f = await fixture(t);
  const rule = await f.request('save', memory('退款上限', '退款金额不得超过实付金额，例外需要审批。'));
  await age(f, rule, '2025-01-01T00:00:00.000Z');
  for (let index = 0; index < 10; index += 1) await f.request('save', memory(`图片导出${index}`, `图片导出应保留原始尺寸${index}。`));
  const text = await f.start('请实现退款功能并检查上限');
  assert.match(text, /退款金额不得超过实付金额，例外需要审批/);
  assert.doesNotMatch(text, /图片导出应保留/);
  await f.request('save', memory('工作偏好', '沟通采用简洁中文。'));
  assert.match(await f.start('继续开发'), /沟通采用简洁中文/);
});

test('long automatic captures cannot reintroduce a partial claim through their derived title', async t => {
  const f = await fixture(t);
  const content = 'Refund processing is permitted. ' + 'Retain the transaction evidence. '.repeat(7) + 'Except chargebacks, which always require separate approval.';
  await f.start(`Please remember: ${content}`);
  // Exercise the real settled-turn writer before starting a fresh task.
  await f.extension.saveAutomaticMemories(f.root, f.extension.extractAutomaticMemoryCandidates([{ role: 'user', content: `Please remember: ${content}` }]));
  const result = await f.start('Implement refund processing');
  assert.doesNotMatch(result, /Refund processing is permitted/);
  assert.match(result, /read full memory/i);
});

test('document summary refresh preserves existing scope and core priority when omitted', async t => {
  const f = await fixture(t);
  const saved = await f.request('remember', { kind: 'document', category: 'business', status: 'confirmed', title: 'Refund authorization', content: 'Refund authorization requires a settled payment.', summary: 'Check settlement before refund authorization.', readWhen: 'When changing payment refunds', scopePaths: ['apps/payments'], importance: 'core' });
  const updated = await f.request('remember', { ...saved.document, expectedRevision: saved.document.revision, summary: 'Refund authorization checks settlement.', readWhen: 'When changing payment refunds' });
  assert.equal(updated.memory.id, saved.memory.id);
  assert.deepEqual(updated.memory.scopePaths, ['apps/payments']);
  assert.equal(updated.memory.importance, 'core');
  assert.doesNotMatch(await f.start('Change apps/accounts/refund.ts'), /Refund authorization checks/);
});

test('absolute and remote paths cannot establish project-relative memory scope', async t => {
  const f = await fixture(t);
  await f.request('save', memory('Scoped payment policy', 'Refund approval belongs to this scoped payment policy.', { scopePaths: ['apps/payments'], importance: 'core' }));
  for (const query of ['Read /home/example/apps/payments/refund.ts', 'Read https://example.invalid/apps/payments/refund.ts', 'Read C:\\Users\\example\\apps\\payments\\refund.ts']) {
    assert.doesNotMatch(await f.start(query), /Refund approval belongs/, query);
  }
  await assert.rejects(f.request('save', { kind: 'document', category: 'business', title: 'Wrong owner', content: 'A source document', scopePaths: ['apps/payments'] }), /MEMORY_METADATA_REQUIRES_MEMORY/);
});

test('the public tool declares task paths, memory scope and bounded core priority', () => {
  const { schema } = require('./main.js');
  assert.equal(schema.properties.scopePaths.type, 'array');
  assert.equal(schema.properties.scopePaths.maxItems, 16);
  assert.equal(schema.properties.paths.type, 'array');
  assert.deepEqual(schema.properties.importance.enum, ['normal', 'core']);
});

test('unreadable memory bodies cannot authorize a document route from cached scope metadata', async t => {
  const f = await fixture(t);
  const saved = await f.request('remember', { kind: 'document', category: 'business', status: 'confirmed', title: 'Refund routing', content: 'Refund routing needs approval.', summary: 'Refund routing needs approval.', readWhen: 'Before changing refunds', scopePaths: ['apps/payments'] });
  const filename = path.join(f.root, saved.memory.path); const old = new Date('2025-01-01T00:00:00.000Z');
  await fs.utimes(filename, old, old);
  await f.request('reindex');
  const stat = await fs.stat(filename);
  await fs.writeFile(filename, (await fs.readFile(filename, 'utf8')).replace('"confirmed"', '"uncertain"'));
  await fs.utimes(filename, stat.atime, stat.mtime);
  assert.equal((await fs.stat(filename)).size, stat.size);
  for (const text of [await f.start('Change apps/payments/refund.ts'), (await f.request('context', { query: 'Change apps/payments/refund.ts', paths: ['apps/payments/refund.ts'] })).text]) {
    assert.ok(!text.includes(saved.document.recordId));
    assert.doesNotMatch(text, /Refund routing needs approval/);
  }
});

test('relative-looking suffixes inside absolute paths or URLs cannot establish scope', async t => {
  const f = await fixture(t);
  await f.request('save', memory('Payment routing policy', 'This scoped routing policy requires payment approval.', { scopePaths: ['apps/payments'], importance: 'core' }));
  for (const query of ['Read /external/other-apps/payments/refund.ts', 'Read https://example-apps/payments/refund.ts']) {
    assert.doesNotMatch(await f.start(query), /This scoped routing policy requires/, query);
    assert.doesNotMatch((await f.request('context', { query })).text, /This scoped routing policy requires/, query);
  }
});

test('explicitly named root files and directories establish their exact scope', async t => {
  const f = await fixture(t);
  await f.request('save', memory('Manifest policy', 'The root manifest must preserve existing package scripts.', { scopePaths: ['package.json'], importance: 'core' }));
  await f.request('save', memory('Build entry policy', 'The build entry must preserve existing targets.', { scopePaths: ['Makefile'], importance: 'core' }));
  assert.match(await f.start('Change `package.json`'), /root manifest must preserve/);
  assert.match(await f.start('Change Makefile'), /build entry must preserve/);
  assert.doesNotMatch(await f.start('Change other/package.json'), /root manifest must preserve/);
});

test('read-only master overview groups verified records without rewriting their source', async t => {
  const f=await fixture(t);
  const core=await f.request('save',memory('Refund core','Refunds retain an audit receipt.',{importance:'core',topics:['Payments']}));
  const draft=await f.request('save',memory('Refund draft','Draft allowance is unlimited.',{status:'draft'}));
  const old=await f.request('save',memory('Legacy preference','Use clear labels.'));
  const before=await Promise.all([core,draft,old].map(row=>f.api.fs.readText(row.path)));
  const overview=await f.request('memoryOverview');
  assert.equal(overview.schemaVersion,1);
  assert.equal(overview.entries.find(row=>row.id===core.id).summary,core.content);
  assert.equal(overview.entries.find(row=>row.id===draft.id).summary,'');
  assert.ok(overview.groups.some(group=>group.type==='core'&&group.keys.includes(overview.entries.find(row=>row.id===core.id).key)));
  assert.ok(overview.groups.some(group=>group.type==='topic'&&group.topic==='Payments'));
  assert.ok(overview.groups.some(group=>group.type==='ungrouped'&&group.keys.includes(overview.entries.find(row=>row.id===old.id).key)));
  assert.ok(overview.groups.some(group=>group.type==='candidates'));
  assert.deepEqual(await Promise.all([core,draft,old].map(row=>f.api.fs.readText(row.path))),before);
  assert.equal((await f.request('snapshot')).memoryCapabilities.overview,true);
  const plain=await f.request('context',{query:'refund'});
  const explained=await f.request('context',{query:'refund',explain:true});
  assert.deepEqual(Object.keys(plain),['text']);
  assert.equal(explained.text,plain.text);
  assert.equal(explained.explanation.mode,'manual');
  assert.equal(explained.explanation.decisions.find(row=>row.id===draft.id).presentation,'omitted');
  await assert.rejects(f.request('context',{memoryMode:'everything'}),/INVALID_MEMORY_MODE/);
  await assert.rejects(f.request('context',{explain:'yes'}),/INVALID_MEMORY_EXPLAIN/);
  assert.deepEqual((await f.request('memoryTraces')).traces,[]);
  await assert.rejects(fs.access(path.join(f.root,ROOT,'memory/recall-traces')));
});

test('overview follows stable source identity while a changed source withholds its previous summary', async t => {
  const f=await fixture(t);
  const linked=await f.request('remember',{kind:'document',category:'business',status:'confirmed',title:'Refund source',content:'Refunds require receipts.',summary:'Refunds require receipts.',readWhen:'Before refund changes'});
  await f.request('save',{...linked.document,content:'Refunds require an invoice.',expectedRevision:linked.document.revision});
  const overview=await f.request('memoryOverview');
  const entry=overview.entries.find(row=>row.id===linked.memory.id);
  assert.equal(entry.sourceState,'stale');assert.equal(entry.summary,'');
  assert.equal(entry.source.recordId,linked.document.recordId);
  const explanation=(await f.request('context',{query:'refund',explain:true,memoryMode:'automatic'})).explanation;
  const decision=explanation.decisions.find(row=>row.id===linked.memory.id);
  assert.equal(decision.presentation,'pointer');assert.ok(decision.reasons.includes('source_stale'));
});

test('automatic preparation persists privacy-bounded explanation and forgetting clears its references', async t => {
  const f=await fixture(t);
  const saved=await f.request('save',memory('Refund audit','Refunds require an audit receipt.'));
  const automatic=await f.start('Implement refund validation confidential-note-428');
  const history=await f.request('memoryTraces');assert.equal(history.traces.length,1);
  const trace=history.traces[0];
  assert.equal(trace.mode,'automatic');
  assert.equal(trace.contextHash,require('./core.cjs').hash(automatic.slice('BASE\n\n'.length)));
  assert.doesNotMatch(JSON.stringify(history),/confidential-note-428|Refunds require an audit receipt|Retrieval test|user prompt/);
  assert.ok(trace.decisions.every(row=>!('id' in row)&&!('title' in row)&&!('content' in row)));
  await f.request('forget',{id:saved.id,expectedRevision:saved.revision});
  assert.deepEqual((await f.request('memoryTraces')).traces,[]);
});

test('incremental context uses warmed metadata without loading memory bodies', async t => {
  const f=await fixture(t);
  const saved=await f.request('save',memory('Incremental rule','Keep the full rule in its owned record.'));
  await f.request('snapshot');
  const read=f.api.fs.readText, bodies=[];
  f.api.fs.readText=async name=>{if(name.endsWith('.md')) bodies.push(name);return read(name);};
  const result=await f.request('context',{since:'2020-01-01T00:00:00.000Z'});
  assert.ok(result.changed.some(row=>row.id===saved.id));
  assert.deepEqual(bodies,[]);
  await assert.rejects(f.request('context',{since:'2020-01-01',explain:true}),/INVALID_MEMORY_QUERY/);
});

test('automatic preview matches extension preparation for draft, stale and long source records', async t => {
  const f=await fixture(t);
  await f.request('save',memory('Refund candidate','Unconfirmed refund exception.',{status:'draft'}));
  await f.request('save',memory('Refund long rule','Refund exceptions require approval. '.repeat(12)));
  const linked=await f.request('remember',{kind:'document',category:'business',status:'confirmed',title:'Refund source',content:'Refund evidence stays in the source.',summary:'Refund summaries require evidence.',readWhen:'Before changing refunds'});
  await f.request('save',{...linked.document,content:'Updated refund evidence needs an invoice.',expectedRevision:linked.document.revision});
  const query='Implement refund validation';
  const preview=await f.request('context',{query,explain:true,memoryMode:'automatic'});
  assert.equal(await f.start(query),`BASE\n\n${preview.text}`);
  assert.equal((await f.request('memoryTraces')).traces[0].contextHash,preview.explanation.contextHash);
  assert.ok(preview.explanation.decisions.some(row=>row.reasons.includes('draft')));
  assert.ok(preview.explanation.decisions.some(row=>row.reasons.includes('source_stale')));
  assert.ok(preview.explanation.decisions.some(row=>row.reasons.includes('body_limit')));
});

test('the public tool exposes read-only overview, traces and explicit explanation modes', async t => {
  const main=require('./main.js');let registered;
  const previous=global.pi;
  global.pi={commands:{register:async()=>{},unregister:async()=>{}},agent:{registerTool:async value=>{registered=value;},unregisterTool:async()=>{}}};
  try {await main.onLoad();await main.onUnload();} finally {global.pi=previous;}
  for(const action of ['memoryOverview','memoryTraces','context']) {
    assert.ok(main.schema.properties.action.enum.includes(action));
    assert.ok(registered.planSafeActions.includes(action));
  }
  assert.equal(main.schema.properties.explain.type,'boolean');
  assert.deepEqual(main.schema.properties.memoryMode.enum,['automatic','manual']);
});

test('file-tree memory deletion uses the same verified trace cleanup as forget', async t=>{
  const f=await fixture(t);
  const saved=await f.request('save',memory('Refund audit','Refunds require a retained receipt.'));
  await f.start('Implement refund audit');
  assert.equal((await f.request('memoryTraces')).traces.length,1);
  assert.equal((await f.request('delete',{id:saved.id,section:'memory',expectedRevision:saved.revision})).deleted,true);
  assert.deepEqual((await f.request('memoryTraces')).traces,[]);
});

test('automatic preview preserves native eligibility before projecting unusable linked summaries', async t=>{
  for(const body of ['','password=fixture-sensitive']) for(const state of ['stale','missing']) await t.test(`${body?'sensitive':'empty'} ${state}`,async t=>{
    const f=await fixture(t);
    const linked=await f.request('remember',{kind:'document',category:'business',status:'confirmed',title:'Refund source',content:'Refund evidence requires a receipt.',summary:'Refund evidence requires a receipt.',readWhen:'Before changing refunds'});
    await f.api.fs.writeText(linked.memory.path,encode({...linked.memory,content:body}));
    if(state==='missing') await f.api.fs.remove(linked.document.path);
    else await f.request('save',{...linked.document,content:'Refund evidence now needs an invoice.',expectedRevision:linked.document.revision});
    const query='Implement refund audit';
    const preview=await f.request('context',{query,memoryMode:'automatic',explain:true});
    assert.equal(await f.start(query),`BASE\n\n${preview.text}`);
    assert.equal(preview.explanation.decisions.find(row=>row.id===linked.memory.id).selected,false);
    assert.ok(!preview.text.includes(linked.document.recordId));
  });
});

function deferred() {let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
test('forget and an overlapping automatic trace cannot leave a deleted memory reference', async t=>{
  for(const order of ['publish-after-forget','publish-before-delete']) await t.test(order,async t=>{
    const f=await fixture(t);
    const saved=await f.request('save',memory('Refund audit','Refunds require a retained receipt.'));
    const entered=deferred(), release=deferred();t.after(()=>release.resolve());
    if(order==='publish-after-forget') {
      const rename=fs.rename;
      t.mock.method(fs,'rename',async(...args)=>{
        if(String(args[1]).includes('/recall-traces/')&&String(args[1]).endsWith('.json')) {entered.resolve();await release.promise;}
        return rename(...args);
      });
      const pending=f.start('Implement refund audit');await entered.promise;
      await f.request('forget',{id:saved.id,expectedRevision:saved.revision});
      release.resolve();await pending;
    } else {
      const remove=f.api.fs.remove;
      f.api.fs.remove=async name=>{if(name===saved.path){entered.resolve();await release.promise;}return remove(name);};
      const forgetting=f.request('forget',{id:saved.id,expectedRevision:saved.revision});await entered.promise;
      await f.start('Implement refund audit');release.resolve();await forgetting;
    }
    assert.deepEqual((await f.request('memoryTraces')).traces,[]);
    await assert.rejects(fs.access(path.join(f.root,saved.path)),{code:'ENOENT'});
  });
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WikiService } = require('./service.cjs');
const { ROOT, encode, hash } = require('./core.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'wiki-document-memory-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let current = root;
  const api = {
    workspace: { get: async () => ({ path: current, name: 'Rules test' }) },
    fs: {
      readText: p => fs.readFile(path.join(current, p), 'utf8'),
      writeText: async (p, value) => { const target = path.join(current, p); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, value); },
      remove: p => fs.rm(path.join(current, p), { recursive: true, force: true }),
      stat: async p => { const stat = await fs.stat(path.join(current, p)); return { size: stat.size, mtimeMs: stat.mtimeMs }; },
      list: async p => Promise.all((await fs.readdir(path.join(current, p), { withFileTypes: true })).map(async item => {
        const relative = `${p}/${item.name}`; const stat = await fs.stat(path.join(current, relative));
        return { name: item.name, path: relative, isDirectory: item.isDirectory(), size: stat.size, mtimeMs: stat.mtimeMs };
      })),
    },
  };
  const service = new WikiService(api);
  const request = (action, input = {}) => service.request({ action, workspacePath: root, ...input });
  await request('init');
  return { root, api, service, request, switchTo: value => { current = value; } };
}
const rule = { title: '退款规则', category: '业务规则', kind: 'document', status: 'confirmed', content: '退款不得超过实付金额。例外必须单独审批。', summary: '退款上限为实付金额，例外需审批。', readWhen: '实现或处理退款业务时', source: 'User-confirmed business rule' };

test('user path: remember a rule, follow its document, rename and move it, then reopen the service', async t => {
  const f = await fixture(t);
  const saved = await f.request('remember', rule);
  assert.equal(saved.linked, true);
  assert.equal(saved.document.content, rule.content);
  assert.equal(saved.memory.content, rule.summary);
  assert.equal(saved.memory.documentLink.state, 'current');
  const stable = saved.document.recordId;
  assert.ok(stable);
  let document = await f.request('read', { id: stable, section: 'knowledge' });
  document = await f.request('save', { ...document, title: '售后退款规则', expectedRevision: document.revision });
  assert.notEqual(document.id, saved.document.id);
  assert.equal(document.recordId, stable);
  document = await f.request('move', { id: stable, section: 'knowledge', targetCategory: '售后规范', expectedRevision: document.revision });
  const memory = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(memory.title, '售后退款规则');
  assert.equal(memory.documentLink.state, 'current');
  assert.equal(memory.documentLink.document.path, document.path);
  assert.equal(memory.documentLink.document.revision, document.revision);
  const reopened = new WikiService(f.api);
  const restored = await reopened.request({ action: 'read', workspacePath: f.root, id: saved.memory.id, section: 'memory' });
  assert.equal(restored.documentLink.state, 'current');
  assert.equal(restored.documentRef.recordId, stable);
  assert.equal((await f.request('snapshot')).sections.memory.entries[0].documentLink.document.title, document.title);
});

test('changed rules hide the old summary until remember refreshes the same association', async t => {
  const f = await fixture(t); const saved = await f.request('remember', rule);
  const changed = await f.request('save', { ...saved.document, content: '退款需先核对签收状态。', expectedRevision: saved.document.revision });
  const stale = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(stale.documentLink.state, 'stale');
  assert.equal(stale.content, '');
  assert.equal(stale.documentLink.document.revision, changed.revision);
  const context = await f.request('context');
  assert.doesNotMatch(context.text, new RegExp(rule.summary));
  const refreshed = await f.request('remember', { ...changed, expectedRevision: changed.revision, summary: '退款前核对签收状态。', readWhen: rule.readWhen });
  assert.equal(refreshed.linked, true);
  assert.equal(refreshed.memory.id, saved.memory.id);
  assert.equal(refreshed.memory.documentLink.state, 'current');
  assert.equal((await f.request('snapshot')).sections.memory.entries.length, 1);
});

test('draft, archived and deleted sources cannot lend their remembered summary', async t => {
  const f = await fixture(t); const saved = await f.request('remember', rule);
  let doc = await f.request('save', { ...saved.document, status: 'draft', expectedRevision: saved.document.revision });
  assert.equal((await f.request('read', { id: saved.memory.id, section: 'memory' })).documentLink.state, 'draft');
  doc = await f.request('save', { ...doc, status: 'archived', expectedRevision: doc.revision });
  let memory = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(memory.documentLink.state, 'archived'); assert.equal(memory.content, '');
  await f.request('delete', { id: doc.id, section: 'knowledge', expectedRevision: doc.revision });
  memory = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(memory.documentLink.state, 'missing'); assert.equal(memory.content, '');
});

test('invalid summaries and unconfirmed rules are refused before any document is written', async t => {
  const f = await fixture(t);
  for (const patch of [{ summary: '' }, { summary: 'a'.repeat(801) }, { readWhen: '' }, { readWhen: 'a'.repeat(241) }, { readWhen: 'Read /home/example/private/rules' }, { summary: 'Use /home/example/private/rules' }, { status: 'draft' }, { summary: '将我制作插件过程记录记忆' }]) {
    await assert.rejects(f.request('remember', { ...rule, ...patch }));
  }
  const snapshot = await f.request('snapshot');
  assert.equal(snapshot.sections.knowledge.entries.length, 0);
  assert.equal(snapshot.sections.memory.entries.length, 0);
});

test('failed document persistence never creates a memory association', async t => {
  const f = await fixture(t); const write = f.api.fs.writeText;
  f.api.fs.writeText = async (p, value) => { if (p.includes('/knowledge/') && p.endsWith('.md')) throw new Error('Test document write failed'); await write(p, value); };
  await assert.rejects(f.request('remember', rule), /Test document write failed/);
  assert.equal((await f.request('snapshot')).sections.memory.entries.length, 0);
});

test('a link write failure reports the saved document and can be retried without duplication', async t => {
  const f = await fixture(t); const write = f.api.fs.writeText;
  f.api.fs.writeText = async (p, value) => { if (p.startsWith(`${ROOT}/memory/`) && p.endsWith('.md')) throw new Error('Test link write failed'); await write(p, value); };
  const partial = await f.request('remember', rule);
  assert.equal(partial.linked, false);
  assert.equal(partial.memory, null);
  assert.match(partial.linkError, /Test link write failed/);
  assert.equal((await f.request('read', { id: partial.document.recordId, section: 'knowledge' })).content, rule.content);
  f.api.fs.writeText = write;
  const retry = await f.request('remember', { ...partial.document, expectedRevision: partial.document.revision, summary: rule.summary, readWhen: rule.readWhen });
  assert.equal(retry.linked, true);
  const snapshot = await f.request('snapshot');
  assert.equal(snapshot.sections.knowledge.entries.length, 1);
  assert.equal(snapshot.sections.memory.entries.length, 1);
});

test('legacy documents acquire a stable identity on first managed save, without an eager rewrite', async t => {
  const f = await fixture(t);
  const legacy = { schemaVersion: 1, id: '历史业务规则', title: '历史业务规则', kind: 'document', category: 'general', status: 'confirmed', source: '', tags: [], topics: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', content: rule.content };
  const filename = `${ROOT}/knowledge/general/历史业务规则.md`; const raw = encode(legacy);
  await f.api.fs.writeText(filename, raw);
  const original = await f.request('read', { id: legacy.id, section: 'knowledge' });
  assert.ok(original.recordId);
  assert.equal(await f.api.fs.readText(filename), raw);
  const saved = await f.request('remember', { ...original, expectedRevision: hash(raw), summary: rule.summary, readWhen: rule.readWhen });
  assert.equal(saved.document.recordId, original.recordId);
  assert.match(await f.api.fs.readText(saved.document.path), /"recordId"/);
});

test('conflicting active document identities are reported instead of choosing a rule', async t => {
  const f = await fixture(t); const saved = await f.request('remember', rule);
  const clone = { ...saved.document, title: '冲突规则', id: '冲突规则', content: 'Another source' };
  await f.api.fs.writeText(`${ROOT}/knowledge/业务规则/冲突规则.md`, encode(clone));
  const memory = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(memory.documentLink.state, 'ambiguous'); assert.equal(memory.content, '');
  await assert.rejects(f.request('read', { id: saved.document.recordId, section: 'knowledge' }), /AMBIGUOUS_DOCUMENT/);
});

test('document references are schema validated and cannot contain filesystem paths', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('save', { kind: 'memory', category: 'memory', title: 'Bad link', content: 'A summary', documentRef: { recordId: '../outside', contentHash: 'a'.repeat(64), readWhen: 'on demand' } }), /INVALID_DOCUMENT_REF/);
  assert.equal((await f.request('snapshot')).sections.memory.entries.length, 0);
});

test('the public agent tool declares the document-memory workflow and fields', () => {
  const { schema } = require('./main.js');
  assert.ok(schema.properties.action.enum.includes('remember'));
  assert.equal(schema.properties.summary.type, 'string');
  assert.equal(schema.properties.readWhen.type, 'string');
});

test('external rename and move preserve the managed document association', async t => {
  const f = await fixture(t); const saved = await f.request('remember', rule);
  const movedPath = `${ROOT}/knowledge/外部整理/改名文件.md`;
  await fs.mkdir(path.join(f.root, ROOT, 'knowledge/外部整理'), { recursive: true });
  await fs.rename(path.join(f.root, saved.document.path), path.join(f.root, movedPath));
  const memory = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(memory.documentLink.state, 'current');
  assert.equal(memory.documentLink.document.path, movedPath);
  assert.equal((await f.request('read', { id: saved.document.recordId, section: 'knowledge' })).content, rule.content);
});

test('optional cache write failure cannot hide a persisted linked memory from the next turn', async t => {
  const f = await fixture(t); const write = f.api.fs.writeText;
  f.api.fs.writeText = async (p, value) => {
    if (p === `${ROOT}/memory/index.json`) throw new Error('Test optional cache write failure');
    await write(p, value);
  };
  const saved = await f.request('remember', rule);
  assert.equal(saved.linked, true);
  const { readProjectContext } = await import('./extension.mjs');
  const context = await readProjectContext(f.root);
  assert.match(context, new RegExp(rule.summary));
  assert.match(context, new RegExp(saved.document.recordId));
});

test('cached unrelated identities cannot hide a duplicate even when size and timestamps match', async t => {
  const f = await fixture(t); const saved = await f.request('remember', rule);
  const other = await f.request('save', { ...rule, title: '其他业务规则' });
  const filename = path.join(f.root, other.path);
  const oldTime = new Date('2025-01-01T00:00:00.000Z');
  await fs.utimes(filename, oldTime, oldTime);
  await f.request('reindex');
  const before = await fs.stat(filename);
  const original = await fs.readFile(filename, 'utf8');
  await fs.writeFile(filename, original.replace(other.recordId, saved.document.recordId));
  await fs.utimes(filename, before.atime, before.mtime);
  assert.equal((await fs.stat(filename)).size, before.size);
  assert.equal((await fs.stat(filename)).mtimeMs, before.mtimeMs);
  const { readProjectContext } = await import('./extension.mjs');
  const context = await readProjectContext(f.root);
  assert.match(context, /ambiguous/);
  assert.doesNotMatch(context, new RegExp(rule.summary));
  const memory = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(memory.documentLink.state, 'ambiguous');
  assert.equal(memory.content, '');
});

test('private source titles stay in explicit documents and never enter persisted or projected memory titles', async t => {
  const f = await fixture(t);
  const title = 'Rules from /home/example/private/rules';
  const saved = await f.request('remember', { ...rule, title });
  assert.equal(saved.document.title, title);
  assert.doesNotMatch(saved.memory.title, /\/home\/example/);
  assert.doesNotMatch((await f.request('read', { id: saved.memory.id, section: 'memory' })).title, /\/home\/example/);
  const { readProjectContext } = await import('./extension.mjs');
  assert.doesNotMatch(await readProjectContext(f.root), /\/home\/example/);
  const changed = await f.request('save', { ...saved.document, title: 'Moved /home/another/private/rules', expectedRevision: saved.document.revision });
  const memory = await f.request('read', { id: saved.memory.id, section: 'memory' });
  assert.equal(memory.documentLink.state, 'current');
  assert.doesNotMatch(JSON.stringify(memory), /\/home\/(?:example|another)/);
  assert.doesNotMatch(await readProjectContext(f.root), /\/home\/(?:example|another)/);
  assert.equal((await f.request('read', { recordId: changed.recordId, section: 'knowledge' })).title, changed.title);
});

test('explicit stable selectors cannot be shadowed by a filename and remain usable for updates', async t => {
  const f = await fixture(t); const saved = await f.request('remember', rule);
  const shadow = await f.request('save', { ...rule, title: saved.document.recordId, content: 'Unrelated document body.' });
  assert.equal(shadow.id, saved.document.recordId);
  await assert.rejects(f.request('read', { id: saved.document.recordId, section: 'knowledge' }), /AMBIGUOUS_DOCUMENT/);
  const document = await f.request('read', { recordId: saved.document.recordId, section: 'knowledge' });
  assert.equal(document.content, rule.content);
  const updated = await f.request('remember', { recordId: document.recordId, expectedRevision: document.revision, status: 'confirmed', summary: rule.summary, readWhen: rule.readWhen });
  assert.equal(updated.linked, true);
  assert.equal(updated.document.recordId, document.recordId);
  assert.equal((await f.request('read', { recordId: shadow.recordId, section: 'knowledge' })).content, shadow.content);
  await assert.rejects(f.request('read', { recordId: '../outside', section: 'knowledge' }), /INVALID_RECORD_ID/);
});

test('an unreadable cached source cannot conceal another linked document identity', async t => {
  const f = await fixture(t); const saved = await f.request('remember', rule);
  const other = await f.request('remember', { ...rule, title: '审批规则', content: '审批需单独留档。', summary: '审批结果需留档。', readWhen: '实现审批流程时' });
  await f.api.fs.writeText(other.document.path, encode({ ...other.document, kind: 'invalid-document-kind' }));
  const { readProjectContext } = await import('./extension.mjs');
  const context = await readProjectContext(f.root);
  assert.doesNotMatch(context, new RegExp(rule.summary));
  assert.match(context, /unreadable/);
  assert.equal((await f.request('read', { id: saved.memory.id, section: 'memory' })).documentLink.state, 'unreadable');
});

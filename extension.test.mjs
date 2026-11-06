import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import extension, { extractAutomaticMemoryCandidates, memoryRequest, usableMemory, saveAutomaticMemories, readProjectContext, readProjectContextStats } from './extension.mjs';
import core from './core.cjs';
import links from './document-links.cjs';
import serviceModule from './service.cjs';
const { ROOT, MEMORY_ROOT, KNOWLEDGE_ROOT, decode, encode, normalize, recordPath } = core;
const { stableRecordId, documentContentHash } = links;
const { WikiService } = serviceModule;

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'wiki-memory-quality-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const handlers = {};
  const notices = [];
  extension({ on: (name, handler) => { handlers[name] = handler; } });
  const context = (sessionId = 'session-a') => ({
    cwd, sessionManager: { getSessionId: () => sessionId },
    ui: { notify: (message, level) => notices.push({ message, level }) },
  });
  async function memories() {
    let names;
    try { names = await fs.readdir(path.join(cwd, MEMORY_ROOT)); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return Promise.all(names.filter(name => name.endsWith('.md')).map(async name => {
      const relative = `${MEMORY_ROOT}/${name}`;
      return decode(await fs.readFile(path.join(cwd, relative), 'utf8'), relative);
    }));
  }
  return { cwd, handlers, context, memories, notices };
}

const start = (f, prompt, ctx = f.context()) => f.handlers.before_agent_start({ type: 'before_agent_start', prompt, systemPrompt: 'BASE' }, ctx);
const settle = (f, ctx = f.context()) => f.handlers.agent_settled({ type: 'agent_settled' }, ctx);

function wiki(cwd) {
  const api = {
    workspace: { get: async () => ({ path: cwd, name: 'Memory test' }) },
    fs: {
      readText: p => fs.readFile(path.join(cwd, p), 'utf8'),
      writeText: async (p, raw) => { const target = path.join(cwd, p); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, raw); },
      stat: async p => { const info = await fs.stat(path.join(cwd, p)); return { size: info.size, mtimeMs: info.mtimeMs }; },
      list: async dir => Promise.all((await fs.readdir(path.join(cwd, dir), { withFileTypes: true })).map(async item => {
        const relative = `${dir}/${item.name}`;
        const info = await fs.stat(path.join(cwd, relative));
        return { name: item.name, path: relative, isDirectory: item.isDirectory(), size: info.size, mtimeMs: info.mtimeMs };
      })),
    },
  };
  const service = new WikiService(api);
  return (action, input = {}) => service.request({ action, workspacePath: cwd, ...input });
}

async function writeEntry(cwd, entry) {
  const name = recordPath(entry);
  await fs.mkdir(path.dirname(path.join(cwd, name)), { recursive: true });
  const raw = encode(entry);
  await fs.writeFile(path.join(cwd, name), raw);
  return decode(raw, name);
}

async function writeIndex(cwd, section, entries) {
  const rows = await Promise.all(entries.map(async ({ content, ...entry }) => {
    const info = await fs.stat(path.join(cwd, entry.path));
    return { ...entry, size: info.size, mtimeMs: info.mtimeMs };
  }));
  await fs.writeFile(path.join(cwd, ROOT, section, 'index.json'), JSON.stringify({ version: 1, section, entries: rows }));
}

async function linkedFixture(t, indexed = true) {
  const f = await fixture(t);
  const document = await writeEntry(f.cwd, normalize({ title: 'Release rules', category: 'business', kind: 'document', status: 'confirmed', content: 'Full release rules. Check authorization before deployment.\n\nDetailed procedure stays in this document.' }));
  const memory = await writeEntry(f.cwd, normalize({ title: 'Old release label', category: 'memory', kind: 'memory', status: 'confirmed', content: 'Confirmed release summary with a permission qualification.', documentRef: { recordId: stableRecordId(document), contentHash: documentContentHash(document), readWhen: 'Before preparing a release or changing release permissions.' } }));
  if (indexed) {
    await writeIndex(f.cwd, 'memory', [memory]);
    await writeIndex(f.cwd, 'knowledge', [document]);
  }
  return { ...f, document, memory };
}

test('queries and context-only commands are not automatic memory facts', () => {
  for (const content of ['记录到记忆中', '把刚才的开发规范记住', '把刚才讨论的开发规范记住', '请记住这个', '记忆开发要点', 'Remember this', 'Save the above to memory', '查看项目文档中是否有一个开发规范', '项目规范有哪些？', '项目规范是什么', '项目规范有哪些', '项目规范是否采用 PinLayout', '项目规范如何制定', 'How do I save this to memory?']) {
    assert.deepEqual(extractAutomaticMemoryCandidates([{ role: 'user', content }]), [], content);
  }
  const [candidate] = extractAutomaticMemoryCandidates([{ role: 'user', content: '请记住：本项目布局统一采用 PinLayout' }]);
  assert.equal(candidate.content, '本项目布局统一采用 PinLayout');
});

test('context-only process requests are guidance, while explicit qualifications remain factual', async t => {
  const f = await fixture(t);
  for (const prompt of ['将我制作插件过程记录记忆', '把这份业务规则整理到记忆', '把业务规则记入记忆', 'remember the previous result', 'save the previous result']) {
    assert.deepEqual(extractAutomaticMemoryCandidates([{ role: 'user', content: prompt }]), [], prompt);
    assert.match((await start(f, prompt))?.systemPrompt || '', /project_wiki/, prompt);
    await settle(f);
  }
  assert.deepEqual(await f.memories(), []);
  const content = '上线前检查是否具有发布权限；操作手册说明如何确认授权。';
  assert.equal(extractAutomaticMemoryCandidates([{ role: 'user', content: `请记住：${content}` }])[0]?.content, content);
  await fs.mkdir(path.join(f.cwd, MEMORY_ROOT), { recursive: true });
  const stored = normalize({ kind: 'memory', category: 'memory', title: '发布资格', content, status: 'confirmed' });
  await fs.writeFile(path.join(f.cwd, recordPath(stored)), encode(stored));
  assert.match(await readProjectContext(f.cwd), /上线前检查是否具有发布权限/);
  assert.match(await readProjectContext(f.cwd), /说明如何确认授权/);
});

test('the newest explicit facts win the per-turn limit, and secrets and assistant text are excluded', () => {
  const messages = Array.from({ length: 5 }, (_, n) => ({ role: 'user', content: `请记住：部署区域为 region-${n}` }));
  messages.push({ role: 'assistant', content: '请记住：没有用户确认的结论' });
  messages.push({ role: 'user', content: '请记住：password=not-a-real-credential' });
  messages.push({ role: 'user', content: '请记住：部署区域为 region-4' });
  const candidates = extractAutomaticMemoryCandidates(messages);
  assert.deepEqual(candidates.map(item => item.content), ['部署区域为 region-4', '部署区域为 region-3', '部署区域为 region-2']);
});

test('an explicit contextual request routes to project_wiki even before initialization, without saving the command', async t => {
  const f = await fixture(t);
  for (const prompt of ['记录到记忆中', '把刚才讨论的开发规范记住']) {
    const result = await start(f, prompt);
    assert.match(result?.systemPrompt || '', /project_wiki/, prompt);
    assert.match(result.systemPrompt, /snapshot/);
    assert.match(result.systemPrompt, /kind.*memory/);
    assert.match(result.systemPrompt, /expectedRevision/);
    assert.match(result.systemPrompt, /MEMORY\.md/);
  }
  await settle(f);
  assert.deepEqual(await f.memories(), []);
  await assert.rejects(fs.stat(path.join(f.cwd, ROOT)), { code: 'ENOENT' });
});

test('user path: request contextual memory, save concrete source-backed facts through the service, restore them next turn', async t => {
  const f = await fixture(t);
  const result = await start(f, '把刚才的开发规范记住');
  assert.match(result?.systemPrompt || '', /project_wiki/);
  const request = wiki(f.cwd);
  assert.equal((await request('snapshot')).initialized, false);
  await request('init');
  const saved = await request('save', {
    kind: 'memory', category: 'memory', status: 'confirmed', title: '布局开发规范',
    content: '布局采用 PinLayout；详细规则以 CODING_STYLE.md 为准。',
    source: 'CODING_STYLE.md; explicit user request in session-a',
  });
  await settle(f);
  assert.equal((await f.memories()).length, 1);
  assert.equal((await request('read', { id: saved.id, section: 'memory' })).source, saved.source);
  const next = await start(f, '继续开发');
  assert.match(next.systemPrompt, /布局采用 PinLayout/);
  assert.match(next.systemPrompt, /CODING_STYLE\.md/);
  assert.doesNotMatch(next.systemPrompt, /记录到记忆中/);
});

test('direct facts survive in full within the limit, deduplicate, and can be restored without pi.session', async t => {
  const f = await fixture(t);
  const content = `项目规范：${'使用已确认的组件约定。'.repeat(57)}`;
  assert.ok(content.length > 600 && content.length <= 800);
  await start(f, `请记住：${content}`);
  await settle(f);
  await start(f, `请记住：${content}`);
  await settle(f);
  const records = await f.memories();
  assert.equal(records.length, 1);
  assert.equal(records[0].content, content);
  const restored = await readProjectContext(f.cwd);
  assert.ok(restored.includes(recordPath(records[0])));
  assert.match(restored, /read full memory/);
  assert.doesNotMatch(restored, /使用已确认的组件约定/);
  assert.deepEqual(f.notices, []);
});

test('a later ordinary prompt clears an unfinished memory request', async t => {
  const f = await fixture(t);
  await start(f, '请记住：部署使用本地集群');
  await start(f, '继续查看代码');
  await settle(f);
  assert.deepEqual(await f.memories(), []);
});

test('pending memory is scoped to both the session and project', async t => {
  const f = await fixture(t);
  await start(f, '请记住：会话 A 使用本地集群', f.context('a'));
  await start(f, '请记住：会话 B 使用测试集群', f.context('b'));
  await settle(f, f.context('a'));
  assert.deepEqual((await f.memories()).map(item => item.content), ['会话 A 使用本地集群']);
  await settle(f, f.context('b'));
  assert.equal((await f.memories()).length, 2);
  const other = await fixture(t);
  await start(f, '请记住：项目 A 的另一项约定');
  await settle(f, { ...f.context(), cwd: other.cwd });
  assert.deepEqual(await other.memories(), []);
});

test('aborted and failed end events clear memory before settlement with a fresh signal', async t => {
  const f = await fixture(t);
  for (const stopReason of ['aborted', 'error']) {
    await start(f, '请记住：这是一条未完成约定', { ...f.context(), signal:new AbortController().signal });
    await f.handlers.message_end({ type:'message_end', message:{ role:'assistant', stopReason } }, f.context());
    await settle(f, { ...f.context(), signal:new AbortController().signal });
    assert.deepEqual(await f.memories(), []);
    await start(f, '请记住：另一条未完成约定');
    await f.handlers.agent_end({ type:'agent_end', messages:[{ role:'assistant', stopReason }] }, f.context());
    await settle(f);
    assert.deepEqual(await f.memories(), []);
  }
  await start(f, '请记住：关闭前的未完成约定');
  await f.handlers.session_shutdown({ type:'session_shutdown' }, f.context());
  await settle(f);
  assert.deepEqual(await f.memories(), []);
});
test('a settlement with an already aborted signal does not save', async t => {
  const f = await fixture(t);
  await start(f, '请记住：取消时不保存');
  const controller = new AbortController();
  controller.abort();
  await settle(f, { ...f.context(), signal:controller.signal });
  assert.deepEqual(await f.memories(), []);
});
test('overlong explicit facts are routed for summarization instead of silently truncated', async t => {
  const f = await fixture(t);
  const prompt = `请记住：项目规范：${'具体的规范内容。'.repeat(110)}`;
  assert.deepEqual(extractAutomaticMemoryCandidates([{ role:'user', content:prompt }]), []);
  assert.match((await start(f, prompt)).systemPrompt, /Summarize/);
  await settle(f);
  assert.deepEqual(await f.memories(), []);
});

test('the persistence boundary refuses empty directives and sensitive candidates before creating directories', async t => {
  const f = await fixture(t);
  assert.equal(await saveAutomaticMemories(f.cwd, [{ content: '记录到记忆中' }, { content: '请记住：password=not-a-real-credential' }]), 0);
  await assert.rejects(fs.stat(path.join(f.cwd, ROOT)), { code: 'ENOENT' });
});

test('memory writes refuse symlinked library and memory directories without touching the target', async t => {
  const f = await fixture(t);
  const outside = await fixture(t);
  await fs.symlink(outside.cwd, path.join(f.cwd, ROOT));
  await assert.rejects(saveAutomaticMemories(f.cwd, [{ content: '项目规范：统一采用 PinLayout' }]), /UNSAFE_WIKI_ROOT/);
  await assert.rejects(fs.stat(path.join(outside.cwd, 'memory')), { code: 'ENOENT' });
  await fs.unlink(path.join(f.cwd, ROOT));
  await fs.mkdir(path.join(f.cwd, ROOT));
  await fs.symlink(outside.cwd, path.join(f.cwd, MEMORY_ROOT));
  await assert.rejects(saveAutomaticMemories(f.cwd, [{ content: '项目规范：统一采用 PinLayout' }]), /UNSAFE_CONTEXT_DIRECTORY/);
  assert.deepEqual(await fs.readdir(outside.cwd), []);
});

test('legacy empty directives are excluded from injection without deleting user data', async t => {
  const f = await fixture(t);
  const entry = normalize({ kind: 'memory', category: 'memory', title: '记录到记忆中', content: '记录到记忆中', status: 'confirmed' });
  await fs.mkdir(path.join(f.cwd, MEMORY_ROOT), { recursive: true });
  await fs.writeFile(path.join(f.cwd, recordPath(entry)), encode(entry));
  assert.doesNotMatch(await readProjectContext(f.cwd), /- 记录到记忆中/);
  assert.equal((await f.memories()).length, 1);
});

test('injection uses read pointers instead of truncated facts for long indexed memories', async t => {
  const f = await fixture(t);
  const entries = [];
  await fs.mkdir(path.join(f.cwd, MEMORY_ROOT), { recursive: true });
  for (let i = 0; i < 10; i++) {
    const entry = normalize({ kind: 'memory', category: 'memory', title: `Rule ${i}`, content: `Unique rule body ${i} ${'details '.repeat(80)}`, status: 'confirmed' });
    entry.updatedAt = `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`;
    await fs.writeFile(path.join(f.cwd, recordPath(entry)), encode(entry));
    entries.push({ ...entry, path: recordPath(entry) });
  }
  const rows = entries.map(({ content, ...meta }) => meta);
  await fs.writeFile(path.join(f.cwd, MEMORY_ROOT, 'index.json'), JSON.stringify({ version: 1, section: 'memory', entries: rows }));
  const result = await readProjectContext(f.cwd);
  assert.doesNotMatch(result, /Unique rule body/);
  assert.ok(result.includes(recordPath(entries[9])));
  assert.match(result, /read full memory/);
  assert.ok(result.length <= 1200);
});

test('stored qualifications and prose that starts with a question word are included in full', async t => {
  const f = await fixture(t);
  const content = '是否具有发布权限由管理员确认。\n\n操作手册说明如何处理退款，业务规则必须保留这一条件。';
  assert.equal(usableMemory({ content }), true);
  assert.deepEqual(memoryRequest('项目规范是什么'), {});
  assert.equal(memoryRequest('请记住：上线前检查是否具有发布权限').content, '上线前检查是否具有发布权限');
  assert.equal(memoryRequest('请记住：如何处理退款以业务手册为准').content, '如何处理退款以业务手册为准');
  await writeEntry(f.cwd, normalize({ kind: 'memory', category: 'memory', title: 'Qualified release policy', status: 'confirmed', content }));
  const result = await readProjectContext(f.cwd);
  assert.match(result, /是否具有发布权限由管理员确认/);
  assert.match(result, /说明如何处理退款/);
});

test('guidance preserves complete rules in a document and distinguishes a failed memory link', async t => {
  const f = await fixture(t);
  const { systemPrompt } = await start(f, '把这份业务规则整理到记忆');
  for (const contract of ['action:"remember"', 'kind:"document"', 'full content', 'summary (at most 800', 'readWhen (at most 240', 'linked:true', 'linked:false', 'linkError', 'expectedRevision', 'recordId', 'personal absolute filesystem paths', 'docs-only save']) {
    assert.ok(systemPrompt.includes(contract), contract);
  }
  await settle(f);
  assert.deepEqual(await f.memories(), []);
});

test('the 800-character boundary is inclusive, preserves facts, and never truncates larger requests', async t => {
  const f = await fixture(t);
  const content = `我偏好${'确'.repeat(797)}`;
  assert.equal(content.length, 800);
  await start(f, `请记住：${content}`);
  await settle(f);
  assert.equal((await f.memories())[0].content, content);
  assert.deepEqual(memoryRequest(`请记住：${content}定`), { needsContext: true });
  assert.equal(await saveAutomaticMemories(f.cwd, [{ content: `${content}定` }]), 0);
  assert.equal((await f.memories()).length, 1);
});

test('legacy contextual process requests are ignored without removing their files', async t => {
  const f = await fixture(t);
  const content = '将我制作插件过程记录记忆';
  const entry = await writeEntry(f.cwd, normalize({ kind: 'memory', category: 'memory', title: content, content, status: 'confirmed' }));
  await writeIndex(f.cwd, 'memory', [entry]);
  assert.doesNotMatch(await readProjectContext(f.cwd), /将我制作插件过程记录记忆/);
  assert.equal((await f.memories())[0].content, content);
});

test('private personal paths and credentials do not become automatic memory', async t => {
  const f = await fixture(t);
  for (const content of ['请记住：构建目录为 /Users/example/build/output', '请记住：构建目录为 C:\\Users\\example\\build', '请记住：api_key=fixture-only']) {
    assert.deepEqual(extractAutomaticMemoryCandidates([{ role: 'user', content }]), []);
    assert.equal(await saveAutomaticMemories(f.cwd, [{ content }]), 0);
  }
  await assert.rejects(fs.stat(path.join(f.cwd, ROOT)), { code: 'ENOENT' });
});

test('indexed linked memory verifies actual identities and never injects full documents', async t => {
  const f = await linkedFixture(t);
  const unrelated = await writeEntry(f.cwd, normalize({ title: 'Unrelated', category: 'notes', kind: 'document', status: 'confirmed', content: 'Unrelated source body must never enter the prompt.' }));
  await writeIndex(f.cwd, 'knowledge', [f.document, unrelated]);
  const result = await readProjectContextStats(f.cwd);
  assert.match(result.text, /Confirmed release summary/);
  assert.ok(result.text.includes(stableRecordId(f.document)));
  assert.ok(result.text.includes(f.memory.documentRef.readWhen));
  assert.doesNotMatch(result.text, /Detailed procedure stays|Unrelated source body/);
  assert.deepEqual(result.reads, { index: 1, records: 1, knowledgeIndex: 1, documents: 2 });
  assert.ok(result.text.length <= 1200);
});

test('a stable link follows document title and category changes even with a stale index', async t => {
  const f = await linkedFixture(t);
  const moved = await writeEntry(f.cwd, normalize({ ...f.document, title: 'Current release rules', category: 'operations' }, f.document));
  assert.equal(stableRecordId(moved), stableRecordId(f.document));
  await fs.rm(path.join(f.cwd, f.document.path));
  const result = await start(f, 'Prepare the release');
  assert.match(result.systemPrompt, /Confirmed release summary/);
  assert.match(result.systemPrompt, /Current release rules/);
  assert.ok(result.systemPrompt.includes(stableRecordId(moved)));
  assert.ok(result.systemPrompt.includes(f.memory.documentRef.readWhen));
  assert.ok(!result.systemPrompt.includes(f.document.path));
  assert.equal((await f.memories())[0].revision, f.memory.revision);
});

test('body changes with a warm index suppress the old summary and retain the current read pointer', async t => {
  const f = await linkedFixture(t);
  await writeEntry(f.cwd, normalize({ ...f.document, content: 'Updated authoritative rules require a different authorization process.' }, f.document));
  const result = await readProjectContext(f.cwd);
  assert.doesNotMatch(result, /Confirmed release summary|Updated authoritative rules/);
  assert.match(result, /stale/i);
  assert.ok(result.includes(stableRecordId(f.document)));
  assert.ok(result.includes(f.memory.documentRef.readWhen));
});

test('archive, draft and deletion suppress linked summaries and identify the broken reference', async t => {
  for (const state of ['archived', 'draft', 'missing']) await t.test(state, async t => {
    const f = await linkedFixture(t);
    if (state === 'missing') await fs.rm(path.join(f.cwd, f.document.path));
    else await writeEntry(f.cwd, normalize({ ...f.document, status: state }, f.document));
    const result = await readProjectContext(f.cwd);
    assert.doesNotMatch(result, /Confirmed release summary/);
    assert.ok(result.toLowerCase().includes(state), result);
    assert.ok(result.includes(f.memory.documentRef.readWhen));
    assert.ok(result.includes(stableRecordId(f.document)));
  });
});

test('corrupt and oversized matching bodies are unavailable instead of cached facts', async t => {
  for (const indexed of [true, false]) await t.test(indexed ? 'indexed' : 'no index', async t => {
    const f = await linkedFixture(t, indexed);
    await fs.writeFile(path.join(f.cwd, f.document.path), encode({ ...f.document, kind: 'invalid-document-kind' }));
    let result = await readProjectContext(f.cwd);
    assert.doesNotMatch(result, /Confirmed release summary/);
    assert.match(result, /unreadable/i);
    await fs.writeFile(path.join(f.cwd, f.document.path), 'x'.repeat(256001));
    result = await readProjectContext(f.cwd);
    assert.doesNotMatch(result, /Confirmed release summary|x{100}/);
    assert.match(result, /unreadable/i);
  });
});

test('symlinked knowledge roots, categories and leaves never lend a summary or load an external body', async t => {
  for (const target of ['knowledge', 'category', 'leaf']) await t.test(target, async t => {
    const f = await linkedFixture(t);
    const outside = await fixture(t);
    const source = target === 'knowledge' ? KNOWLEDGE_ROOT : target === 'category' ? `${KNOWLEDGE_ROOT}/business` : f.document.path;
    const external = path.join(outside.cwd, target === 'leaf' ? 'external.md' : 'external');
    await fs.rename(path.join(f.cwd, source), external);
    await fs.symlink(external, path.join(f.cwd, source));
    const result = await readProjectContextStats(f.cwd);
    assert.doesNotMatch(result.text, /Confirmed release summary|Detailed procedure stays/);
    assert.match(result.text, /unreadable/i);
    assert.equal(result.reads.documents, 0);
  });
  const f = await fixture(t); const outside = await fixture(t);
  await fs.symlink(outside.cwd, path.join(f.cwd, ROOT));
  await assert.rejects(readProjectContext(f.cwd), /UNSAFE_WIKI_ROOT/);
});

test('absent and invalid knowledge indexes fall back to a bounded actual-document scan', async t => {
  const f = await linkedFixture(t, false);
  const unrelated = await writeEntry(f.cwd, normalize({ title: 'Other topic', category: 'notes', kind: 'document', content: 'Do not copy this body into context.' }));
  let result = await readProjectContextStats(f.cwd);
  assert.match(result.text, /Confirmed release summary/);
  assert.deepEqual(result.reads, { index: 0, records: 1, knowledgeIndex: 0, documents: 2 });
  await fs.writeFile(path.join(f.cwd, KNOWLEDGE_ROOT, 'index.json'), JSON.stringify({ version: 1, section: 'knowledge', entries: [{ ...unrelated, path: '../external.md' }] }));
  result = await readProjectContextStats(f.cwd);
  assert.match(result.text, /Confirmed release summary/);
  assert.doesNotMatch(result.text, /Do not copy this body/);
  assert.equal(result.reads.documents, 2);
});

test('duplicate active stable ids are ambiguous, including an unindexed duplicate, while archived copies do not conflict', async t => {
  const f = await linkedFixture(t);
  const duplicate = await writeEntry(f.cwd, normalize({ ...f.document, title: 'Duplicate release rules' }, f.document));
  let result = await readProjectContext(f.cwd);
  assert.match(result, /ambiguous/i);
  assert.doesNotMatch(result, /Confirmed release summary/);
  const archived = await writeEntry(f.cwd, normalize({ ...duplicate, status: 'archived' }, duplicate));
  await writeIndex(f.cwd, 'knowledge', [f.document, archived]);
  result = await readProjectContext(f.cwd);
  assert.match(result, /Confirmed release summary/);
  assert.doesNotMatch(result, /ambiguous/i);
});

test('failed memory body reads never promote cached index metadata into facts', async t => {
  const f = await fixture(t);
  const memory = await writeEntry(f.cwd, normalize({ title: 'Cached metadata must not be a fact', category: 'memory', kind: 'memory', status: 'confirmed', content: 'Actual body must not be replaced by its title.' }));
  await writeIndex(f.cwd, 'memory', [memory]);
  await fs.rm(path.join(f.cwd, memory.path));
  const result = await readProjectContextStats(f.cwd);
  assert.doesNotMatch(result.text, /Cached metadata must not be a fact|Actual body/);
  assert.deepEqual(result.reads, { index: 0, records: 0 });
});

test('ordinary memories perform no knowledge reads and preserve the existing stats shape', async t => {
  const f = await fixture(t); const outside = await fixture(t);
  await saveAutomaticMemories(f.cwd, [{ content: 'I prefer concise reviews.' }]);
  await fs.symlink(outside.cwd, path.join(f.cwd, KNOWLEDGE_ROOT));
  const result = await readProjectContextStats(f.cwd);
  assert.match(result.text, /I prefer concise reviews/);
  assert.deepEqual(result.reads, { index: 0, records: 1 });
  assert.deepEqual(await readProjectContextStats('relative-project'), { text: null, reads: { index: 0, records: 0 } });
});

test('an incomplete knowledge listing fails closed instead of trusting an indexed summary', async t => {
  const f = await linkedFixture(t);
  await Promise.all(Array.from({ length: 1001 }, (_, i) => fs.writeFile(path.join(f.cwd, KNOWLEDGE_ROOT, `extra-${i}.txt`), '')));
  const result = await readProjectContextStats(f.cwd);
  assert.doesNotMatch(result.text, /Confirmed release summary/);
  assert.match(result.text, /unreadable/i);
  assert.equal(result.reads.documents, 0);
});

test('user path: contextual rules are remembered with full documents, become stale after editing, and refresh together', async t => {
  const f = await fixture(t);
  assert.match((await start(f, '把这份业务规则整理到记忆')).systemPrompt, /action:"remember"/);
  const request = wiki(f.cwd);
  assert.equal((await request('snapshot')).initialized, false);
  await request('init');
  const input = { kind: 'document', category: 'business', status: 'confirmed', title: 'Refund rules', content: '# Refund rules\n\nPartial refunds must not exceed the amount paid.\n\nCheck whether the request has been approved before processing.\n\nThe full approval procedure belongs in this topic document.', summary: 'Refunds require approval and cannot exceed the amount paid.', readWhen: 'Before implementing or processing a refund.', source: 'docs/refund-rules.md; explicit user-confirmed rules' };
  const saved = await request('remember', input);
  assert.equal(saved.linked, true);
  assert.equal(saved.document.content, input.content);
  assert.equal(saved.memory.content, input.summary);
  assert.equal(saved.memory.documentRef.recordId, stableRecordId(saved.document));
  await settle(f);
  let next = await start(f, 'Implement a refund');
  assert.ok(next.systemPrompt.includes(input.summary));
  assert.ok(next.systemPrompt.includes(input.readWhen));
  assert.doesNotMatch(next.systemPrompt, /The full approval procedure/);
  const read = await request('read', { id: stableRecordId(saved.document), section: 'knowledge' });
  const edited = await request('save', { ...input, id: read.recordId, expectedRevision: read.revision, content: `${input.content}\n\nRefunds also require a current authorization check.` });
  next = await start(f, 'Continue the refund');
  assert.doesNotMatch(next.systemPrompt, /Refunds require approval and cannot exceed/);
  assert.match(next.systemPrompt, /stale/);
  const summary = 'Refunds require approval, a current authorization check, and the paid-amount limit.';
  const refreshed = await request('remember', { ...input, id: edited.recordId, expectedRevision: edited.revision, content: edited.content, summary });
  assert.equal(refreshed.linked, true);
  next = await start(f, 'Continue with current refund rules');
  assert.ok(next.systemPrompt.includes(summary));
  assert.equal((await f.memories()).length, 1);
  assert.deepEqual(f.notices, []);
});

test('legacy document metadata acquires a stable reference that survives a later topic move', async t => {
  const f = await fixture(t);
  const { recordId, ...legacy } = normalize({ title: 'Legacy rule topic', category: 'business', kind: 'document', status: 'confirmed', content: 'Established rules from a legacy document.' });
  const original = await writeEntry(f.cwd, legacy);
  assert.match(stableRecordId(original), /^legacy-[a-f0-9]{64}$/);
  await writeEntry(f.cwd, normalize({ title: 'Legacy summary', category: 'memory', kind: 'memory', status: 'confirmed', content: 'Legacy confirmed rules remain applicable.', documentRef: { recordId: stableRecordId(original), contentHash: documentContentHash(original), readWhen: 'Before changing established rules.' } }));
  const moved = await writeEntry(f.cwd, normalize({ ...original, title: 'Renamed legacy topic', category: 'operations' }, original));
  await fs.rm(path.join(f.cwd, original.path));
  const result = await readProjectContext(f.cwd);
  assert.match(result, /Legacy confirmed rules remain applicable/);
  assert.match(result, /Renamed legacy topic/);
  assert.ok(result.includes(stableRecordId(original)));
  assert.equal(stableRecordId(moved), stableRecordId(original));
});

test('cancellation during an automatic write leaves no saved record or temporary file', async t => {
  const f = await fixture(t);
  const controller = new AbortController();
  const open = fs.open;
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    if (args[1] === 'wx') controller.abort();
    return handle;
  });
  await assert.rejects(saveAutomaticMemories(f.cwd, [{ content: 'I prefer a concise release review.' }], controller.signal), { name: 'AbortError' });
  assert.deepEqual(await fs.readdir(path.join(f.cwd, MEMORY_ROOT)), []);
});

async function heldPreparation(t) {
  const f=await fixture(t);
  const entry=await writeEntry(f.cwd,normalize({kind:'memory',category:'memory',status:'confirmed',title:'Existing rule',content:'Keep review evidence.'}));
  await writeIndex(f.cwd,'memory',[entry]);
  let release, entered, held=false;
  const blocked=new Promise(resolve=>{release=resolve;});
  const ready=new Promise(resolve=>{entered=resolve;});
  const open=fs.open;
  t.mock.method(fs,'open',async (...args)=>{
    if(!held&&args[0]===path.join(f.cwd,MEMORY_ROOT,'index.json')) {held=true;entered();await blocked;}
    return open(...args);
  });
  t.after(()=>release());
  return {...f,ready,release};
}

test('invalidated preparations discard only their pending memory and produce no trace', async t => {
  for(const change of ['workspace','session','cancel']) await t.test(change,async t=>{
    const f=await heldPreparation(t), controller=new AbortController();
    let session='session-a';
    const ctx={...f.context(),sessionManager:{getSessionId:()=>session},signal:controller.signal};
    const pending=start(f,'请记住：本轮未完成约定不应保存',ctx);
    await f.ready;
    if(change==='workspace') ctx.cwd=(await fixture(t)).cwd;
    if(change==='session') session='session-b';
    if(change==='cancel') controller.abort();
    f.release();
    assert.equal(await pending,undefined);
    await settle(f,f.context());
    assert.deepEqual((await f.memories()).map(row=>row.content),['Keep review evidence.']);
    await assert.rejects(fs.access(path.join(f.cwd,MEMORY_ROOT,'recall-traces')),{code:'ENOENT'});
  });
});

test('a late preparation cannot discard a newer same-session memory candidate', async t=>{
  const f=await heldPreparation(t);
  const previous=start(f,'请记住：旧一轮约定');
  await f.ready;
  assert.match((await start(f,'请记住：新一轮约定')).systemPrompt,/automatic project memory/);
  f.release();assert.equal(await previous,undefined);
  await settle(f);
  assert.deepEqual(new Set((await f.memories()).map(row=>row.content)),new Set(['Keep review evidence.','新一轮约定']));
});

test('diagnostic write failure warns with a code and preserves prepared context', async t=>{
  const f=await fixture(t);
  await writeEntry(f.cwd,normalize({kind:'memory',category:'memory',status:'confirmed',title:'Existing rule',content:'Keep review evidence.'}));
  await fs.writeFile(path.join(f.cwd,MEMORY_ROOT,'recall-traces'),'occupied');
  const expected=await readProjectContext(f.cwd,{query:'Continue review'});
  assert.equal((await start(f,'Continue review')).systemPrompt,`BASE\n\n${expected}`);
  assert.ok(f.notices.some(row=>row.level==='warning'&&/diagnostics were not saved \([A-Z_]+\)/.test(row.message)));
  assert.equal(await fs.readFile(path.join(f.cwd,MEMORY_ROOT,'recall-traces'),'utf8'),'occupied');
});

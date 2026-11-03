import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import extension, { extractAutomaticMemoryCandidates, saveAutomaticMemories, readProjectContext } from './extension.mjs';
import core from './core.cjs';
import serviceModule from './service.cjs';
const { ROOT, MEMORY_ROOT, decode, encode, normalize, recordPath } = core;
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

test('queries and context-only commands are not automatic memory facts', () => {
  for (const content of ['记录到记忆中', '把刚才的开发规范记住', '把刚才讨论的开发规范记住', '请记住这个', '记忆开发要点', 'Remember this', 'Save the above to memory', '查看项目文档中是否有一个开发规范', '项目规范有哪些？', '项目规范是什么', '项目规范有哪些', 'How do I save this to memory?']) {
    assert.deepEqual(extractAutomaticMemoryCandidates([{ role: 'user', content }]), [], content);
  }
  const [candidate] = extractAutomaticMemoryCandidates([{ role: 'user', content: '请记住：本项目布局统一采用 PinLayout' }]);
  assert.equal(candidate.content, '本项目布局统一采用 PinLayout');
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
  assert.match(await readProjectContext(f.cwd), /使用已确认的组件约定/);
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

test('injection loads the newest indexed memory bodies and includes a read pointer for truncated text', async t => {
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
  assert.match(result, /Unique rule body 9/);
  assert.ok(result.includes(recordPath(entries[9])));
  assert.match(result, /…/);
  assert.ok(result.length <= 1200);
});

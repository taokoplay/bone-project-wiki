'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WikiService } = require('./service.cjs');
const { ROOT } = require('./core.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'wiki-html-preview-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let current = root;
  const reads = [];
  const api = {
    workspace: { get: async () => ({ path: current, name: 'HTML preview test' }) },
    fs: {
      readText: async p => { reads.push(p); return fs.readFile(path.join(current, p), 'utf8'); },
      writeText: async (p, value) => { const target = path.join(current, p); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, value); },
      remove: p => fs.rm(path.join(current, p), { recursive: true, force: true }),
      stat: async p => { const stat = await fs.stat(path.join(current, p)); return { size: stat.size, mtimeMs: stat.mtimeMs }; },
      list: async p => Promise.all((await fs.readdir(path.join(current, p), { withFileTypes: true })).map(async item => {
        const name = `${p}/${item.name}`; const stat = await fs.stat(path.join(current, name));
        return { name: item.name, path: name, isDirectory: item.isDirectory(), size: stat.size, mtimeMs: stat.mtimeMs };
      })),
      readPreview: async p => ({ dataUrl: `data:image/png;base64,${(await fs.readFile(path.join(current, p))).toString('base64')}` }),
    },
  };
  const service = new WikiService(api); service.racyWindowMs = 0;
  const request = (action, input = {}) => service.request({ action, workspacePath: root, ...input });
  await request('init');
  const put = (name, value) => api.fs.writeText(`${ROOT}/knowledge/产品设计/${name}`, value);
  return { root, api, request, put, reads, switchTo: value => { current = value; } };
}
const source = '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>完整产品设计</h1><button onclick="this.textContent=\'已切换\'">切换页面</button></body></html>';

test('user path: open an externally copied Chinese HTML file and retain its bytes and attachment identity', async t => {
  const f = await fixture(t); await f.put('完整产品与交互文档.html', source);
  const snapshot = await f.request('snapshot');
  const meta = snapshot.entries.find(row => row.id === '完整产品与交互文档.html');
  assert.equal(meta.kind, 'attachment');
  const entry = await f.request('read', { id: meta.id, section: 'knowledge' });
  assert.ok(entry.htmlPreview, 'ordinary HTML needs a preview, not only a file card');
  assert.equal(entry.htmlPreview.entryPath, meta.id);
  assert.equal(entry.htmlPreview.files[0].content, source);
  assert.equal(entry.kind, 'attachment');
  assert.equal(await f.api.fs.readText(meta.path), source);
  const after = await f.request('snapshot');
  assert.equal(after.entries.length, 1);
  assert.equal(after.entries[0].id, meta.id);
});

test('a warm legacy attachment cache and uppercase HTM still acquire preview data', async t => {
  const f = await fixture(t); await f.put('历史页面.HTM', source);
  const meta = (await f.request('snapshot')).entries[0];
  const old = new Date('2025-01-01T00:00:00.000Z'); await fs.utimes(path.join(f.root, meta.path), old, old);
  await f.request('reindex');
  assert.equal((await f.request('snapshot')).entries[0].kind, 'attachment');
  const entry = await f.request('read', { id: meta.id });
  assert.equal(entry.htmlPreview.files[0].content, source);
});

test('HTML attachments imported through the existing API reuse their stored local bundle', async t => {
  const f = await fixture(t);
  const saved = await f.request('import', { kind: 'attachment', category: '产品设计', title: '历史导入页面', files: [{ path: 'index.html', content: source }, { path: 'style.css', content: 'h1{color:green}' }] });
  const entry = await f.request('read', { id: saved.id });
  assert.equal(entry.kind, 'attachment');
  assert.equal(entry.htmlPreview.entryPath, 'index.html');
  assert.equal(entry.htmlPreview.files[0].content, source);
  assert.deepEqual(entry.htmlPreview.files.map(file => file.path), ['index.html', 'style.css']);
});

test('local styles, scripts and images are loaded once within the HTML directory', async t => {
  const f = await fixture(t);
  await f.put('页面.html', '<link rel="stylesheet" href="assets/主题.css"><script src="assets/app.js"></script><img src="assets/icon.png">');
  await f.put('assets/主题.css', '.card{background:url("../assets/icon.png")}');
  await f.put('assets/app.js', 'document.body.dataset.loaded="yes"');
  await f.put('assets/icon.png', Buffer.from([137, 80, 78, 71]));
  f.reads.length = 0;
  const entry = await f.request('read', { id: '页面.html' });
  assert.deepEqual(entry.htmlPreview.files.map(file => file.path).sort(), ['页面.html', 'assets/主题.css', 'assets/app.js', 'assets/icon.png'].sort());
  assert.equal(f.reads.filter(name => name.endsWith('assets/主题.css')).length, 1);
  assert.ok(entry.htmlPreview.files.find(file => file.path === 'assets/icon.png').dataUrl.startsWith('data:image/png;base64,'));
});

test('remote, absolute and escaping dependencies do not produce filesystem reads', async t => {
  const f = await fixture(t);
  await f.put('安全页面.html', '<script src="../outside.js"></script><script src="%2e%2e/outside.js"></script><script src="assets/../../../outside.js"></script><script src="https://example.invalid/remote.js"></script><link href="/private/style.css" rel="stylesheet"><img src="file:///private/image.png"><script src="C:\\private\\file.js"></script>');
  f.reads.length = 0;
  const entry = await f.request('read', { id: '安全页面.html' });
  assert.deepEqual(entry.htmlPreview.files.map(file => file.path), ['安全页面.html']);
  assert.ok(f.reads.every(name => name.startsWith(`${ROOT}/`)));
  assert.ok(!f.reads.some(name => /outside|remote|private/.test(name)));
});

test('missing optional assets preserve the page and report incomplete preview', async t => {
  const f = await fixture(t); await f.put('缺少资源.html', '<h1>仍可阅读</h1><script src="missing.js"></script>');
  const entry = await f.request('read', { id: '缺少资源.html' });
  assert.match(entry.htmlPreview.files[0].content, /仍可阅读/);
  assert.deepEqual(entry.htmlPreview.missing, ['missing.js']);
});

test('oversized and unreadable HTML return an explicit preview error while preserving the record', async t => {
  const f = await fixture(t); await f.put('过大页面.html', source);
  const stat = f.api.fs.stat;
  f.api.fs.stat = async name => name.endsWith('过大页面.html') ? { size: 10 * 1024 * 1024 + 1, mtimeMs: 0 } : stat(name);
  let entry = await f.request('read', { id: '过大页面.html' });
  assert.equal(entry.htmlPreview.error, 'HTML_PREVIEW_LIMIT');
  assert.equal(entry.path, `${ROOT}/knowledge/产品设计/过大页面.html`);
  f.api.fs.stat = stat;
  const read = f.api.fs.readText;
  f.api.fs.readText = async name => { if (name.endsWith('.html')) throw new Error('EACCES'); return read(name); };
  entry = await f.request('read', { id: '过大页面.html' });
  assert.equal(entry.htmlPreview.error, 'HTML_PREVIEW_UNAVAILABLE');
});

test('a project switch during preview reads cannot return old project contents', async t => {
  const f = await fixture(t); await f.put('切换页面.html', source);
  const read = f.api.fs.readText;
  f.api.fs.readText = async name => { const value = await read(name); if (name.endsWith('.html')) f.switchTo(`${f.root}/other`); return value; };
  await assert.rejects(f.request('read', { id: '切换页面.html' }), /WORKSPACE_CHANGED/);
});

test('dependency count and actual byte growth remain bounded after filesystem metadata checks', async t => {
  const f = await fixture(t);
  const source = Array.from({ length: 100 }, (_, index) => `<script src="assets/file-${index}.js"></script>`).join('');
  await f.put('资源过多.html', source);
  let entry = await f.request('read', { id: '资源过多.html' });
  assert.equal(entry.htmlPreview.error, 'HTML_PREVIEW_LIMIT');
  await f.put('实际内容过大.html', '<h1>small on disk</h1>');
  const read = f.api.fs.readText;
  f.api.fs.readText = async name => name.endsWith('实际内容过大.html') ? 'x'.repeat(10 * 1024 * 1024 + 1) : read(name);
  entry = await f.request('read', { id: '实际内容过大.html' });
  assert.equal(entry.htmlPreview.error, 'HTML_PREVIEW_LIMIT');
});

test('derived preview data is excluded from metadata summaries and managed writes', async t => {
  const f = await fixture(t);
  const saved = await f.request('import', { kind: 'attachment', category: '产品设计', title: '保留附件', files: [{ path: 'page.html', content: source }] });
  const entry = await f.request('read', { id: saved.id });
  assert.ok(entry.htmlPreview);
  const { summarize } = require('./core.cjs');
  assert.equal(summarize(entry).htmlPreview, undefined);
  await f.request('save', { ...entry, title: '更新标题', expectedRevision: entry.revision });
  assert.doesNotMatch(await f.api.fs.readText(saved.path), /"htmlPreview"/);
});

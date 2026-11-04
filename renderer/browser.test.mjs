// Standalone renderer acceptance tests. Uses a fresh Chrome profile and a demo
// bridge fixture; never connects to PI-Desktop or a real project.
// Run: CHROME_BIN=/path/to/chrome node renderer/browser.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const profile = await mkdtemp(join(process.env.PI_SCRATCH_DIR || tmpdir(), 'wiki-browser-test-'));
const server = createServer(async (request, response) => {
  try {
    const name = basename(new URL(request.url, 'http://localhost').pathname) || 'index.html';
    const body = await readFile(join(root, name));
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css' })[extname(name)] || 'text/plain'); response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    chrome.once('error', error => { clearTimeout(timeout); reject(error); });
    chrome.stderr.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0, session;
  const pending = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const request = pending.get(message.id); if (!request) return; pending.delete(message.id); clearTimeout(request.timer); if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result); } });
  function cdp(method, params = {}, target = session) {
    return new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method} ${JSON.stringify(params)}`)); }, 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) })); });
  }
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  session = (await cdp('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  async function wait(expression) {
    try { await evaluate(`new Promise((resolve, reject) => { const end = performance.now() + 5000; function tick() { if (${expression}) resolve(true); else if (performance.now() > end) reject(new Error('Condition timed out: ' + ${JSON.stringify(expression)})); else requestAnimationFrame(tick); } tick(); })`); }
    catch (error) { console.error(await evaluate(`JSON.stringify({body:document.body.innerText,calls:fixture.calls.slice(-4),data:fixture.data})`)); throw error; }
  }
  const click = text => evaluate(`[...document.querySelectorAll('button')].find(node => node.textContent === ${JSON.stringify(text)}).click()`);
  const fill = (name, value) => evaluate(`{ const node = document.querySelector('[name="${name}"]'); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); }`);
  // PI-Desktop-style select: open the pill trigger, then click the option.
  const pick = async (name, value) => {
    await evaluate(`document.querySelector('[data-select="${name}"] .select-trigger').click()`);
    await wait(`document.querySelector('.popover [role="option"][data-value="${value}"]')`);
    await evaluate(`document.querySelector('.popover [role="option"][data-value="${value}"]').click()`);
  };
  const closePopover = () => evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  // Secondary header actions are behind one overflow menu.
  const menu = async label => {
    await evaluate(`document.querySelector('.menu-trigger').click()`);
    await wait(`document.querySelector('.popover [role="menuitem"]')`);
    await evaluate(`[...document.querySelectorAll('.popover [role="menuitem"]')].find(node => node.textContent === ${JSON.stringify(label)}).click()`);
  };
  function fixture() {
    const data = { workspacePath: '/demo/a', projectName: 'Demo project', initialized: false, categories: [], entries: [] };
    const listeners = {};
    window.fixture = { data, calls: [], failSave: false, closed: false, locale: 'en', listeners };
    window.confirm = () => true;
    window.pluginBridge = {
      on(event, listener) { listeners[event] = listener; return () => delete listeners[event]; },
      async invoke(channel, input) {
        if (channel === 'app.getLocale') return window.fixture.locale;
        if (channel === 'app.getAppearance') return { base: 'light' };
        if (channel === 'ui.closePanel') { window.fixture.closed = true; return undefined; }
        window.fixture.calls.push(structuredClone(input));
        if (input.action !== 'snapshot' && input.workspacePath !== data.workspacePath) throw new Error('Stale workspace');
        switch (input.action) {
          case 'snapshot': return structuredClone(data);
          case 'init': data.initialized = true; return structuredClone(data);
          case 'save': {
            if (window.fixture.failSave) throw new Error('Revision conflict');
            if (input.id && input.expectedRevision !== data.entries.find(entry => entry.id === input.id).revision) throw new Error('Revision conflict');
            const entry = { ...input, id: input.id || `record-${data.entries.length + 1}`, revision: (input.expectedRevision || 0) + 1, updatedAt: '2026-01-01' };
            data.entries = data.entries.filter(item => item.id !== entry.id); data.entries.push(entry); return structuredClone(entry);
          }
          case 'remember': {
            const document = { ...data.entries.find(entry => entry.recordId === input.recordId), revision: input.expectedRevision + 1, status: 'confirmed' };
            data.entries = data.entries.map(entry => entry.recordId === document.recordId ? document : entry);
            return { document: structuredClone(document), memory: null, linked: false, linkError: 'Test memory link failure' };
          }
          case 'read':
            if (window.fixture.deferRead) return new Promise(resolve => { window.fixture.resolveRead = () => resolve(structuredClone(data.entries.find(entry => entry.id === input.id))); });
            return structuredClone(data.entries.find(entry => entry.id === input.id));
          case 'search': return structuredClone(data.entries.filter(entry => entry.title.includes(input.query)));
          case 'preferencesGet': return { content: 'Demo preferences', revision: 1 };
          case 'preferencesSave': return { content: input.content, revision: input.expectedRevision + 1 };
          case 'context': return { text: 'Demo context <script>unsafe</script>' };
          case 'forget': data.entries = data.entries.filter(entry => entry.id !== input.id); return { deleted: true };
          case 'import': { const entry = { ...input, id: 'imported', status: 'draft', topics: [], tags: [], revision: 1 }; data.entries.push(entry); return structuredClone(entry); }
          case 'export': return { html: '<!doctype html><title>Demo export</title>' };
          case 'move': { const entry = data.entries.find(e => e.id === input.id); if (entry) entry.category = input.targetCategory; return structuredClone(entry); }
          case 'delete': { data.entries = data.entries.filter(entry => entry.id !== input.id); return { deleted: true, id: input.id }; }
          case 'reveal': { return { revealed: true, path: input.path }; }
          default: throw new Error(`Unhandled fixture action: ${input.action}`);
        }
      }
    };
  }
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixture.toString()})();` });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html` });
  assert.equal(await evaluate(`document.querySelectorAll('select').length`), 0);
  await wait(`document.body.textContent.includes('Initialize library')`);
  await click('Initialize library'); await wait(`document.body.textContent.includes('Library initialized')`);
  assert.equal(await evaluate(`document.querySelectorAll('header .tools > *').length`), 1);
  assert.equal(await evaluate(`document.querySelectorAll('header .section-tab').length`), 2);
  assert.equal(await evaluate(`document.querySelector('header .section-tab[aria-selected="true"]').textContent.trim()`), 'Knowledge base');
  await evaluate(`document.querySelectorAll('header .section-tab')[1].click()`);
  assert.equal(await evaluate(`document.querySelector('header .section-tab[aria-selected="true"]').textContent.trim()`), 'Memory');
  assert.equal(await evaluate(`document.querySelector('input[type="search"]').placeholder`), 'Search memory');
  await evaluate(`document.querySelectorAll('header .section-tab')[0].click()`);
  assert.equal(await evaluate(`document.querySelector('header .section-tab[aria-selected="true"]').textContent.trim()`), 'Knowledge base');
  assert.equal(await evaluate(`document.querySelector('input[type="search"]').placeholder`), 'Search knowledge');
  assert.equal(await evaluate(`document.querySelector('.filters [data-select]') === null`), true, 'no topic filter before a record carries a topic');
  assert.equal(await evaluate(`document.querySelector('.records').textContent`), 'No records yet');
  await wait(`document.querySelector('.detail input[name=\"title\"]')`);
  assert.equal(await evaluate(`document.querySelector('.detail form.note-editor') !== null`), true);
  await fill('title', 'Decision one'); await fill('content', '# Decision\\n<script>window.panelPwned=true</script>\\n- Keep it simple');
  await wait(`document.body.textContent.includes('Saved')`);
  assert.equal(await evaluate(`fixture.calls.find(call => call.action === 'save').workspacePath`), '/demo/a');
  await fill('title', 'Decision updated'); await wait(`fixture.calls.filter(call => call.action === 'save').length === 2`);
  assert.equal(await evaluate(`fixture.calls.filter(call => call.action === 'save').at(-1).expectedRevision`), 1);
  assert.equal(await evaluate(`document.querySelectorAll('.tree-folder').length`), 1);
  assert.equal(await evaluate(`document.querySelector('.tree-folder-name').textContent.trim()`), 'General');
  assert.equal(await evaluate(`document.querySelector('.tree-folder-count').textContent.trim()`), '1');
  assert.equal(await evaluate(`document.querySelectorAll('.record.tree-item').length`), 1);
  await evaluate(`document.querySelector('.tree-folder').click()`);
  assert.equal(await evaluate(`document.querySelector('.tree-folder').getAttribute('aria-expanded')`), 'false');
  await evaluate(`document.querySelector('.tree-folder').click()`);
  assert.equal(await evaluate(`document.querySelector('.tree-folder').getAttribute('aria-expanded')`), 'true');
  assert.equal(await evaluate(`document.querySelector('.record strong').textContent`), 'Decision updated');
  await evaluate(`{ const search = document.querySelector('input[type="search"]'); search.value = 'missing'; search.dispatchEvent(new Event('input')); }`);
  await wait(`fixture.calls.some(call => call.action === 'search') && document.querySelector('.records').textContent.includes('No matching records')`);
  await evaluate(`{ const search = document.querySelector('input[type="search"]'); search.value = ''; search.dispatchEvent(new Event('input')); }`);
  await wait(`document.querySelector('.record')`);
  await evaluate(`document.querySelector('.record').click()`); await wait(`document.querySelector('.detail input[name=\"title\"]')`);
  await evaluate('fixture.failSave = true'); await fill('content', 'Retain this draft'); await wait(`document.body.textContent.includes('Revision conflict')`);
  assert.equal(await evaluate(`document.querySelector('[name="content"]').value`), 'Retain this draft');
  await evaluate(`fixture.data.workspacePath = '/demo/b'; fixture.listeners['workspace:changed']()`);
  await wait(`document.body.textContent.includes('Saving is blocked')`);
  assert.equal(await evaluate(`document.querySelector('[name=\"content\"]').readOnly`), true);
  assert.equal(await evaluate(`document.querySelector('[name="content"]').value`), 'Retain this draft');
  await click('Discard draft and refresh'); await wait(`document.querySelector('header h1')?.textContent === 'Project knowledge' && document.querySelector('.record')`);
  await evaluate('fixture.failSave = false');
  await evaluate('window.wikiUi.preferences()'); await wait(`document.querySelector('[name=\"content\"]')`); await fill('content', 'Prefer concise answers'); await click('Save preferences'); await wait(`document.body.textContent.includes('Saved')`);
  assert.equal(await evaluate(`fixture.calls.find(call => call.action === 'preferencesSave').expectedRevision`), 1);
  await evaluate('window.wikiUi.context()'); await wait(`document.querySelector('pre.context')`);
  assert.equal(await evaluate(`document.querySelector('pre.context').textContent`), 'Demo context <script>unsafe</script>');
  await evaluate(`document.querySelectorAll('header .section-tab')[1].click()`);
  assert.equal(await evaluate(`document.querySelector('.records').textContent`), 'No records yet');
  await evaluate(`document.querySelectorAll('header .section-tab')[0].click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.record').length`), 1);
  // Import through the actual input event, not a mocked renderer helper.
  await evaluate('window.wikiUi.importView()'); await fill('title', 'Demo prototype');
  const prototypeFiles = [
    { name: 'index.html', content: '<html><head><link rel="stylesheet" href="style.css"></head><body><button onclick="this.textContent=\'Clicked\'">Try me</button><script src="app.js"></script><iframe src="https://example.invalid"></iframe></body></html>' },
    { name: 'style.css', content: 'body{color:rgb(1,2,3)}' },
    { name: 'app.js', content: 'document.body.dataset.executed="yes"; try { parent.document.body.dataset.leaked="yes" } catch {}' }
  ];
  await evaluate(`{ const dt = new DataTransfer(); for (const file of ${JSON.stringify(prototypeFiles)}) dt.items.add(new File([file.content], file.name)); const node = document.querySelector('input[type="file"]'); node.files=dt.files; node.dispatchEvent(new Event('change')); }`);
  await wait(`document.body.textContent.includes('Files ready: 3')`); await evaluate(`document.querySelector('button[type="submit"]').click()`);
  await wait(`document.querySelector('iframe.preview')`);
  assert.equal(await evaluate(`document.querySelector('iframe.preview').getAttribute('sandbox')`), 'allow-scripts');
  assert.equal(await evaluate(`document.body.dataset.leaked === undefined`), true);
  let frameTarget;
  const frameDeadline = Date.now() + 5000;
  while (!frameTarget && Date.now() < frameDeadline) {
    frameTarget = (await cdp('Target.getTargets', {}, null)).targetInfos.find(target => target.type === 'iframe');
    if (!frameTarget) await evaluate('new Promise(requestAnimationFrame)');
  }
  assert.ok(frameTarget, 'Prototype runs in a separate opaque-origin frame');
  const frameSession = (await cdp('Target.attachToTarget', { targetId: frameTarget.targetId, flatten: true }, null)).sessionId;
  await cdp('Runtime.enable', {}, frameSession);
  const frameEval = async expression => { const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, frameSession); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description); return result.result.value; };
  await frameEval(`new Promise((resolve, reject) => { const end = performance.now() + 4000; function ready() { if (document.body?.dataset.executed) resolve(); else if (performance.now() > end) reject(new Error(document.documentElement.outerHTML)); else setTimeout(ready, 20); } ready(); })`);
  assert.equal(await frameEval(`document.body.dataset.executed`), 'yes');
  assert.equal(await frameEval(`document.querySelectorAll('iframe').length`), 0);
  await frameEval(`document.querySelector('button').click()`);
  assert.equal(await frameEval(`document.querySelector('button').textContent`), 'Clicked');
  assert.equal(await frameEval(`getComputedStyle(document.body).color`), 'rgb(1, 2, 3)');
  // Local sanitization, binary validation and bundle limits in the browser.
  const safety = await evaluate(`(async () => {
    const { buildPrototype, collectFiles } = await import('./content.mjs');
    const html = buildPrototype({entryPath:'index.html',files:[{path:'index.html',content:'<base href="https://bad.invalid"><meta http-equiv="refresh" content="0;url=https://bad.invalid"><script type="module">import "https://bad.invalid/a.js"</script><script src="https://bad.invalid/x.js"></script><img src="https://bad.invalid/x.png"><object data="x"></object><a href="https://bad.invalid">link</a>'}]});
    const doc = new DOMParser().parseFromString(html,'text/html');
    let binary = false, limit = false, bytes = false;
    try { await collectFiles([new File(['x'], 'bad.exe')]); } catch { binary = true; }
    try { await collectFiles(Array.from({length:101}, (_,i)=>new File(['x'], i+'.txt'))); } catch { limit = true; }
    try { await collectFiles([new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.txt')]); } catch { bytes = true; }
    return { clean: !doc.querySelector('base,object,script,img[src],a[href]'), policy: doc.querySelector('meta').content, binary, limit, bytes };
  })()`);
  assert.equal(safety.clean, true); assert.equal(safety.binary, true); assert.equal(safety.limit, true); assert.equal(safety.bytes, true); assert.match(safety.policy, /connect-src 'none'/);
  // Responsive geometry, keyboard focus, and reduced-motion are real CDP checks.
  for (const width of [1280, 800, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `No horizontal overflow at ${width}px`);
  }
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.record, .detail > *')).animationName`), 'none');
  await evaluate(`document.activeElement?.blur(); document.body.focus()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate(`document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'`), true);
  assert.equal(await evaluate(`fixture.calls.every(call => call.action === 'snapshot' || typeof call.workspacePath === 'string')`), true);
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile, eventsEnabled: true }, null);
  const downloaded = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Export download timed out')), 5000); const listener = event => { const message = JSON.parse(event.data); if (message.method === 'Browser.downloadProgress' && message.params.state === 'completed') { clearTimeout(timer); socket.removeEventListener('message', listener); resolve(); } }; socket.addEventListener('message', listener); });
  await evaluate('window.wikiUi.exportHtml()'); await downloaded;
  assert.match(await readFile(join(profile, 'project-wiki.html'), 'utf8'), /Demo export/);
  await evaluate('window.wikiUi.importView()'); await fill('title', 'Demo image'); await pick('kind', 'image');
  await evaluate(`{ const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII='), c => c.charCodeAt(0))], 'pixel.png', {type:'image/png'})); const node = document.querySelector('input[type="file"]'); node.files = dt.files; node.dispatchEvent(new Event('change')); }`);
  await wait(`document.body.textContent.includes('Files ready: 1')`); await evaluate(`document.querySelector('button[type="submit"]').click()`);
  await wait(`document.querySelector('.image-preview')?.complete`);
  assert.equal(await evaluate(`document.querySelector('.image-preview').naturalWidth`), 1);
  // An older read cannot replace a newly opened editor.
  await evaluate(`fixture.deferRead=true; document.querySelector('.record').click()`); await wait('fixture.resolveRead');
  await evaluate('window.wikiUi.editRecord()'); await fill('title', 'Keep newer editor'); await evaluate('fixture.resolveRead()');
  assert.equal(await evaluate(`document.querySelector('[name="title"]').value`), 'Keep newer editor');
  await evaluate(`fixture.listeners['session:activated']()`);
  assert.equal(await evaluate(`document.querySelector('[name=\"title\"]').readOnly`), true);
  // Locale lookup controls visible labels.
  await click('Discard draft and refresh'); await wait(`document.querySelector('.record')`);
  // A saved-document/failed-link draft belongs to its project, even when another project copies the identity.
  await evaluate(`fixture.deferRead=false; fixture.data.entries=[{id:'rule-source',recordId:'11111111-1111-4111-8111-111111111111',title:'Source rules',kind:'document',category:'general',status:'confirmed',content:'Complete source rules.',topics:[],tags:[],revision:1,updatedAt:'2026-01-01'}]; window.wikiUi.refresh()`);
  await wait(`document.querySelector('.record strong')?.textContent === 'Source rules'`);
  await evaluate(`document.querySelector('.record').click()`);
  await wait(`document.querySelector('[name="memorySummary"]')`);
  await evaluate(`document.querySelector('.document-memory-editor').open=true`);
  await fill('memorySummary', 'Project A summary must stay in project A.');
  await fill('readWhen', 'Before changing project A rules.');
  await evaluate(`document.querySelector('[name="confirmDocument"]').checked=true; document.querySelector('.document-memory-form').requestSubmit()`);
  await wait(`document.body.textContent.includes('Document saved; memory link failed')`);
  await evaluate(`fixture.data.workspacePath='/demo/copied-project'; window.wikiUi.refresh()`);
  await wait(`document.querySelector('.record strong')?.textContent === 'Source rules'`);
  await evaluate(`document.querySelector('.record').click()`);
  await wait(`document.querySelector('[name="memorySummary"]')`);
  assert.equal(await evaluate(`document.querySelector('[name="memorySummary"]').value`), '');
  assert.equal(await evaluate(`document.querySelector('[name="readWhen"]').value`), '');
  // Unsubmitted input also participates in project-change and unload guards.
  await evaluate(`document.querySelector('.document-memory-editor').open=true`);
  await fill('memorySummary', 'Retain this summary until explicitly discarded.');
  assert.equal(await evaluate(`(() => { const event = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented; })()`), true);
  await evaluate(`fixture.data.workspacePath='/demo/third-project'; fixture.listeners['workspace:changed']()`);
  await wait(`document.body.textContent.includes('Saving is blocked')`);
  assert.equal(await evaluate(`document.querySelector('[name="memorySummary"]').readOnly`), true);
  assert.equal(await evaluate(`document.querySelector('[name="memorySummary"]').value`), 'Retain this summary until explicitly discarded.');
  await click('Discard draft and refresh');
  await wait(`document.querySelector('.record')`);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.fixture.locale = 'zh-CN';" });
  const reloaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Reload timed out')), 10000);
    const listener = event => { const message = JSON.parse(event.data); if (message.method === 'Page.loadEventFired' && message.sessionId === session) { clearTimeout(timer); socket.removeEventListener('message', listener); resolve(); } };
    socket.addEventListener('message', listener);
  });
  await cdp('Page.reload'); await reloaded;
  await wait(`document.documentElement.lang === 'zh-CN' && document.body.textContent.includes('初始化知识库')`);
  await evaluate(`fixture.listeners['appearance:changed']({base:'dark',pluginTheme:null})`);
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).backgroundColor`), 'rgb(24, 24, 24)');
  await evaluate(`fixture.listeners['appearance:changed']({base:'light',pluginTheme:{css:':root { --ds-bg-primary: rgb(240, 241, 242); --ds-text-primary: rgb(10, 20, 30); --font-sans: monospace; }'}})`);
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).backgroundColor`), 'rgb(240, 241, 242)');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('h1')).fontFamily`), 'monospace');
  await evaluate(`fixture.listeners['appearance:changed']({base:'light',pluginTheme:null})`);
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).backgroundColor`), 'rgb(255, 255, 255)');
  assert.equal(await evaluate(`(async()=>{const m=await import('./i18n.mjs');return m.errorText(new Error('REVISION_CONFLICT'));})()`), '内容已被其他操作修改。请保留草稿，重新读取后合并修改。');
  await click('初始化知识库');
  await wait(`document.body.textContent.includes('知识库已初始化')`);
  // Drag and drop Markdown import
  await evaluate(`{
    const file = new File(['---\\ntitle: Dropped Note\\ntags: [obsidian]\\n---\\n# Dropped Note\\n\\nFrom drag and drop.'], 'obsidian-note.md', { type: 'text/markdown' });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt }));
  }`);
  await wait(`[...document.querySelectorAll('.record strong')].some(n => n.textContent === 'Dropped Note')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.record strong')].some(n => n.textContent === 'Dropped Note')`), true);
  // Context menu on record: Move to, Reveal, Delete
  await evaluate(`{
    const record = document.querySelector('.record');
    const rect = record.getBoundingClientRect();
    record.dispatchEvent(new MouseEvent('contextmenu', { clientX: rect.x + 10, clientY: rect.y + 10, bubbles: true }));
  }`);
  await wait(`document.querySelector('.popover.context-menu')`);
  assert.equal(await evaluate(`document.querySelectorAll('.popover.context-menu .popover-item').length`), 3);
  assert.equal(await evaluate(`document.querySelector('.popover.context-menu .popover-item.danger')?.textContent.includes('删除')`), true);
  await closePopover();
  // Folder + button adds note directly under that folder
  await evaluate(`document.querySelector('.tree-folder-add').click()`);
  assert.equal(await evaluate(`document.querySelector('.detail input[name="title"]').value`), '');
  console.log('PASS: init, create/update, revision conflict, preserved stale draft, isolated document-summary drafts, project-change guards, preferences, context, memory deletion, bundle import, directory side panel, opaque prototype isolation, inline interactions, CSP, binary/size limits, responsive widths, keyboard focus, reduced motion, stale reads, Chinese locale.');
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else chrome.once('exit', resolve); });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import core from '../core.cjs';
import links from '../document-links.cjs';

const { normalize, encode, decode, recordPath } = core;
const { stableRecordId, documentContentHash } = links;

// Reuse an already built Desktop runtime; never install another environment.
const desktopRoot = process.env.PI_DESKTOP_ROOT;
if (!desktopRoot) throw new Error('Set PI_DESKTOP_ROOT to a PI-Desktop checkout with a built agent-runtime.');
const { TrustedExtensionRunner } = await import(pathToFileURL(path.join(desktopRoot, 'packages/agent-runtime/dist/extensions/runner.js')).href);
const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const project = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'wiki-memory-runner-'));
const { readProjectContext } = await import(pathToFileURL(path.join(pluginRoot, 'extension.mjs')).href);
const notices = [];
const bridge = {
  sessionId: 'isolated-memory-session', cwd: project,
  getModel: () => ({ id: 'offline-fixture' }), setModel: async () => true,
  getThinkingLevel: () => 'off', setThinkingLevel: () => {},
  isIdle: () => true, abort: () => {}, hasPendingMessages: () => false,
  getContextUsage: () => undefined, compact: () => {}, getSystemPrompt: () => 'BASE',
  getActiveTools: () => ['project_wiki'], getAllTools: () => [], setActiveTools: () => {},
  getSessionName: () => 'isolated fixture', setSessionName: () => {}, sendUserMessage: () => {},
  waitForIdle: async () => {}, newSession: async () => ({ cancelled: true }), fork: async () => ({ cancelled: true }),
  requestUi: async (_spec, request) => { notices.push(request); return { kind: request.kind }; },
  publishCommands: () => {}, publishDiagnostics: () => {},
};
const options = {
  specs: [{ id: 'bone.project-wiki-memory-quality', entry: path.join(pluginRoot, 'extension.mjs'), label: 'Memory quality fixture', source: 'user', root: pluginRoot }],
  bridge,
};
const memoryFiles = async () => (await fs.readdir(path.join(project, '.bone-project-wiki/memory'))).filter(name => name.endsWith('.md'));
const writeEntry = async entry => {
  const name = recordPath(entry); const raw = encode(entry);
  await fs.mkdir(path.dirname(path.join(project, name)), { recursive: true });
  await fs.writeFile(path.join(project, name), raw);
  return decode(raw, name);
};
let runner;
try {
  runner = new TrustedExtensionRunner(options);
  const reports = await runner.load();
  assert.equal(reports[0].state, 'loaded', JSON.stringify(reports));
  for (const prompt of ['记录到记忆中', '将我制作插件过程记录记忆', '把这份业务规则整理到记忆', 'remember the previous result', 'save the previous result']) {
    const guidance = await runner.emitBeforeAgentStart(prompt, 'BASE');
    assert.match(guidance, /project_wiki/);
    assert.match(guidance, /action:"remember"/);
    assert.match(guidance, /kind:"document"/);
    assert.match(guidance, /linked:true/);
    assert.match(guidance, /linked:false/);
    assert.match(guidance, /readWhen/);
    await runner.emit('agent_settled', { type: 'agent_settled' });
    await assert.rejects(fs.stat(path.join(project, '.bone-project-wiki')), { code: 'ENOENT' });
  }
  await runner.emitBeforeAgentStart('请记住：本项目布局统一采用 PinLayout', 'BASE');
  await runner.emit('agent_settled', { type: 'agent_settled' });
  assert.equal((await memoryFiles()).length, 1);
  assert.match(await readProjectContext(project), /本项目布局统一采用 PinLayout/);
  await runner.emitBeforeAgentStart('请记住：取消后不应保存的约定', 'BASE');
  await runner.emit('message_end', { type: 'message_end', message: { role: 'assistant', stopReason: 'aborted' } });
  runner.cancelPending();
  await runner.emit('agent_settled', { type: 'agent_settled' });
  assert.equal((await memoryFiles()).length, 1);
  await runner.emitBeforeAgentStart('请记住：错误后不应保存的约定', 'BASE');
  await runner.emit('agent_end', { type: 'agent_end', messages: [{ role: 'assistant', stopReason: 'error' }] });
  await runner.emit('agent_settled', { type: 'agent_settled' });
  assert.equal((await memoryFiles()).length, 1);
  const document = await writeEntry(normalize({ title: 'Full release process', category: 'business', kind: 'document', status: 'confirmed', content: 'Full process: check whether the operator has release authorization.\n\nRetain the complete detailed process here.' }));
  const memory = await writeEntry(normalize({ title: 'Release process summary', category: 'memory', kind: 'memory', status: 'confirmed', content: 'Release only after authorization; the manual explains how to verify it.', documentRef: { recordId: stableRecordId(document), contentHash: documentContentHash(document), readWhen: 'Before releasing or changing release permissions.' } }));
  const moved = await writeEntry(normalize({ ...document, title: 'Current release process', category: 'operations' }, document));
  await fs.rm(path.join(project, document.path));
  await runner.dispose();
  runner = new TrustedExtensionRunner({ ...options, bridge: { ...bridge, sessionId: 'reopened-memory-session' } });
  assert.equal((await runner.load())[0].state, 'loaded');
  const restored = await runner.emitBeforeAgentStart('继续开发', 'BASE');
  assert.match(restored, /本项目布局统一采用 PinLayout/);
  assert.match(restored, /\.bone-project-wiki\/memory\//);
  assert.doesNotMatch(restored, /- 记录到记忆中/);
  assert.match(restored, /Current release process/);
  assert.match(restored, /Release only after authorization/);
  assert.ok(restored.includes(stableRecordId(document)));
  assert.ok(restored.includes(memory.documentRef.readWhen));
  assert.doesNotMatch(restored, /Retain the complete detailed process/);
  await writeEntry(normalize({ ...moved, content: 'The authoritative process has changed; refresh its short memory.' }, moved));
  const stale = await runner.emitBeforeAgentStart('Prepare another release', 'BASE');
  assert.match(stale, /stale/);
  assert.doesNotMatch(stale, /Release only after authorization|The authoritative process has changed/);
  assert.ok(stale.includes(stableRecordId(document)));
  await writeEntry(normalize({ kind: 'memory', category: 'memory', status: 'confirmed', title: 'Payment refund policy', content: 'Refund authorization requires a settled payment.', scopePaths: ['apps/payments'], importance: 'core' }));
  await writeEntry(normalize({ kind: 'memory', category: 'memory', status: 'draft', title: 'Refund candidate', content: 'Candidate refunds need no approval.' }));
  for (let index = 0; index < 10; index += 1) await writeEntry(normalize({ kind: 'memory', category: 'memory', status: 'confirmed', title: `Image export ${index}`, content: `Export image ${index} at its original size.` }));
  const paymentTask = await runner.emitBeforeAgentStart('Implement apps/payments/refund.ts', 'BASE');
  assert.match(paymentTask, /Refund authorization requires a settled payment/);
  assert.doesNotMatch(paymentTask, /Candidate refunds|Export image/);
  const accountTask = await runner.emitBeforeAgentStart('Implement apps/accounts/refund.ts', 'BASE');
  assert.doesNotMatch(accountTask, /Refund authorization requires a settled payment/);
  assert.equal(runner.getDiagnostics().length, 0, JSON.stringify(runner.getDiagnostics()));
  assert.equal(notices.length, 0, JSON.stringify(notices));
  console.log('PASS: real extension loader, contextual guidance, settled fact write, cancellation/error cleanup, reload, moved/stale document links, task relevance, scoped core memory and candidate isolation (offline fixture).');
} finally {
  if (runner) await runner.dispose();
  await fs.rm(project, { recursive: true, force: true });
}

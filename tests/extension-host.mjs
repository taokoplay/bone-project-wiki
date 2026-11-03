import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
let runner;
try {
  runner = new TrustedExtensionRunner(options);
  const reports = await runner.load();
  assert.equal(reports[0].state, 'loaded', JSON.stringify(reports));
  const guidance = await runner.emitBeforeAgentStart('记录到记忆中', 'BASE');
  assert.match(guidance, /project_wiki/);
  assert.match(guidance, /kind.*memory/);
  await runner.emit('agent_settled', { type: 'agent_settled' });
  await assert.rejects(fs.stat(path.join(project, '.bone-project-wiki')), { code: 'ENOENT' });
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
  await runner.dispose();
  runner = new TrustedExtensionRunner({ ...options, bridge: { ...bridge, sessionId: 'reopened-memory-session' } });
  assert.equal((await runner.load())[0].state, 'loaded');
  const restored = await runner.emitBeforeAgentStart('继续开发', 'BASE');
  assert.match(restored, /本项目布局统一采用 PinLayout/);
  assert.match(restored, /\.bone-project-wiki\/memory\//);
  assert.doesNotMatch(restored, /- 记录到记忆中/);
  assert.equal(runner.getDiagnostics().length, 0, JSON.stringify(runner.getDiagnostics()));
  assert.equal(notices.length, 0, JSON.stringify(notices));
  console.log('PASS: real extension loader, contextual guidance, settled fact write, cancellation/error cleanup, reload and next-turn restoration (offline fixture).');
} finally {
  if (runner) await runner.dispose();
  await fs.rm(project, { recursive: true, force: true });
}

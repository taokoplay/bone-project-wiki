'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fixture, deferred, core } = require('./tests/operation-fixture.cjs');

function toolDefaults() {
  return {
    action:'snapshot', category:'', content:'', entryPath:'', expectedRevision:'',
    explain:false, files:[], id:'', importance:'normal', kind:'document',
    memoryMode:'manual', path:'', paths:[], query:'', readWhen:'', recordId:'',
    scopePaths:[], section:'knowledge', since:'', source:'', status:'confirmed',
    summary:'', tags:[], targetCategory:'', title:'', topics:[], workspacePath:'',
  };
}

async function uninitialized(t) {
  const f = await fixture(t, { documents:0, linked:0 });
  await fs.unlink(path.join(f.root, core.ROOT, 'project.json'));
  f.reset();
  return f;
}

test('snapshot discovers the actual workspace with omitted, empty or stale hints, before and after initialization', async t => {
  const f = await uninitialized(t);
  const hints = [undefined, '', '/workspace/stale-project', f.root + '/', f.root + '/nested', f.root];
  for (const initialized of [false, true]) {
    if (initialized) await f.request('init');
    f.reset();
    for (const workspacePath of hints) {
      const input = workspacePath === undefined ? { action:'snapshot' } : { action:'snapshot', workspacePath };
      const snapshot = await f.service.request(input);
      assert.equal(snapshot.workspacePath, f.root);
      assert.equal(snapshot.initialized, initialized);
    }
    assert.equal(f.writes.length, 0, 'discovery must not initialize the library or rewrite unchanged indexes');
  }
});

test('registered tool user path: default empty snapshot, initialize, save and read verified content', async t => {
  const f = await uninitialized(t), tools = new Map(), previousPi = global.pi;
  global.pi = { ...f.api,
    agent:{registerTool:async tool => tools.set(tool.name, tool), unregisterTool:async name => tools.delete(name)},
    commands:{register:async () => {}, unregister:async () => {}}, ui:{openPanel:async () => {}},
  };
  const plugin = require('./main.js');
  t.after(async () => { await plugin.onUnload(); if (previousPi === undefined) delete global.pi; else global.pi = previousPi; });
  await plugin.onLoad();
  const tool = tools.get('project_wiki');
  const snapshot = await tool.execute(toolDefaults());
  assert.equal(snapshot.workspacePath, f.root);
  assert.equal(snapshot.initialized, false);
  const initialized = await tool.execute({ action:'init', workspacePath:snapshot.workspacePath });
  assert.equal(initialized.initialized, true);
  const saved = await tool.execute({ action:'save', workspacePath:snapshot.workspacePath, kind:'document', status:'confirmed',
    title:'Verified research', category:'research', content:'The complete research source remains authoritative.' });
  assert.equal(saved.kind, 'document');
  assert.ok(saved.recordId);
  const read = await tool.execute({ action:'read', workspacePath:snapshot.workspacePath,
    recordId:saved.recordId, section:'knowledge' });
  assert.equal(read.content, 'The complete research source remains authoritative.');
  assert.equal(read.revision, saved.revision);
  assert.equal(core.hash(await fs.readFile(path.join(f.root, saved.path), 'utf8')), saved.revision);
  const refreshed = await plugin.onPanelInvoke('wiki', { action:'snapshot', workspacePath:'/workspace/stale-project' });
  assert.ok(refreshed.entries.some(entry => entry.recordId === saved.recordId));
});

test('discovered snapshots still reject a real project change during filesystem I/O and recover next request', async t => {
  const f = await fixture(t, { documents:0, linked:0 });
  const other = path.join(f.root, 'other-project'); await fs.mkdir(other);
  f.afterRead = async name => { if (name === `${core.ROOT}/project.json`) f.switchTo(other); };
  await assert.rejects(f.service.request({ action:'snapshot' }), /WORKSPACE_CHANGED/);
  f.afterRead = null;
  const snapshot = await f.service.request({ action:'snapshot', workspacePath:f.root });
  assert.equal(snapshot.workspacePath, other);
  assert.equal(snapshot.initialized, false);
});

test('queued snapshot discovers the project at execution and never reuses the interrupted request scope', async t => {
  const f = await fixture(t, { documents:1, linked:0 });
  const other = path.join(f.root, 'other-project'); await fs.mkdir(other);
  const entered = deferred(), release = deferred();
  f.afterRead = async name => { if (name === f.documents[0].path) { entered.resolve(); await release.promise; } };
  const active = f.request('read', { id:f.documents[0].id }).catch(error => error);
  await entered.promise;
  const queued = f.service.request({ action:'snapshot', workspacePath:f.root });
  f.switchTo(other); f.afterRead = null; release.resolve();
  assert.match((await active).message, /WORKSPACE_CHANGED/);
  const result = await queued;
  assert.equal(result.workspacePath, other);
  assert.equal(result.initialized, false);
});

test('discovery does not relax public or private mutation/search workspace guards', async t => {
  const f = await fixture(t, { documents:0, linked:0 });
  let sequence = 0;
  for (const workspacePath of ['', '/workspace/stale-project']) {
    f.reset();
    for (const action of ['init', 'save', 'remember', 'search']) {
      await assert.rejects(f.service.request({ action, workspacePath, kind:'document', title:'Wrong project', content:'Never write this.' }), /WORKSPACE_CHANGED/);
    }
    await assert.rejects(f.service.saveAndSnapshot({ action:'save', workspacePath, title:'Wrong project', content:'Never write this.' }), /WORKSPACE_CHANGED/);
    await assert.rejects(f.service.requestLatestSearch({ action:'search', workspacePath, query:'Never',
      clientId:'00000000-0000-4000-8000-000000000001', sequence:++sequence }), /WORKSPACE_CHANGED/);
    assert.equal(f.events.length, 0, 'wrong-workspace operations must not reach filesystem I/O');
    assert.equal(f.writes.length, 0);
  }
});

test('snapshot discovery keeps local-project and unload boundaries', async t => {
  const f = await fixture(t, { documents:0, linked:0 });
  f.switchTo('remote-project:fixture/path');
  await assert.rejects(f.service.request({ action:'snapshot' }), /LOCAL_PROJECT_REQUIRED/);
  f.service.dispose();
  await assert.rejects(f.service.request({ action:'snapshot', workspacePath:'' }), /PLUGIN_UNLOADED/);
});

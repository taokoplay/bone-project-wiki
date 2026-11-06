import assert from 'node:assert/strict';
import test from 'node:test';
import { watchFocusRefresh } from './focus-refresh.mjs';

function fixture(t) {
  const original = { window: globalThis.window, document: globalThis.document };
  const window = new EventTarget(), document = new EventTarget();
  let focused = true;
  document.hasFocus = () => focused;
  document.activeElement = null;
  globalThis.window = window; globalThis.document = document;
  const state = { epoch: 1, view: 1, search: 1, section: 'knowledge', query: '', mode: 'read', entry: null,
    snapshot: { initialized: true, workspacePath: '/demo/project', entries: [] }, memoryDraft: null,
    dirty: false, stale: false, busy: false };
  const requests = [], applied = [], errors = [];
  let workspaceChanges = 0;
  const stop = watchFocusRefresh({ state,
    request: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    onSnapshot: snapshot => applied.push(snapshot),
    onWorkspaceChanged: () => { workspaceChanges++; },
    onError: error => errors.push(error)
  });
  t.after(() => { stop(); Object.assign(globalThis, original); });
  const dispatch = (name, target = window) => target.dispatchEvent(new Event(name));
  const reply = async (index, result) => { requests[index].resolve(result); await Promise.resolve(); };
  const changed = title => ({ ...state.snapshot, entries: [{ id: title, kind: 'document', title }] });
  return { state, window, document, requests, applied, errors, dispatch, reply, changed,
    setFocused: value => { focused = value; }, get workspaceChanges() { return workspaceChanges; } };
}

test('only the latest focus synchronization may update the panel', async t => {
  const f = fixture(t);
  f.dispatch('focus'); f.dispatch('focus');
  await f.reply(1, f.changed('Newer external snapshot'));
  await f.reply(0, f.changed('Old external snapshot'));
  assert.deepEqual(f.applied.map(snapshot => snapshot.entries[0].title), ['Newer external snapshot']);
});

test('a project change invalidates the previous project result', async t => {
  const f = fixture(t);
  f.dispatch('focus');
  const old = f.changed('Previous project rule');
  f.state.epoch++;
  f.state.snapshot = { ...f.state.snapshot, workspacePath: '/demo/other-project' };
  await f.reply(0, old);
  assert.deepEqual(f.applied, []);
  assert.equal(f.workspaceChanges, 0);
  f.dispatch('focus');
  await f.reply(1, { ...f.state.snapshot, workspacePath: '/demo/third-project' });
  assert.equal(f.workspaceChanges, 1, 'Unexpected workspace is routed through the existing project-change guard');
  assert.deepEqual(f.applied, []);
});

test('input, a held pointer and disposal each prevent a pending sync from replacing UI', async t => {
  const f = fixture(t);
  f.dispatch('focus');
  f.dispatch('input', f.document);
  await f.reply(0, f.changed('Before latest input'));
  f.dispatch('pointerdown', f.document);
  f.dispatch('focus');
  await f.reply(1, f.changed('During pointer selection'));
  f.dispatch('pointerup');
  f.dispatch('focus');
  f.dispatch('pagehide');
  await f.reply(2, f.changed('After page disposal'));
  f.dispatch('focus');
  assert.deepEqual(f.applied, []);
  assert.equal(f.requests.length, 3, 'Disposed panels stop issuing background requests');
});

test('internal iframe focus is ignored while real application reactivation synchronizes', async t => {
  const f = fixture(t);
  f.document.activeElement = { matches: selector => selector === 'iframe.preview' };
  f.dispatch('blur'); f.dispatch('focus');
  assert.equal(f.requests.length, 0);
  f.setFocused(false); f.dispatch('blur');
  f.setFocused(true); f.dispatch('focus');
  await f.reply(0, f.changed('Real external change'));
  assert.equal(f.applied[0].entries[0].title, 'Real external change');
});

test('current sync failures are observable; failures from an old view are ignored', async t => {
  const f = fixture(t);
  f.dispatch('focus');
  const error = new Error('Snapshot unavailable');
  f.requests[0].reject(error); await Promise.resolve();
  assert.deepEqual(f.errors, [error]);
  f.dispatch('focus'); f.state.view++;
  f.requests[1].reject(new Error('Superseded request')); await Promise.resolve();
  assert.deepEqual(f.errors, [error]);
});

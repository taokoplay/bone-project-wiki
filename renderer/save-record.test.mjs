import test from 'node:test';
import assert from 'node:assert/strict';
import { saveRecord, withSavedEntry } from './save-record.mjs';

const entry = { id: 'record', revision: 'fresh' }, payload = { title: 'A document', expectedRevision: 'old' };
test('capable saves apply the saved revision and full snapshot through one private request', async () => {
  const calls = [], committed = [], snapshot = { workspacePath: '/project' };
  const result = await saveRecord({ capabilities: { schemaVersion: 1, saveSnapshot: true }, payload,
    request: async (...args) => { calls.push(args); return { entry, snapshot }; }, onEntry: value => committed.push(value) });
  assert.deepEqual(calls, [['save', payload, 'wiki.save']]);
  assert.deepEqual(committed, [entry]); assert.equal(result.snapshot, snapshot);
});

test('committed private partial success retains the revision without a second refresh or save', async () => {
  const committed = [], calls = [];
  const result = await saveRecord({ capabilities: { schemaVersion: 1, saveSnapshot: true }, payload,
    request: async (...args) => { calls.push(args); return { entry, snapshot: null, refreshError: 'REFRESH_FAILED' }; }, onEntry: value => committed.push(value) });
  assert.deepEqual(committed, [entry]); assert.equal(calls.length, 1); assert.equal(result.refreshError, 'REFRESH_FAILED');
});

test('released fallback advances the revision before waiting for snapshot and preserves partial success', async () => {
  let revision = 'old';
  const result = await saveRecord({ payload, request: async action => {
    if (action === 'save') return entry;
    assert.equal(revision, 'fresh'); throw new Error('refresh failure');
  }, onEntry: value => { revision = value.revision; } });
  assert.deepEqual(result, { entry, snapshot: null, refreshError: 'REFRESH_FAILED' });
});

for (const code of ['WORKSPACE_CHANGED', 'PLUGIN_UNLOADED', 'LOCAL_PROJECT_REQUIRED']) {
  test(`context failures reject instead of reporting save refresh success: ${code}`, async () => {
    await assert.rejects(saveRecord({ payload, request: async action => {
      if (action === 'save') return entry;
      throw Object.assign(new Error('changed'), { code });
    }, onEntry() {} }), { code });
  });
}

test('save failure cannot report a committed entry or request a snapshot', async () => {
  const calls = [];
  await assert.rejects(saveRecord({ payload, request: async action => { calls.push(action); throw new Error('REVISION_CONFLICT'); }, onEntry() { assert.fail('save did not commit'); } }), /REVISION_CONFLICT/);
  assert.deepEqual(calls, ['save']);
});

test('committed metadata replaces a renamed record in both snapshot views without losing memory projections', () => {
  const before = { id: 'before', recordId: 'stable', kind: 'document', category: 'rules', revision: 'old' };
  const saved = { ...before, id: 'after', revision: 'new' };
  const memory = { id: 'summary', documentLink: { state: 'current' } };
  const snapshot = { workspacePath: '/project', entries: [before, memory], sections: { knowledge: { entries: [before], categories: ['rules'] }, memory: { entries: [memory] } } };
  const next = withSavedEntry(snapshot, saved);
  assert.deepEqual(next.entries, [saved, memory]);
  assert.deepEqual(next.sections.knowledge.entries, [saved]);
  assert.equal(next.sections.memory, snapshot.sections.memory);
  assert.deepEqual(snapshot.entries, [before, memory]);
});

test('new saved memory is usable before refresh without affecting other sections', () => {
  const saved = { id: 'new', kind: 'memory', category: 'memory', revision: 'fresh' };
  const knowledge = { entries: [] };
  const snapshot = { entries: [], sections: { knowledge, memory: { entries: [] } } };
  const next = withSavedEntry(snapshot, saved);
  assert.deepEqual(next.entries, [saved]); assert.deepEqual(next.sections.memory.entries, [saved]);
  assert.equal(next.sections.knowledge, knowledge);
});

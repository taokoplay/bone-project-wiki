import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestSearch } from './latest-search.mjs';

const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(capabilities = { schemaVersion: 1, latestSearch: true }) {
  const state = { epoch: 0, view: 0, search: 0, section: 'knowledge', query: '', stale: false,
    snapshot: { initialized: true, workspacePath: '/project/a', requestCapabilities: capabilities } };
  const timers = new Map(), calls = [], pending = [], results = [], errors = [];
  let next = 0;
  const control = createLatestSearch({ state, clientId: '11111111-1111-4111-8111-111111111111',
    setTimer: (work, delay) => { assert.equal(delay, 220); timers.set(++next, work); return next; }, clearTimer: id => timers.delete(id),
    invoke(channel, payload) {
      calls.push({ channel, payload });
      if (channel === 'wiki.search.cancel') return Promise.resolve({ cancelled: true });
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
    request(action, payload, epoch) { calls.push({ channel: 'wiki', payload: { action, ...payload }, epoch }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
    onResults: value => results.push(value), onLoading: () => calls.push({ channel: 'loading' }), onError: error => errors.push(error),
  });
  return { state, calls, results, errors, timers, pending, control,
    change(query) { state.query = query; control.change(); },
    fire() { const work = [...timers.values()]; timers.clear(); work.forEach(run => run()); },
  };
}

test('new input cancels immediately, retains only one debounce and rejects late generations', async () => {
  const f = fixture();
  f.change('old');
  assert.deepEqual(f.calls[0], { channel: 'wiki.search.cancel', payload: { clientId: '11111111-1111-4111-8111-111111111111', sequence: 1 } });
  assert.equal(f.pending.length, 0);
  f.fire();
  const old = f.calls.find(call => call.channel === 'wiki.search');
  assert.deepEqual(old.payload, { action: 'search', query: 'old', workspacePath: '/project/a', clientId: '11111111-1111-4111-8111-111111111111', sequence: 1 });
  f.change('middle'); f.change('latest');
  assert.equal(f.timers.size, 1);
  assert.equal(f.calls.at(-1).payload.sequence, 3);
  f.pending[0].resolve(['obsolete']); await tick(); assert.deepEqual(f.results, []);
  f.fire(); f.pending[1].resolve(['latest']); await tick();
  assert.deepEqual(f.results, [['latest']]); assert.deepEqual(f.errors, []);
});

test('clear cancels active work immediately and cannot restore late results or errors', async () => {
  const f = fixture(); f.change('held'); f.fire(); f.change('');
  assert.equal(f.calls.at(-1).channel, 'wiki.search.cancel');
  assert.deepEqual(f.results, [null]); assert.equal(f.timers.size, 0);
  f.pending[0].reject(new Error('obsolete failure')); await tick(); assert.deepEqual(f.errors, []);
});

for (const mutate of [f => f.state.epoch++, f => f.state.view++, f => { f.state.snapshot.workspacePath = '/project/b'; }, f => { f.state.query = 'other'; }, f => { f.state.section = 'memory'; }, f => { f.state.stale = true; }]) {
  test(`late results require the same panel context: ${mutate}`, async () => {
    const f = fixture(); f.change('held'); f.fire(); mutate(f);
    f.pending[0].resolve(['obsolete']); await tick(); assert.deepEqual(f.results, []);
  });
}

test('invalidation and page disposal cancel even after the snapshot was removed, and retain no debounce', async () => {
  const f = fixture(); f.change('held'); f.fire(); f.state.snapshot = null; f.control.invalidate();
  assert.equal(f.calls.at(-1).payload.sequence, 2);
  f.control.dispose(); const count = f.calls.length;
  f.change('after unload'); f.control.dispose(); f.control.invalidate();
  assert.equal(f.timers.size, 0); assert.equal(f.calls.length, count);
  f.pending[0].resolve(['obsolete']); await tick(); assert.deepEqual(f.results, []);
});

test('capability absence uses only the released bridge and still guards obsolete results', async () => {
  const f = fixture(undefined); delete f.state.snapshot.requestCapabilities;
  f.change('old'); f.fire(); f.change('new');
  assert.equal(f.calls.some(call => call.channel.startsWith('wiki.')), false);
  f.pending[0].resolve(['old']); await tick(); assert.deepEqual(f.results, []);
  f.fire(); f.pending[1].resolve(['new']); await tick(); assert.deepEqual(f.results, [['new']]);
});

test('current failures are observable; backend cancellation is suppressed', async () => {
  const f = fixture(); f.change('first'); f.fire();
  f.pending[0].reject(Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' })); await tick(); assert.deepEqual(f.errors, []);
  f.change('next'); f.fire(); const failure = new Error('READ_FAILED');
  f.pending[1].reject(failure); await tick(); assert.deepEqual(f.errors, [failure]);
});

test('independent panels receive different UUIDs', () => {
  const ids = [];
  const state = { search: 0, snapshot: { requestCapabilities: { schemaVersion: 1, latestSearch: true } } };
  const create = () => createLatestSearch({ state: { ...state }, invoke: (_, payload) => ids.push(payload.clientId) });
  const left = create(), right = create(); left.invalidate(); right.invalidate();
  assert.notEqual(ids[0], ids[1]); assert.match(ids[0], /^[0-9a-f-]{36}$/);
});

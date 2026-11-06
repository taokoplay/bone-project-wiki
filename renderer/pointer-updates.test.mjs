import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerUpdates } from './pointer-updates.mjs';
function fixture() {
  const document = new EventTarget(), window = new EventTarget(), timers = new Map(); let next = 0;
  const control = createPointerUpdates({ document, window,
    setTimer: work => { timers.set(++next, work); return next; }, clearTimer: id => timers.delete(id) });
  return { document, window, control, timers, emit: (target, type) => target.dispatchEvent(new Event(type)),
    flush: () => { const work = [...timers.values()]; timers.clear(); work.forEach(run => run()); } };
}
test('updates keep the physical target until click handlers have completed and coalesce per owner', () => {
  const f = fixture(), observed = [];
  f.emit(f.document, 'pointerdown');
  f.control.run('tree', () => observed.push('obsolete')); f.control.run('tree', () => observed.push('fresh'));
  f.emit(f.window, 'pointerup'); assert.deepEqual(observed, []);
  f.window.addEventListener('click', () => observed.push('click'));
  f.emit(f.window, 'click'); assert.deepEqual(observed, ['click']);
  f.flush(); assert.deepEqual(observed, ['click', 'fresh']); assert.equal(f.timers.size, 0);
});
test('cancel, blur and release without click drain pending work; pagehide disposes without layout work', () => {
  for (const event of ['pointercancel', 'blur', 'pointerup', 'pagehide']) {
    const f = fixture(), observed = [];
    f.emit(f.document, 'pointerdown'); f.control.run('tree', () => observed.push('tree'));
    f.emit(f.window, event); f.flush();
    assert.deepEqual(observed, event === 'pagehide' ? [] : ['tree']);
    if (event === 'pagehide') { f.control.run('new', () => assert.fail('disposed')); assert.equal(f.timers.size, 0); }
  }
});

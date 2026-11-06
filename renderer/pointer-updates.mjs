// Snapshot-driven layout updates wait through the physical click. Only the
// latest update for each owner is retained, so a held pointer cannot grow work.
export function createPointerUpdates({ document: doc = document, window: win = window,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const lifecycle = new AbortController(), pending = new Map();
  const options = { signal: lifecycle.signal, capture: true };
  let held = false, released = false, timer = null;
  function flush() {
    clearTimer(timer); timer = null;
    if (held || lifecycle.signal.aborted) return;
    const work = [...pending.values()]; pending.clear();
    for (const apply of work) apply();
  }
  function finish() { held = false; released = false; flush(); }
  doc.addEventListener('pointerdown', () => {
    clearTimer(timer); timer = null; held = true; released = false;
  }, options);
  win.addEventListener('pointerup', () => {
    released = true;
    // Click normally follows pointerup in the same task. The timer also covers
    // dragging away or releasing outside the original target without a click.
    timer = setTimer(finish, 0);
  }, options);
  win.addEventListener('click', () => {
    if (released) { clearTimer(timer); timer = setTimer(finish, 0); }
  }, { signal: lifecycle.signal });
  win.addEventListener('pointercancel', finish, options);
  win.addEventListener('blur', event => { if (event.target === win) finish(); }, options);
  function dispose() {
    clearTimer(timer); timer = null; pending.clear(); lifecycle.abort();
  }
  win.addEventListener('pagehide', dispose, { ...options, once: true });
  return {
    run(owner, apply) {
      if (lifecycle.signal.aborted) return;
      if (held) pending.set(owner, apply);
      else { pending.delete(owner); apply(); }
    },
    dispose,
  };
}

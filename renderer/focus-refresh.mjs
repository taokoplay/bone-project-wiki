// Automatic activation sync must never replace an in-progress pointer target,
// a newer selection, or an editor draft. Explicit reload remains separate.
const contextKeys = ['epoch', 'view', 'search', 'section', 'query', 'mode', 'entry', 'snapshot', 'memoryDraft'];
const eligible = state => state.snapshot?.initialized && !state.dirty && !state.stale && !state.busy;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function recordMeta(snapshot, entry) {
  return snapshot.entries?.find(row => entry.recordId
    ? row.recordId === entry.recordId && row.kind === entry.kind
    : row.id === entry.id && row.kind === entry.kind && row.category === entry.category);
}

export function watchFocusRefresh({ state, request, onSnapshot, onWorkspaceChanged, onError }) {
  const lifecycle = new AbortController();
  const options = { signal: lifecycle.signal };
  let generation = 0, sequence = 0, pointerDown = false, previewFocused = false;
  const invalidate = () => { generation++; };
  document.addEventListener('pointerdown', () => { pointerDown = true; invalidate(); }, { ...options, capture: true });
  window.addEventListener('pointerup', () => { pointerDown = false; }, { ...options, capture: true });
  window.addEventListener('pointercancel', () => { pointerDown = false; }, { ...options, capture: true });
  for (const event of ['input', 'keydown']) document.addEventListener(event, invalidate, { ...options, capture: true });
  window.addEventListener('blur', () => {
    previewFocused = document.hasFocus() && document.activeElement?.matches('iframe.preview');
    if (!document.hasFocus()) { pointerDown = false; invalidate(); }
  }, options);

  async function synchronize() {
    if (previewFocused) { previewFocused = false; return; }
    if (!eligible(state)) return;
    const currentSequence = ++sequence, currentGeneration = generation;
    const ticket = Object.fromEntries(contextKeys.map(key => [key, state[key]]));
    const current = () => !lifecycle.signal.aborted && currentSequence === sequence
      && generation === currentGeneration && !pointerDown && eligible(state)
      && contextKeys.every(key => state[key] === ticket[key]);
    try {
      const snapshot = await request('snapshot', {}, ticket.epoch);
      if (!current()) return;
      if (snapshot.workspacePath !== ticket.snapshot.workspacePath || !snapshot.initialized) {
        onWorkspaceChanged(); return;
      }
      if (same(snapshot, ticket.snapshot)) return;
      let entry;
      if (ticket.entry && ticket.mode === 'read' && !ticket.memoryDraft) {
        const before = recordMeta(ticket.snapshot, ticket.entry);
        const after = recordMeta(snapshot, ticket.entry);
        if (!same(before, after)) {
          entry = after ? await request('read', after.recordId && after.kind === 'document'
            ? { recordId: after.recordId, section: 'knowledge' } : { id: after.id }, ticket.epoch) : null;
        }
      }
      if (current()) onSnapshot(snapshot, entry);
    } catch (error) {
      if (current()) onError(error);
    }
  }
  window.addEventListener('focus', () => { void synchronize(); }, options);
  const stop = () => { invalidate(); lifecycle.abort(); };
  window.addEventListener('pagehide', stop, { ...options, once: true });
  return stop;
}

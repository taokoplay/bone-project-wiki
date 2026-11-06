// A panel owns one search client and one debounce timer. Invalidation always
// precedes the debounce: cancellation must not wait behind the next query.
export function createLatestSearch({ state, invoke, request, onResults, onLoading, onError,
  onCancelError = error => console.warn('Search cancellation failed', error),
  clientId = crypto.randomUUID(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let sequence = 0, timer = null, disposed = false, usedPrivateChannel = false;
  const capable = () => state.snapshot?.requestCapabilities?.schemaVersion === 1
    && state.snapshot.requestCapabilities.latestSearch === true;
  const current = ticket => !disposed && ticket.sequence === sequence && !state.stale
    && state.snapshot?.initialized && ticket.epoch === state.epoch && ticket.view === state.view
    && ticket.workspacePath === state.snapshot.workspacePath
    && ticket.section === state.section && ticket.query === state.query;
  function cancel() {
    if (!capable() && !usedPrivateChannel) return;
    usedPrivateChannel = true;
    try { void Promise.resolve(invoke('wiki.search.cancel', { clientId, sequence })).catch(onCancelError); }
    catch (error) { onCancelError(error); }
  }
  function invalidate() {
    if (disposed) return;
    clearTimer(timer); timer = null;
    sequence++; state.search++;
    cancel();
    // Never send an unsafe sequence, even in a very long-lived panel.
    if (sequence === Number.MAX_SAFE_INTEGER) {
      clientId = crypto.randomUUID(); sequence = 0; usedPrivateChannel = false;
    }
  }
  async function run(ticket) {
    timer = null;
    if (!current(ticket)) return;
    onLoading();
    try {
      const payload = { query: ticket.query };
      let results;
      if (capable()) {
        usedPrivateChannel = true;
        results = await invoke('wiki.search', { action: 'search', ...payload,
          workspacePath: ticket.workspacePath, clientId, sequence: ticket.sequence });
      } else results = await request('search', payload, ticket.epoch);
      if (current(ticket)) onResults(results);
    } catch (error) {
      if (current(ticket) && error?.code !== 'CANCELLED' && error?.message !== 'CANCELLED') onError(error);
    }
  }
  function change() {
    if (disposed) return;
    invalidate();
    state.results = null;
    if (!state.query.trim()) { onResults(null); return; }
    if (!state.snapshot?.initialized || state.stale) return;
    const ticket = { sequence, epoch: state.epoch, view: state.view, query: state.query,
      section: state.section, workspacePath: state.snapshot.workspacePath };
    timer = setTimer(() => { void run(ticket); }, 220);
  }
  return {
    change,
    invalidate,
    dispose() { if (!disposed) { invalidate(); disposed = true; } },
  };
}

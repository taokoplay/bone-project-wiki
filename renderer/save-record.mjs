// A committed save must advance the editor's revision even if refreshing fails.
const contextFailure = error => /WORKSPACE_CHANGED|PLUGIN_UNLOADED|LOCAL_PROJECT_REQUIRED|LOCAL_WORKSPACE_REQUIRED/
  .test(`${error?.code || ''} ${error?.message || error}`);
export async function saveRecord({ request, payload, capabilities, onEntry }) {
  if (capabilities?.schemaVersion === 1 && capabilities.saveSnapshot === true) {
    const result = await request('save', payload, 'wiki.save');
    onEntry(result.entry);
    return result;
  }
  const entry = await request('save', payload);
  onEntry(entry);
  try { return { entry, snapshot: await request('snapshot') }; }
  catch (error) {
    if (contextFailure(error)) throw error;
    return { entry, snapshot: null, refreshError: 'REFRESH_FAILED' };
  }
}

// Keep committed metadata usable during a released-host refresh or partial
// success. Linked-source projections still come from the full host snapshot.
export function withSavedEntry(snapshot, saved) {
  const matches = row => saved.kind === 'document' && saved.recordId
    ? row.kind === saved.kind && row.recordId === saved.recordId
    : row.id === saved.id && row.kind === saved.kind && row.category === saved.category;
  const replace = rows => rows.some(matches) ? rows.map(row => matches(row) ? saved : row) : [...rows, saved];
  const section = saved.kind === 'memory' ? 'memory' : saved.kind === 'handoff' ? 'development' : 'knowledge';
  return { ...snapshot, entries: replace(snapshot.entries || []),
    ...(snapshot.sections ? { sections: { ...snapshot.sections,
      [section]: { ...snapshot.sections[section], entries: replace(snapshot.sections[section]?.entries || []) },
    } } : {}),
  };
}

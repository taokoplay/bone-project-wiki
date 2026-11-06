import { memoryFields } from './memory-fields.mjs';

// The editor owns its debounce and version counter. Ordinary saves update the
// record base and surrounding metadata, never the live input nodes or values.
export function mountNoteEditor(entry, { state, detail, element, t, button, mutation,
  save, onSnapshot, onSavedControls, renderDetail, appendDocumentMemory, message,
  errorText, forgetMemory, lock, defer }) {
  detail.replaceChildren();
  const form = element('form', undefined, 'note-editor');
  const epoch = state.epoch, view = state.view;
  let version = 0, saving = false, readAfterSave = false, timer = null, disposed = false;
  let generatedTitle = '';
  const current = () => !disposed && epoch === state.epoch && view === state.view
    && form.isConnected && !state.stale;
  const titleInput = element('input', undefined, 'note-title-input');
  titleInput.type = 'text'; titleInput.name = 'title'; titleInput.placeholder = t('title'); titleInput.value = entry?.title || '';
  titleInput.setAttribute('aria-label', t('title'));
  const contentInput = element('textarea', undefined, 'note-content-input');
  contentInput.name = 'content'; contentInput.placeholder = t('content'); contentInput.value = entry?.content || '';
  contentInput.setAttribute('aria-label', t('content'));
  if (state.stale) { titleInput.readOnly = true; contentInput.readOnly = true; }
  const submit = mutation(element('button')); submit.type = 'submit'; submit.style.display = 'none'; submit.setAttribute('aria-hidden', 'true');
  const modeBar = element('div', undefined, 'note-mode-bar');
  const readButton = mutation(button('readMode', () => {
    if (!current() || state.busy) return;
    if (state.dirty || saving) {
      readAfterSave = true; readButton.textContent = t('working');
      clearTimeout(timer); void performSave();
    } else showReadMode();
  }));
  function showReadMode() {
    if (!current() || state.dirty || saving) return;
    state.view++; state.mode = 'read'; renderDetail();
  }
  modeBar.append(element('span', t('editMode'), 'note-mode-label'));
  if (entry) modeBar.append(readButton);
  form.append(modeBar, titleInput, element('div', undefined, 'note-title-divider'), contentInput, submit);
  let memoryBar;
  function addMemoryAction(record) {
    if (record?.kind !== 'memory' || memoryBar) return;
    memoryBar = element('div', undefined, 'memory-bar');
    memoryBar.append(mutation(button('forget', () => forgetMemory(state.entry)))); form.append(memoryBar);
  }
  addMemoryAction(entry);
  const settings = entry?.kind === 'memory' || (!entry && state.section === 'memory')
    ? memoryFields(t, entry || {}, { confirmation: true }) : null;
  if (settings) { form.insertBefore(settings.element, submit); settings.element.addEventListener('input', onInput); }
  function updateControls() {
    defer(form, () => {
      if (!current()) return;
      if (!readButton.isConnected && state.entry) modeBar.append(readButton);
      addMemoryAction(state.entry);
      onSavedControls(state.entry);
      lock();
    });
  }
  async function performSave() {
    if (saving || !current() || state.busy) return;
    clearTimeout(timer); timer = null;
    const rawTitle = titleInput.value.trim(), content = contentInput.value, base = state.entry;
    if (!rawTitle && !content.trim() && !base) return;
    const firstLine = content.trim().split('\n')[0]?.replace(/^[#\s*-]+/, '').trim();
    const title = rawTitle || generatedTitle || (firstLine ? firstLine.slice(0, 50) : base?.title || t('untitledDocument'));
    const savedVersion = version;
    let again = false, readReady = false;
    saving = true;
    try {
      const result = await save({ title, content,
        category: base?.category || (state.section === 'memory' ? 'memory' : state.category || 'general'),
        kind: base?.kind || (state.section === 'memory' ? 'memory' : 'document'),
        status: base?.status || 'draft', source: base?.source || '', topics: base?.topics || [], tags: base?.tags || [],
        ...(settings ? settings.read() : {}),
        ...(base ? { id: base.id, ...(base.kind === 'document' ? { recordId: base.recordId } : {}), expectedRevision: base.revision } : {}),
      }, epoch, saved => { if (current()) state.entry = saved; });
      if (!current()) return;
      // A snapshot is useful even when input advanced during the operation.
      // Applying it must leave the newer input, search text and draft DOM alone.
      if (result.snapshot) onSnapshot(result.snapshot, epoch);
      if (!current()) return;
      state.dirty = version !== savedVersion;
      if (!state.dirty && !rawTitle) generatedTitle = state.entry.title;
      again = state.dirty;
      updateControls();
      if (result.refreshError) {
        readAfterSave = false; readButton.textContent = t('readMode');
        message(t('saveRefreshPartial'), true);
      } else if (!state.dirty) {
        message(t('saved')); readReady = readAfterSave;
      }
    } catch (error) {
      readAfterSave = false; readButton.textContent = t('readMode');
      if (current()) message(errorText(error), true);
    } finally {
      saving = false;
      if (again && current()) void performSave();
      else if (readReady) defer(readButton, () => {
        if (version === savedVersion && current() && readAfterSave) showReadMode();
      });
    }
  }
  function onInput() {
    if (!current()) return;
    version++; state.dirty = true;
    clearTimeout(timer); timer = setTimeout(() => { void performSave(); }, 350);
  }
  titleInput.addEventListener('input', () => { generatedTitle = ''; onInput(); }); contentInput.addEventListener('input', onInput);
  form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); void performSave(); });
  detail.append(form); appendDocumentMemory(entry); lock();
  return { dispose() { disposed = true; clearTimeout(timer); } };
}

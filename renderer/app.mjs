import { t, setLocale, errorText } from './i18n.mjs';
import { safeImage, collectFiles } from './content.mjs';
import { createSelect, closeAnyControl, showContextMenu } from './controls.mjs';
import { rememberDocumentForm } from './document-memory.mjs';
import { memoryFields } from './memory-fields.mjs';
import { htmlPreview } from './html-preview.mjs';
import { noteReader } from './note-reader.mjs';
import { watchFocusRefresh } from './focus-refresh.mjs';

const bridge = window.pluginBridge;
const app = document.querySelector('#app');
const state = { snapshot: null, section: 'knowledge', category: '', topic: '', query: '', results: null, entry: null, mode: 'read', dirty: false, stale: false, busy: false, epoch: 0, view: 0, search: 0, memoryDraft: null };
let detail, records, notice, searchTimer, editorDialog;
const sectionEntries = section => { const snapshotEntries = state.snapshot?.entries || []; if (section === 'memory') return state.snapshot?.sections ? [...(state.snapshot.sections.memory?.entries || []), ...(state.snapshot.sections.development?.entries || [])] : snapshotEntries.filter(entry => entry.kind === 'memory' || entry.category === 'memory' || entry.kind === 'handoff' || entry.category === 'development'); if (section === 'knowledge') return state.snapshot?.sections?.knowledge?.entries || snapshotEntries.filter(entry => entry.kind !== 'memory' && entry.category !== 'memory' && entry.kind !== 'handoff' && entry.category !== 'development'); return state.snapshot?.sections?.[section]?.entries || []; };
const knowledgeCategories = () => {
  const listed = state.snapshot?.sections?.knowledge?.categories;
  if (Array.isArray(listed) && listed.length) return listed;
  return [...new Set(sectionEntries('knowledge').map(entry => entry.category).filter(Boolean))].sort();
};
const currentEntries = () => sectionEntries(state.section);
const sectionCorrupted = section => state.snapshot?.sections?.[section]?.corrupted || [];
const allCorrupted = () => ['knowledge', 'memory', 'development'].flatMap(sectionCorrupted);
const subscriptions = [];
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function getFileIconSvg(entry, size = 13) {
  const ext = entry?.title?.split('.').at(-1)?.toLowerCase() || '';
  const s = size;
  if (entry?.kind === 'image' || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
  }
  if (entry?.kind === 'audio' || ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'wma'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
  }
  if (entry?.kind === 'video' || ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2.18"></rect><path d="m10 8 6 4-6 4V8z"></path></svg>`;
  }
  if (['docx', 'doc', 'dotx', 'dot'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M8 13l1.5 5 1.5-4 1.5 4 1.5-5"></path></svg>`;
  }
  if (['wps', 'wpt', 'et', 'ett', 'dps', 'dpt'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M6 8l3 8 3-6 3 6 3-8"></path></svg>`;
  }
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
  }
  if (['pptx', 'ppt', 'key'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
  }
  if (entry?.kind === 'pdf' || ['pdf'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="10" y1="12" x2="14" y2="12"></line><line x1="10" y1="16" x2="14" y2="16"></line></svg>`;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v20M14 2v20M4 7h16M4 17h16"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>`;
  }
  if (['json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'py', 'sh', 'rs'].includes(ext)) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
  }
  if (entry?.kind === 'attachment') {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
}
function button(key, action, primary = false) {
  const node = element('button', t(key), primary ? 'primary' : '');
  node.type = 'button'; node.addEventListener('click', action); return node;
}
let noticeTimer = null;
function message(text = '', error = false) {
  if (!notice) return;
  notice.textContent = text;
  notice.className = `notice visible${error ? ' error' : ''}`;
  notice.setAttribute('role', error ? 'alert' : 'status');
  clearTimeout(noticeTimer);
  if (text) {
    noticeTimer = setTimeout(() => { notice.classList.remove('visible'); }, 2000);
  }
}
function problem(error) { message(`${t('error')}: ${errorText(error)}`, true); }
const active = epoch => epoch === state.epoch;
function lock() {
  document.querySelectorAll('[data-mutation]').forEach(node => { node.disabled = state.busy || state.stale || !state.snapshot?.workspacePath; });
  document.querySelectorAll('form').forEach(node => { node.inert = state.busy; });
  document.querySelectorAll('.memory-policy-editor').forEach(node => { node.inert = state.busy || state.stale; });
  document.querySelectorAll('.note-title-input, .note-content-input, [name="title"], [name="content"], [name="memorySummary"], [name="readWhen"]').forEach(node => { if (state.stale) node.readOnly = true; });
  app.setAttribute('aria-busy', String(state.busy));
}
function mutation(node) { node.dataset.mutation = ''; return node; }
async function request(action, payload = {}, epoch = state.epoch) {
  if (!bridge) throw new Error(t('unavailable'));
  if (!active(epoch) || (action !== 'snapshot' && state.stale)) throw new Error(t('changed'));
  const data = action === 'snapshot' ? { action } : { action, ...payload, workspacePath: state.snapshot?.workspacePath };
  if (action !== 'snapshot' && !data.workspacePath) throw new Error(t('noWorkspace'));
  const result = await bridge.invoke('wiki', data);
  if (!active(epoch)) throw new Error(t('changed'));
  return result;
}
async function perform(work) {
  if (state.busy || state.stale) return;
  const epoch = state.epoch;
  state.busy = true; lock(); message(t('working'));
  try { await work(epoch); } catch (error) { if (active(epoch)) problem(error); }
  finally { if (active(epoch)) { state.busy = false; lock(); } }
}
function leave() {
  if (state.busy) return false;
  if ((state.dirty || state.memoryDraft) && !window.confirm(t('discard'))) return false;
  state.dirty = false; state.memoryDraft = null;
  if (state.stale) { refresh(); return false; }
  return true;
}
function markDirty() { state.dirty = true; if (!state.stale) message(t('unsaved')); }
function empty(target, title, description, action) {
  const box = element('div', undefined, 'empty');
  box.append(element('div', '◇', 'empty-mark'), element('h2', t(title)), element('p', t(description)));
  if (action) box.append(action);
  target.replaceChildren(box);
}
async function closePanel() {
  try { await bridge?.invoke('ui.closePanel'); }
  catch (error) { console.error('Panel close failed', error); }
}
function renderShell() {
  closeAnyControl();
  app.replaceChildren();
  editorDialog = null;
  const header = element('header');
  const identity = element('div', undefined, 'identity');
  identity.append(element('h1', t('library')));
  const tools = element('div', undefined, 'tools');
  if (state.snapshot?.initialized) {
    const tabs = element('div', undefined, 'section-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('library'));
    const isKnowledge = state.section === 'knowledge';
    const kbTab = button('knowledge', () => { if (state.section !== 'knowledge' && leave()) switchSection('knowledge'); });
    kbTab.className = 'section-tab';
    kbTab.setAttribute('role', 'tab');
    kbTab.setAttribute('aria-selected', String(isKnowledge));
    kbTab.setAttribute('tabindex', isKnowledge ? '0' : '-1');
    const memTab = button('memory', () => { if (state.section !== 'memory' && leave()) switchSection('memory'); });
    memTab.className = 'section-tab';
    memTab.setAttribute('role', 'tab');
    memTab.setAttribute('aria-selected', String(!isKnowledge));
    memTab.setAttribute('tabindex', !isKnowledge ? '0' : '-1');
    tabs.append(kbTab, memTab);
    tools.append(tabs);
  }
  header.append(identity, tools);
  notice = element('div', undefined, 'notice'); notice.setAttribute('aria-live', 'polite');
  const shell = element('div', undefined, 'shell');
  const library = element('section', undefined, 'library'); library.setAttribute('aria-label', t('all'));
  const sidebarHeader = element('div', undefined, 'sidebar-header');
  const vaultTitle = element('div', t('fileExplorer') || '文件', 'sidebar-vault-title');
  const sidebarTools = element('div', undefined, 'sidebar-tools');
  const toggleAllBtn = element('button', undefined, 'sidebar-tool-btn btn-toggle-all');
  toggleAllBtn.type = 'button';
  toggleAllBtn.title = '折叠/展开全部';
  toggleAllBtn.innerHTML = '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"7 15 12 20 17 15\"></polyline><polyline points=\"7 9 12 4 17 9\"></polyline></svg>';
  toggleAllBtn.addEventListener('click', () => {
    const discovered = knowledgeCategories();
    if (collapsedFolders.size > 0) { collapsedFolders.clear(); }
    else { discovered.forEach(c => collapsedFolders.add(c)); collapsedFolders.add('memory'); }
    renderList();
  });
  const newFolderBtn = element('button', undefined, 'sidebar-tool-btn btn-new-folder');
  newFolderBtn.type = 'button';
  newFolderBtn.setAttribute('aria-label', t('newFolder'));
  newFolderBtn.setAttribute('title', t('newFolder'));
  newFolderBtn.innerHTML = '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z\"></path><line x1=\"12\" y1=\"10\" x2=\"12\" y2=\"16\"></line><line x1=\"9\" y1=\"13\" x2=\"15\" y2=\"13\"></line></svg>';
  newFolderBtn.addEventListener('click', () => {
    promptText({
      title: t('newFolder') || '新建目录',
      placeholder: '输入新目录名称...',
      onConfirm: cleanName => {
        perform(async epoch => {
          await createDirectory(cleanName, epoch);
          state.category = cleanName;
          state.entry = null;
          await updateSnapshot(epoch);
          renderDetail();
          detail.querySelector('[name=\"title\"]')?.focus();
          message(`目录已创建：${cleanName}`);
        });
      }
    });
  });
  const newBtn = element('button', undefined, 'sidebar-tool-btn btn-new-note');
  newBtn.type = 'button';
  newBtn.setAttribute('aria-label', t('new'));
  newBtn.setAttribute('title', t('new'));
  newBtn.innerHTML = '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"></line><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line></svg>';
  newBtn.addEventListener('click', () => {
    if (leave()) {
      state.view++; state.mode = 'edit'; state.entry = null;
      renderDetail();
      detail.querySelector('[name=\"title\"]')?.focus();
    }
  });
  const refreshBtn = element('button', undefined, 'sidebar-tool-btn btn-refresh');
  refreshBtn.type = 'button';
  refreshBtn.setAttribute('aria-label', t('refresh') || '刷新目录');
  refreshBtn.setAttribute('title', t('refresh') || '刷新目录');
  refreshBtn.innerHTML = '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2\"/></svg>';
  refreshBtn.addEventListener('click', () => refresh());
  sidebarTools.append(toggleAllBtn, refreshBtn, newFolderBtn, newBtn);
  sidebarHeader.append(vaultTitle, sidebarTools);
  const search = element('input'); search.type = 'search'; search.className = 'sidebar-search-input'; search.placeholder = state.section === 'memory' ? t('searchMemory') : t('search'); search.setAttribute('aria-label', search.placeholder); search.value = state.query;
  search.addEventListener('input', () => { state.query = search.value; clearTimeout(searchTimer); const serial = ++state.search; searchTimer = setTimeout(() => runSearch(serial), 220); });
  records = element('div', undefined, 'tree-view records'); records.setAttribute('aria-live', 'polite');
  library.append(sidebarHeader, search, records);
  detail = element('main', undefined, 'detail'); detail.id = 'detail';
  shell.append(library, detail); app.append(header, notice, shell);
  lock();
}
function switchSection(section) {
  if (!leave()) return;
  state.section = section; state.category = section === 'knowledge' ? '' : section; state.topic = ''; state.entry = null; state.mode = 'read'; state.view++;
  renderShell(); renderList(); renderDetail();
}
const collapsedFolders = new Set();
function renderList() {
  records.replaceChildren();
  const entries = (state.results ?? currentEntries()).filter(e => e.status !== 'archived');
  if (state.section === 'memory' && !entries.length) {
    records.append(element('p', state.query ? t('noResults') : t('noRecords'), 'hint'));
    return;
  }
  if (state.section === 'knowledge') {
    if (state.query && !entries.length) {
      records.append(element('p', t('noResults'), 'hint'));
      return;
    }
    const discoveredCategories = knowledgeCategories();
    const allCategories = [...new Set([...discoveredCategories, ...entries.map(e => e.category).filter(Boolean)])].sort();
    if (!allCategories.length && !entries.length) {
      records.append(element('p', currentEntries().length ? t('noResults') : t('noRecords'), 'hint'));
      return;
    }
    allCategories.forEach(cat => {
      const catEntries = entries.filter(e => e.category === cat);
      if (!catEntries.length && state.query) return;
      const group = element('div', undefined, 'tree-group'); group.dataset.category = cat;
      const folder = element('div', undefined, 'tree-folder'); folder.setAttribute('role', 'treeitem');
      const isCollapsed = collapsedFolders.has(cat); folder.setAttribute('aria-expanded', String(!isCollapsed));
      const chevron = element('span', undefined, 'tree-chevron');
      chevron.innerHTML = '<svg class=\"tree-chevron-svg\" width=\"9\" height=\"9\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"9 18 15 12 9 6\"></polyline></svg>';
      const icon = element('span', undefined, 'tree-folder-icon');
      icon.innerHTML = '<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z\"></path></svg>';
      const name = element('span', t(cat) || cat, 'tree-folder-name'); const count = element('span', String(catEntries.length), 'tree-folder-count');
      const addBtn = element('button', undefined, 'tree-folder-add');
      addBtn.type = 'button';
      addBtn.setAttribute('title', `在 ${t(cat) || cat} 中新建文件`);
      addBtn.setAttribute('aria-label', `在 ${t(cat) || cat} 中新建文件`);
      addBtn.innerHTML = '<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"></line><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line></svg>';
      addBtn.addEventListener('click', event => {
        event.stopPropagation();
        if (leave()) {
          folder.setAttribute('aria-expanded', 'true');
          collapsedFolders.delete(cat);
          state.category = cat;
          state.entry = null;
          renderDetail();
          detail.querySelector('[name=\"title\"]')?.focus();
        }
      });
      folder.append(chevron, icon, name, count, addBtn);
      folder.addEventListener('click', () => {
        const currentlyExpanded = folder.getAttribute('aria-expanded') !== 'false';
        if (currentlyExpanded) { folder.setAttribute('aria-expanded', 'false'); collapsedFolders.add(cat); }
        else { folder.setAttribute('aria-expanded', 'true'); collapsedFolders.delete(cat); }
      });
      folder.addEventListener('contextmenu', event => {
        event.preventDefault();
        showContextMenu(event.clientX, event.clientY, [
          {
            icon: '🔍', label: t('revealInFinder'),
            action: () => perform(async epoch => { await executeReveal(`.bone-project-wiki/knowledge/${cat}`); })
          },
          { separator: true },
          {
            icon: '🗑️', label: t('deleteCategory'), danger: true,
            action: () => {
              if (!window.confirm(t('deleteCategoryConfirm'))) return;
              perform(async epoch => {
                await request('deleteCategory', { category: cat }, epoch);
                if (state.category === cat) state.category = '';
                if (state.entry?.category === cat) {
                  state.entry = null;
                  renderDetail();
                }
                await updateSnapshot(epoch);
                message(t('deletedCategory'));
              });
            }
          }
        ]);
      });
      const children = element('div', undefined, 'tree-children'); children.setAttribute('role', 'group');
      catEntries.forEach((entry, index) => {
        const node = element('button', undefined, 'record tree-item'); node.type = 'button'; node.style.setProperty('--i', String(index));
        node.setAttribute('aria-pressed', String(entry.id === state.entry?.id));
        const itemIcon = element('span', undefined, 'tree-item-icon');
        itemIcon.innerHTML = getFileIconSvg(entry, 13);
        const strong = element('strong', entry.title, 'tree-item-title');
        node.append(itemIcon, strong);
        node.addEventListener('click', () => { if (leave()) openRecord(entry.id); });
        node.addEventListener('contextmenu', event => {
          event.preventDefault();
          const targetCats = knowledgeCategories().filter(c => c !== entry.category);
          const moveChildren = targetCats.map(targetCat => ({
            icon: '📁',
            label: t(targetCat) || targetCat,
            action: () => {
              perform(async epoch => {
                const moved = await executeMove(entry, targetCat, epoch);
                state.entry = moved;
                await updateSnapshot(epoch);
                message(`已移动到 ${t(targetCat) || targetCat}`);
              });
            }
          }));
          if (moveChildren.length) moveChildren.push({ separator: true });
          moveChildren.push({
            icon: '＋',
            label: t('newFolder') || '新建目录…',
            action: () => {
              promptText({
                title: t('newFolder') || '新建目录并移动',
                placeholder: '输入目标目录名称...',
                onConfirm: cleanCat => {
                  perform(async epoch => {
                    const moved = await executeMove(entry, cleanCat, epoch);
                    state.entry = moved;
                    await updateSnapshot(epoch);
                    message(`已移动到 ${t(cleanCat) || cleanCat}`);
                  });
                }
              });
            }
          });
          const menuItems = [{
            icon: '📁', label: t('moveTo'), children: moveChildren
          }, {
            icon: '🔍', label: t('revealInFinder'),
            action: () => perform(async epoch => { await executeReveal(entry.path); })
          }, { separator: true }, {
            icon: '🗑️', label: t('deleteDoc'), danger: true,
            action: () => {
              if (!window.confirm(t('deleteConfirm'))) return;
              perform(async epoch => {
                await executeDelete(entry, epoch);
                if (state.entry?.id === entry.id) { state.entry = null; renderDetail(); }
                await updateSnapshot(epoch);
                message(t('deletedDoc'));
              });
            }
          }];
          showContextMenu(event.clientX, event.clientY, menuItems);
        });
        children.append(node);
      });
      group.append(folder, children); records.append(group);
    });
  } else {
    const group = element('div', undefined, 'tree-group'); group.dataset.category = 'memory';
    const folder = element('div', undefined, 'tree-folder'); folder.setAttribute('role', 'treeitem');
    const isCollapsed = collapsedFolders.has('memory'); folder.setAttribute('aria-expanded', String(!isCollapsed));
    const chevron = element('span', undefined, 'tree-chevron');
    chevron.innerHTML = '<svg class=\"tree-chevron-svg\" width=\"9\" height=\"9\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"9 18 15 12 9 6\"></polyline></svg>';
    const icon = element('span', undefined, 'tree-folder-icon');
    icon.innerHTML = '<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z\"></path></svg>';
    const name = element('span', t('projectMemory'), 'tree-folder-name'); const count = element('span', String(entries.length), 'tree-folder-count');
    folder.append(chevron, icon, name, count);
    folder.addEventListener('click', () => {
      const currentlyExpanded = folder.getAttribute('aria-expanded') !== 'false';
      if (currentlyExpanded) { folder.setAttribute('aria-expanded', 'false'); collapsedFolders.add('memory'); }
      else { folder.setAttribute('aria-expanded', 'true'); collapsedFolders.delete('memory'); }
    });
    const children = element('div', undefined, 'tree-children'); children.setAttribute('role', 'group');
    entries.forEach((entry, index) => {
      const node = element('button', undefined, 'record tree-item'); node.type = 'button'; node.style.setProperty('--i', String(index));
      node.setAttribute('aria-pressed', String(entry.id === state.entry?.id));
      const itemIcon = element('span', undefined, 'tree-item-icon');
      itemIcon.innerHTML = getFileIconSvg(entry, 13);
      const strong = element('strong', entry.title, 'tree-item-title');
      node.append(itemIcon, strong);
      node.addEventListener('click', () => { if (leave()) openRecord(entry.id); });
      node.addEventListener('contextmenu', event => {
        event.preventDefault();
        const menuItems = [{
          icon: '🔍', label: t('revealInFinder'),
          action: () => perform(async epoch => { await executeReveal(entry.path); })
        }, { separator: true }, {
          icon: '🗑️', label: t('deleteDoc'), danger: true,
          action: () => {
            if (!window.confirm(t('deleteConfirm'))) return;
            perform(async epoch => {
              await executeDelete(entry, epoch);
              if (state.entry?.id === entry.id) { state.entry = null; renderDetail(); }
              await updateSnapshot(epoch);
              message(t('deletedDoc'));
            });
          }
        }];
        showContextMenu(event.clientX, event.clientY, menuItems);
      });
      children.append(node);
    });
    group.append(folder, children); records.append(group);
  }
}
async function runSearch(serial) {
  if (!state.snapshot?.initialized || state.stale) return;
  const epoch = state.epoch;
  if (!state.query.trim()) { state.results = null; renderList(); return; }
  records.replaceChildren(element('p', t('loading'), 'hint'));
  try {
    const results = await request('search', { query: state.query }, epoch);
    if (serial !== state.search) return;
    state.results = results; renderList();
  } catch (error) { if (active(epoch) && serial === state.search) problem(error); }
}
async function refresh() {
  const workspacePath = state.snapshot?.workspacePath || state.memoryDraft?.workspacePath;
  const draft = state.memoryDraft;
  const epoch = ++state.epoch; state.view++; state.search++;
  state.dirty = false; state.stale = false; state.busy = false; state.entry = null; state.results = null; state.query = ''; state.topic = ''; state.snapshot = null; state.mode = 'read'; state.drawer = false;
  renderShell(); empty(detail, 'loading', 'pending');
  try {
    state.snapshot = await request('snapshot', {}, epoch);
    if (state.snapshot.workspacePath !== workspacePath) state.memoryDraft = null;
    const restoreDraft = draft && state.memoryDraft === draft && draft.workspacePath === state.snapshot.workspacePath;
    if (restoreDraft) { state.section = 'knowledge'; state.category = ''; }
    renderShell(); renderList(); renderDetail();
    if (restoreDraft) void openRecord({ recordId: draft.recordId, section: 'knowledge' });
    if (state.snapshot.corrupted?.length) message(`${t('corrupted')}: ${state.snapshot.corrupted.map(item => item.path).join(', ')}`, true);
  } catch (error) {
    if (!active(epoch)) return;
    empty(detail, 'library', bridge ? 'noWorkspace' : 'unavailable', button('retry', refresh)); problem(error);
  }
}
function renderDetail() {
  const snapshot = state.snapshot;
  if (!snapshot?.workspacePath) { empty(detail, 'library', 'noWorkspace'); return; }
  if (!snapshot.initialized) {
    empty(detail, 'library', 'initBody', mutation(button('init', () => perform(async epoch => {
      state.snapshot = await request('init', {}, epoch); renderShell(); renderList(); renderDetail(); message(t('initialized'));
    }), true))); lock(); return;
  }
  if (!state.entry || ['document', 'memory', 'handoff'].includes(state.entry.kind)) {
    if (!state.entry || (state.mode === 'edit' && !state.entry.documentRef)) {
      state.mode = 'edit'; renderNoteEditor(state.entry);
    } else {
      const entry = state.entry;
      detail.replaceChildren(noteReader(entry, t, {
        onEdit: () => {
          if (state.busy || state.stale) return;
          state.view++; state.mode = 'edit'; renderDetail();
          detail.querySelector('[name="content"]')?.focus();
        },
        onOpenSource: id => {
          if (!leave()) return;
          state.section = 'knowledge'; state.category = ''; state.query = ''; state.results = null;
          renderShell(); renderList(); void openRecord({ recordId: id, section: 'knowledge' });
        },
        onForget: () => forgetMemory(entry)
      }));
      appendDocumentMemory(entry); lock();
    }
    return;
  }
  const entry = state.entry;
  if (entry.kind === 'prototype' || entry.htmlPreview) {
    const actions = entry.htmlPreview ? [
      button('openInSystem', () => { void request('openDefault', { path: entry.path }).catch(problem); }),
      button('revealInFinder', () => { void executeReveal(entry.path); })
    ] : [];
    detail.replaceChildren(htmlPreview(entry.htmlPreview || entry, entry.title, t, actions));
    return;
  }
  detail.replaceChildren();
  const article = element('article');
  article.append(element('div', t(entry.category === 'development' ? 'projectMemory' : entry.category), 'section-label'), element('h2', entry.title));
  if (entry.kind === 'image') {
    let hasPreview = false;
    for (const file of entry.files || []) {
      if (file.dataUrl && safeImage(file.dataUrl)) {
        hasPreview = true;
        const image = element('img', undefined, 'image-preview');
        image.src = file.dataUrl;
        image.alt = file.path;
        article.append(image);
      }
    }
    const actions = element('div', undefined, 'file-actions');
    const revealBtn = element('button', t('revealInFinder') || '打开文件位置', 'btn btn-secondary');
    revealBtn.addEventListener('click', () => executeReveal(entry.path));
    const openBtn = element('button', '在系统中打开', 'btn btn-secondary');
    openBtn.addEventListener('click', () => request('openDefault', { path: entry.path }));
    actions.append(revealBtn, openBtn);
    article.append(actions);
  } else if (entry.kind === 'audio') {
    const card = element('div', undefined, 'attachment-card media-card');
    const badge = element('div', undefined, 'attachment-badge');
    badge.innerHTML = getFileIconSvg(entry, 24);
    const info = element('div', undefined, 'attachment-info');
    info.append(element('h3', entry.title, 'attachment-title'));
    if (entry.size) info.append(element('p', `${(entry.size / 1024).toFixed(1)} KB · 音频文件`, 'hint'));
    card.append(badge, info);
    article.append(card);
    if (entry.files?.[0]?.dataUrl) {
      const audio = element('audio', undefined, 'media-audio-player');
      audio.controls = true;
      audio.src = entry.files[0].dataUrl;
      article.append(audio);
    }
    const actions = element('div', undefined, 'file-actions');
    const openBtn = element('button', '在系统中打开', 'btn btn-primary');
    openBtn.addEventListener('click', () => request('openDefault', { path: entry.path }));
    const revealBtn = element('button', t('revealInFinder') || '打开文件位置', 'btn btn-secondary');
    revealBtn.addEventListener('click', () => executeReveal(entry.path));
    actions.append(openBtn, revealBtn);
    article.append(actions);
  } else if (entry.kind === 'video') {
    const card = element('div', undefined, 'attachment-card media-card');
    const badge = element('div', undefined, 'attachment-badge');
    badge.innerHTML = getFileIconSvg(entry, 24);
    const info = element('div', undefined, 'attachment-info');
    info.append(element('h3', entry.title, 'attachment-title'));
    if (entry.size) info.append(element('p', `${(entry.size / (1024 * 1024)).toFixed(2)} MB · 视频文件`, 'hint'));
    card.append(badge, info);
    article.append(card);
    if (entry.files?.[0]?.dataUrl) {
      const video = element('video', undefined, 'media-video-player');
      video.controls = true;
      video.src = entry.files[0].dataUrl;
      article.append(video);
    }
    const actions = element('div', undefined, 'file-actions');
    const openBtn = element('button', '在系统中打开', 'btn btn-primary');
    openBtn.addEventListener('click', () => request('openDefault', { path: entry.path }));
    const revealBtn = element('button', t('revealInFinder') || '打开文件位置', 'btn btn-secondary');
    revealBtn.addEventListener('click', () => executeReveal(entry.path));
    actions.append(openBtn, revealBtn);
    article.append(actions);
  } else if (entry.kind === 'pdf') {
    const card = element('div', undefined, 'attachment-card');
    const badge = element('div', undefined, 'attachment-badge');
    badge.innerHTML = getFileIconSvg(entry, 24);
    const info = element('div', undefined, 'attachment-info');
    info.append(element('h3', entry.title, 'attachment-title'));
    if (entry.size) info.append(element('p', `${(entry.size / 1024).toFixed(1)} KB · PDF 文档`, 'hint'));
    card.append(badge, info);
    article.append(card);
    const actions = element('div', undefined, 'file-actions');
    const openBtn = element('button', '在系统中打开', 'btn btn-primary');
    openBtn.addEventListener('click', () => request('openDefault', { path: entry.path }));
    const revealBtn = element('button', t('revealInFinder') || '打开文件位置', 'btn btn-secondary');
    revealBtn.addEventListener('click', () => executeReveal(entry.path));
    actions.append(openBtn, revealBtn);
    article.append(actions);
  } else if (entry.kind === 'attachment') {
    const card = element('div', undefined, 'attachment-card');
    const ext = entry.title.split('.').at(-1)?.toUpperCase() || 'FILE';
    let typeLabel = `${ext} 文件`;
    if (['DOCX', 'DOC'].includes(ext)) typeLabel = 'Word 文档';
    else if (['WPS', 'WPT', 'ET', 'ETT', 'DPS', 'DPT'].includes(ext)) typeLabel = 'WPS Office 文档';
    else if (['XLSX', 'XLS', 'CSV'].includes(ext)) typeLabel = 'Excel 电子表格';
    else if (['PPTX', 'PPT', 'KEY'].includes(ext)) typeLabel = '演示文稿';
    const badge = element('div', undefined, 'attachment-badge');
    badge.innerHTML = getFileIconSvg(entry, 24);
    const info = element('div', undefined, 'attachment-info');
    info.append(element('h3', entry.title, 'attachment-title'));
    const sizeStr = entry.size ? `${(entry.size / 1024).toFixed(1)} KB · ` : '';
    info.append(element('p', `${sizeStr}${typeLabel}`, 'hint'));
    const actions = element('div', undefined, 'file-actions');
    const openBtn = element('button', '在系统中打开', 'btn btn-primary');
    openBtn.addEventListener('click', () => request('openDefault', { path: entry.path }));
    const revealBtn = element('button', t('revealInFinder') || '打开文件位置', 'btn btn-secondary');
    revealBtn.addEventListener('click', () => executeReveal(entry.path));
    actions.append(openBtn, revealBtn);
    card.append(badge, info);
    article.append(card, actions);
  }
  detail.append(article); lock();
}
async function executeMove(entry, targetCategory, epoch) {
  try {
    return await request('move', { id: entry.id, targetCategory, expectedRevision: entry.revision }, epoch);
  } catch (err) {
    if (String(err?.message || err).includes('UNKNOWN_ACTION')) {
      const moved = await request('save', {
        title: entry.title,
        content: entry.content || '',
        category: targetCategory,
        kind: entry.kind || 'document',
        status: 'draft'
      }, epoch);
      try {
        await request('save', {
          id: entry.id,
          title: entry.title,
          content: entry.content || '',
          category: entry.category,
          status: 'archived',
          expectedRevision: entry.revision
        }, epoch);
      } catch {}
      return moved;
    }
    throw err;
  }
}
async function executeDelete(entry, epoch) {
  try {
    await request('delete', { id: entry.id, expectedRevision: entry.revision }, epoch);
  } catch (err) {
    if (String(err?.message || err).includes('UNKNOWN_ACTION')) {
      await request('save', {
        id: entry.id,
        title: entry.title,
        content: entry.content || '',
        category: entry.category,
        status: 'archived',
        expectedRevision: entry.revision
      }, epoch);
      return;
    }
    throw err;
  }
}
function promptText({ title, placeholder = '', onConfirm }) {
  const dialog = element('dialog', undefined, 'prompt-dialog');
  const form = element('form', undefined, 'prompt-dialog-body');
  const heading = element('h3', title, 'prompt-dialog-title');
  const input = element('input', undefined, 'prompt-dialog-input');
  input.type = 'text'; input.placeholder = placeholder; input.required = true;
  const actions = element('div', undefined, 'prompt-dialog-actions');
  const cancelBtn = element('button', t('cancel'), '');
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', () => { dialog.close(); dialog.remove(); });
  const okBtn = element('button', t('save') || '确定', 'primary');
  okBtn.type = 'submit';
  actions.append(cancelBtn, okBtn);
  form.append(heading, input, actions);
  dialog.append(form);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const val = input.value.trim();
    if (!val) { input.focus(); return; }
    dialog.close(); dialog.remove();
    onConfirm(val);
  });
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}
async function executeReveal(path) {
  try {
    if (bridge) {
      await bridge.invoke('fs.reveal', { path });
      return;
    }
  } catch (err) {
    console.warn('Native fs.reveal failed', err);
  }
  try {
    await request('reveal', { path });
  } catch {}
}
async function createDirectory(category, epoch) {
  try {
    await request('createCategory', { category }, epoch);
  } catch (err) {
    if (String(err?.message || err).includes('UNKNOWN_ACTION')) {
      await request('save', {
        title: 'index',
        content: `# ${category}\\n`,
        category,
        kind: 'document',
        status: 'draft'
      }, epoch);
      return;
    }
    throw err;
  }
}
let autoSaveTimer = null;
function renderNoteEditor(entry) {
  detail.replaceChildren();
  const form = element('form', undefined, 'note-editor');
  const editorEpoch = state.epoch, editorView = state.view;
  const titleInput = element('input', undefined, 'note-title-input');
  titleInput.type = 'text'; titleInput.name = 'title'; titleInput.placeholder = t('title'); titleInput.value = entry?.title || '';
  titleInput.setAttribute('aria-label', t('title'));
  const divider = element('div', undefined, 'note-title-divider');
  const contentInput = element('textarea', undefined, 'note-content-input');
  contentInput.name = 'content'; contentInput.placeholder = t('content'); contentInput.value = entry?.content || '';
  contentInput.setAttribute('aria-label', t('content'));
  if (state.stale) { titleInput.readOnly = true; contentInput.readOnly = true; }
  const submitBtn = mutation(element('button', undefined)); submitBtn.type = 'submit'; submitBtn.style.display = 'none'; submitBtn.setAttribute('aria-hidden', 'true');
  form.append(titleInput, divider, contentInput, submitBtn);
  if (entry?.kind === 'memory') {
    const memoryBar = element('div', undefined, 'memory-bar');
    memoryBar.append(mutation(button('forget', () => forgetMemory(entry))));
    form.append(memoryBar);
  }
  let editVersion = 0, saving = false, readAfterSave = false;
  const modeBar = element('div', undefined, 'note-mode-bar');
  const readButton = mutation(button('readMode', () => {
    if (state.stale || state.busy || !form.isConnected) return;
    if (state.dirty || saving) {
      readAfterSave = true; readButton.textContent = t('working');
      clearTimeout(autoSaveTimer); void performSave();
    } else { state.view++; state.mode = 'read'; renderDetail(); }
  }));
  modeBar.append(element('span', t('editMode'), 'note-mode-label'));
  if (entry) modeBar.append(readButton);
  form.prepend(modeBar);
  const settings = entry?.kind === 'memory' || (!entry && state.section === 'memory') ? memoryFields(t, entry || {}, { confirmation: true }) : null;
  if (settings) {
    form.insertBefore(settings.element, submitBtn);
    settings.element.addEventListener('input', onInput);
  }
  async function performSave() {
    if (saving || !form.isConnected || !active(editorEpoch) || editorView !== state.view || state.stale || state.busy) return;
    const rawTitle = titleInput.value.trim();
    const content = contentInput.value;
    if (!rawTitle && !content.trim() && !state.entry) return;
    let title = rawTitle;
    if (!title) {
      const firstLine = content.trim().split('\n')[0]?.replace(/^[#\s*-]+/, '').trim();
      title = firstLine ? firstLine.slice(0, 50) : (state.entry?.title || '未命名文档');
    }
    const category = entry?.category || (state.section === 'memory' ? 'memory' : state.category || 'general');
    const epoch = state.epoch;
    const version = editVersion;
    let saveAgain = false;
    saving = true;

    try {
      const saved = await request('save', {
        title,
        content,
        category,
        kind: entry?.kind || (state.section === 'memory' ? 'memory' : 'document'),
        status: entry?.status || 'draft',
        source: entry?.source || '',
        topics: entry?.topics || [],
        tags: entry?.tags || [],
        ...(settings ? settings.read() : {}),
        ...(state.entry ? { id: state.entry.id, ...(state.entry.kind === 'document' ? { recordId: state.entry.recordId } : {}), expectedRevision: state.entry.revision } : {})
      }, epoch);
      if (editorView !== state.view || !form.isConnected) return;
      state.entry = saved;
      if (editVersion !== version) { saveAgain = true; return; }
      const rendered = await updateSnapshot(epoch, () => editVersion === version && editorView === state.view && form.isConnected, () => {
        state.dirty = false;
        if (readAfterSave) state.mode = 'read';
      });
      if (!rendered) { saveAgain = editVersion !== version; return; }
      message(t('saved'));
    } catch (err) {
      readAfterSave = false; readButton.textContent = t('readMode');
      if (active(editorEpoch) && editorView === state.view && form.isConnected) message(errorText(err), true);
    } finally {
      saving = false;
      if (saveAgain) void performSave();
    }
  }
  function onInput() {
    editVersion++;
    state.dirty = true;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(performSave, 350);
  }
  titleInput.addEventListener('input', onInput);
  contentInput.addEventListener('input', onInput);
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(autoSaveTimer);
    performSave();
  });
  detail.append(form);
  appendDocumentMemory(entry);
  lock();
}
function forgetMemory(entry) {
  if (!window.confirm(t('forgetConfirm'))) return;
  void perform(async epoch => {
    await request('forget', { id: entry.id, expectedRevision: entry.revision }, epoch);
    state.entry = null;
    await updateSnapshot(epoch);
    message(t('deleted'));
  });
}
function appendDocumentMemory(entry) {
  const editorEpoch = state.epoch, editorView = state.view;
  if (entry?.kind === 'document' && entry.status !== 'archived') {
    const workspacePath = state.snapshot.workspacePath;
    const draft = state.memoryDraft?.workspacePath === workspacePath && state.memoryDraft.recordId === entry.recordId ? state.memoryDraft : null;
    const policy = sectionEntries('memory').find(row => row.documentRef?.recordId === entry.recordId);
    const captureDraft = values => {
      if (!active(editorEpoch) || editorView !== state.view || state.stale) return;
      const policyChanged = JSON.stringify(values.scopePaths || []) !== JSON.stringify(policy?.scopePaths || [])
        || (values.importance || 'normal') !== (policy?.importance || 'normal');
      state.memoryDraft = values.summary || values.readWhen || policyChanged ? { workspacePath, recordId: entry.recordId, ...values } : null;
      message(t('unsaved'));
    };
    detail.append(rememberDocumentForm(entry, t, { draft, policy, onDraftChange: captureDraft, onRemember: values => {
      if (state.dirty) { problem(new Error(t('saveBeforeLink'))); return; }
      captureDraft(values);
      void perform(async epoch => {
        const saved = await request('remember', { ...state.entry, ...values, kind: 'document', status: 'confirmed', expectedRevision: state.entry.revision }, epoch);
        state.entry = saved.document;
        if (saved.linked) state.memoryDraft = null;
        await updateSnapshot(epoch);
        message(t(saved.linked ? 'memoryLinked' : 'memoryLinkPartial'), !saved.linked);
      });
    } }));
  }
  lock();
}
async function openRecord(selector) {
  const payload = typeof selector === 'string' ? { id: selector } : selector;
  const view = ++state.view, epoch = state.epoch; state.mode = 'read'; state.entry = null;
  empty(detail, 'loading', 'pending');
  try { const entry = await request('read', payload, epoch); if (view !== state.view) return; state.entry = entry; renderList(); renderDetail(); }
  catch (error) { if (active(epoch) && view === state.view) { empty(detail, 'error', 'retry', button('retry', () => openRecord(selector))); problem(error); } }
}
async function updateSnapshot(epoch, isCurrent = () => true, beforeRender = () => {}) {
  const snapshot = await request('snapshot', {}, epoch);
  if (!isCurrent()) return false;
  if (snapshot.workspacePath !== state.snapshot?.workspacePath) {
    state.memoryDraft = null; state.entry = null; state.dirty = false; state.view++;
  }
  else beforeRender();
  state.snapshot = snapshot;
  state.results = null; state.query = ''; state.search++;
  renderShell(); renderList(); renderDetail();
  return true;
}
function field(form, name, label, value = '') {
  const wrapper = element('label', undefined, 'field'); wrapper.append(element('span', t(label)));
  const input = element(name === 'content' ? 'textarea' : 'input'); input.name = name;
  input.value = value; wrapper.append(input); form.append(wrapper); return input;
}
// PI-Desktop's menu-select, never a native <select>: the OS draws that popup
// outside these tokens. A hidden input keeps FormData working.
function selectField(form, name, label, value, options, { onChange } = {}) {
  const wrapper = element('label', undefined, 'field'); wrapper.append(element('span', t(label)));
  const control = createSelect({ name, label: t(label), value, options: options.map(option => ({ id: option, label: t(option) })), onChange });
  control.field = wrapper;
  wrapper.append(control.element); form.append(wrapper);
  return control;
}
function closeEditorDialog() {
  if (!editorDialog) return;
  if (editorDialog.open) editorDialog.close();
  editorDialog.remove();
  editorDialog = null;
}
function beginEditor(mode, title, popup = false) {
  state.view++; state.mode = mode; state.dirty = false;
  if (!popup) {
    detail.replaceChildren(element('h2', t(title)));
    return detail;
  }
  const dialog = element('dialog', undefined, 'editor-dialog');
  const head = element('div', undefined, 'dialog-head');
  head.append(element('h2', t(title)));
  const close = button('close', () => { if (leave()) { state.mode = 'read'; closeEditorDialog(); renderDetail(); } });
  close.classList.add('dialog-close');
  close.setAttribute('aria-label', t('close'));
  head.append(close);
  dialog.append(head);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (leave()) { state.mode = 'read'; closeEditorDialog(); renderDetail(); }
  });
  app.append(dialog);
  editorDialog = dialog;
  dialog.showModal();
  return dialog;
}
function editorActions(form, key, submit) {
  const actions = element('div', undefined, 'tools');
  const save = mutation(button(key, () => {} , true)); save.type = 'submit';
  actions.append(save, button('cancel', () => { if (leave()) { state.mode = 'read'; closeEditorDialog(); renderDetail(); } }));
  form.append(actions); form.addEventListener('input', markDirty);
  form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) perform(submit); }); lock();
}
function editRecord(entry) {
  const host = beginEditor('edit', entry ? 'edit' : 'new', !entry);
  const form = element('form', undefined, 'editor'); host.append(form);
  const title = field(form, 'title', 'title', entry?.title); title.required = true;
  const grid = element('div', undefined, 'field-grid'); form.append(grid);
  let category;
  if (state.section === 'knowledge') {
    category = field(grid, 'category', 'category', entry?.category || state.category || 'general');
    category.required = !entry;
    category.readOnly = Boolean(entry);
  } else { const fixed = field(form, 'category', 'category', entry?.category || state.section); fixed.type = 'hidden'; fixed.parentElement.hidden = true; category = fixed; }
  const kindOptions = state.section === 'memory' ? ['memory'] : ['document'];
  selectField(grid, 'kind', 'kind', entry?.kind || kindOptions[0], entry ? [entry.kind] : kindOptions);
  selectField(grid, 'status', 'status', entry?.status || 'draft', ['draft', 'confirmed', 'archived']);
  field(grid, 'topics', 'topics', (entry?.topics || []).join(', ')).placeholder = t('separated');
  field(grid, 'tags', 'tags', (entry?.tags || []).join(', ')).placeholder = t('separated');
  field(grid, 'source', 'source', entry?.source || '');
  if (entry) form.append(element('p', t('fixedLocation'), 'hint'));
  field(form, 'content', 'content', entry?.content || '');
  editorActions(form, 'save', async epoch => {
    const values = Object.fromEntries(new FormData(form));
    if (values.category) values.category = values.category.trim().toLowerCase();
    if (!values.title.trim()) { title.setCustomValidity(t('title')); title.reportValidity(); title.addEventListener('input', () => title.setCustomValidity(''), { once: true }); return; }
    const split = value => [...new Set(value.split(/[,，]/).map(part => part.trim()).filter(Boolean))];
    const saved = await request('save', { ...values, title: values.title.trim(), tags: split(values.tags), topics: split(values.topics), ...(entry ? { id: entry.id, expectedRevision: entry.revision } : {}) }, epoch);
    state.dirty = false; state.entry = saved; state.mode = 'read'; closeEditorDialog(); await updateSnapshot(epoch); renderDetail(); message(t('saved'));
  }); title.focus();
}
async function preferences() {
  const view = ++state.view, epoch = state.epoch; empty(detail, 'loading', 'pending');
  try {
    const preferences = await request('preferencesGet', {}, epoch); if (view !== state.view) return;
    beginEditor('preferences', 'preferences'); detail.append(element('p', t('preferencesHelp'), 'hint'));
    const form = element('form', undefined, 'editor'); detail.append(form);
    field(form, 'content', 'content', preferences.content);
    editorActions(form, 'savePreferences', async current => {
      const saved = await request('preferencesSave', { content: new FormData(form).get('content'), expectedRevision: preferences.revision }, current);
      preferences.revision = saved.revision; state.dirty = false; message(t('saved'));
    });
  } catch (error) { if (active(epoch) && view === state.view) problem(error); }
}
async function context() {
  const view = ++state.view, epoch = state.epoch; empty(detail, 'loading', 'pending');
  try { const result = await request('context', {}, epoch); if (view !== state.view) return; state.mode = 'context'; detail.replaceChildren(element('h2', t('context')), element('p', t('contextHelp'), 'hint'), element('pre', result.text, 'context')); }
  catch (error) { if (active(epoch) && view === state.view) problem(error); }
}
function exportHtml() {
  perform(async epoch => {
    const result = await request('export', {}, epoch);
    const url = URL.createObjectURL(new Blob([result.html], { type: 'text/html;charset=utf-8' }));
    const anchor = element('a'); anchor.href = url; anchor.download = 'project-wiki.html'; document.body.append(anchor);
    try { anchor.click(); message(t('exportDone')); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
}
function importView() {
  beginEditor('import', 'import');
  const form = element('form', undefined, 'editor'); detail.append(form);
  const title = field(form, 'title', 'importTitle'); title.required = true;
  const type = selectField(form, 'kind', 'importType', 'prototype', ['prototype', 'image', 'attachment'], {
    onChange: value => { if (entry) entry.field.hidden = value !== 'prototype'; },
  });
  const zone = element('div', undefined, 'dropzone'); zone.append(element('p', t('importHelp'), 'hint'));
  const picks = element('div', undefined, 'tools');
  let bundle = [], fileSerial = 0;
  const list = element('ul', undefined, 'file-list');
  const entry = selectField(form, 'entryPath', 'entryPath', '', []);
  async function accept(files) {
    const serial = ++fileSerial, epoch = state.epoch, view = state.view;
    try {
      const collected = await collectFiles(files);
      if (!active(epoch) || view !== state.view || serial !== fileSerial) return;
      bundle = collected; list.replaceChildren(...bundle.map(file => element('li', file.path)));
      const pages = bundle.filter(file => /\.html?$/i.test(file.path)).map(file => ({ id: file.path, label: file.path }));
      const preferred = pages.find(page => /(^|\/)index\.html?$/i.test(page.id)) ?? pages[0];
      entry.setOptions(pages, preferred?.id ?? '');
      if (!title.value) title.value = bundle[0].path.split('/')[0];
      state.dirty = true; message(`${t('importReady')}: ${bundle.length}`);
    } catch (error) { if (active(epoch) && view === state.view && serial === fileSerial) problem(error); }
  }
  for (const directory of [false, true]) {
    const label = element('label', undefined, 'field'); label.append(element('span', t(directory ? 'folder' : 'files')));
    const input = element('input'); input.type = 'file'; input.multiple = true;
    if (directory) input.setAttribute('webkitdirectory', '');
    input.addEventListener('change', () => accept(input.files)); label.append(input); picks.append(label);
  }
  zone.append(picks, element('p', t('folderDrop'), 'hint'), list); form.insertBefore(zone, entry.field);
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.dataset.drag = 'true'; });
  zone.addEventListener('dragleave', () => { delete zone.dataset.drag; });
  zone.addEventListener('drop', event => { event.preventDefault(); delete zone.dataset.drag; accept(event.dataTransfer.files); });
  editorActions(form, 'import', async epoch => {
    if (!bundle.length) throw new Error(t('noFiles'));
    if (type.value === 'prototype' && !entry.value) throw new Error(t('noHtml'));
    if (type.value === 'image' && bundle.some(file => !safeImage(file.dataUrl))) throw new Error(t('imageOnly'));
    const kind = type.value;
    // Images are independent records. Remove each successful import from the retry set.
    if (kind === 'image') {
      while (bundle.length) {
        const file = bundle[0];
        state.entry = await request('import', { title: bundle.length === 1 ? title.value : file.path, category: 'assets', kind, files: [file] }, epoch);
        bundle.shift(); list.firstChild?.remove();
      }
    } else {
      state.entry = await request('import', { title: title.value, category: kind === 'prototype' ? 'prototypes' : 'attachments', kind, files: bundle, ...(kind === 'prototype' ? { entryPath: entry.value } : {}) }, epoch);
    }
    state.dirty = false; state.mode = 'read'; await updateSnapshot(epoch); renderDetail(); message(t('importDone'));
  });
}
function workspaceChanged() {
  if (state.dirty || state.memoryDraft) {
    state.epoch++; state.view++; state.search++; state.stale = true; state.busy = false;
    message(t('stale'), true); notice.append(document.createTextNode(' '), button('discardDraft', () => {
      if (window.confirm(t('discard'))) { state.memoryDraft = null; refresh(); }
    })); lock();
  } else refresh();
}
function appearance(value) {
  const base = value?.base === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value?.base === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.base = base;
  document.documentElement.dataset.theme = base;
  let theme = document.querySelector('#host-plugin-theme');
  if (!theme) { theme = document.createElement('style'); theme.id = 'host-plugin-theme'; document.head.append(theme); }
  theme.textContent = typeof value?.pluginTheme?.css === 'string' ? value.pluginTheme.css : '';
}
window.addEventListener('beforeunload', event => { if (state.dirty || state.memoryDraft) { event.preventDefault(); event.returnValue = ''; } });
let dropOverlay = null;
async function extractDropEntries(dataTransfer) {
  const result = [];
  const items = dataTransfer?.items ? [...dataTransfer.items] : [];
  async function traverse(entry, folder = '') {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      result.push({ file, folder });
    } else if (entry.isDirectory) {
      const dirName = folder ? `${folder}/${entry.name}` : entry.name;
      const reader = entry.createReader();
      const readBatch = async () => {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (batch.length > 0) {
          for (const item of batch) await traverse(item, dirName);
          await readBatch();
        }
      };
      await readBatch();
    }
  }
  if (items.length && typeof items[0].webkitGetAsEntry === 'function') {
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) await traverse(entry);
    }
  }
  if (!result.length && dataTransfer?.files?.length) {
    for (const file of dataTransfer.files) {
      result.push({ file, folder: '' });
    }
  }
  return result;
}
async function handleDroppedItems(droppedItems) {
  if (!state.snapshot?.initialized) { message(t('initBody'), true); return; }
  if (!droppedItems?.length) return;
  perform(async epoch => {
    let lastEntry = null, importedCount = 0;
    for (const item of droppedItems) {
      const file = item.file;
      const folder = item.folder || '';
      const name = file.name;
      if (name === '.DS_Store' || name.startsWith('._')) continue;
      const baseName = name.replace(/\.[^.]+$/, '');
      const ext = name.split('.').at(-1)?.toLowerCase();
      let targetCat = folder.split('/')[0] || (state.section === 'knowledge' && state.category ? state.category : 'general');
      const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext);
      const isAud = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(ext);
      const isVid = ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext);
      const isPdf = ext === 'pdf';
      const isOfficeOrDoc = ['docx', 'doc', 'wps', 'wpt', 'et', 'ett', 'dps', 'dpt', 'xlsx', 'xls', 'csv', 'pptx', 'ppt', 'zip', 'rar'].includes(ext);
      if (isImg || isAud || isVid || isPdf || isOfficeOrDoc) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error(`${t('error')}: ${name}`));
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        const importKind = isImg ? 'image' : isAud ? 'audio' : isVid ? 'video' : isPdf ? 'pdf' : 'attachment';
        lastEntry = await request('import', {
          title: baseName,
          kind: importKind,
          category: targetCat,
          files: [{ path: name, dataUrl }]
        }, epoch);
        importedCount++;
      } else {
        let text;
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch { continue; }
        if (text.includes('\0')) continue;
        let title = baseName, content = text, tags = [], topics = [];
        const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
        if (match) {
          try {
            const meta = JSON.parse(match[1]);
            if (meta.title) title = meta.title;
            if (Array.isArray(meta.tags)) tags = meta.tags;
            if (Array.isArray(meta.topics)) topics = meta.topics;
            content = text.slice(match[0].length);
          } catch {
            const titleMatch = /title:\s*(.+)/.exec(match[1]);
            if (titleMatch) title = titleMatch[1].replace(/^['"]|['"]$/g, '').trim();
          }
        }
        if (targetCat && targetCat !== 'general') {
          try { await request('createCategory', { category: targetCat }, epoch); } catch {}
        }
        lastEntry = await request('save', {
          title: title.trim() || baseName,
          category: targetCat,
          kind: 'document',
          status: 'draft',
          tags,
          topics,
          content,
        }, epoch);
        importedCount++;
      }
    }
    await updateSnapshot(epoch);
    if (lastEntry) state.entry = lastEntry;
    renderShell(); renderList(); renderDetail();
    message(`${t('importSuccess')} ${importedCount} ${t('count')}`);
  });
}
async function handleDroppedFiles(fileList) {
  const items = [...fileList].map(file => ({ file, folder: '' }));
  return handleDroppedItems(items);
}
function setupDragAndDrop() {
  dropOverlay = element('div', undefined, 'drop-overlay');
  const card = element('div', undefined, 'drop-card');
  card.append(element('div', '📥', 'drop-icon'), element('h3', t('dropTitle')), element('p', t('dropSubtitle')));
  dropOverlay.append(card); document.body.append(dropOverlay);
  let dragDepth = 0;
  window.addEventListener('dragenter', event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault(); dragDepth++; dropOverlay.classList.add('active');
  });
  window.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', event => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.classList.remove('active');
  });
  window.addEventListener('drop', async event => {
    event.preventDefault(); dragDepth = 0; dropOverlay.classList.remove('active');
    const items = await extractDropEntries(event.dataTransfer);
    if (items.length) await handleDroppedItems(items);
  });
}
window.wikiUi = { handleDroppedFiles, preferences, importView, context, exportHtml, editRecord: entry => { state.view++; state.mode = 'edit'; state.entry = entry || null; renderDetail(); }, refresh };
async function start() {
  setupDragAndDrop();
  watchFocusRefresh({ state, request, onWorkspaceChanged: workspaceChanged, onError: problem,
    onSnapshot: (snapshot, entry) => {
      state.snapshot = snapshot;
      if (entry !== undefined) state.entry = entry;
      if (state.results === null) renderList();
      if (entry !== undefined) renderDetail();
    }
  });
  renderShell(); empty(detail, 'loading', 'pending');
  if (bridge) {
    try { setLocale(await bridge.invoke('app.getLocale')); } catch (error) { console.error('Locale lookup failed', error); }
    try { appearance(await bridge.invoke('app.getAppearance')); } catch (error) { console.error('Appearance lookup failed', error); }
    for (const event of ['workspace:changed', 'session:activated']) subscriptions.push(bridge.on(event, workspaceChanged));
    subscriptions.push(bridge.on('appearance:changed', appearance));
  }
  await refresh();
}
start();

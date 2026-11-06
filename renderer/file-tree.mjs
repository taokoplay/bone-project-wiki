// Tree nodes belong to stable record identities. Handlers resolve current
// metadata at invocation, including a menu opened before an autosave rename.
export function createFileTree({ state, target, entries, categories, allEntries, element, t,
  icon, collapsed, leave, openRecord, onNew, perform, move, remove, reveal,
  deleteCategory, promptText, showContextMenu, onMoved, onRemoved, onCategoryRemoved, refresh, message, defer }) {
  let root, section;
  const rows = new Map(), groups = new Map();
  let documentCounts = new Map();
  const latestEntries = () => [...new Map([...allEntries(), ...entries()].map(entry => [entry.path, entry])).values()];
  const key = entry => entry.kind === 'document' && entry.recordId
    ? documentCounts.get(entry.recordId) > 1 ? `path:${entry.path}` : `document:${entry.recordId}`
    : `id:${entry.kind}:${entry.category}:${entry.id}`;
  const reconcile = (parent, wanted) => {
    let cursor = parent.firstChild;
    for (const node of wanted) {
      if (node === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(node, cursor);
    }
    while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
  };
  function createGroup(category) {
    const group = element('div', undefined, 'tree-group'); group.dataset.category = category;
    const folder = element('div', undefined, 'tree-folder'); folder.setAttribute('role', 'treeitem');
    const chevron = element('span', undefined, 'tree-chevron');
    chevron.innerHTML = '<svg class="tree-chevron-svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    const folderIcon = element('span', undefined, 'tree-folder-icon');
    folderIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>';
    const name = element('span', state.section === 'memory' ? t('projectMemory') : t(category), 'tree-folder-name');
    const count = element('span', '', 'tree-folder-count');
    folder.append(chevron, folderIcon, name, count);
    if (state.section === 'knowledge') {
      const add = element('button', undefined, 'tree-folder-add'); add.type = 'button';
      const label = t('newInDirectory').replace('{directory}', t(category));
      add.title = label; add.setAttribute('aria-label', label);
      add.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
      add.addEventListener('click', event => {
        event.stopPropagation();
        if (!leave()) return;
        folder.setAttribute('aria-expanded', 'true'); collapsed.delete(category); onNew(category);
      });
      folder.append(add);
      folder.addEventListener('contextmenu', event => {
        event.preventDefault();
        showContextMenu(event.clientX, event.clientY, [
          { icon: '🔍', label: t('revealInFinder'), action: () => perform(() => reveal(`.bone-project-wiki/knowledge/${category}`)) },
          { separator: true },
          { icon: '🗑️', label: t('deleteCategory'), danger: true, action: () => {
            if (!window.confirm(t('deleteCategoryConfirm'))) return;
            perform(async epoch => { await deleteCategory(category, epoch); onCategoryRemoved(category); await refresh(epoch); message(t('deletedCategory')); });
          } },
        ]);
      });
    }
    folder.addEventListener('click', () => {
      const expanded = folder.getAttribute('aria-expanded') !== 'false';
      folder.setAttribute('aria-expanded', String(!expanded));
      if (expanded) collapsed.add(category); else collapsed.delete(category);
    });
    const children = element('div', undefined, 'tree-children'); children.setAttribute('role', 'group');
    group.append(folder, children);
    return { group, folder, children, count };
  }
  function createRow(entry) {
    const node = element('button', undefined, 'record tree-item'); node.type = 'button';
    const row = { node, entry, svg: null };
    const image = element('span', undefined, 'tree-item-icon'), title = element('strong', '', 'tree-item-title');
    node.append(image, title);
    const current = () => {
      const base = row.entry;
      const candidates = latestEntries().filter(latest => base.kind === 'document' && base.recordId
        ? latest.kind === base.kind && latest.recordId === base.recordId
        : latest.id === base.id && latest.kind === base.kind && latest.category === base.category);
      // A discovered result remains actionable while the next search is debounced.
      const latest = candidates.length === 0 ? base : candidates.length === 1 ? candidates[0] : candidates.find(latest => latest.path === base.path);
      return latest ? { ...(state.entry?.path === latest.path ? state.entry : {}), ...latest } : null;
    };
    const act = work => () => perform(async epoch => { const latest = current(); if (latest) await work(latest, epoch); });
    const moveTo = category => act(async (latest, epoch) => {
      onMoved(await move(latest, category, epoch)); await refresh(epoch);
      message(t('movedToDirectory').replace('{directory}', t(category)));
    });
    node.addEventListener('click', () => { const latest = current(); if (latest && leave()) void openRecord(latest.id); });
    node.addEventListener('contextmenu', event => {
      event.preventDefault();
      const latest = current(); if (!latest) return;
      const items = [];
      if (state.section === 'knowledge') {
        const children = categories().filter(category => category !== latest.category)
          .map(category => ({ icon: '📁', label: t(category), action: moveTo(category) }));
        if (children.length) children.push({ separator: true });
        children.push({ icon: '＋', label: t('newFolder'), action: () => promptText({
          title: t('newFolder'), placeholder: t('directoryPlaceholder'), onConfirm: category => moveTo(category)(),
        }) });
        items.push({ icon: '📁', label: t('moveTo'), children });
      }
      items.push({ icon: '🔍', label: t('revealInFinder'), action: act(latest => reveal(latest.path)) }, { separator: true },
        { icon: '🗑️', label: t('deleteDoc'), danger: true, action: () => {
          if (!window.confirm(t('deleteConfirm'))) return;
          act(async (latest, epoch) => { await remove(latest, epoch); onRemoved(latest); await refresh(epoch); message(t('deletedDoc')); })();
        } });
      showContextMenu(event.clientX, event.clientY, items);
    });
    return Object.assign(row, { image, title });
  }
  function render() {
    const nextRoot = target();
    if (!nextRoot) return;
    if (root !== nextRoot || section !== state.section) {
      root = nextRoot; section = state.section; rows.clear(); groups.clear();
    }
    const visible = entries().filter(entry => entry.status !== 'archived');
    documentCounts = new Map();
    for (const entry of latestEntries()) if (entry.kind === 'document' && entry.recordId) documentCounts.set(entry.recordId, (documentCounts.get(entry.recordId) || 0) + 1);
    const byCategory = new Map();
    if (section === 'knowledge') {
      for (const category of [...new Set([...categories(), ...visible.map(entry => entry.category).filter(Boolean)])].sort()) byCategory.set(category, []);
      for (const entry of visible) byCategory.get(entry.category)?.push(entry);
    } else if (visible.length) byCategory.set('memory', visible);
    const usedRows = new Set(), usedGroups = new Set(), nodes = [];
    for (const [category, members] of byCategory) {
      if (state.query && !members.length) continue;
      let group = groups.get(category);
      if (!group) { group = createGroup(category); groups.set(category, group); }
      group.folder.setAttribute('aria-expanded', String(!collapsed.has(category)));
      group.count.textContent = String(members.length);
      const children = members.map((entry, index) => {
        const identity = key(entry); usedRows.add(identity);
        let row = rows.get(identity);
        if (!row) { row = createRow(entry); rows.set(identity, row); }
        row.entry = entry;
        row.node.style.setProperty('--i', String(index));
        row.node.setAttribute('aria-pressed', String(entry.path && state.entry?.path ? entry.path === state.entry.path : entry.id === state.entry?.id));
        if (row.title.textContent !== entry.title) row.title.textContent = entry.title;
        const svg = icon(entry, 13);
        if (row.svg !== svg) { row.image.innerHTML = svg; row.svg = svg; }
        return row.node;
      });
      reconcile(group.children, children); usedGroups.add(category); nodes.push(group.group);
    }
    if (!nodes.length) nodes.push(element('p', state.query ? t('noResults') : t('noRecords'), 'hint'));
    reconcile(root, nodes);
    for (const identity of rows.keys()) if (!usedRows.has(identity)) rows.delete(identity);
    for (const category of groups.keys()) if (!usedGroups.has(category)) groups.delete(category);
  }
  return { render: () => defer('file-tree', render), loading: () => defer('file-tree', () => {
    const nextRoot = target(); if (!nextRoot) return;
    nextRoot.replaceChildren(element('p', t('loading'), 'hint'));
    rows.clear(); groups.clear();
  }) };
}

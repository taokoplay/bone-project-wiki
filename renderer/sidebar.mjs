// Panel-local layout state. Toggling never rebuilds the tree or current document.
export function createSidebarToggle(t, closeControls) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-toggle';
  button.setAttribute('aria-controls', 'wiki-sidebar');
  button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path class="sidebar-toggle-arrow" d="m16 9-3 3 3 3"/></svg>';
  let collapsed = false;
  let shell, library;

  function apply() {
    const label = t(collapsed ? 'expandSidebar' : 'collapseSidebar');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-expanded', String(!collapsed));
    if (shell && library) {
      library.hidden = collapsed;
      shell.classList.toggle('sidebar-collapsed', collapsed);
    }
  }
  button.addEventListener('click', () => {
    closeControls();
    collapsed = !collapsed;
    apply();
    button.focus({ preventScroll: true });
  });
  apply();
  return {
    button,
    attach(nextShell, nextLibrary) {
      shell = nextShell;
      library = nextLibrary;
      library.id = 'wiki-sidebar';
      apply();
    }
  };
}

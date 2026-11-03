// PI-Desktop's own menu-select pattern (SettingsMenuSelect + AnchoredMenu),
// rebuilt in plain DOM because this panel is an isolated page and cannot import
// host React components: a pill trigger, a fixed listbox portaled to <body> and
// placed from the trigger rect, a check mark on the current option, arrow-key
// wrap, and Escape / outside-click / scroll close. Native <select> popups are
// drawn by the OS, ignore these tokens and show the platform highlight, so the
// panel never uses one.
let openSurface = null;

const CHEVRON = 'M3.5 6l4.5 4.5L12.5 6';

function icon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'chevron');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CHEVRON);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function check() {
  const span = document.createElement('span');
  span.className = 'option-check';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = '✓';
  return span;
}

const MARGIN = 8;
const GAP = 6;

function place(surface, trigger, align) {
  const rect = trigger.getBoundingClientRect();
  surface.hidden = false;
  surface.style.visibility = 'hidden';
  const width = surface.offsetWidth;
  const height = surface.offsetHeight;
  let left = align === 'end' ? rect.right - width : rect.left;
  left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - width - MARGIN));
  let top = rect.bottom + GAP;
  if (top + height > window.innerHeight - MARGIN) top = Math.max(MARGIN, rect.top - GAP - height);
  surface.style.left = `${left}px`;
  surface.style.top = `${top}px`;
  surface.style.minWidth = `${Math.min(rect.width, window.innerWidth - MARGIN * 2)}px`;
  surface.style.visibility = '';
}

function closeSurface(restore = true) {
  const current = openSurface;
  if (!current) return;
  openSurface = null;
  current.surface.remove();
  current.trigger.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', current.onOutside, true);
  document.removeEventListener('keydown', current.onGlobalKey, true);
  window.removeEventListener('resize', current.onViewport, true);
  window.removeEventListener('scroll', current.onViewport, true);
  if (restore) current.trigger.focus();
}

/** Close any open select or menu; the shell calls this before it re-renders. */
export function closeAnyControl() { closeSurface(false); }

function openSurfaceFor(config) {
  closeSurface(false);
  const surface = document.createElement('div');
  surface.className = `popover ${config.className}`;
  surface.setAttribute('role', config.role);
  surface.setAttribute('aria-label', config.label);
  surface.setAttribute('tabindex', '-1');
  document.body.append(surface);
  config.build(surface);
  place(surface, config.trigger, config.align);
  config.trigger.setAttribute('aria-expanded', 'true');
  const onOutside = event => { if (!surface.contains(event.target) && !config.trigger.contains(event.target)) closeSurface(false); };
  const onGlobalKey = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSurface(true); } };
  const onViewport = () => closeSurface(false);
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onGlobalKey, true);
  window.addEventListener('resize', onViewport, true);
  window.addEventListener('scroll', onViewport, true);
  openSurface = { surface, trigger: config.trigger, onOutside, onGlobalKey, onViewport };
  config.onOpen?.(surface);
  return surface;
}

/**
 * Single-choice control.
 * @returns {{ element: HTMLElement, setOptions(list: {id: string, label: string, disabled?: boolean}[], next?: string): void,
 *   setDisabled(disabled: boolean): void, get value(): string, setValue(value: string): void, focus(): void }}
 */
export function createSelect({ name, label, value = '', options = [], onChange, disabled = false, align = 'start' }) {
  let current = value;
  let items = options.slice();
  const root = document.createElement('div');
  root.className = 'select';
  if (name) root.dataset.select = name;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', label);
  const valueLabel = document.createElement('span');
  valueLabel.className = 'select-value';
  trigger.append(valueLabel, icon());
  // The panel reads form values with FormData, which only sees native controls.
  const hidden = document.createElement(name ? 'input' : 'span');
  if (name) { hidden.type = 'hidden'; hidden.name = name; }
  root.append(trigger, hidden);

  const renderValue = () => {
    const match = items.find(item => item.id === current);
    valueLabel.textContent = match ? match.label : current;
    root.dataset.value = current;
    if (name) hidden.value = current;
    trigger.disabled = disabled || !items.length;
  };

  const choose = next => {
    if (next === current) return;
    current = next;
    renderValue();
    // Native selects fire `input` on change; forms rely on it to mark dirty.
    root.dispatchEvent(new Event('input', { bubbles: true }));
    onChange?.(next);
  };

  const open = () => {
    openSurfaceFor({
      trigger,
      role: 'listbox',
      label,
      className: 'popover-list',
      align,
      build: node => {
        const focused = document.createElement('ul');
        focused.className = 'popover-options';
        focused.setAttribute('role', 'presentation');
        for (const option of items) {
          const item = document.createElement('li');
          item.setAttribute('role', 'presentation');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'popover-option';
          button.setAttribute('role', 'option');
          button.dataset.value = option.id;
          button.setAttribute('aria-selected', String(option.id === current));
          button.tabIndex = -1;
          if (option.disabled) button.disabled = true;
          if (option.id === current) button.classList.add('is-current');
          const text = document.createElement('span');
          text.className = 'popover-option-label';
          text.textContent = option.label;
          button.append(text);
          if (option.id === current) button.append(check());
          button.addEventListener('click', () => { closeSurface(true); choose(option.id); });
          item.append(button);
          focused.append(item);
        }
        node.append(focused);
      },
      onOpen: surface => {
        const buttons = [...surface.querySelectorAll('[role="option"]')];
        const target = surface.querySelector('[aria-selected="true"]:not([disabled])') || buttons[0];
        target?.focus();
        surface.addEventListener('keydown', event => {
          const focusables = buttons.filter(button => !button.disabled);
          const index = focusables.indexOf(document.activeElement);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            const next = index === -1
              ? (delta > 0 ? 0 : focusables.length - 1)
              : (index + delta + focusables.length) % focusables.length;
            focusables[next]?.focus();
            return;
          }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            (event.key === 'Home' ? focusables[0] : focusables.at(-1))?.focus();
            return;
          }
          if (event.key === 'Tab') { closeSurface(false); return; }
        });
      },
    });
  };

  trigger.addEventListener('click', () => {
    if (openSurface?.surface && openSurface.trigger === trigger) closeSurface(true);
    else open();
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
  });

  renderValue();
  return {
    element: root,
    get value() { return current; },
    setValue(next) { current = next; renderValue(); },
    setOptions(next, nextValue) {
      items = next.slice();
      if (nextValue !== undefined) current = nextValue;
      else if (!items.some(item => item.id === current)) current = items[0]?.id ?? '';
      renderValue();
    },
    setDisabled(next) { disabled = next; renderValue(); },
    focus() { trigger.focus(); },
  };
}

/**
 * Trigger-anchored action menu. `items` is read every time the menu opens, so a
 * caller can gate entries on current state without rebuilding the trigger.
 * @returns {{ element: HTMLElement, setDisabled(disabled: boolean): void }}
 */
export function createMenu({ label, items, disabled = false, align = 'end' }) {
  const root = document.createElement('div');
  root.className = 'menu';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'menu-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', label);
  const text = document.createElement('span');
  text.textContent = label;
  trigger.append(text, icon());
  root.append(trigger);
  let off = disabled;
  const sync = () => { trigger.disabled = off; };
  sync();

  trigger.addEventListener('click', () => {
    if (openSurface?.surface && openSurface.trigger === trigger) { closeSurface(true); return; }
    openSurfaceFor({
      trigger,
      role: 'menu',
      label,
      className: 'popover-menu',
      align,
      build: node => {
        const list = document.createElement('div');
        list.setAttribute('role', 'presentation');
        const entries = items().filter(Boolean);
        for (const entry of entries) {
          if (entry.separator) {
            const line = document.createElement('div');
            line.className = 'popover-separator';
            line.setAttribute('role', 'separator');
            list.append(line);
            continue;
          }
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'popover-item';
          button.setAttribute('role', 'menuitem');
          button.tabIndex = -1;
          if (entry.disabled) button.disabled = true;
          button.textContent = entry.label;
          button.addEventListener('click', () => { closeSurface(false); entry.onSelect?.(); });
          list.append(button);
        }
        node.append(list);
      },
      onOpen: surface => {
        const buttons = [...surface.querySelectorAll('[role="menuitem"]:not([disabled])')];
        buttons[0]?.focus();
        surface.addEventListener('keydown', event => {
          const focusables = [...surface.querySelectorAll('[role="menuitem"]:not([disabled])')];
          const index = focusables.indexOf(document.activeElement);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            const next = index === -1
              ? (delta > 0 ? 0 : focusables.length - 1)
              : (index + delta + focusables.length) % focusables.length;
            focusables[next]?.focus();
          }
        });
      },
    });
  });

  return {
    element: root,
    setDisabled(next) { off = next; sync(); },
  };
}

export function showContextMenu(x, y, items) {
  closeAnyControl();
  const openPopovers = [];
  function closeAll() {
    while (openPopovers.length) openPopovers.pop().remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('contextmenu', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onOutside(event) {
    if (!openPopovers.some(p => p.contains(event.target))) closeAll();
  }
  function onKey(event) {
    if (event.key === 'Escape') closeAll();
  }
  function createMenu(menuItems) {
    const popover = document.createElement('div');
    popover.className = 'popover context-menu';
    popover.setAttribute('role', 'menu');
    let activeSubmenu = null;
    for (const item of menuItems) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'popover-separator';
        popover.append(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'popover-item';
      btn.setAttribute('role', 'menuitem');
      if (item.danger) btn.classList.add('danger');
      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'menu-icon';
        iconSpan.textContent = item.icon;
        btn.append(iconSpan);
      }
      const labelSpan = document.createElement('span');
      labelSpan.className = 'popover-option-label';
      labelSpan.textContent = item.label;
      btn.append(labelSpan);
      if (Array.isArray(item.children) && item.children.length) {
        const arrow = document.createElement('span');
        arrow.className = 'menu-arrow';
        arrow.textContent = '▸';
        btn.append(arrow);
        const openSub = () => {
          if (activeSubmenu) activeSubmenu.remove();
          const rect = btn.getBoundingClientRect();
          const sub = createMenu(item.children);
          activeSubmenu = sub;
          openPopovers.push(sub);
          document.body.append(sub);
          positionMenu(sub, rect.right + 2, rect.top - 4);
        };
        btn.addEventListener('mouseenter', openSub);
        btn.addEventListener('click', event => {
          event.stopPropagation();
          openSub();
        });
      } else {
        btn.addEventListener('mouseenter', () => {
          if (activeSubmenu) { activeSubmenu.remove(); activeSubmenu = null; }
        });
        btn.addEventListener('click', event => {
          event.stopPropagation();
          closeAll();
          item.action?.();
        });
      }
      popover.append(btn);
    }
    return popover;
  }
  function positionMenu(popover, targetX, targetY) {
    const width = popover.offsetWidth || 150;
    const height = popover.offsetHeight || 100;
    let left = targetX;
    if (left + width > window.innerWidth - 10) left = Math.max(10, targetX - width - 20);
    let top = targetY;
    if (top + height > window.innerHeight - 10) top = Math.max(10, window.innerHeight - height - 10);
    popover.style.left = `${Math.max(10, left)}px`;
    popover.style.top = `${Math.max(10, top)}px`;
  }
  const rootMenu = createMenu(items);
  openPopovers.push(rootMenu);
  document.body.append(rootMenu);
  positionMenu(rootMenu, x, y);
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('contextmenu', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}

// scripts/ui/cloud-menu.js
// Контекстное меню для Cloud-трека (ТЗ 10)

const MENU_CSS = `
.cloud-ctx-menu {
  position: absolute;
  z-index: 9999;
  background: #222;
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.4);
  min-width: 160px;
  padding: 6px 0;
  font-size: 14px;
  color: #eee;
}
.cloud-ctx-menu-item {
  padding: 8px 14px;
  cursor: pointer;
  white-space: nowrap;
}
.cloud-ctx-menu-item:hover {
  background: #333;
}
`;

function injectCss() {
  const U = window.Utils;
  if (U?.dom?.createStyleOnce) {
    U.dom.createStyleOnce('cloud-ctx-menu-css', MENU_CSS);
    return;
  }

  if (document.getElementById('cloud-ctx-menu-css')) return;
  const s = document.createElement('style');
  s.id = 'cloud-ctx-menu-css';
  s.textContent = MENU_CSS;
  document.head.appendChild(s);
}

let activeMenu = null;
let offDocClick = null;

function closeActiveMenu() {
  if (activeMenu) {
    try { activeMenu.remove(); } catch {}
    activeMenu = null;
  }
  if (offDocClick) {
    try { offDocClick(); } catch {}
    offDocClick = null;
  }
}

function onDocClick(e) {
  if (activeMenu && !activeMenu.contains(e.target)) {
    closeActiveMenu();
  }
}

export function attachCloudMenu(opts = {}) {
  const U = window.Utils;
  const on = U?.dom?.on ? U.dom.on.bind(U.dom) : (el, ev, fn, o) => {
    if (!el) return () => {};
    el.addEventListener(ev, fn, o);
    return () => el.removeEventListener(ev, fn, o);
  };

  const defer = U?.dom?.defer ? U.dom.defer.bind(U.dom) : (fn) => setTimeout(fn, 0);

  const root = opts.root;
  const onAddLock = opts.onAddLock;
  const onRemoveCache = opts.onRemoveCache;

  if (!root) return;

  injectCss();
  closeActiveMenu();

  const menu = document.createElement('div');
  menu.className = 'cloud-ctx-menu';

  const lockItem = document.createElement('div');
  lockItem.className = 'cloud-ctx-menu-item';
  lockItem.textContent = '🔒 Закрепить офлайн';
  on(lockItem, 'click', (e) => {
    e.stopPropagation();
    closeActiveMenu();
    if (typeof onAddLock === 'function') onAddLock();
  });
  menu.appendChild(lockItem);

  const removeItem = document.createElement('div');
  removeItem.className = 'cloud-ctx-menu-item';
  removeItem.textContent = '🗑 Удалить из кэша';
  on(removeItem, 'click', (e) => {
    e.stopPropagation();
    closeActiveMenu();
    if (typeof onRemoveCache === 'function') onRemoveCache();
  });
  menu.appendChild(removeItem);

  document.body.appendChild(menu);

  const rect = root.getBoundingClientRect();
  let top = rect.bottom + 4;
  let left = rect.left;

  if (left + menu.offsetWidth > window.innerWidth) {
    left = window.innerWidth - menu.offsetWidth - 8;
  }
  if (top + menu.offsetHeight > window.innerHeight) {
    top = rect.top - menu.offsetHeight - 4;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  activeMenu = menu;

  defer(() => {
    // capture=true чтобы закрываться раньше других обработчиков при клике вне меню
    offDocClick = on(document, 'click', onDocClick, true);
  });
}

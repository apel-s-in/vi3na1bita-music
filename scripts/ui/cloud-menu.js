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
  if (document.getElementById('cloud-ctx-menu-css')) return;
  const s = document.createElement('style');
  s.id = 'cloud-ctx-menu-css';
  s.textContent = MENU_CSS;
  document.head.appendChild(s);
}

let activeMenu = null;

function closeActiveMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
  document.removeEventListener('click', onDocClick, true);
}

function onDocClick(e) {
  if (activeMenu && !activeMenu.contains(e.target)) {
    closeActiveMenu();
  }
}

export function attachCloudMenu(opts = {}) {
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
  lockItem.onclick = (e) => {
    e.stopPropagation();
    closeActiveMenu();
    if (typeof onAddLock === 'function') onAddLock();
  };
  menu.appendChild(lockItem);

  const removeItem = document.createElement('div');
  removeItem.className = 'cloud-ctx-menu-item';
  removeItem.textContent = '🗑 Удалить из кэша';
  removeItem.onclick = (e) => {
    e.stopPropagation();
    closeActiveMenu();
    if (typeof onRemoveCache === 'function') onRemoveCache();
  };
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

  menu.style.top = top + 'px';
  menu.style.left = left + 'px';

  activeMenu = menu;

  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
  }, 0);
}

// scripts/ui/cloud-menu.js

export function attachCloudMenu({ root, onAddLock, onRemoveCache }) {
  // root — элемент кнопки ☁
  root.addEventListener('click', (e) => {
    e.preventDefault();
    const menu = document.createElement('div');
    menu.className = 'cloud-menu';
    menu.innerHTML = `
      <button data-action="add-lock">Добавить замочек 🔒</button>
      <button data-action="remove-cache">Удалить из кэша (статистика будет сброшена)</button>
    `;
    document.body.appendChild(menu);
    const onClick = (ev) => {
      const act = ev.target?.getAttribute?.('data-action');
      if (act === 'add-lock') onAddLock?.();
      if (act === 'remove-cache') onRemoveCache?.();
      cleanup();
    };
    const onDoc = (ev) => {
      if (!menu.contains(ev.target)) cleanup();
    };
    function cleanup() {
      menu.remove();
      document.removeEventListener('click', onDoc, true);
      menu.removeEventListener('click', onClick);
    }
    menu.addEventListener('click', onClick);
    setTimeout(() => document.addEventListener('click', onDoc, true));
  });
}

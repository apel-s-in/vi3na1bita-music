// scripts/ui/cloud-menu.js
// Меню для ☁ (ТЗ: "Добавить 🔒" / "Удалить из кэша")

export function attachCloudMenu({ root, onAddLock, onRemoveCache } = {}) {
  const el = root;
  if (!el) return;

  const mgr = window.OfflineUI?.offlineManager;
  const openModal = window.Modals?.open;
  const actionRow = window.Modals?.actionRow;

  if (typeof openModal !== 'function') return;

  const modal = openModal({
    title: 'Cloud ☁',
    maxWidth: 420,
    bodyHtml: `
      <div style="color:#9db7dd; line-height:1.45; margin-bottom:14px;">
        Управление облачным кэшем трека.
      </div>
      ${typeof actionRow === 'function' ? actionRow([
        { act: 'add', text: 'Добавить замочек 🔒', className: 'online', style: 'min-width:170px;' },
        { act: 'remove', text: 'Удалить из кэша', className: '', style: 'min-width:170px;' }
      ]) : ''}
    `
  });

  modal.querySelector('[data-act="add"]')?.addEventListener('click', async () => {
    try {
      if (typeof onAddLock === 'function') await onAddLock();
      window.NotificationSystem?.success('Трек добавлен в pinned 🔒');
    } catch {
      window.NotificationSystem?.error('Не удалось добавить в pinned');
    } finally {
      try { modal.remove(); } catch {}
    }
  });

  modal.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
    try { modal.remove(); } catch {}

    if (window.Modals?.confirm) {
      window.Modals.confirm({
        title: 'Удалить из кэша?',
        textHtml: 'Cloud‑статистика будет сброшена.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        danger: true,
        onConfirm: async () => {
          try {
            if (typeof onRemoveCache === 'function') {
              await onRemoveCache();
            } else {
              const uid = String(el.dataset?.uid || '').trim();
              if (uid && mgr) await mgr.cloudMenu(uid, 'remove-cache');
            }
            window.NotificationSystem?.success('Трек удалён из cloud');
          } catch {
            window.NotificationSystem?.error('Не удалось удалить из cloud');
          }
        }
      });
    }
  });
}

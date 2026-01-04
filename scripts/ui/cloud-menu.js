// scripts/ui/cloud-menu.js
// Меню для ☁ (ТЗ: “Добавить 🔒” / “Удалить из кэша” + сброс cloud-статистики)
// Реализация под текущий проект: Utils.createModal(html), OfflineUI.offlineManager

import { OfflineUI } from '../app/offline-ui-bootstrap.js';

export function attachCloudMenu({ root, onAddLock, onRemoveCache } = {}) {
  const el = root;
  if (!el) return;

  const esc = window.Utils?.escapeHtml
    ? (s) => window.Utils.escapeHtml(String(s || ''))
    : (s) => String(s || '');

  const html = `
    <div class="modal-feedback" style="max-width: 420px;">
      <button class="bigclose" title="Закрыть" aria-label="Закрыть">
        <svg viewBox="0 0 48 48">
          <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        </svg>
      </button>

      <div style="font-size: 1.08em; font-weight: 900; color: #eaf2ff; margin-bottom: 10px;">
        Cloud ☁
      </div>

      <div style="color:#9db7dd; line-height:1.45; margin-bottom: 14px;">
        <div style="opacity:.9;">
          Управление облачным кэшем трека.
        </div>
      </div>

      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button class="offline-btn online" data-act="add" style="min-width: 170px;">Добавить замочек 🔒</button>
        <button class="offline-btn" data-act="remove" style="min-width: 170px;">Удалить из кэша</button>
      </div>
    </div>
  `;

  const modal = (window.Utils && typeof window.Utils.createModal === 'function')
    ? window.Utils.createModal(html)
    : null;

  if (!modal) return;

  modal.querySelector('[data-act="add"]')?.addEventListener('click', async () => {
    try {
      if (typeof onAddLock === 'function') {
        await onAddLock();
      }
      window.NotificationSystem?.success('Трек добавлен в pinned 🔒');
    } catch (e) {
      window.NotificationSystem?.error('Не удалось добавить в pinned');
    } finally {
      try { modal.remove(); } catch {}
    }
  });

  modal.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
    const ok = window.confirm('Удалить из кэша? Cloud‑статистика будет сброшена.');
    if (!ok) return;

    try {
      if (typeof onRemoveCache === 'function') {
        await onRemoveCache();
      } else {
        // fallback: если коллбеки не передали — используем стандартный метод
        const uid = String(el.dataset?.uid || '').trim();
        if (uid) {
          await OfflineUI.offlineManager.cloudMenu(uid, 'remove-cache');
        }
      }
      window.NotificationSystem?.success('Трек удалён из cloud');
    } catch (e) {
      window.NotificationSystem?.error('Не удалось удалить из cloud');
    } finally {
      try { modal.remove(); } catch {}
    }
  });
}

// scripts/ui/offline-indicators.js
import { OfflineUI } from '../app/offline-ui-bootstrap.js';
import { attachCloudMenu } from './cloud-menu.js';

const ICON_CSS = `
  .offline-ico-slot{display:inline-flex;align-items:center;margin-right:6px}
  .offline-ico{cursor:pointer;user-select:none;font-size:14px;line-height:1}
  .offline-ico.gray{opacity:.4}
  .offline-ico.lock{width:1em}
  .offline-ico.cloud{width:1em}
`;
function injectCss() {
  if (document.getElementById('offline-ico-css')) return;
  const s = document.createElement('style');
  s.id = 'offline-ico-css';
  s.textContent = ICON_CSS;
  document.head.appendChild(s);
}

function findUidForRow(row) {
  // 0) Самый надёжный источник — data-uid на строке (ставим в scripts/app/albums.js и в favorites render)
  const rowUid = String(row?.dataset?.uid || '').trim();
  if (rowUid) return rowUid;

  // 1) __favorites__: id="fav_{albumKey}_{uid}"
  const id = String(row?.id || '');
  const m = id.match(/^fav_(.+)_(.+)$/);
  if (m && m[2]) return String(m[2]).trim() || null;

  // 2) Fallback: у звезды есть data-uid
  const star = row?.querySelector?.('.like-star[data-uid]');
  const starUid = String(star?.dataset?.uid || '').trim();
  if (starUid) return starUid;

  return null;
}

function ensureSlot(row) {
  let slot = row.querySelector(':scope > .offline-ico-slot');
  if (slot) return slot;

  slot = document.createElement('span');
  slot.className = 'offline-ico-slot';

  // Попробуем вставить перед “номером”; если его нет — в начало строки
  const num = row.querySelector('.tnum');
  if (num && num.parentNode === row) {
    row.insertBefore(slot, num);
  } else {
    row.insertBefore(slot, row.firstChild);
  }
  return slot;
}

function renderIndicator(row, state, uid) {
  const slot = ensureSlot(row);
  slot.innerHTML = '';

  const isUnknown = !!state?.unknown;

  // Приоритет отображения: pinned 🔒 → ☁ (cloud&&100%) → серый 🔒
  if (!isUnknown && state.pinned) {
    const el = document.createElement('span');
    el.className = 'offline-ico lock';
    el.textContent = '🔒';
    el.title = 'Закреплено офлайн';
    el.dataset.uid = uid;
    el.dataset.active = 'true';
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await OfflineUI.offlineManager.unpin(uid); } catch {}
      refreshRow(row);
    });
    slot.appendChild(el);
    return;
  }

  if (!isUnknown && state.cloud && state.cachedComplete) {
    const el = document.createElement('span');
    el.className = 'offline-ico cloud';
    el.textContent = '☁';
    el.title = 'Доступно офлайн по облаку';
    el.dataset.uid = uid;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      attachCloudMenu({
        root: el,
        onAddLock: async () => { await OfflineUI.offlineManager.pin(uid); refreshRow(row); },
        onRemoveCache: async () => { await OfflineUI.offlineManager.cloudMenu(uid, 'remove-cache'); refreshRow(row); }
      });
    });

    slot.appendChild(el);
    return;
  }

  // серый 🔒 (если unknown — не кликается)
  const el = document.createElement('span');
  el.className = 'offline-ico lock gray';
  el.textContent = '🔒';
  el.dataset.uid = uid || '';
  el.dataset.active = 'false';

  if (isUnknown) {
    el.title = 'OFFLINE: UID ещё не готов';
    el.style.pointerEvents = 'none';
    el.style.opacity = '0.25';
    slot.appendChild(el);
    return;
  }

  el.title = 'Закрепить офлайн';
  el.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await OfflineUI.offlineManager.pin(uid);
      // ✅ ТЗ 20: UX сообщение о старте
      window.NotificationSystem?.info('Трек будет доступен офлайн. Начинаю скачивание…', 3500);
    } catch {
      window.NotificationSystem?.error('Не удалось закрепить офлайн');
    }
    refreshRow(row);
  });

  slot.appendChild(el);
}

async function refreshRow(row) {
  const uid = findUidForRow(row);

  // ✅ Даже если uid пока неизвестен — показываем серый 🔒 как “не готово”.
  if (!uid) {
    renderIndicator(row, { pinned: false, cloud: false, cachedComplete: false, unknown: true }, '');
    return;
  }

  const ind = await OfflineUI.offlineManager.getIndicators(uid);
  renderIndicator(row, ind, uid);
}

function refreshAll() {
  const list = document.querySelectorAll('#track-list .track');
  list.forEach((row) => refreshRow(row));
}

function bindLiveUpdates() {
  // Обновляем индикатор при прогрессе загрузок/завершении
  OfflineUI.offlineManager.on('progress', (ev) => {
    const uid = String(ev?.uid || '').trim();
    if (!uid) return;

    // ✅ Точечно обновляем только строки с этим uid:
    // - в __favorites__ uid хранится в data-uid на строке
    // - в обычных альбомах uid теперь тоже на строке (scripts/app/albums.js)
    const rows = document.querySelectorAll(`#track-list .track[data-uid="${CSS.escape(uid)}"]`);
    rows.forEach((row) => refreshRow(row));
  });

  // При любых точечных апдейтах списка (например, favorites:changed) — безопасный рефреш
  window.addEventListener('favorites:changed', () => setTimeout(refreshAll, 0));
  window.addEventListener('favorites:refsChanged', () => setTimeout(refreshAll, 0));
}

export function attachOfflineIndicators() {
  injectCss();
  // Стартовый проход
  refreshAll();

  // Наблюдатель за перестроением списков
  const root = document.getElementById('track-list') || document.body;
  const mo = new MutationObserver((muts) => {
    let need = false;
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) need = true;
      if (m.type === 'childList') need = true;
    }
    if (need) refreshAll();
  });
  mo.observe(root, { childList: true, subtree: true });

  bindLiveUpdates();
}

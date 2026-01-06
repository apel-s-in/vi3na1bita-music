// scripts/ui/offline-indicators.js
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
  const rowUid = String(row?.dataset?.uid || '').trim();
  if (rowUid) return rowUid;

  const id = String(row?.id || '');
  const m = id.match(/^fav_(.+)_(.+)$/);
  if (m && m[2]) return String(m[2]).trim() || null;

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
  const mgr = window.OfflineUI?.offlineManager;

  if (!isUnknown && state.pinned) {
    const el = document.createElement('span');
    el.className = 'offline-ico lock';
    el.textContent = '🔒';
    el.title = 'Закреплено офлайн';
    el.dataset.uid = uid;
    el.dataset.active = 'true';
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { if (mgr) await mgr.unpin(uid); } catch {}
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
        onAddLock: async () => { if (mgr) await mgr.pin(uid); refreshRow(row); },
        onRemoveCache: async () => { if (mgr) await mgr.cloudMenu(uid, 'remove-cache'); refreshRow(row); }
      });
    });

    slot.appendChild(el);
    return;
  }

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
      if (mgr) {
        await mgr.pin(uid);
        window.NotificationSystem?.info('Трек будет доступен офлайн. Начинаю скачивание…', 3500);
      }
    } catch {
      window.NotificationSystem?.error('Не удалось закрепить офлайн');
    }
    refreshRow(row);
  });

  slot.appendChild(el);
}

async function refreshRow(row) {
  const uid = findUidForRow(row);
  const mgr = window.OfflineUI?.offlineManager;

  if (!mgr) {
    return; 
  }

  if (!uid) {
    renderIndicator(row, { pinned: false, cloud: false, cachedComplete: false, unknown: true }, '');
    return;
  }

  try {
    const ind = await mgr.getIndicators(uid);
    renderIndicator(row, ind, uid);
  } catch (e) {
    console.warn('Error getting indicators:', e);
  }
}

let __refreshAllTimer = null;

function refreshAll() {
  if (__refreshAllTimer) return;

  __refreshAllTimer = setTimeout(() => {
    __refreshAllTimer = null;
    const list = document.querySelectorAll('#track-list .track');
    list.forEach((row) => refreshRow(row));
  }, 50);
}

function bindLiveUpdates() {
  const mgr = window.OfflineUI?.offlineManager;
  if (!mgr) return;

  mgr.on('progress', (ev) => {
    const uid = String(ev?.uid || '').trim();
    if (!uid) return;

    const rows = document.querySelectorAll(`#track-list .track[data-uid="${CSS.escape(uid)}"]`);
    rows.forEach((row) => refreshRow(row));
  });

  window.addEventListener('favorites:changed', () => refreshAll());
  window.addEventListener('favorites:refsChanged', () => refreshAll());
}

export function attachOfflineIndicators() {
  injectCss();
  refreshAll();

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

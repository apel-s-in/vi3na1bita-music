// scripts/ui/offline-indicators.js
import { attachCloudMenu } from './cloud-menu.js';
import { deleteTrackCache, clearCloudStats } from '../offline/cache-db.js';

const CSS = `.offline-ico-slot{display:inline-flex;align-items:center;margin-right:6px;min-width:14px}.offline-ico{cursor:pointer;user-select:none;font-size:14px;line-height:1}.offline-ico.gray{opacity:.3;filter:grayscale(1)}.offline-ico.lock{color:#ffd166}.offline-ico.cloud{color:#8ab8fd}`;

let _tm = null;
const getMgr = () => window.OfflineUI?.offlineManager;
const notify = (m, t='info') => window.NotificationSystem?.[t]?.(m);

const getUid = (el) => {
  const ds = el.dataset.uid;
  if (ds) return ds;
  const m = el.id?.match(/^fav_[^_]+_(.+)$/);
  return m ? m[1] : (el.querySelector('.like-star')?.dataset?.uid || null);
};

const getHtml = (s, uid) => {
  if (!uid || !s) return `<span class="offline-ico gray" title="Загрузка...">🔒</span>`;
  if (s.pinned) return `<span class="offline-ico lock" title="Закреплено офлайн" data-act="unpin" data-uid="${uid}">🔒</span>`;
  if (s.cloud && s.cachedComplete) return `<span class="offline-ico cloud" title="Доступно офлайн (Cloud)" data-act="menu" data-uid="${uid}">☁</span>`;
  return `<span class="offline-ico gray" title="Закрепить офлайн" data-act="pin" data-uid="${uid}">🔒</span>`;
};

async function updateRow(row) {
  const uid = getUid(row);
  if (!uid) return;
  const mgr = getMgr();
  const state = mgr ? await mgr.getTrackOfflineState(uid) : null;
  
  let slot = row.querySelector('.offline-ico-slot');
  if (!slot) {
    slot = document.createElement('span');
    slot.className = 'offline-ico-slot';
    const ref = row.querySelector('.tnum') || row.firstChild;
    row.insertBefore(slot, ref);
  }
  const html = getHtml(state, uid);
  if (slot.innerHTML !== html) slot.innerHTML = html;
}

function scheduleRefresh() {
  if (_tm) return;
  _tm = requestAnimationFrame(() => {
    _tm = null;
    const rows = document.querySelectorAll('.track');
    for (let i = 0; i < rows.length; i++) updateRow(rows[i]);
  });
}

function handleGlobalClick(e) {
  const t = e.target;
  if (!t.classList.contains('offline-ico')) return;
  
  e.preventDefault(); e.stopPropagation();
  const act = t.dataset.act;
  const uid = t.dataset.uid;
  const mgr = getMgr();
  
  if (!mgr || !uid || !act) return;

  if (act === 'pin' || act === 'unpin') {
    mgr.togglePinned(uid).then(scheduleRefresh);
  } else if (act === 'menu') {
    attachCloudMenu({
      root: t,
      onAddLock: () => mgr.togglePinned(uid).then(scheduleRefresh),
      onRemoveCache: async () => {
        await deleteTrackCache(uid);
        await clearCloudStats(uid);
        notify('Удалено из кэша');
        scheduleRefresh();
      }
    });
  }
}

export function attachOfflineIndicators() {
  if (window.__offIndInit) return;
  window.__offIndInit = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  document.addEventListener('click', handleGlobalClick, true);
  const obs = new MutationObserver(scheduleRefresh);
  const list = document.getElementById('track-list');
  if (list) obs.observe(list, { childList: true, subtree: true });
  window.addEventListener('offline:uiChanged', scheduleRefresh);
  const mgr = getMgr();
  if (mgr?.on) mgr.on('progress', scheduleRefresh);
  scheduleRefresh();
}

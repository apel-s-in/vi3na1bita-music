/**
 * scripts/ui/offline-indicators.js
 * Optimized Event Delegation & Batch DB Updates. 
 * Eliminates N+1 queries lock and DOM memory leaks.
 */
import { getOfflineManager } from '../offline/offline-manager.js';
import { getAllTrackMetas } from '../offline/cache-db.js';

let _timer = 0;
let _menu = null;

export async function refreshAllIndicators() {
  const mgr = getOfflineManager();
  const hasSpace = await mgr.hasSpace().catch(() => true);
  const metas = await getAllTrackMetas().catch(() => []);
  const metaMap = new Map(metas.map(m => [m.uid, m]));
  
  let needsAlert = false;

  document.querySelectorAll('.offline-ind').forEach(ind => {
    const uid = ind.dataset.uid;
    const m = metaMap.get(uid);
    let s = 'none';

    if (m?.type === 'pinned') s = 'pinned';
    else if (m?.type === 'cloud') s = m.cachedComplete ? 'cloud' : 'cloud_loading';
    else if (m?.type === 'playbackCache' || m?.type === 'dynamic') s = 'transient';

    if (m?.needsReCache || m?.needsUpdate) needsAlert = true;

    ind.className = 'offline-ind';
    ind.textContent = s === 'cloud' ? '☁' : '🔒';

    if (s === 'pinned') {
      const dl = mgr.queue?.act?.has(uid);
      ind.classList.add(dl ? 'offline-ind--pinned-loading' : 'offline-ind--pinned');
      ind.title = dl ? 'Закреплён (загружается…)' : 'Закреплён офлайн';
    } else if (s === 'cloud') {
      ind.classList.add('offline-ind--cloud');
      ind.title = `Облачный кэш (осталось ${Math.max(0, Math.ceil(((m.cloudExpiresAt || 0) - Date.now()) / 86400000))} дн.)`;
    } else {
      ind.classList.add(hasSpace ? 'offline-ind--none' : 'offline-ind--nospace');
      ind.title = s === 'cloud_loading' ? 'Облачный кэш (загружается…)' : (hasSpace ? 'Нажмите, чтобы закрепить' : 'Нет места на устройстве');
    }
  });

  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.classList.toggle('active', mgr.getMode() === 'R1');
    let alert = btn.querySelector('.offline-btn-alert');
    if (needsAlert && !alert) {
      btn.insertAdjacentHTML('afterbegin', '<span class="offline-btn-alert" title="Есть треки для обновления">!</span>');
    } else if (!needsAlert && alert) {
      alert.remove();
    }
  }
}

export function injectOfflineIndicators(root = document) {
  if (!root) return;
  root.querySelectorAll('.track[data-uid]').forEach(t => {
    if (!t.querySelector('.offline-ind')) {
      const i = document.createElement('span');
      i.className = 'offline-ind offline-ind--none';
      i.dataset.uid = t.dataset.uid;
      i.textContent = '🔒';
      const tn = t.querySelector('.tnum');
      tn ? t.insertBefore(i, tn) : t.prepend(i);
    }
  });
  scheduleRefresh();
}

export const injectIndicator = async (el) => {
  if (!el || el.querySelector('.offline-ind')) return;
  const i = document.createElement('span');
  i.className = 'offline-ind offline-ind--none';
  i.dataset.uid = el.dataset.uid;
  i.textContent = '🔒';
  const tn = el.querySelector('.tnum');
  tn ? el.insertBefore(i, tn) : el.prepend(i);
  scheduleRefresh();
};

const scheduleRefresh = () => {
  if (!_timer) _timer = setTimeout(() => { _timer = 0; refreshAllIndicators(); }, 50);
};

function showCloudMenu(ind, uid) {
  _menu?.remove();
  _menu = document.createElement('div');
  _menu.className = 'cloud-menu';
  _menu.dataset.uid = uid;
  Object.assign(_menu.style, { position: 'fixed', zIndex: '99999' });
  _menu.innerHTML = `
    <div class="cloud-menu__item" data-action="pin">🔒 Закрепить</div>
    <div class="cloud-menu__item cloud-menu__item--danger" data-action="del">🗑 Удалить из кэша</div>
  `;
  document.body.appendChild(_menu);
  const r = ind.getBoundingClientRect();
  _menu.style.left = `${Math.min(r.left, window.innerWidth - 160)}px`;
  _menu.style.top = (window.innerHeight - r.bottom < 100) ? `${r.top - _menu.offsetHeight}px` : `${r.bottom + 5}px`;
}

// Global Event Delegation (Replaces 1000s of listeners)
document.addEventListener('click', async (e) => {
  const alert = e.target.closest('.offline-btn-alert');
  if (alert) {
    e.stopPropagation();
    return window.NotificationSystem?.show?.('Есть треки для обновления', 'info', 6000);
  }

  const mItem = e.target.closest('.cloud-menu__item');
  if (mItem) {
    e.stopPropagation();
    const uid = _menu?.dataset.uid, act = mItem.dataset.action, mgr = getOfflineManager();
    _menu?.remove(); _menu = null;
    if (!uid) return;

    if (act === 'pin') {
      await mgr.togglePinned(uid);
      scheduleRefresh();
    } else if (act === 'del' && window.Modals?.confirm) {
      window.Modals.confirm({
        title: 'Удалить из кэша?',
        textHtml: 'Статистика облачка будет сброшена.<br>Global-статистика останется.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: async () => { await mgr.removeCached(uid); scheduleRefresh(); }
      });
    }
    return;
  }

  if (_menu && !e.target.closest('.cloud-menu') && !e.target.closest('.offline-ind')) {
    _menu.remove(); _menu = null;
  }

  const ind = e.target.closest('.offline-ind');
  if (ind) {
    e.preventDefault(); e.stopPropagation();
    const uid = ind.dataset.uid, mgr = getOfflineManager();
    const st = await mgr.getTrackOfflineState(uid);

    if (st.status === 'cloud') {
      showCloudMenu(ind, uid);
    } else {
      if (st.status !== 'pinned' && !(await mgr.hasSpace().catch(() => true))) {
        return window.NotificationSystem?.show?.('Недостаточно места на устройстве. Освободите память для офлайн-кэша.', 'warning');
      }
      await mgr.togglePinned(uid);
      scheduleRefresh();
    }
  }
});

export function initOfflineIndicators() {
  ['offline:uiChanged', 'offline:stateChanged', 'offline:trackCached', 'offline:downloadStart', 'netPolicy:changed'].forEach(ev => window.addEventListener(ev, scheduleRefresh));
  injectOfflineIndicators(); // Вызывается оркестратором app.js, DOM уже готов
}

window.OfflineIndicators = { initOfflineIndicators, injectOfflineIndicators, injectIndicator, refreshAllIndicators };
export default window.OfflineIndicators;

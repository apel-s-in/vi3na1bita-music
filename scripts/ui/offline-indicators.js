import { getOfflineManager } from '../offline/offline-manager.js';
import { getAllTrackMetas } from '../offline/cache-db.js';

let _timer = 0, _menu = null;

export const refreshAllIndicators = async () => {
  const mgr = getOfflineManager(), hasSpace = await mgr.hasSpace().catch(() => true), metaMap = new Map((await getAllTrackMetas().catch(() => [])).map(m => [m.uid, m]));
  let needsAlert = false;

  document.querySelectorAll('.offline-ind').forEach(ind => {
    const m = metaMap.get(ind.dataset.uid);
    let s = m?.type === 'pinned' ? 'pinned' : (m?.type === 'cloud' ? (m.cachedComplete ? 'cloud' : 'cloud_loading') : (['playbackCache', 'dynamic'].includes(m?.type) ? 'transient' : 'none'));
    if (m?.needsReCache || m?.needsUpdate) needsAlert = true;

    ind.className = 'offline-ind'; ind.textContent = s === 'cloud' ? '☁' : '🔒';
    if (s === 'pinned') { const dl = mgr.queue?.act?.has(m.uid); ind.classList.add(dl ? 'offline-ind--pinned-loading' : 'offline-ind--pinned'); ind.title = dl ? 'Закреплён (загружается…)' : 'Закреплён офлайн'; } 
    else if (s === 'cloud') { ind.classList.add('offline-ind--cloud'); ind.title = `Облачный кэш (осталось ${Math.max(0, Math.ceil(((m.cloudExpiresAt || 0) - Date.now()) / 86400000))} дн.)`; } 
    else { ind.classList.add(hasSpace ? 'offline-ind--none' : 'offline-ind--nospace'); ind.title = s === 'cloud_loading' ? 'Облачный кэш (загружается…)' : (hasSpace ? 'Нажмите, чтобы закрепить' : 'Нет места на устройстве'); }
  });

  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.classList.toggle('active', mgr.getMode() === 'R1');
    const al = btn.querySelector('.offline-btn-alert');
    if (needsAlert && !al) btn.insertAdjacentHTML('afterbegin', '<span class="offline-btn-alert" title="Есть треки для обновления">!</span>');
    else if (!needsAlert && al) al.remove();
  }
};

export const injectOfflineIndicators = (root = document) => { if (root) { root.querySelectorAll('.track[data-uid]').forEach(injectIndicatorSync); scheduleRefresh(); } };
const injectIndicatorSync = el => { if (el && !el.querySelector('.offline-ind')) { const i = Object.assign(document.createElement('span'), { className: 'offline-ind offline-ind--none', textContent: '🔒' }); i.dataset.uid = el.dataset.uid; const tn = el.querySelector('.tnum'); tn ? el.insertBefore(i, tn) : el.prepend(i); } };
export const injectIndicator = async el => { injectIndicatorSync(el); scheduleRefresh(); };
const scheduleRefresh = () => { if (!_timer) _timer = setTimeout(() => { _timer = 0; refreshAllIndicators(); }, 50); };
const isShowcaseInd = t => { try { return t?.closest('.offline-ind') && t.closest('#track-list') && !!window.Utils?.isShowcaseContext?.(window.AlbumsManager?.getCurrentAlbum?.()); } catch { return false; } };

document.addEventListener('click', async (e) => {
  if (e.target.closest('.offline-btn-alert')) return e.stopPropagation(), window.NotificationSystem?.show?.('Есть треки для обновления', 'info', 6000);
  const mItem = e.target.closest('.cloud-menu__item');
  if (mItem) {
    e.stopPropagation(); const uid = _menu?.dataset.uid, act = mItem.dataset.action, mgr = getOfflineManager();
    _menu?.remove(); _menu = null; if (!uid) return;
    if (act === 'pin') { await mgr.togglePinned(uid); scheduleRefresh(); } 
    else if (act === 'del' && window.Modals?.confirm) window.Modals.confirm({ title: 'Удалить из кэша?', textHtml: 'Статистика облачка будет сброшена.<br>Global-статистика останется.', confirmText: 'Удалить', cancelText: 'Отмена', onConfirm: async () => { await mgr.removeCached(uid); scheduleRefresh(); } });
    return;
  }
  if (_menu && !e.target.closest('.cloud-menu') && !e.target.closest('.offline-ind')) { _menu.remove(); _menu = null; }
  const ind = e.target.closest('.offline-ind');
  if (ind) {
    if (isShowcaseInd(e.target)) return e.preventDefault(), e.stopPropagation();
    e.preventDefault(); e.stopPropagation(); const uid = ind.dataset.uid, mgr = getOfflineManager(), st = await mgr.getTrackOfflineState(uid);
    if (st.status === 'cloud') {
      _menu?.remove(); _menu = Object.assign(document.createElement('div'), { className: 'cloud-menu', innerHTML: `<div class="cloud-menu__item" data-action="pin">🔒 Закрепить</div><div class="cloud-menu__item cloud-menu__item--danger" data-action="del">🗑 Удалить из кэша</div>` }); _menu.dataset.uid = uid; Object.assign(_menu.style, { position: 'fixed', zIndex: '99999' }); document.body.appendChild(_menu);
      const r = ind.getBoundingClientRect(); _menu.style.left = `${Math.min(r.left, window.innerWidth - 160)}px`; _menu.style.top = (window.innerHeight - r.bottom < 100) ? `${r.top - _menu.offsetHeight}px` : `${r.bottom + 5}px`;
    } else {
      if (st.status !== 'pinned' && !(await mgr.hasSpace().catch(() => true))) return window.NotificationSystem?.show?.('Недостаточно места на устройстве. Освободите память для офлайн-кэша.', 'warning');
      await mgr.togglePinned(uid); scheduleRefresh();
    }
  }
});

export const initOfflineIndicators = () => { ['offline:uiChanged', 'offline:stateChanged', 'offline:trackCached', 'offline:downloadStart', 'netPolicy:changed'].forEach(ev => window.addEventListener(ev, scheduleRefresh)); injectOfflineIndicators(); };
window.OfflineIndicators = { initOfflineIndicators, injectOfflineIndicators, injectIndicator, refreshAllIndicators };
export default window.OfflineIndicators;

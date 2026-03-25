import { getOfflineManager } from '../offline/offline-manager.js';
let _layer = null;

export const initCacheProgressOverlay = () => {
  if (!window.Utils?.func?.initOnce?.('ui:cache-progress-overlay:init', () => {})) return;
  const s = () => requestAnimationFrame(updateProgressBar);
  ['player:trackChanged', 'offline:downloadStart', 'offline:trackCached', 'offline:downloadFailed', 'offline:stateChanged', 'offline:uiChanged'].forEach(ev => window.addEventListener(ev, s));
  document.getElementById('cache-progress-overlay')?.remove();
};

const updateProgressBar = async () => {
  const bar = document.getElementById('player-progress-bar'); if (!bar) return;
  if (!_layer || !_layer.isConnected) {
    _layer = Object.assign(document.createElement('div'), { className: 'player-cache-layer' });
    bar.insertBefore(_layer, bar.firstChild);
  }
  const uid = window.playerCore?.getCurrentTrackUid?.();
  if (!uid) return Object.assign(_layer.style, { opacity: '0' }) && _layer.classList.remove('is-loading');
  const st = await getOfflineManager().getTrackOfflineState(uid);
  if (st.cachedComplete) { Object.assign(_layer.style, { width: '100%', opacity: '1', background: 'rgba(255,255,255,0.2)' }); _layer.classList.remove('is-loading'); } 
  else if (st.downloading) { _layer.classList.add('is-loading'); _layer.style.background = ''; } 
  else { _layer.style.opacity = '0'; _layer.classList.remove('is-loading'); }
};
export default { initCacheProgressOverlay };

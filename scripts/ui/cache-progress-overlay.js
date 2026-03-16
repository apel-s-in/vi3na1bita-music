import { getOfflineManager } from '../offline/offline-manager.js';
let _layer = null;

export const initCacheProgressOverlay = () => {
  const s = () => requestAnimationFrame(updateProgressBar);
  ['player:trackChanged', 'offline:downloadStart', 'offline:trackCached', 'offline:downloadFailed', 'offline:stateChanged', 'offline:uiChanged'].forEach(ev => window.addEventListener(ev, s));
  document.getElementById('cache-progress-overlay')?.remove();
};

const updateProgressBar = async () => {
  const bar = document.getElementById('player-progress-bar'); if (!bar) return;
  if (!_layer || !_layer.isConnected) {
    _layer = Object.assign(document.createElement('div'), { className: 'player-cache-layer' });
    bar.insertBefore(_layer, bar.firstChild);
    if (!document.getElementById('cache-layer-styles')) {
      const s = document.createElement('style'); s.id = 'cache-layer-styles';
      s.textContent = `.player-cache-layer{position:absolute;inset:0 auto auto 0;height:100%;background:rgba(255,255,255,0.2);border-radius:3px;pointer-events:none;transition:width .3s ease,opacity .3s;width:0%;opacity:0;z-index:0}.player-cache-layer.is-loading{background:linear-gradient(90deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.3) 50%,rgba(255,255,255,0.05) 100%);background-size:200% 100%;animation:cacheAnim 1.5s infinite linear;width:100%;opacity:1}.player-progress-fill{position:relative;z-index:1}@keyframes cacheAnim{to{background-position:-200% 0}}`;
      document.head.appendChild(s);
    }
  }
  const uid = window.playerCore?.getCurrentTrackUid?.();
  if (!uid) return Object.assign(_layer.style, { opacity: '0' }) && _layer.classList.remove('is-loading');
  const st = await getOfflineManager().getTrackOfflineState(uid);
  if (st.cachedComplete) { Object.assign(_layer.style, { width: '100%', opacity: '1', background: 'rgba(255,255,255,0.2)' }); _layer.classList.remove('is-loading'); } 
  else if (st.downloading) { _layer.classList.add('is-loading'); _layer.style.background = ''; } 
  else { _layer.style.opacity = '0'; _layer.classList.remove('is-loading'); }
};
export default { initCacheProgressOverlay };

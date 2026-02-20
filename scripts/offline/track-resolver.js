/**
 * scripts/offline/track-resolver.js
 * Optimized v2.0 — 100% Spec-Compliant (R1/R2)
 * 
 * FIX: Устранена избыточная нагрузка на IndexedDB (N+1 query problem).
 * PlayerCore использует исключительно `source`, `blob` и `url`. 
 * Удаление лишнего запроса за `meta` обеспечивает действительно мгновенные 
 * переходы (instant transitions) в режиме PlaybackCache.
 */

let _mgr = null;

export const initTrackResolver = (offlineManager) => {
  _mgr = offlineManager;
  window.TrackResolver = { resolve };
};

export async function resolve(uid, quality) {
  if (!_mgr) return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  
  try {
    // Вся тяжелая работа уже выполнена внутри OfflineManager
    const res = await _mgr.resolveTrackSource(uid, quality);
    
    return {
      source: res.source || 'stream',
      url: res.url || null,
      blob: res.blob || null,
      quality: res.quality || quality,
      localKind: res.source === 'local' ? 'cache' : 'none' // Информативно, без блокировки Main Thread
    };
  } catch (e) {
    console.warn('[TrackResolver] resolve failed:', e);
    return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  }
}

export default { initTrackResolver, resolve };

let _mgr = null;
export const initTrackResolver = (offlineManager) => { _mgr = offlineManager; window.TrackResolver = { resolve }; };

export const resolve = async (uid, quality) => {
  if (!_mgr) return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  try {
    const r = await _mgr.resolveTrackSource(uid, quality);
    return { source: r.source || 'stream', url: r.url || null, blob: r.blob || null, quality: r.quality || quality, localKind: r.source === 'local' ? 'cache' : 'none', provider: r.source === 'local' ? 'cache' : (r.provider || 'unknown') };
  } catch (e) {
    console.warn('[TrackResolver] resolve failed:', e);
    return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  }
};
export default { initTrackResolver, resolve };

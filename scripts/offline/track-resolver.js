let _mgr = null;
export const initTrackResolver = m => { _mgr = m; window.TrackResolver = { resolve }; };
export const resolve = async (uid, q) => { if (!_mgr) return { source: 'stream', url: null, blob: null, quality: q, localKind: 'none' }; try { const r = await _mgr.resolveTrackSource(uid, q); return { source: r.source || 'stream', url: r.url || null, blob: r.blob || null, quality: r.quality || q, localKind: r.source === 'local' ? 'cache' : 'none', provider: r.source === 'local' ? 'cache' : (r.provider || 'unknown') }; } catch (e) { console.warn('[TrackResolver] resolve failed:', e); return { source: 'stream', url: null, blob: null, quality: q, localKind: 'none' }; } };
export default { initTrackResolver, resolve };

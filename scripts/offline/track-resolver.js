/**
 * track-resolver.js — Fix #1.7/#2.3/#16.1
 * Тонкая прослойка: PlayerCore → TrackResolver → OfflineManager
 * PlayerCore не знает об OfflineManager напрямую.
 */

let _mgr = null;

export function initTrackResolver(offlineManager) {
  _mgr = offlineManager;
  window.TrackResolver = { resolve };
}

/**
 * @returns {{ source, url, blob, quality, localKind }}
 *   localKind: 'pinned' | 'cloud' | 'transient' | 'none'
 */
export async function resolve(uid, quality) {
  if (!_mgr) {
    return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  }

  try {
    const resolved = await _mgr.resolveTrackSource(uid, quality);

    let localKind = 'none';
    if (resolved.source === 'local' || resolved.source === 'cache') {
      try {
        const meta = await _mgr.getTrackMeta(uid);
        if (meta) {
          localKind = meta.type === 'pinned' ? 'pinned'
            : meta.type === 'cloud' ? 'cloud'
            : meta.type === 'playbackCache' ? 'transient'
            : 'none';
        }
      } catch {}
    }

    return {
      source: resolved.source || 'stream',
      url: resolved.url || null,
      blob: resolved.blob || null,
      quality: resolved.quality || quality,
      localKind
    };
  } catch (e) {
    console.warn('[TrackResolver] resolve failed:', e);
    return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  }
}

export default { initTrackResolver, resolve };

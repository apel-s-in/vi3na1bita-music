// scripts/offline/track-resolver.js
// Track Resolver v2.0: Priority Logic (Hi -> Lo -> Stream)

import offlineManager from './offline-manager.js';

export async function resolveTrackUrl(uid, trackData) {
  // Normalize input
  if (typeof trackData === 'string') trackData = { audio: trackData, src: trackData };
  if (!trackData) trackData = {};

  // 1. Ask OfflineManager to resolve source (Logic inside OM handles: Hi Blob -> Lo Blob)
  const result = await offlineManager.resolveTrackSource(uid, trackData);

  // 2. Handle Local Blob
  if (result.source === 'local' && result.blob) {
    const objectUrl = URL.createObjectURL(result.blob);
    return {
      url: objectUrl,
      source: 'local',
      quality: result.quality,
      needsReCache: result.needsReCache,
      _blobUrl: true // Flag to revoke later
    };
  }

  // 3. Handle Stream
  if (result.source === 'stream' && result.url) {
    return {
      url: result.url,
      source: 'stream',
      quality: result.quality,
      needsReCache: false,
      _blobUrl: false
    };
  }

  // 4. Unavailable
  return {
    url: null,
    source: 'unavailable',
    quality: null,
    needsReCache: false,
    _blobUrl: false
  };
}

export function revokeTrackUrl(resolved) {
  if (resolved && resolved._blobUrl && resolved.url) {
    try { URL.revokeObjectURL(resolved.url); } catch {}
  }
}

export default { resolveTrackUrl, revokeTrackUrl };

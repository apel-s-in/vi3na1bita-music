// scripts/offline/track-resolver.js
import { getAudioBlob, bytesByQuality, touchLocalAccess, getLocalMeta } from './cache-db.js';
import { getOfflineManager } from './offline-manager.js';
import { getNetPolicy, isAllowedByNetPolicy } from './net-policy.js';

const U = window.Utils;

async function getLocalUrl(uid, q) {
  if (!U?.blob) return null;
  const blob = await getAudioBlob(uid, q);
  if (!blob) return null;
  const url = U.blob.createUrl(`${uid}:${q}`, blob);
  touchLocalAccess(uid).catch(() => {});
  return url;
}

export async function resolvePlaybackSource({ track }) {
  if (!track || !track.uid) return { url: null, reason: 'no_track' };
  
  const mgr = getOfflineManager();
  const mode = mgr.getMode();
  const targetQ = mgr.getActivePlaybackQuality(); 
  const net = U.getNet();
  
  const [hasHi, hasLo] = await Promise.all([
      mgr.isTrackComplete(track.uid, 'hi'),
      mgr.isTrackComplete(track.uid, 'lo')
  ]);
  
  const meta = await getLocalMeta(track.uid);
  const cacheKind = meta?.kind || 'none';

  // 1. Check Local (Best Effort)
  if (targetQ === 'hi') {
      if (hasHi) return { url: await getLocalUrl(track.uid, 'hi'), isLocal: true, effectiveQuality: 'hi', cacheKind };
      if (hasLo) return { url: await getLocalUrl(track.uid, 'lo'), isLocal: true, effectiveQuality: 'lo', cacheKind, needsReCache: true };
  } else {
      if (hasLo) return { url: await getLocalUrl(track.uid, 'lo'), isLocal: true, effectiveQuality: 'lo', cacheKind };
      if (hasHi) return { url: await getLocalUrl(track.uid, 'hi'), isLocal: true, effectiveQuality: 'hi', cacheKind }; 
  }

  // 2. Network (Secondary)
  if (mode === 'R3') {
      return { url: null, reason: 'R3_offline_block', isLocal: false };
  }
  
  const policy = getNetPolicy();
  const allowed = isAllowedByNetPolicy({ policy, net, userInitiated: false }); // Playback is implied user intent but standard checks apply
  
  if (net.online && allowed) {
      const src = track.sources?.audio || {};
      const url = targetQ === 'lo' ? (src.lo || track.audio_low) : (src.hi || track.audio);
      if (url) return { url, isLocal: false, effectiveQuality: targetQ, cacheKind: 'none' };
  }

  return { url: null, reason: 'no_source', isLocal: false };
}

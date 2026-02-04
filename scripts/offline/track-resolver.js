// scripts/offline/track-resolver.js
import { getAudioBlob, bytesByQuality, touchLocalAccess } from './cache-db.js';
import { getOfflineManager } from './offline-manager.js';
import { getNetPolicy, isAllowedByNetPolicy } from './net-policy.js';

const U = window.Utils;
const norm = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');

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
  const targetQ = mgr.getActivePlaybackQuality(); // PQ or CQ or FOQ based on mode
  const net = U.getNet();
  
  // 1. Check Local (Primary)
  // Logic: Try exact quality first.
  const [hasHi, hasLo] = await Promise.all([
      mgr.isTrackComplete(track.uid, 'hi'),
      mgr.isTrackComplete(track.uid, 'lo')
  ]);
  
  if (targetQ === 'hi') {
      if (hasHi) return { url: await getLocalUrl(track.uid, 'hi'), isLocal: true, quality: 'hi' };
      // Fallback to Lo if strictly necessary? (See 7.4.3: "best effort")
      if (hasLo) return { url: await getLocalUrl(track.uid, 'lo'), isLocal: true, quality: 'lo' }; 
  } else {
      if (hasLo) return { url: await getLocalUrl(track.uid, 'lo'), isLocal: true, quality: 'lo' };
      if (hasHi) return { url: await getLocalUrl(track.uid, 'hi'), isLocal: true, quality: 'hi' };
  }

  // 2. Network (Secondary) - STRICTLY FORBIDDEN IN R3
  if (mode === 'R3') {
      return { url: null, reason: 'R3_offline_block' };
  }
  
  const policy = getNetPolicy();
  const allowed = isAllowedByNetPolicy({ policy, net, userInitiated: true });
  
  if (net.online && allowed) {
      const src = track.sources?.audio || {};
      const url = targetQ === 'lo' ? (src.lo || track.audio_low) : (src.hi || track.audio);
      if (url) return { url, isLocal: false, quality: targetQ };
  }

  return { url: null, reason: 'no_source' };
}

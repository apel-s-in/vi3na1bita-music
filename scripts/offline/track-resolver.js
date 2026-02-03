import { getAudioBlob, bytesByQuality, touchLocalAccess, getLocalMeta } from './cache-db.js';
import { getTrackByUid } from '../app/track-registry.js';

const U = window.Utils;

const norm = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const sUrl = (v) => (v ? String(v).trim() : null);

export function revokeObjectUrlsForUid(uid) {
  if (!U?.blob) return 0;
  return (U.blob.revokeUrl(`${uid}:hi`) ? 1 : 0) + (U.blob.revokeUrl(`${uid}:lo`) ? 1 : 0);
}

export async function isLocalComplete(uid, q) {
  const u = sUrl(uid); if (!u) return false;
  const m = getTrackByUid(u); if (!m) return false;
  
  const qual = norm(q);
  const sz = qual === 'lo' ? (m.sizeLo || m.size_low) : (m.sizeHi || m.size);
  if (!sz) return false; // Unknown size -> not complete

  const stored = await bytesByQuality(u);
  const has = qual === 'hi' ? stored.hi : stored.lo;
  
  // 92% threshold to be safe
  return has >= (sz * 1024 * 1024 * 0.92); 
}

async function getLocalUrl(uid, q) {
  if (!U?.blob) return null;
  const key = `${uid}:${q}`;
  
  // Try creation
  const blob = await getAudioBlob(uid, q);
  if (!blob) return null;

  const url = U.blob.createUrl(key, blob);
  try { await touchLocalAccess(uid); } catch {}
  return url;
}

export async function resolvePlaybackSource({ track, pq, cq, offlineMode }) {
  const u = sUrl(track?.uid);
  const net = U?.getNetworkStatusSafe ? U.getNetworkStatusSafe() : { online: navigator.onLine };
  const pQual = norm(pq);
  const cQual = norm(cq);

  // 1. Check Local Availability
  const [hasHi, hasLo] = u ? await Promise.all([isLocalComplete(u, 'hi'), isLocalComplete(u, 'lo')]) : [false, false];

  // 2. Determine Effective Quality based on New Rules
  // Rule: Play Local if Quality >= PQ.
  // Rule: If Local < PQ, play Network (if allowed).
  
  // A. Try Local Optimal (Matches PQ or Better)
  if (pQual === 'hi' && hasHi) {
     const url = await getLocalUrl(u, 'hi');
     if (url) return { url, effectiveQuality: 'hi', isLocal: true };
  }
  if (pQual === 'lo') {
     if (hasLo) {
        const url = await getLocalUrl(u, 'lo');
        if (url) return { url, effectiveQuality: 'lo', isLocal: true };
     } else if (hasHi) {
        // Upgrade to Hi if local
        const url = await getLocalUrl(u, 'hi');
        if (url) return { url, effectiveQuality: 'hi', isLocal: true };
     }
  }

  // B. Try Network (If online and not forced offline)
  if (net.online && !offlineMode) {
    const src = track?.sources?.audio;
    const netUrl = (pQual === 'lo') ? (src?.lo || track?.audio_low) : (src?.hi || track?.audio);
    // Fallback to whatever URL is available if specific quality is missing
    const finalUrl = netUrl || track?.src || track?.audio;
    
    if (finalUrl) return { url: sUrl(finalUrl), effectiveQuality: pQual, isLocal: false };
  }

  // C. Fallback Local (Lower quality than requested, but better than nothing)
  if (pQual === 'hi' && !hasHi && hasLo) {
     const url = await getLocalUrl(u, 'lo');
     if (url) return { url, effectiveQuality: 'lo', isLocal: true };
  }

  return { url: null, reason: 'offline:noSource' };
}

export async function isTrackAvailableOffline(uid) {
  const u = sUrl(uid);
  return u ? ((await isLocalComplete(u, 'hi')) || (await isLocalComplete(u, 'lo'))) : false;
}

export const TrackResolver = { resolvePlaybackSource, isTrackAvailableOffline, isLocalComplete };

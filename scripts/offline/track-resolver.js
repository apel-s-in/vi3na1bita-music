//=================================================
// FILE: /scripts/offline/track-resolver.js
import { getAudioBlob, bytesByQuality, touchLocalAccess, getLocalMeta } from './cache-db.js';
import { getTrackByUid } from '../app/track-registry.js';

// Utils.blob handles registry and revocation now
const U = window.Utils;

// --- Helpers ---
const norm = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const sUrl = (v) => (v ? String(v).trim() : null);

// API: Revoke specific track blobs (e.g. on deletion)
export function revokeObjectUrlsForUid(uid) {
  if (!U?.blob) return 0;
  return (U.blob.revokeUrl(`${uid}:hi`) ? 1 : 0) + (U.blob.revokeUrl(`${uid}:lo`) ? 1 : 0);
}

// API: Check integrity (TZ 9.2)
export async function isLocalComplete(uid, q) {
  const u = sUrl(uid); if (!u) return false;
  const m = getTrackByUid(u); if (!m) return false;
  
  const qual = norm(q);
  const sz = qual === 'lo' ? (m.sizeLo || m.size_low) : (m.sizeHi || m.size);
  if (!sz) return false;

  const stored = await bytesByQuality(u);
  const has = qual === 'hi' ? stored.hi : stored.lo;
  return has >= (sz * 1024 * 1024 * 0.92); // >92% threshold
}

async function getLocalUrl(uid, q) {
  if (!U?.blob) return null;
  const key = `${uid}:${q}`;
  
  // 1. Try create new from DB (Utils.blob handles dups)
  const blob = await getAudioBlob(uid, q);
  if (!blob) return null;

  const url = U.blob.createUrl(key, blob);
  try { await touchLocalAccess(uid); } catch {}
  return url;
}

// API: Main Source Resolution (TZ 6.1, 7.4)
export async function resolvePlaybackSource({ track, pq, cq, offlineMode }) {
  const u = sUrl(track?.uid);
  const net = U?.isOnline ? U.isOnline() : navigator.onLine;
  const pQual = norm(pq);
  const cQual = norm(cq);

  const [hasHi, hasLo] = u ? await Promise.all([isLocalComplete(u, 'hi'), isLocalComplete(u, 'lo')]) : [false, false];

  // TZ 6.1: CQ upgrades PQ if available locally
  let effQ = pQual;
  if (pQual === 'lo' && cQual === 'hi' && hasHi) effQ = 'hi';

  const attempts = [];

  // A. Local Optimal
  if (effQ === 'hi' && hasHi) attempts.push({ type: 'local', q: 'hi' });
  else if (effQ === 'lo') {
    if (hasLo) attempts.push({ type: 'local', q: 'lo' });
    else if (hasHi) attempts.push({ type: 'local', q: 'hi' }); 
  }

  // B. Network (if allowed)
  if (net && !offlineMode) {
    const src = track?.sources?.audio;
    const url = (pQual === 'lo') ? (src?.lo || track?.audio_low) : (src?.hi || track?.audio);
    const alt = (pQual === 'lo') ? (src?.hi || track?.audio) : (src?.lo || track?.audio_low);
    if (url || alt) attempts.push({ type: 'net', url: sUrl(url || alt) });
  }

  // C. Local Fallback
  if (!hasHi && hasLo && pQual === 'hi') attempts.push({ type: 'local', q: 'lo' });
  if (hasHi && !hasLo && pQual === 'lo') attempts.push({ type: 'local', q: 'hi' });

  for (const c of attempts) {
    if (c.type === 'local') {
      const url = await getLocalUrl(u, c.q);
      if (url) {
        const m = await getLocalMeta(u);
        return { 
          url, effectiveQuality: c.q, isLocal: true, 
          localKind: (m?.kind === 'cloud' || m?.kind === 'transient') ? m.kind : 'transient'
        };
      }
    } else if (c.type === 'net' && c.url) {
      return { url: c.url, effectiveQuality: pQual, isLocal: false, localKind: null };
    }
  }

  return { url: null, reason: 'offline:noSource' };
}

export async function isTrackAvailableOffline(uid) {
  const u = sUrl(uid);
  return u ? ((await isLocalComplete(u, 'hi')) || (await isLocalComplete(u, 'lo'))) : false;
}

export const TrackResolver = { resolvePlaybackSource, isTrackAvailableOffline, isLocalComplete };

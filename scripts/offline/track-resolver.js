import { getAudioBlob, bytesByQuality, touchLocalAccess } from './cache-db.js';
import { getTrackByUid } from '../app/track-registry.js';
import { isAllowedByNetPolicy, getNetPolicy } from './net-policy.js';

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
  if (!sz) return false;
  const stored = await bytesByQuality(u);
  const has = qual === 'hi' ? stored.hi : stored.lo;
  return has >= (sz * 1024 * 1024 * 0.92); 
}

async function getLocalUrl(uid, q) {
  if (!U?.blob) return null;
  const key = `${uid}:${q}`;
  const blob = await getAudioBlob(uid, q);
  if (!blob) return null;
  const url = U.blob.createUrl(key, blob);
  try { await touchLocalAccess(uid); } catch {}
  return url;
}

/**
 * ГЛАВНАЯ ЛОГИКА ВЫБОРА ИСТОЧНИКА (ТЗ 7.4)
 */
export async function resolvePlaybackSource({ track, pq, cq, offlineMode }) {
  const u = sUrl(track?.uid);
  if (!u) return { url: null, reason: 'no_uid' };

  const net = U?.getNetworkStatusSafe ? U.getNetworkStatusSafe() : { online: navigator.onLine };
  const pQual = norm(pq);
  const cQual = norm(cq);

  const [hasHi, hasLo] = await Promise.all([isLocalComplete(u, 'hi'), isLocalComplete(u, 'lo')]);

  // 1. Попытка играть локально (приоритет)
  // Если запрашиваем Hi - нужно Hi
  if (pQual === 'hi') {
      if (hasHi) return { url: await getLocalUrl(u, 'hi'), effectiveQuality: 'hi', isLocal: true };
  } 
  // Если запрашиваем Lo
  else {
      // Ищем Lo
      if (hasLo) return { url: await getLocalUrl(u, 'lo'), effectiveQuality: 'lo', isLocal: true };
      // Если нет Lo, но есть Hi - это УЛУЧШЕНИЕ (CQ > PQ), играем Hi
      if (hasHi) return { url: await getLocalUrl(u, 'hi'), effectiveQuality: 'hi', isLocal: true };
  }

  // 2. Сеть (GitHub), если сети нет - переходим к fallback
  const policy = getNetPolicy();
  const netAllowed = isAllowedByNetPolicy({ policy, net, userInitiated: true });

  if (net.online && !offlineMode && netAllowed) {
    const src = track?.sources?.audio;
    const netUrl = (pQual === 'lo') ? (src?.lo || track?.audio_low) : (src?.hi || track?.audio);
    const finalUrl = netUrl || track?.src || track?.audio;

    if (finalUrl) return { url: sUrl(finalUrl), effectiveQuality: pQual, isLocal: false };
  }

  // 3. Fallback (Локальное низкое качество, когда нет выбора)
  // Например: хотели Hi, его нет, сети нет, но есть Lo.
  if (pQual === 'hi' && !hasHi && hasLo) {
     return { url: await getLocalUrl(u, 'lo'), effectiveQuality: 'lo', isLocal: true };
  }

  return { url: null, reason: 'offline:noSource' };
}

export async function isTrackAvailableOffline(uid) {
  const u = sUrl(uid);
  return u ? ((await isLocalComplete(u, 'hi')) || (await isLocalComplete(u, 'lo'))) : false;
}

export const TrackResolver = { resolvePlaybackSource, isTrackAvailableOffline, isLocalComplete };

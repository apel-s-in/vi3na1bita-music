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

/**
 * Проверка, есть ли трек локально в нужном качестве (или лучше).
 * @returns {Promise<boolean>}
 */
export async function isLocalComplete(uid, q) {
  const u = sUrl(uid); if (!u) return false;
  const m = getTrackByUid(u); if (!m) return false;
  
  const qual = norm(q);
  // Определяем ожидаемый размер
  const sz = qual === 'lo' ? (m.sizeLo || m.size_low) : (m.sizeHi || m.size);
  
  // Если размер неизвестен (0 или null), считаем что не скачано, 
  // т.к. мы не можем проверить целостность.
  if (!sz) return false;

  const stored = await bytesByQuality(u);
  const has = qual === 'hi' ? stored.hi : stored.lo;
  
  // Порог 92% (как в ТЗ)
  return has >= (sz * 1024 * 1024 * 0.92); 
}

/**
 * Создает Blob URL для локального файла
 */
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
  const pQual = norm(pq); // Качество, которое хочет пользователь (кнопка на плеере)

  // 1. Проверяем наличие локальных копий
  const [hasHi, hasLo] = await Promise.all([isLocalComplete(u, 'hi'), isLocalComplete(u, 'lo')]);

  // Логика выбора (ТЗ 7.4.2)
  
  // А) Локальная копия качества >= PQ
  // Если хотим Hi -> подходит Hi
  // Если хотим Lo -> подходит Lo (и Hi тоже подходит, так как Hi >= Lo)
  
  if (pQual === 'hi' && hasHi) {
     const url = await getLocalUrl(u, 'hi');
     if (url) return { url, effectiveQuality: 'hi', isLocal: true };
  }
  
  if (pQual === 'lo') {
     // Сначала ищем точное совпадение (Lo)
     if (hasLo) {
        const url = await getLocalUrl(u, 'lo');
        if (url) return { url, effectiveQuality: 'lo', isLocal: true };
     } 
     // Если нет Lo, но есть Hi -> это "Улучшение" (Hi >= Lo), играем Hi из кэша
     else if (hasHi) {
        const url = await getLocalUrl(u, 'hi');
        if (url) return { url, effectiveQuality: 'hi', isLocal: true };
     }
  }

  // Б) Сеть (GitHub), если локально нет подходящего, и сеть разрешена
  const policy = getNetPolicy();
  const netAllowed = isAllowedByNetPolicy({ policy, net, userInitiated: true }); // Playback is user initiated typically

  if (net.online && !offlineMode && netAllowed) {
    const src = track?.sources?.audio;
    // Пытаемся взять URL нужного качества, фоллбек на любой доступный
    const netUrl = (pQual === 'lo') ? (src?.lo || track?.audio_low) : (src?.hi || track?.audio);
    const finalUrl = netUrl || track?.src || track?.audio; // Абсолютный фоллбек

    if (finalUrl) return { url: sUrl(finalUrl), effectiveQuality: pQual, isLocal: false };
  }

  // В) Локальный Fallback (Качество < PQ)
  // Это происходит, если сети нет, и "хорошей" копии нет. Играем хоть что-то.
  // Например: Хотим Hi, сети нет, есть только Lo.
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

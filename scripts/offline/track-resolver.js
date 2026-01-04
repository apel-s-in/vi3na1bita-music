// scripts/offline/track-resolver.js
// TrackResolver (ESM) — выбор источника воспроизведения по PQ↔CQ и доступности.
// Важно: в этом коммите локальный URL (blob/objectURL) ещё не реализован,
// поэтому "local" пока означает "локально закэширован кандидат", но url вернём network URL,
// либо null если сети нет и локального URL нет.

import { bytesByQuality } from './cache-db.js';
import { getTrackByUid } from '../app/track-registry.js';

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
}

function getNetworkStatus() {
  try {
    if (window.NetworkManager && typeof window.NetworkManager.getStatus === 'function') {
      return window.NetworkManager.getStatus();
    }
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown', raw: null, saveData: false };
}

async function hasCachedEnough(uid, q) {
  const u = String(uid || '').trim();
  if (!u) return false;

  const meta = getTrackByUid(u);
  const needMb = q === 'hi'
    ? Number(meta?.sizeHi || meta?.size || 0)
    : Number(meta?.sizeLo || meta?.size_low || 0);

  if (!(needMb > 0)) return false;

  const b = await bytesByQuality(u);
  const haveMb = q === 'hi' ? Number(b.hi || 0) : Number(b.lo || 0);

  // MVP: bytesByQuality у нас хранит "условные MB" (как size из config),
  // поэтому сравниваем как MB. Позже при реальных байтах переведём в bytes.
  return haveMb >= needMb;
}

/**
 * resolvePlaybackSource
 * Возвращает:
 * - url: string|null
 * - effectiveQuality: 'hi'|'lo' (какое качество реально выбираем)
 * - isLocal: boolean (можем ли играть локально прямо сейчас)
 * - localQuality: 'hi'|'lo'|null (какой локальный уровень доступен)
 * - reason: string (debug)
 */
export async function resolvePlaybackSource(params) {
  const track = params?.track || null;
  const pq = normQ(params?.pq);
  const cq = normQ(params?.cq);
  const offlineMode = !!params?.offlineMode;
  const st = params?.network || getNetworkStatus();

  const uid = String(track?.uid || '').trim() || null;

  // network urls from current track.sources
  const sources = track?.sources || null;
  const key = 'audio';

  const urlHi = String(sources?.[key]?.hi || '').trim() || null;
  const urlLo = String(sources?.[key]?.lo || '').trim() || null;

  const pickNetworkUrl = (q) => {
    if (q === 'lo') return urlLo || urlHi || String(track?.src || '').trim() || null;
    return urlHi || urlLo || String(track?.src || '').trim() || null;
  };

  // Локальная доступность (MVP по bytes):
  const localHi = uid ? await hasCachedEnough(uid, 'hi') : false;
  const localLo = uid ? await hasCachedEnough(uid, 'lo') : false;

  const localQuality = localHi ? 'hi' : (localLo ? 'lo' : null);

  // PQ↔CQ правило:
  // если CQ выше PQ и локально есть hi — выбираем hi (effectiveQuality='hi')
  // иначе выбираем PQ (с fallback по url наличию)
  const effectiveQuality = (() => {
    if (pq === 'lo' && cq === 'hi' && localHi) return 'hi';
    return pq;
  })();

  // Если сети нет:
  // - если у нас есть реальный локальный URL -> можем играть локально (пока нет реализации)
  // - иначе url=null (нужно пропустить трек)
  if (!st?.online) {
    // пока локального objectURL нет
    return {
      url: null,
      effectiveQuality,
      isLocal: false,
      localQuality,
      reason: offlineMode ? 'offlineMode:noNetwork:noLocalUrl' : 'noNetwork:noLocalUrl'
    };
  }

  // Сеть есть: всегда можем играть по сети.
  // При этом effectiveQuality может быть hi даже при PQ=lo (если CQ=hi и локально было бы hi).
  // Но пока url локальный не реализован, всё равно играем по сети в effectiveQuality.
  const url = pickNetworkUrl(effectiveQuality);

  return {
    url: url || null,
    effectiveQuality,
    isLocal: false,
    localQuality,
    reason: 'network'
  };
}

export const TrackResolver = { resolvePlaybackSource };

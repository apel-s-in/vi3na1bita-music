// scripts/offline/track-resolver.js
// TrackResolver (ESM) — выбор источника воспроизведения по PQ↔CQ (ТЗ 6.1)
// Ключевое правило: CQ влияет на воспроизведение ТОЛЬКО если CQ выше PQ

import { bytesByQuality, getAudioBlob } from './cache-db.js';
import { getTrackByUid } from '../app/track-registry.js';

const MB = 1024 * 1024;
const COMPLETE_THRESHOLD = 0.92; // 92% считаем complete

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
}

function safeUrl(v) {
  const s = String(v || '').trim();
  return s || null;
}

// Object URL cache with TTL
const objectUrlCache = new Map();
const OBJECT_URL_TTL_MS = 30 * 60 * 1000;

function getCachedObjectUrl(key) {
  const rec = objectUrlCache.get(key);
  if (!rec) return null;
  if ((Date.now() - rec.ts) > OBJECT_URL_TTL_MS) {
    try { URL.revokeObjectURL(rec.url); } catch {}
    objectUrlCache.delete(key);
    return null;
  }
  return rec.url;
}

function setCachedObjectUrl(key, url) {
  objectUrlCache.set(key, { url, ts: Date.now() });
  return url;
}

async function getLocalBlobUrl(uid, quality) {
  const u = String(uid || '').trim();
  if (!u) return null;

  const q = normQ(quality);
  const key = `${u}:${q}`;

  // Check cache first
  const cached = getCachedObjectUrl(key);
  if (cached) return cached;

  // Get blob from IndexedDB
  const blob = await getAudioBlob(u, q);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  return setCachedObjectUrl(key, url);
}

async function isLocalComplete(uid, quality) {
  const u = String(uid || '').trim();
  if (!u) return false;

  const q = normQ(quality);
  const meta = getTrackByUid(u);
  if (!meta) return false;

  const needMb = q === 'hi'
    ? Number(meta.sizeHi || meta.size || 0)
    : Number(meta.sizeLo || meta.size_low || 0);

  if (!(Number.isFinite(needMb) && needMb > 0)) return false;

  const needBytes = Math.floor(needMb * MB);
  const have = await bytesByQuality(u);
  const gotBytes = q === 'hi' ? Number(have.hi || 0) : Number(have.lo || 0);

  if (!(Number.isFinite(gotBytes) && gotBytes > 0)) return false;

  return gotBytes >= Math.floor(needBytes * COMPLETE_THRESHOLD);
}

function getNetworkStatus() {
  try {
    if (window.NetworkManager?.getStatus) {
      return window.NetworkManager.getStatus();
    }
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown' };
}

/**
 * resolvePlaybackSource — главная функция выбора источника (ТЗ 6.1, 7.4)
 * 
 * Порядок выбора (ТЗ 7.4.2):
 * 1. Локальная копия качества ≥ PQ
 * 2. Сетевой источник качества = PQ (если сеть доступна)
 * 3. Локальная копия качества < PQ (fallback)
 * 4. null (недоступно офлайн)
 * 
 * Правило PQ↔CQ (ТЗ 6.1):
 * - CQ влияет на playback ТОЛЬКО если CQ > PQ
 * - PQ=Hi, CQ=Lo → играем Hi (не ухудшаем!)
 * - PQ=Lo, CQ=Hi, локально есть Hi → играем Hi (улучшение)
 */
export async function resolvePlaybackSource(params) {
  const track = params?.track || null;
  const pq = normQ(params?.pq);
  const cq = normQ(params?.cq);
  const offlineMode = !!params?.offlineMode;
  const network = params?.network || getNetworkStatus();

  const uid = String(track?.uid || '').trim() || null;
  const netOnline = !!network?.online;

  // Extract URLs from track
  const sources = track?.sources || null;
  const urlHi = safeUrl(sources?.audio?.hi || track?.audio || track?.src);
  const urlLo = safeUrl(sources?.audio?.lo || track?.audio_low);

  const pickNetworkUrl = (q) => {
    if (q === 'lo') return urlLo || urlHi;
    return urlHi || urlLo;
  };

  // Check local availability
  const localHiComplete = uid ? await isLocalComplete(uid, 'hi') : false;
  const localLoComplete = uid ? await isLocalComplete(uid, 'lo') : false;

  const localQuality = localHiComplete ? 'hi' : (localLoComplete ? 'lo' : null);

  // ТЗ 6.1: Определяем effective quality
  // CQ > PQ: можем улучшить воспроизведение локальным файлом
  // CQ < PQ: НЕ ухудшаем воспроизведение из-за кэша
  const cqHigherThanPq = (cq === 'hi' && pq === 'lo');
  
  let effectiveQuality = pq;
  if (cqHigherThanPq && localHiComplete) {
    // PQ=Lo, CQ=Hi, есть Hi локально → улучшаем до Hi
    effectiveQuality = 'hi';
  }

  // ===== СЕТЬ НЕДОСТУПНА =====
  if (!netOnline) {
    // Приоритет 1: локальная копия ≥ effectiveQuality
    if (effectiveQuality === 'hi' && localHiComplete) {
      const url = await getLocalBlobUrl(uid, 'hi');
      if (url) {
        return { url, effectiveQuality: 'hi', isLocal: true, localQuality, reason: 'offline:localHi' };
      }
    }
    
    if (effectiveQuality === 'lo' && (localLoComplete || localHiComplete)) {
      // Lo запрошен: подойдёт Lo или Hi (Hi — улучшение)
      const prefQ = localHiComplete ? 'hi' : 'lo';
      const url = await getLocalBlobUrl(uid, prefQ);
      if (url) {
        return { url, effectiveQuality: prefQ, isLocal: true, localQuality, reason: `offline:local${prefQ.charAt(0).toUpperCase() + prefQ.slice(1)}` };
      }
    }

    // Приоритет 3: любая локальная копия (fallback)
    if (localHiComplete) {
      const url = await getLocalBlobUrl(uid, 'hi');
      if (url) {
        return { url, effectiveQuality: 'hi', isLocal: true, localQuality, reason: 'offline:fallbackHi' };
      }
    }
    if (localLoComplete) {
      const url = await getLocalBlobUrl(uid, 'lo');
      if (url) {
        return { url, effectiveQuality: 'lo', isLocal: true, localQuality, reason: 'offline:fallbackLo' };
      }
    }

    // Ничего нет
    return { url: null, effectiveQuality, isLocal: false, localQuality: null, reason: 'offline:noLocal' };
  }

  // ===== СЕТЬ ДОСТУПНА =====
  
  // ТЗ 11.2.A: если OFFLINE mode OFF — только сеть (Playback Cache через сеть)
  if (!offlineMode) {
    const url = pickNetworkUrl(effectiveQuality);
    return { url, effectiveQuality, isLocal: false, localQuality, reason: 'online:streamOnly' };
  }

  // OFFLINE mode ON: локальные файлы имеют приоритет для минимизации трафика
  
  // Приоритет 1: локальная копия ≥ effectiveQuality
  if (effectiveQuality === 'hi' && localHiComplete) {
    const url = await getLocalBlobUrl(uid, 'hi');
    if (url) {
      return { url, effectiveQuality: 'hi', isLocal: true, localQuality, reason: 'offlineMode:localHi' };
    }
  }

  if (effectiveQuality === 'lo') {
    // Lo запрошен: Hi подходит (≥), Lo подходит
    if (localHiComplete) {
      const url = await getLocalBlobUrl(uid, 'hi');
      if (url) {
        return { url, effectiveQuality: 'hi', isLocal: true, localQuality, reason: 'offlineMode:localHiForLo' };
      }
    }
    if (localLoComplete) {
      const url = await getLocalBlobUrl(uid, 'lo');
      if (url) {
        return { url, effectiveQuality: 'lo', isLocal: true, localQuality, reason: 'offlineMode:localLo' };
      }
    }
  }

  // Приоритет 2: сетевой источник = effectiveQuality
  const netUrl = pickNetworkUrl(effectiveQuality);
  if (netUrl) {
    return { url: netUrl, effectiveQuality, isLocal: false, localQuality, reason: 'offlineMode:network' };
  }

  // Приоритет 3: fallback на любую локальную копию
  if (localHiComplete) {
    const url = await getLocalBlobUrl(uid, 'hi');
    if (url) {
      return { url, effectiveQuality: 'hi', isLocal: true, localQuality, reason: 'offlineMode:fallbackHi' };
    }
  }
  if (localLoComplete) {
    const url = await getLocalBlobUrl(uid, 'lo');
    if (url) {
      return { url, effectiveQuality: 'lo', isLocal: true, localQuality, reason: 'offlineMode:fallbackLo' };
    }
  }

  return { url: null, effectiveQuality, isLocal: false, localQuality: null, reason: 'offlineMode:noSource' };
}

export const TrackResolver = { resolvePlaybackSource };

import { getAudioBlob, bytesByQuality, touchLocalAccess, getLocalMeta } from './cache-db.js';
import { getTrackByUid } from '../app/track-registry.js';

const BLOB_TTL = 30 * 60 * 1000; // 30 min cache for blob URLs
const cache = new Map(); // key(uid:q) -> { url, ts }

// --- Helpers ---
const norm = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const sUrl = (v) => (v ? String(v).trim() : null);

function getCachedUrl(key) {
  const r = cache.get(key);
  if (!r) return null;
  if (Date.now() - r.ts > BLOB_TTL) { revoke(key); return null; }
  return r.url;
}

function revoke(key) {
  const r = cache.get(key);
  if (r) { try { URL.revokeObjectURL(r.url); } catch {} cache.delete(key); return true; }
  return false;
}

// API: Очистка ресурсов при удалении трека
export function revokeObjectUrlsForUid(uid) {
  return (revoke(`${uid}:hi`) ? 1 : 0) + (revoke(`${uid}:lo`) ? 1 : 0);
}

// API: Проверка целостности файла (ТЗ 9.2)
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
  const key = `${uid}:${q}`;
  let url = getCachedUrl(key);
  if (url) return url;

  const blob = await getAudioBlob(uid, q);
  if (!blob) return null;

  url = URL.createObjectURL(blob);
  cache.set(key, { url, ts: Date.now() });
  try { await touchLocalAccess(uid); } catch {}
  return url;
}

// API: Главный метод выбора источника (ТЗ 6.1, 7.4, 11.2)
export async function resolvePlaybackSource({ track, pq, cq, offlineMode }) {
  const u = sUrl(track?.uid);
  const net = window.Utils?.isOnline ? window.Utils.isOnline() : navigator.onLine;
  const pQual = norm(pq);
  const cQual = norm(cq);

  // 1. Анализ доступности локальных файлов
  const [hasHi, hasLo] = u ? await Promise.all([isLocalComplete(u, 'hi'), isLocalComplete(u, 'lo')]) : [false, false];

  // 2. Правило ТЗ 6.1: CQ влияет только если он выше PQ (улучшение)
  let effQ = pQual;
  if (pQual === 'lo' && cQual === 'hi' && hasHi) effQ = 'hi';

  // 3. Формирование кандидатов (ТЗ 7.4.2)
  const attempts = [];

  // A. Локальный идеальный (Local >= PQ)
  // Пытаемся взять из кэша то качество, которое нужно (или лучшее доступное для Lo)
  if (effQ === 'hi' && hasHi) attempts.push({ type: 'local', q: 'hi' });
  else if (effQ === 'lo') {
    if (hasLo) attempts.push({ type: 'local', q: 'lo' });
    else if (hasHi) attempts.push({ type: 'local', q: 'hi' }); // Fallback to Hi for Lo requests is fine
  }

  // B. Сеть (Network = PQ) - если разрешено
  // Если offlineMode=ON, сеть исключаем (кроме случаев, когда локально нет вообще ничего - но ТЗ требует строгости)
  if (net && !offlineMode) {
    const src = track?.sources?.audio;
    const url = (pQual === 'lo') ? (src?.lo || track?.audio_low) : (src?.hi || track?.audio);
    const alt = (pQual === 'lo') ? (src?.hi || track?.audio) : (src?.lo || track?.audio_low);
    if (url || alt) attempts.push({ type: 'net', url: sUrl(url || alt) });
  }

  // C. Локальный Fallback (Local < PQ) - играем что есть
  if (!hasHi && hasLo && pQual === 'hi') attempts.push({ type: 'local', q: 'lo' });
  if (hasHi && !hasLo && pQual === 'lo') attempts.push({ type: 'local', q: 'hi' }); // Already covered but safe to double check

  // 4. Выбор первого доступного
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

// API: Проверка доступности (для UI)
export async function isTrackAvailableOffline(uid) {
  const u = sUrl(uid);
  return u ? ((await isLocalComplete(u, 'hi')) || (await isLocalComplete(u, 'lo'))) : false;
}

export const TrackResolver = { resolvePlaybackSource, isTrackAvailableOffline, isLocalComplete };

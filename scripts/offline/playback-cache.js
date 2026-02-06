/**
 * playback-cache.js — Управление воспроизведением с учётом офлайн-кэша.
 *
 * Отвечает за:
 *   - Резолв URL трека (кэш → сеть → fallback)
 *   - Сценарий потери сети: S1 (ожидание) → S2 (модалка) → S3 (wait/skip/FOQ)
 *   - Предзагрузку следующего трека
 *   - Генерацию событий для UI (иконки, прогресс, тосты)
 *
 * Зависимости:
 *   - ./cache-db.js (getAudioBlob, getTrackMeta, setAudioBlob, setTrackMeta)
 *   - ./offline-manager.js (window.OfflineManager)
 *   - ../ui/s2-modal.js (showS2Modal)
 */

import {
  getAudioBlob,
  getTrackMeta,
  setAudioBlob,
  setTrackMeta
} from './cache-db.js';

/* ═══════════════════════════════════════════
   Константы
   ═══════════════════════════════════════════ */

const S1_TIMEOUT_MS = 10_000;
const PRELOAD_AHEAD = 1;
const CLOUD_TTL_MS = 31 * 24 * 60 * 60 * 1000; // 31 день

/* ═══════════════════════════════════════════
   Состояние модуля
   ═══════════════════════════════════════════ */

let _currentScenario = null;   // 'S1' | 'S2' | 'S3' | null
let _s1Timer = null;
let _s3Action = null;          // 'wait' | 'skip' | null
let _abortCtrl = null;         // AbortController для текущей загрузки
let _preloadQueue = [];

/* ═══════════════════════════════════════════
   Утилиты
   ═══════════════════════════════════════════ */

function isOnline() {
  return navigator.onLine;
}

function getManager() {
  return window.OfflineManager || null;
}

function getMode() {
  const mgr = getManager();
  return mgr ? mgr.getMode() : 'R0';
}

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function toast(msg) {
  emit('offline:toast', { message: msg });
}

function blobToUrl(blob) {
  return URL.createObjectURL(blob);
}

/* ═══════════════════════════════════════════
   Сценарий S1 → S2 → S3
   ═══════════════════════════════════════════ */

function clearScenario() {
  if (_s1Timer) {
    clearTimeout(_s1Timer);
    _s1Timer = null;
  }
  if (_abortCtrl) {
    _abortCtrl.abort();
    _abortCtrl = null;
  }
  _currentScenario = null;
  _s3Action = null;
}

/**
 * S1 — 10 секунд ожидания сети.
 * Если сеть вернулась — resolve(url).
 * Если нет — переход в S2.
 */
function startS1(uid, networkUrl, quality, resolve, reject) {
  _currentScenario = 'S1';
  emit('playback:scenario', { state: 'S1', uid });

  const onOnline = () => {
    cleanup();
    resolveFromNetwork(uid, quality, networkUrl).then(resolve).catch(reject);
  };

  const onTimeout = () => {
    cleanup();
    startS2(uid, networkUrl, quality, resolve, reject);
  };

  function cleanup() {
    window.removeEventListener('online', onOnline);
    if (_s1Timer) clearTimeout(_s1Timer);
    _s1Timer = null;
  }

  window.addEventListener('online', onOnline, { once: true });
  _s1Timer = setTimeout(onTimeout, S1_TIMEOUT_MS);
}

/**
 * S2 — Модалка выбора: «Ждать» / «Пропустить» / «Перейти к FOQ».
 * Импортирует s2-modal.js динамически.
 */
async function startS2(uid, networkUrl, quality, resolve, reject) {
  _currentScenario = 'S2';
  emit('playback:scenario', { state: 'S2', uid });

  let showS2Modal;
  try {
    const mod = await import('../ui/s2-modal.js');
    showS2Modal = mod.showS2Modal;
  } catch {
    // fallback — если модалка не подключена, автоскип
    resolve(null);
    return;
  }

  const mode = getMode();
  const hasFOQ = (mode === 'R2' || mode === 'R3');

  const choice = await showS2Modal({ uid, hasFOQ });

  switch (choice) {
    case 'wait':
      startS3Wait(uid, networkUrl, quality, resolve, reject);
      break;

    case 'skip':
      _currentScenario = null;
      resolve(null); // PlayerCore сделает next()
      break;

    case 'foq':
      startS3FOQ(uid, resolve, reject);
      break;

    default:
      _currentScenario = null;
      resolve(null);
  }
}

/**
 * S3-wait — ждём сеть бесконечно, показывая спиннер.
 */
function startS3Wait(uid, networkUrl, quality, resolve, reject) {
  _currentScenario = 'S3';
  _s3Action = 'wait';
  emit('playback:scenario', { state: 'S3', action: 'wait', uid });

  const onOnline = () => {
    _currentScenario = null;
    _s3Action = null;
    emit('playback:scenario', { state: null, uid });
    resolveFromNetwork(uid, quality, networkUrl).then(resolve).catch(reject);
  };

  window.addEventListener('online', onOnline, { once: true });
}

/**
 * S3-FOQ — переход к ближайшему закэшированному треку (Full Offline Queue).
 */
async function startS3FOQ(uid, resolve, reject) {
  _currentScenario = 'S3';
  _s3Action = 'foq';
  emit('playback:scenario', { state: 'S3', action: 'foq', uid });

  const mgr = getManager();
  if (mgr && typeof mgr.getRecoveryTarget === 'function') {
    const target = await mgr.getRecoveryTarget();
    if (target) {
      emit('playback:jumpToTrack', { uid: target.uid });
      _currentScenario = null;
      resolve(null); // PlayerCore обработает jumpToTrack
      return;
    }
  }

  toast('Нет закэшированных треков для воспроизведения');
  _currentScenario = null;
  resolve(null);
}

/* ═══════════════════════════════════════════
   Резолв URL трека
   ═══════════════════════════════════════════ */

/**
 * Основная точка входа — вызывается из PlayerCore.
 * Возвращает: { url, source } | null
 *
 * source: 'cache' | 'network' | null
 */
export async function resolveTrackUrl(uid, networkUrl, quality) {
  clearScenario();

  // 1. Пробуем кэш
  const cached = await tryCache(uid, quality);
  if (cached) {
    schedulePreload(uid, quality);
    return cached;
  }

  // 2. Пробуем сеть
  if (isOnline() && networkUrl) {
    try {
      const result = await resolveFromNetwork(uid, quality, networkUrl);
      schedulePreload(uid, quality);
      return result;
    } catch (err) {
      console.warn('[PlaybackCache] Network fetch failed:', err.message);
    }
  }

  // 3. Нет кэша и нет сети — запускаем S1
  return new Promise((resolve, reject) => {
    startS1(uid, networkUrl, quality, resolve, reject);
  });
}

/**
 * Пробуем получить трек из кэша.
 */
async function tryCache(uid, quality) {
  try {
    // Сначала запрошенное качество
    let blob = await getAudioBlob(uid, quality);
    if (blob) {
      emit('playback:source', { uid, source: 'cache', quality });
      return { url: blobToUrl(blob), source: 'cache' };
    }

    // Fallback на другое качество
    const fallbackQ = quality === 'high' ? 'low' : 'high';
    blob = await getAudioBlob(uid, fallbackQ);
    if (blob) {
      emit('playback:source', { uid, source: 'cache', quality: fallbackQ });
      return { url: blobToUrl(blob), source: 'cache' };
    }
  } catch (err) {
    console.warn('[PlaybackCache] Cache read error:', err.message);
  }

  return null;
}

/**
 * Загрузка трека из сети с попутным кэшированием (cloud-тип).
 */
async function resolveFromNetwork(uid, quality, networkUrl) {
  if (!networkUrl) {
    return { url: null, source: null };
  }

  emit('playback:source', { uid, source: 'network', quality });

  const mode = getMode();

  // В R0 — просто стримим, без кэширования
  if (mode === 'R0') {
    return { url: networkUrl, source: 'network' };
  }

  // R1/R2/R3 — кэшируем как cloud
  try {
    _abortCtrl = new AbortController();

    const resp = await fetch(networkUrl, { signal: _abortCtrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    _abortCtrl = null;

    await setAudioBlob(uid, quality, blob);
    await setTrackMeta(uid, {
      type: 'cloud',
      quality,
      size: blob.size,
      ttl: CLOUD_TTL_MS
    });

    emit('playback:cached', { uid, quality, size: blob.size });

    return { url: blobToUrl(blob), source: 'network' };
  } catch (err) {
    _abortCtrl = null;
    if (err.name === 'AbortError') return { url: null, source: null };
    // При ошибке — стримим напрямую
    return { url: networkUrl, source: 'network' };
  }
}

/* ═══════════════════════════════════════════
   Предзагрузка следующего трека
   ═══════════════════════════════════════════ */

function schedulePreload(currentUid, quality) {
  const mode = getMode();
  if (mode === 'R0') return;

  emit('playback:preloadRequest', {
    currentUid,
    quality,
    count: PRELOAD_AHEAD
  });
}

/**
 * Предзагрузить конкретный трек (вызывается из PlayerCore / OfflineManager).
 */
export async function preloadTrack(uid, networkUrl, quality) {
  if (!networkUrl || !isOnline()) return false;

  const existing = await getAudioBlob(uid, quality);
  if (existing) return true;

  try {
    const resp = await fetch(networkUrl);
    if (!resp.ok) return false;

    const blob = await resp.blob();
    await setAudioBlob(uid, quality, blob);
    await setTrackMeta(uid, { type: 'cloud', quality, size: blob.size, url: networkUrl, ttl: CLOUD_TTL_MS });

    emit('playback:cached', { uid, quality, size: blob.size });
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════
   Определение качества кэша для трека
   ═══════════════════════════════════════════ */

/**
 * Возвращает информацию о кэше трека.
 * { cached: bool, quality: 'high'|'low'|null, type: string|null }
 */
export async function getTrackCacheInfo(uid) {
  const meta = await getTrackMeta(uid);
  if (!meta) return { cached: false, quality: null, type: null };

  const hasHigh = !!(await getAudioBlob(uid, 'high'));
  const hasLow = !hasHigh && !!(await getAudioBlob(uid, 'low'));

  if (!hasHigh && !hasLow) {
    return { cached: false, quality: null, type: meta.type || null };
  }

  return {
    cached: true,
    quality: hasHigh ? 'high' : 'low',
    type: meta.type || 'cloud'
  };
}

/* ═══════════════════════════════════════════
   Текущее состояние сценария (для UI)
   ═══════════════════════════════════════════ */

export function getScenarioState() {
  return {
    scenario: _currentScenario,
    action: _s3Action
  };
}

/**
 * Принудительная отмена текущего сценария (например при ручном переключении трека).
 */
export function cancelScenario() {
  clearScenario();
  emit('playback:scenario', { state: null });
}

/* ═══════════════════════════════════════════
   Вычисление % загрузки текущего трека (для прогресс-бара)
   ═══════════════════════════════════════════ */

export async function computeCachePercent(uid) {
  const meta = await getTrackMeta(uid);
  if (!meta) return 0;

  const blob = (await getAudioBlob(uid, 'high')) || (await getAudioBlob(uid, 'low'));
  if (!blob) return 0;

  return 100; // Если blob есть — он загружен целиком (мы не храним частичные)
}

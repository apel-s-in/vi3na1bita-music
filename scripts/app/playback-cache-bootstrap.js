/**
 * playback-cache-bootstrap.js — Инициализация Playback Cache.
 *
 * Подключается к PlayerCore для автоматического:
 *  - кэширования соседних треков (NEXT/PREV) при воспроизведении
 *  - регистрации полных прослушиваний (full listen → cloud-статистика)
 *  - использования локальных копий 🔒/☁ при воспроизведении
 *
 * ТЗ: Приложение П.5.2, П.6.1, П.10
 *
 * Экспорт:
 *   - initPlaybackCache() — вызвать один раз при старте приложения
 */

import offlineManager, { getOfflineManager } from '../offline/offline-manager.js';
import { resolveTrackUrl, revokeTrackUrl } from '../offline/track-resolver.js';

/* ═══════ State ═══════ */

let _initialized = false;
let _lastResolvedUrl = null;
let _listenStartTime = 0;
let _listenUid = null;

/* ═══════ Init ═══════ */

/**
 * initPlaybackCache() — подключение к PlayerCore.
 * Вызвать после инициализации PlayerCore и OfflineManager.
 */
export function initPlaybackCache() {
  if (_initialized) return;
  _initialized = true;

  const mgr = getOfflineManager();

  /* ─── Перехват события смены трека ─── */
  window.addEventListener('player:trackChanged', async (e) => {
    const { uid, trackData } = e.detail || {};
    if (!uid) return;

    /* Зафиксировать full listen для предыдущего трека */
    _checkFullListen();

    /* Начать отслеживание нового трека */
    _listenStartTime = Date.now();
    _listenUid = uid;

    /* Предзагрузка соседей (P1) — ТЗ П.10 */
    _prefetchNeighbors(uid);
  });

  /* ─── Перехват окончания трека ─── */
  window.addEventListener('player:trackEnded', (e) => {
    const { uid } = e.detail || {};
    _checkFullListen(uid);
  });

  /* ─── Перехват прогресса (для определения >90%) ─── */
  window.addEventListener('player:timeUpdate', (e) => {
    /* Сохраняем данные для _checkFullListen */
    const { uid, currentTime, duration } = e.detail || {};
    if (uid && duration > 0) {
      _lastProgress = { uid, currentTime, duration };
    }
  });

  /* ─── Online/offline ─── */
  window.addEventListener('online', () => {
    mgr.resumeDownloads();
  });

  window.addEventListener('offline', () => {
    /* Не паузим очередь полностью — просто fetch будет фейлиться */
  });

  console.log('[PlaybackCache] Initialized');
}

/* ═══════ Progress tracking ═══════ */

let _lastProgress = { uid: null, currentTime: 0, duration: 0 };

/**
 * Проверить и зарегистрировать full listen.
 * ТЗ П.5.2: Full listen = прогресс > 90% длительности.
 */
function _checkFullListen(overrideUid) {
  const uid = overrideUid || _listenUid;
  if (!uid) return;

  const p = _lastProgress;
  if (p.uid !== uid) return;
  if (!p.duration || p.duration <= 0) return;

  const ratio = p.currentTime / p.duration;
  if (ratio < 0.9) return;

  /* Регистрируем full listen */
  const mgr = getOfflineManager();
  mgr.registerFullListen(uid, {
    duration: p.duration,
    position: p.currentTime
  });

  /* Сбросить чтобы не засчитывать дважды */
  _listenUid = null;
  _lastProgress = { uid: null, currentTime: 0, duration: 0 };
}

/* ═══════ Prefetch neighbors (ТЗ П.10: P1) ═══════ */

async function _prefetchNeighbors(currentUid) {
  const mgr = getOfflineManager();
  const mode = mgr.getMode();

  /* В R0 (чистый стриминг) НЕ предзагружаем соседей (только если R1+) */
  if (mode === 'R0') return;

  const playerCore = window.playerCore;
  if (!playerCore) return;

  const playlist = playerCore.getPlaylistSnapshot?.() || [];
  const currentIdx = playlist.findIndex(t =>
    (t.uid || t.id) === currentUid
  );

  if (currentIdx < 0) return;

  const quality = mgr.getCacheQuality();
  const neighbors = [];

  /* NEXT */
  if (currentIdx + 1 < playlist.length) {
    const next = playlist[currentIdx + 1];
    neighbors.push(next);
  }

  /* PREV */
  if (currentIdx - 1 >= 0) {
    const prev = playlist[currentIdx - 1];
    neighbors.push(prev);
  }

  for (const track of neighbors) {
    const uid = track.uid || track.id;
    if (!uid) continue;

    /* Не качать если уже есть */
    const state = await mgr.getTrackOfflineState(uid);
    if (state.status === 'pinned' || state.status === 'cloud') continue;

    const url = _getTrackUrl(track, quality);
    if (!url) continue;

    if (await mgr.hasSpace()) {
      mgr.enqueueAudioDownload(uid, {
        priority: 6, /* P1 — neighbor */
        kind: 'playbackCache'
      });
    }
  }
}

/**
 * Получить URL трека по объекту из плейлиста.
 */
function _getTrackUrl(track, quality) {
  if (quality === 'lo') return track.audio_low || track.audio || track.src || null;
  return track.audio || track.src || null;
}

/* ═══════ resolveForPlayback (используется PlayerCore) ═══════ */

/**
 * resolveForPlayback(uid, trackData) — определить источник для воспроизведения.
 *
 * ТЗ П.6.1: Приоритет локальной копии над стримингом.
 *
 * @param {string} uid
 * @param {Object} trackData — { audio, audio_low, src }
 * @returns {Promise<{ url: string|null, source: string, quality: string }>}
 */
export async function resolveForPlayback(uid, trackData) {
  /* Освободить предыдущий blob URL */
  if (_lastResolvedUrl) {
    revokeTrackUrl(_lastResolvedUrl);
    _lastResolvedUrl = null;
  }

  const resolved = await resolveTrackUrl(uid, trackData);
  _lastResolvedUrl = resolved;
  return resolved;
}

/* ═══════ Default export ═══════ */

export default {
  initPlaybackCache,
  resolveForPlayback
};

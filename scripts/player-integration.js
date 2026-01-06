// scripts/player-integration.js
// Интеграция офлайн-системы с аудио-плеером

import { getOfflineManager } from './offline/offline-manager.js';
import { getPlaybackCache } from './offline/playback-cache.js';
import { resolvePlaybackSource } from './offline/track-resolver.js';
import { getTrackByUid } from './app/track-registry.js';

let _currentTrack = null;
let _pq = 'hi';
let _listenStartTime = 0;
let _listenedSeconds = 0;

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
}

/**
 * setPlaybackQuality — устанавливает PQ глобально
 */
export function setPlaybackQuality(pq) {
  _pq = normQ(pq);
  getPlaybackCache().setPlaybackQuality(_pq);
  return _pq;
}

/**
 * getPlaybackQuality — возвращает текущее PQ
 */
export function getPlaybackQuality() {
  return _pq;
}

/**
 * resolveAndPlay — разрешает источник и начинает воспроизведение
 */
export async function resolveAndPlay(uid, audioElement) {
  const u = String(uid || '').trim();
  if (!u || !audioElement) return null;

  const track = getTrackByUid(u);
  if (!track) {
    console.warn('[Player] Track not found:', u);
    return null;
  }

  const mgr = getOfflineManager();
  const cq = await mgr.getCacheQuality();

  const result = await resolvePlaybackSource({
    track,
    pq: _pq,
    cq,
    offlineMode: mgr.isOfflineMode(),
    network: window.NetworkManager?.getStatus?.() || { online: navigator.onLine }
  });

  if (!result?.url) {
    console.warn('[Player] No playback source available for:', u);
    window.NotificationSystem?.error('Трек недоступен офлайн');
    return null;
  }

  // Update current track
  _currentTrack = { uid: u, track, result };
  _listenStartTime = Date.now();
  _listenedSeconds = 0;

  // Set source and play
  audioElement.src = result.url;
  audioElement.load();

  try {
    await audioElement.play();
  } catch (e) {
    console.warn('[Player] Autoplay blocked:', e);
  }

  console.log(`[Player] Playing: ${u}, source: ${result.reason}, quality: ${result.effectiveQuality}, isLocal: ${result.isLocal}`);

  return result;
}

/**
 * onPlaylistChange — обновляет плейлист в PlaybackCache
 */
export function onPlaylistChange(uids) {
  getPlaybackCache().setPlaylist(uids);
}

/**
 * onTrackIndexChange — уведомляет PlaybackCache о смене трека
 */
export function onTrackIndexChange(idx) {
  getPlaybackCache().onTrackChange(idx);
}

/**
 * onTimeUpdate — трекинг времени прослушивания
 */
export function onTimeUpdate(currentTime, duration) {
  if (!_currentTrack) return;

  const now = Date.now();
  const delta = (now - _listenStartTime) / 1000;

  if (delta >= 1) {
    _listenedSeconds += delta;
    _listenStartTime = now;
  }
}

/**
 * onTrackEnded — вызывается при завершении трека
 */
export async function onTrackEnded() {
  if (!_currentTrack) return;

  const uid = _currentTrack.uid;
  const mgr = getOfflineManager();

  // Record full listen
  await mgr.recordListenStats(uid, {
    deltaSec: _listenedSeconds,
    isFullListen: true
  });

  console.log(`[Player] Track ended: ${uid}, listened: ${_listenedSeconds.toFixed(1)}s`);

  // Reset
  _currentTrack = null;
  _listenedSeconds = 0;
}

/**
 * onTrackPaused — вызывается при паузе
 */
export async function onTrackPaused() {
  if (!_currentTrack) return;

  const uid = _currentTrack.uid;
  const mgr = getOfflineManager();

  // Record partial listen
  await mgr.recordListenStats(uid, {
    deltaSec: _listenedSeconds,
    isFullListen: false
  });

  console.log(`[Player] Track paused: ${uid}, listened: ${_listenedSeconds.toFixed(1)}s`);
}

/**
 * setupAudioElementListeners — подключает слушатели к audio element
 */
export function setupAudioElementListeners(audioElement) {
  if (!audioElement) return;

  audioElement.addEventListener('timeupdate', () => {
    onTimeUpdate(audioElement.currentTime, audioElement.duration);
  });

  audioElement.addEventListener('ended', () => {
    onTrackEnded();
  });

  audioElement.addEventListener('pause', () => {
    // Only record if not ended
    if (!audioElement.ended) {
      onTrackPaused();
    }
  });

  audioElement.addEventListener('play', () => {
    _listenStartTime = Date.now();
  });
}

export const PlayerIntegration = {
  setPlaybackQuality,
  getPlaybackQuality,
  resolveAndPlay,
  onPlaylistChange,
  onTrackIndexChange,
  onTimeUpdate,
  onTrackEnded,
  onTrackPaused,
  setupAudioElementListeners
};

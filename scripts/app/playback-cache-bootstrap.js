/**
 * playback-cache-bootstrap.js — Связка PlayerCore ↔ OfflineManager.
 *
 * Отвечает за:
 *   1. Регистрацию полных прослушиваний (fullListen) → cloud-статистика
 *   2. Подключение track-resolver для приоритета локальных копий
 *   3. Диспатч window events для совместимости
 *
 * ТЗ: П.5.2, П.6.1
 *
 * ВАЖНО: PlayerCore НЕ диспатчит window event `player:trackEnded`.
 * Вместо этого мы подписываемся через playerCore.on({ onEnd: ... })
 * и вычисляем fullPlay из позиции/длительности.
 */

import offlineManager from '../offline/offline-manager.js';
import { resolveTrackUrl, revokeTrackBlob } from '../offline/track-resolver.js';

let _playerCore = null;
let _currentUid = null;
let _currentDuration = 0;
let _initialized = false;

/**
 * Инициализация. Вызывается один раз при старте приложения.
 * @param {object} playerCore — экземпляр PlayerCore
 */
export function initPlaybackCacheBootstrap(playerCore) {
  if (_initialized) return;
  if (!playerCore) {
    console.warn('[PCB] PlayerCore не передан');
    return;
  }

  _playerCore = playerCore;
  _initialized = true;

  /* ═══ Подписка на события PlayerCore ═══ */

  /* onEnd — трек завершился естественно */
  _playerCore.on({
    onEnd: () => {
      _onTrackEnd();
    }
  });

  /* onPlay — новый трек начал играть */
  _playerCore.on({
    onPlay: (data) => {
      _onTrackStart(data);
    }
  });

  /* Fallback: слушаем кастомные события если PlayerCore их диспатчит */
  window.addEventListener('player:trackEnded', (e) => {
    _onTrackEnd();
  });

  window.addEventListener('player:trackChanged', (e) => {
    if (e.detail?.uid) {
      _currentUid = e.detail.uid;
      _currentDuration = e.detail.duration || 0;
    }
  });

  console.log('[PCB] Playback cache bootstrap initialized');
}

/* ═══════ Track start ═══════ */

function _onTrackStart(data) {
  const uid = data?.uid || _playerCore?.currentTrack?.uid;
  const duration = data?.duration || _playerCore?.getDuration?.() || 0;

  if (uid) {
    _currentUid = uid;
    _currentDuration = duration;
  }
}

/* ═══════ Track end — регистрация fullListen (ТЗ П.5.2) ═══════ */

async function _onTrackEnd() {
  const uid = _currentUid || _playerCore?.currentTrack?.uid;
  if (!uid) return;

  /* Получить позицию и длительность */
  const position = _playerCore?.getPosition?.() || _playerCore?.currentTime || 0;
  const duration = _currentDuration || _playerCore?.getDuration?.() || 0;

  /* ТЗ П.5.2: Full listen = прогресс > 90% и duration валидна */
  if (duration <= 0) return;
  const progress = position / duration;
  if (progress < 0.9) return;

  /* Регистрируем полное прослушивание */
  await offlineManager.registerFullListen(uid, { duration, position });

  /* Диспатч window event для других модулей */
  window.dispatchEvent(new CustomEvent('player:fullListen', {
    detail: { uid, duration, position }
  }));
}

/* ═══════ Track resolver integration (ТЗ П.6.1) ═══════ */

/**
 * Резолвит URL трека с приоритетом локальной копии.
 * Используется плеером вместо прямого обращения к TrackRegistry.
 *
 * @param {string} uid
 * @param {object} trackData — { audio, audio_low, src }
 * @returns {{ url: string, source: string, quality: string } | null}
 */
export async function resolveTrack(uid, trackData) {
  /* Revoke предыдущий blob */
  if (_currentUid && _currentUid !== uid) {
    revokeTrackBlob(_currentUid);
  }

  return resolveTrackUrl(uid, trackData);
}

/**
 * Ручная установка текущего uid (если PlayerCore не передаёт через события).
 */
export function setCurrentTrack(uid, duration) {
  _currentUid = uid;
  _currentDuration = duration || 0;
}

/**
 * Получить текущий uid.
 */
export function getCurrentUid() {
  return _currentUid;
}

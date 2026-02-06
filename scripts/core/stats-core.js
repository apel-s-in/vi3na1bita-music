/**
 * stats-core.js — Ядро статистики прослушивания
 * Импортирует updateGlobalStats из cache-db (не setCloudStats)
 */

import { updateGlobalStats, getCloudStats } from '../offline/cache-db.js';

let _currentUid = null;
let _startTime = 0;
let _accumulatedSec = 0;
let _isPlaying = false;

/**
 * Начать отслеживание трека
 */
export function startTracking(uid) {
  if (_currentUid && _isPlaying) {
    flushStats();
  }
  _currentUid = uid;
  _startTime = Date.now();
  _accumulatedSec = 0;
  _isPlaying = true;
}

/**
 * Пауза — сохраняем накопленное
 */
export function pauseTracking() {
  if (!_isPlaying || !_currentUid) return;
  _accumulatedSec += (Date.now() - _startTime) / 1000;
  _isPlaying = false;
}

/**
 * Возобновление после паузы
 */
export function resumeTracking() {
  if (_isPlaying || !_currentUid) return;
  _startTime = Date.now();
  _isPlaying = true;
}

/**
 * Трек завершён (полное прослушивание)
 */
export function trackCompleted() {
  if (!_currentUid) return;
  if (_isPlaying) {
    _accumulatedSec += (Date.now() - _startTime) / 1000;
    _isPlaying = false;
  }
  const sec = Math.round(_accumulatedSec);
  if (sec > 0) {
    updateGlobalStats(_currentUid, sec, 1).catch(() => {});
  }
  _accumulatedSec = 0;
  _currentUid = null;
}

/**
 * Сбросить текущую статистику (смена трека)
 */
export function flushStats() {
  if (!_currentUid) return;
  if (_isPlaying) {
    _accumulatedSec += (Date.now() - _startTime) / 1000;
    _isPlaying = false;
  }
  const sec = Math.round(_accumulatedSec);
  if (sec > 0) {
    updateGlobalStats(_currentUid, sec, 0).catch(() => {});
  }
  _accumulatedSec = 0;
}

/**
 * Получить облачную статистику
 */
export async function getStats() {
  return getCloudStats();
}

export default {
  startTracking,
  pauseTracking,
  resumeTracking,
  trackCompleted,
  flushStats,
  getStats
};

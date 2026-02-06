/**
 * stats-core.js — StatsCore: единая точка подсчёта статистики.
 *
 * Две независимые системы:
 *   Cloud stats  — для управления ☁ (сбрасывается при «Удалить из кэша»)
 *   Global stats — для модалки «Статистика» (НИКОГДА не сбрасывается)
 *
 * Привязка по uid — качество/источник/режим не влияют.
 */

import { updateGlobalStats } from './cache-db.js';
import offlineManager from './offline-manager.js';

class StatsCore {
  constructor() {
    this._current = null;   // { uid, startTime, seconds, maxProgress }
    this._tickTimer = null;
  }

  /* ─── События от плеера ─── */

  /**
   * Трек начал воспроизведение.
   * Вызывается при trackStart / play после паузы.
   */
  onTrackStart(uid) {
    if (!uid) return;
    const u = String(uid).trim();

    // Если тот же трек — просто возобновляем отсчёт
    if (this._current?.uid === u) {
      this._current.startTime = Date.now();
      this._startTick();
      return;
    }

    // Новый трек — финализировать предыдущий
    this._finalizeCurrent(false);

    this._current = {
      uid: u,
      startTime: Date.now(),
      seconds: 0,
      maxProgress: 0
    };
    this._startTick();
  }

  /**
   * Трек поставлен на паузу.
   */
  onPause() {
    this._flushSeconds();
    this._stopTick();
  }

  /**
   * Секундный тик (внутренний, считает время playing).
   */
  _startTick() {
    this._stopTick();
    this._tickTimer = setInterval(() => this._flushSeconds(), 5000);
  }

  _stopTick() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  _flushSeconds() {
    if (!this._current?.startTime) return;
    const now = Date.now();
    const delta = Math.floor((now - this._current.startTime) / 1000);
    if (delta > 0) {
      this._current.seconds += delta;
      this._current.startTime = now;
      // Сохраняем в global stats
      updateGlobalStats(this._current.uid, delta, 0).catch(() => {});
    }
  }

  /**
   * Seek произошёл.
   */
  onSeek(uid, from, to) {
    // Обновляем maxProgress
    if (this._current?.uid === String(uid || '').trim()) {
      this._current.maxProgress = Math.max(this._current.maxProgress, to);
    }
  }

  /**
   * Прогресс обновился (вызывается периодически из плеера).
   */
  onProgress(uid, progress) {
    if (this._current?.uid === String(uid || '').trim()) {
      this._current.maxProgress = Math.max(this._current.maxProgress, progress);
    }
  }

  /**
   * Трек закончился естественно (ended).
   */
  onEnded(uid, progress, durationValid) {
    const u = String(uid || '').trim();
    if (this._current?.uid !== u) return;
    this._current.maxProgress = Math.max(this._current.maxProgress, progress);
    this._finalizeCurrent(durationValid);
  }

  /**
   * Трек был пропущен (skip / next / prev).
   */
  onSkip(uid, progress, durationValid) {
    const u = String(uid || '').trim();
    if (this._current?.uid !== u) return;
    this._current.maxProgress = Math.max(this._current.maxProgress, progress);
    this._finalizeCurrent(durationValid);
  }

  /* ─── Финализация ─── */

  _finalizeCurrent(durationValid) {
    if (!this._current) return;

    this._flushSeconds();
    this._stopTick();

    const { uid, maxProgress } = this._current;

    // Full listen: duration валидна И прогресс > 90%
    const isFullListen = durationValid !== false && maxProgress > 0.9;

    if (isFullListen) {
      // Global stats: +1 full play
      updateGlobalStats(uid, 0, 1).catch(() => {});
      // Cloud stats: регистрация
      offlineManager.registerFullListen(uid).catch(() => {});
    }

    this._current = null;
  }
}

/* ═══════ Singleton ═══════ */

const statsCore = new StatsCore();
export default statsCore;

window.statsCore = statsCore;

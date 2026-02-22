import { eventLogger } from './event-logger.js';

export class SessionTracker {
  constructor() {
    this.currentSession = null;
    this._bindEvents();
  }
  _bindEvents() {
    window.addEventListener('player:play', (e) => this._startSession(e.detail));
    window.addEventListener('player:pause', () => this._pauseSession());
    window.addEventListener('player:tick', (e) => this._updateSession(e.detail));
    window.addEventListener('player:ended', () => this._endSession(true));
    window.addEventListener('player:stop', () => this._endSession(false));
    window.addEventListener('player:trackChanged', () => this._endSession(false));
  }
  _startSession({ uid, duration, type = 'audio' }) {
    if (this.currentSession && this.currentSession.uid === uid) {
      this.currentSession.lastUpdate = Date.now();
      return;
    }
    this._endSession(false);
    this.currentSession = { uid, type, duration, accumulatedMs: 0, lastUpdate: Date.now(), suspect: false };
  }
  _updateSession({ currentTime, volume, muted }) {
    if (!this.currentSession) return;
    const now = Date.now();
    const delta = now - this.currentSession.lastUpdate;
    this.currentSession.lastUpdate = now;
    
    if (delta > 0 && delta < 2000) { // Защита от скачков
      this.currentSession.accumulatedMs += delta;
      if (document.hidden && (volume === 0 || muted)) {
        this.currentSession.suspect = true;
      }
    }
    
    // Проверка на фулл прослушивание (90%)
    if (this.currentSession.accumulatedMs >= (this.currentSession.duration * 1000 * 0.9)) {
       this._endSession(true); // Засчитываем досрочно на 90%
    }
  }
  _pauseSession() {
    if (this.currentSession) this.currentSession.lastUpdate = Date.now();
  }
  _endSession(isFull) {
    if (!this.currentSession) return;
    const { uid, type, accumulatedMs, suspect } = this.currentSession;
    const seconds = Math.floor(accumulatedMs / 1000);
    
    if (seconds >= 13) {
      eventLogger.log('LISTEN_VALID', { uid, type, seconds, suspect });
    }
    if (isFull && type !== 'short') {
      eventLogger.log('LISTEN_FULL', { uid, type, suspect });
      window.dispatchEvent(new CustomEvent('analytics:fullListen', { detail: { uid } }));
    }
    this.currentSession = null;
  }
}

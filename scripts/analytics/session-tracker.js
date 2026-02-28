import { eventLogger } from './event-logger.js';

export class SessionTracker {
  constructor() {
    this.s = null;
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('player:play', e => this._start(e.detail));
    window.addEventListener('player:pause', () => this._pause());
    window.addEventListener('player:tick', e => this._tick(e.detail));
    window.addEventListener('player:ended', () => this._end(true));
    window.addEventListener('player:stop', () => this._end(false));
    window.addEventListener('player:trackChanged', () => this._end(false));
  }

  _start({ uid, duration, type = 'audio' }) {
    if (this.s && this.s.uid === uid && this.s.variant === type) {
      this.s.lastUpdate = Date.now(); return;
    }
    this._end(false);
    this.s = { 
      uid, variant: type, quality: window.playerCore?.qMode || 'hi',
      duration: duration || 0, accumulatedMs: 0, lastPos: 0, lastUpdate: Date.now() 
    };
    
    // Скрытые временные события для Rule Engine
    const d = new Date();
    if (d.getHours() === 11 && d.getMinutes() === 11) {
      eventLogger.log('FEATURE_USED', 'global', { feature: 'play_11_11' });
    }
    if (d.getDay() === 0 || d.getDay() === 6) {
      eventLogger.log('FEATURE_USED', 'global', { feature: 'weekend_play' });
    }

    eventLogger.log('LISTEN_START', uid, { variant: type });
  }

  _tick({ currentTime, volume, muted }) {
    if (!this.s) return;
    const now = Date.now();
    const deltaMs = now - this.s.lastUpdate;
    const posDelta = Math.abs(currentTime - this.s.lastPos);
    
    this.s.lastUpdate = now;
    this.s.lastPos = currentTime;
    
    // Считаем только реальное звучание (защита от перемотки/паузы)
    if (deltaMs > 0 && deltaMs < 2000 && posDelta < 1.5 && volume > 0 && !muted) {
      this.s.accumulatedMs += deltaMs;
      
      // Логика непрерывного прослушивания для ачивки Speed Runner (3 часа = 10800000 мс)
      window._speedRunnerMs = (window._speedRunnerMs || 0) + deltaMs;
      if (window._speedRunnerMs >= 10800000 && !window._speedRunnerLogged) {
        window._speedRunnerLogged = true;
        if (window.eventLogger) window.eventLogger.log('FEATURE_USED', 'global', { feature: 'speed_runner' });
      }
    } else {
      window._speedRunnerMs = 0; // Сброс при паузе, муте или перемотке
    }
    
    if (this.s.duration <= 0) this.s.duration = window.playerCore?.getDuration() || 0;
  }

  _pause() { if (this.s) this.s.lastUpdate = Date.now(); }

  _end(isEndedEvent) {
    if (!this.s) return;
    const { uid, variant, quality, accumulatedMs, duration, lastPos } = this.s;
    this.s = null;

    if (duration <= 0 && !isEndedEvent) return;

    const seconds = Math.floor(accumulatedMs / 1000);
    const progress = duration > 0 ? (lastPos / duration) : 0;
    
    // ТЗ: Valid = 13 сек ИЛИ доиграл до конца. Full = 90% ИЛИ доиграл до конца.
    const isValid = seconds >= 13 || isEndedEvent;
    const isFull = progress >= 0.9 || isEndedEvent;

    if (isValid || isFull) {
      eventLogger.log('LISTEN_COMPLETE', uid, {
        variant, quality, listenedSeconds: seconds, trackDuration: duration, 
        progress, isFullListen: isFull, isValidListen: isValid
      });
    } else {
      eventLogger.log('LISTEN_SKIP', uid, { listenedSeconds: seconds });
    }
  }
}

import { metaDB } from './meta-db.js';

class LiveStatsTracker {
  constructor() {
    this.state = {
      playing: false,
      uid: null,
      startedAt: 0,
      lastTickAt: 0,
      liveAccumulatedMs: 0,
      baseTotalSec: 0,
      globalStreak: 0,
      sleepTargetAt: 0
    };
    this._tick = null;
    this._bound = false;
  }

  async initialize() {
    if (this._bound) return;
    this._bound = true;

    try {
      const stats = await metaDB.getAllStats();
      this.state.baseTotalSec = stats.filter(s => s.uid !== 'global').reduce((sum, s) => sum + (s.globalListenSeconds || 0), 0);
      this.state.globalStreak = (await metaDB.getGlobal('global_streak'))?.value?.current || 0;
    } catch {}

    window.addEventListener('stats:updated', async () => {
      try {
        const stats = await metaDB.getAllStats();
        this.state.baseTotalSec = stats.filter(s => s.uid !== 'global').reduce((sum, s) => sum + (s.globalListenSeconds || 0), 0);
        this.state.globalStreak = (await metaDB.getGlobal('global_streak'))?.value?.current || 0;
        this._emit();
      } catch {}
    });

    window.addEventListener('player:play', e => {
      this.state.playing = true;
      this.state.uid = e.detail?.uid || null;
      this.state.startedAt = Date.now();
      this.state.lastTickAt = Date.now();
      this._ensureTicker();
      this._syncSleep();
      this._emit();
    });

    window.addEventListener('player:pause', () => {
      this._flush();
      this.state.playing = false;
      this._stopTickerIfIdle();
      this._syncSleep();
      this._emit();
    });

    window.addEventListener('player:stop', () => {
      this._flush();
      this.state.playing = false;
      this.state.uid = null;
      this._stopTickerIfIdle();
      this._syncSleep();
      this._emit();
    });

    window.addEventListener('player:ended', () => {
      this._flush();
      this.state.playing = false;
      this._stopTickerIfIdle();
      this._syncSleep();
      this._emit();
    });

    window.addEventListener('player:trackChanged', e => {
      this._flush();
      this.state.uid = e.detail?.uid || null;
      this.state.lastTickAt = Date.now();
      this._syncSleep();
      this._emit();
    });

    window.addEventListener('player:sleepTimerChanged', () => {
      this._syncSleep();
      this._emit();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._flush();
    });

    this._syncSleep();
    this._emit();
  }

  _syncSleep() {
    this.state.sleepTargetAt = Number(window.playerCore?.getSleepTimerTarget?.() || 0);
  }

  _flush() {
    if (!this.state.playing) return;
    const now = Date.now();
    const delta = now - (this.state.lastTickAt || now);
    if (delta > 0 && delta < 2000) this.state.liveAccumulatedMs += delta;
    this.state.lastTickAt = now;
  }

  _ensureTicker() {
    if (this._tick) return;
    this._tick = setInterval(() => {
      if (this.state.playing) this._flush();
      this._syncSleep();
      this._emit();
    }, 1000);
  }

  _stopTickerIfIdle() {
    if (this.state.playing) return;
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = null;
    }
  }

  _emit() {
    window.dispatchEvent(new CustomEvent('analytics:liveTick', { detail: this.getSnapshot() }));
  }

  getSnapshot() {
    const projectedTotalSec = this.state.baseTotalSec + Math.floor(this.state.liveAccumulatedMs / 1000);
    const sleepRemainingMs = this.state.sleepTargetAt > 0 ? Math.max(0, this.state.sleepTargetAt - Date.now()) : 0;
    return {
      playing: this.state.playing,
      uid: this.state.uid,
      projectedTotalSec,
      liveAccumulatedMs: this.state.liveAccumulatedMs,
      streak: this.state.globalStreak,
      sleepTargetAt: this.state.sleepTargetAt,
      sleepRemainingMs
    };
  }
}

export const liveStatsTracker = new LiveStatsTracker();
window.liveStatsTracker = liveStatsTracker;

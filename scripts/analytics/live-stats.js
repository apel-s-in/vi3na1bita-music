import { metaDB } from './meta-db.js';

const DAY_MS = 86400000;
const dayKeyLocal = (ts = Date.now()) => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

class LiveStatsTracker {
  constructor() {
    this.state = {
      playing: false,
      uid: null,
      lastTickAt: 0,
      lastPos: 0,
      duration: 0,
      liveAccumulatedMs: 0,
      baseTotalSec: 0,
      globalStreak: 0,
      streakLastActiveDate: '',
      todayValidSec: 0,
      sleepTargetAt: 0,
      volume: 100,
      muted: false
    };
    this._tick = null;
    this._bound = false;
  }

  async initialize() {
    if (this._bound) return;
    this._bound = true;
    await this._reloadBase();

    window.addEventListener('stats:updated', async () => {
      await this._reloadBase();
      this._emit();
    });

    window.addEventListener('player:play', e => {
      this.state.playing = true;
      this.state.uid = e.detail?.uid || null;
      this.state.duration = Number(e.detail?.duration || window.playerCore?.getDuration?.() || 0);
      this.state.lastTickAt = Date.now();
      this.state.lastPos = Number(window.playerCore?.getPosition?.() || 0);
      this._ensureTicker();
      this._syncSleep();
      this._emit();
    });

    window.addEventListener('player:tick', e => {
      const d = e.detail || {};
      this.state.volume = Number(d.volume ?? this.state.volume ?? 100);
      this.state.muted = !!d.muted;
      this._flush({
        currentTime: Number(d.currentTime || 0),
        duration: Number(window.playerCore?.getDuration?.() || this.state.duration || 0),
        volume: this.state.volume,
        muted: this.state.muted
      });
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
      this.state.lastPos = 0;
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
      this.state.lastPos = Number(window.playerCore?.getPosition?.() || 0);
      this.state.duration = Number(window.playerCore?.getDuration?.() || 0);
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

  async _reloadBase() {
    try {
      const stats = await metaDB.getAllStats();
      this.state.baseTotalSec = stats.filter(s => s.uid !== 'global').reduce((sum, s) => sum + (s.globalListenSeconds || 0), 0);
      const streakObj = (await metaDB.getGlobal('global_streak'))?.value || {};
      this.state.globalStreak = Number(streakObj.current || 0);
      this.state.streakLastActiveDate = String(streakObj.lastActiveDate || '');
    } catch {}
  }

  _syncSleep() {
    this.state.sleepTargetAt = Number(window.playerCore?.getSleepTimerTarget?.() || 0);
  }

  _flush(tick = null) {
    if (!this.state.playing) return;
    const now = Date.now();
    const last = this.state.lastTickAt || now;
    const delta = now - last;
    const currentTime = Number(tick?.currentTime ?? window.playerCore?.getPosition?.() ?? this.state.lastPos ?? 0);
    const posDelta = Math.abs(currentTime - (this.state.lastPos || 0));
    const volume = Number(tick?.volume ?? this.state.volume ?? 100);
    const muted = !!(tick?.muted ?? this.state.muted);

    this.state.duration = Number(tick?.duration || this.state.duration || window.playerCore?.getDuration?.() || 0);
    this.state.lastTickAt = now;
    this.state.lastPos = currentTime;

    if (delta > 0 && delta < 2000 && posDelta < 1.5 && volume > 0 && !muted) {
      this.state.liveAccumulatedMs += delta;
      this.state.todayValidSec = Math.floor(this.state.liveAccumulatedMs / 1000);
    }
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
    const todayKey = dayKeyLocal();
    const hasTodayPersistent = this.state.streakLastActiveDate === todayKey;
    const wouldCountToday = !hasTodayPersistent && Math.floor(this.state.liveAccumulatedMs / 1000) >= 13;
    const projectedStreak = hasTodayPersistent ? this.state.globalStreak : (wouldCountToday ? this.state.globalStreak + 1 : this.state.globalStreak);

    return {
      playing: this.state.playing,
      uid: this.state.uid,
      projectedTotalSec,
      liveAccumulatedMs: this.state.liveAccumulatedMs,
      streak: this.state.globalStreak,
      projectedStreak,
      streakLastActiveDate: this.state.streakLastActiveDate,
      hasTodayPersistent,
      wouldCountToday,
      sleepTargetAt: this.state.sleepTargetAt,
      sleepRemainingMs
    };
  }
}

export const liveStatsTracker = new LiveStatsTracker();
window.liveStatsTracker = liveStatsTracker;

import { metaDB } from './meta-db.js';
import { isValidPlaybackDelta } from './playback-validity.js';
import { makePlaybackRuntimeSnapshot } from './playback-runtime.js';

const dayKeyLocal = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

class LiveStatsTracker {
  constructor() { this.state = { playing: false, uid: null, lastTickAt: 0, lastPos: 0, duration: 0, liveAccumulatedMs: 0, baseTotalSec: 0, globalStreak: 0, streakLastActiveDate: '', todayValidSec: 0, sleepTargetAt: 0, volume: 100, muted: false }; this._tick = null; this._bound = false; }

  async initialize() {
    if (this._bound) return; this._bound = true; await this._reloadBase();
    window.addEventListener('stats:updated', async () => { await this._reloadBase(); this._emit(); });
    window.addEventListener('player:play', e => { this.state.playing = true; this._updMeta(e.detail?.uid, e.detail?.duration); this._ensureTicker(); this._emit(); });
    window.addEventListener('player:tick', e => { const d = e.detail || {}; this.state.volume = Number(d.volume ?? this.state.volume ?? 100); this.state.muted = !!d.muted; this._flush({ currentTime: d.currentTime, duration: window.playerCore?.getDuration?.() || this.state.duration, volume: this.state.volume, muted: this.state.muted }); });
    ['player:pause', 'player:stop', 'player:ended'].forEach(ev => window.addEventListener(ev, () => {
      this._flush(); this.state.playing = false;
      if (ev === 'player:stop') { this.state.uid = null; this.state.lastPos = 0; }
      this._stopTickerIfIdle(); this._syncSleep(); this._emit();
    }));
    window.addEventListener('player:trackChanged', e => { this._flush(); this._updMeta(e.detail?.uid); this._emit(); });
    window.addEventListener('player:sleepTimerChanged', () => { this._syncSleep(); this._emit(); });
    document.addEventListener('visibilitychange', () => document.hidden && this._flush());
    this._syncSleep(); this._emit();
  }

  _updMeta(u, d) { this.state.uid = u || null; this.state.lastTickAt = Date.now(); this.state.lastPos = Number(window.playerCore?.getPosition?.() || 0); this.state.duration = Number(d || window.playerCore?.getDuration?.() || 0); this._syncSleep(); }

  async _reloadBase() {
    try {
      this.state.baseTotalSec = (await metaDB.getAllStats()).filter(s => s.uid !== 'global').reduce((sum, s) => sum + (s.globalListenSeconds || 0), 0);
      const strk = (await metaDB.getGlobal('global_streak'))?.value || {};
      this.state.globalStreak = Number(strk.current || 0); this.state.streakLastActiveDate = String(strk.lastActiveDate || '');
    } catch {}
  }

  _syncSleep() { this.state.sleepTargetAt = Number(window.playerCore?.getSleepTimerTarget?.() || 0); }

  _flush(t = null) {
    if (!this.state.playing) return;
    const rt = makePlaybackRuntimeSnapshot({ lastTickAt: this.state.lastTickAt, lastPos: this.state.lastPos, duration: this.state.duration, volume: this.state.volume, muted: this.state.muted, tick: t, playerCore: window.playerCore });
    this.state.duration = rt.duration; this.state.lastTickAt = rt.now; this.state.lastPos = rt.currentTime;
    if (isValidPlaybackDelta({ deltaMs: rt.deltaMs, prevTime: rt.prevPos, currentTime: rt.currentTime, volume: rt.volume, muted: rt.muted })) {
      this.state.liveAccumulatedMs += rt.deltaMs; this.state.todayValidSec = Math.floor(this.state.liveAccumulatedMs / 1000);
    }
  }

  _ensureTicker() { if (!this._tick) this._tick = setInterval(() => { if (this.state.playing) this._flush(); this._syncSleep(); this._emit(); }, 1000); }
  _stopTickerIfIdle() { if (!this.state.playing && this._tick) { clearInterval(this._tick); this._tick = null; } }
  _emit() { window.dispatchEvent(new CustomEvent('analytics:liveTick', { detail: this.getSnapshot() })); }

  getSnapshot() {
    const hasTdy = this.state.streakLastActiveDate === dayKeyLocal(), wdCnt = !hasTdy && Math.floor(this.state.liveAccumulatedMs / 1000) >= 13;
    return { playing: this.state.playing, uid: this.state.uid, projectedTotalSec: this.state.baseTotalSec + Math.floor(this.state.liveAccumulatedMs / 1000), liveAccumulatedMs: this.state.liveAccumulatedMs, streak: this.state.globalStreak, projectedStreak: hasTdy ? this.state.globalStreak : (wdCnt ? this.state.globalStreak + 1 : this.state.globalStreak), streakLastActiveDate: this.state.streakLastActiveDate, hasTodayPersistent: hasTdy, wouldCountToday: wdCnt, sleepTargetAt: this.state.sleepTargetAt, sleepRemainingMs: Math.max(0, this.state.sleepTargetAt - Date.now()) };
  }
}
export const liveStatsTracker = new LiveStatsTracker(); window.liveStatsTracker = liveStatsTracker;

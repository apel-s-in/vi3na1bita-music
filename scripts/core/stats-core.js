// scripts/core/stats-core.js
import { updateGlobalStats, getCloudStats, setCloudStats } from '../offline/cache-db.js';

const THRESHOLD = 0.90; // 90% for full listen

class StatsCoreImpl {
  constructor() {
    this._uid = null;
    this._dur = 0;
    this._sec = 0; // seconds played in current session for this track
    this._maxPos = 0;
    this._started = false;
  }

  onTrackStart(uid, duration) {
    if (this._uid && this._uid !== uid) this._flush();
    this._uid = uid;
    this._dur = duration || 0;
    this._sec = 0;
    this._maxPos = 0;
    this._started = true;
  }

  onTick(pos) {
    if (!this._started || !this._uid) return;
    this._sec += 0.25; // Called every 250ms usually, or delta passed
    this._maxPos = Math.max(this._maxPos, pos);
  }
  
  // Custom method for explicit delta from player core
  onSecondTick(uid, delta) {
      if (this._uid !== uid) return;
      this._sec += delta;
      
      // Real-time update to DB for robustness? 
      // For performance, we batch or do it on end. 
      // TЗ says "Global stats never resets".
      // Let's update global stats incrementally to avoid data loss on crash
      updateGlobalStats(uid, delta, 0).catch(() => {});
  }

  onSeek(uid, from, to) {
      // Seek doesn't reset "seconds listened" but might affect "full listen" logic if we were strict about continuity.
      // TЗ 18.3: "seconds считаем только пока playing".
  }

  async onEnded(uid, pos, dur) {
     if (this._uid !== uid) return;
     const isFull = this._checkFull(pos, dur);
     await this._commit(uid, 0, isFull ? 1 : 0);
     this._reset();
  }
  
  async onSkip(uid, pos, dur) {
      if (this._uid !== uid) return;
      const isFull = this._checkFull(pos, dur);
      await this._commit(uid, 0, isFull ? 1 : 0);
      this._reset();
  }

  _checkFull(pos, dur) {
      const d = dur || this._dur;
      if (!d) return false;
      return (pos / d) >= THRESHOLD;
  }

  async _commit(uid, dSec, dFull) {
      if (!uid) return;
      // Global Stats
      await updateGlobalStats(uid, dSec, dFull);

      // Cloud Stats (only full listens count for cloud logic usually, but we track dates)
      if (dFull > 0) {
         const s = await getCloudStats(uid) || {};
         const n = (s.cloudFullListenCount || 0) + 1;
         // Logic for Cloud Promotion is in OfflineManager (NC-4 implied), 
         // but StatsCore just records data. 
         // Actually OfflineManager.recordListenStats handles the logic. 
         // Let's delegate back to OfflineManager for the "Business Logic" of cloud promotion?
         // TЗ 18.3 says StatsCore is the entry point.
         
         // Let's call OfflineManager to handle "Business Logic" side effects (Cloud promotion)
         const mgr = window.OfflineUI?.offlineManager;
         if (mgr) mgr.recordListenStats(uid, { deltaSec: dSec, isFullListen: dFull > 0 });
      }
  }

  _reset() {
      this._uid = null;
      this._started = false;
  }
}

export const StatsCore = new StatsCoreImpl();

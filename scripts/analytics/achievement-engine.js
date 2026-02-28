import { metaDB } from './meta-db.js';

export class StatsAggregator {
  constructor() {
    this.last = new Map();
    this.sess = { favRun: 0, favShuf: new Set(), midTrack: null, midCnt: 0 };
    window.addEventListener('analytics:logUpdated', () => this.processHotEvents());
  }

  async processHotEvents() {
    const events = await metaDB.getEvents('events_hot');
    if (!events.length) return;

    let dailyActive = false;
    const todayStr = new Date().toISOString().split('T')[0];
    const updates = new Map(); 

    // Helper for In-Memory Aggregation
    const getUpd = (uid) => {
      if (!updates.has(uid)) updates.set(uid, { sec: 0, val: 0, ful: 0, last: 0, feat: {}, hr: {}, wk: {} });
      return updates.get(uid);
    };
    const inc = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };

    // 1. O(N) In-Memory Processing (No DB locks here)
    for (const ev of events) {
      const uid = ev.uid || 'global';
      const u = getUpd(uid);
      const d = ev.data || {};

      if (ev.type === 'FEATURE_USED') {
        inc(u.feat, d.feature);
        continue;
      }
      if (ev.type !== 'LISTEN_COMPLETE') continue;

      u.sec += (d.listenedSeconds || 0);
      if (ev.timestamp > u.last) u.last = ev.timestamp;

      if (d.isValidListen) {
        u.val++;
        dailyActive = true;
        const dt = new Date(ev.timestamp);
        inc(u.hr, dt.getHours());
        inc(u.wk, (dt.getDay() + 6) % 7); // Mon=0, Sun=6
      }

      // Rate Limiting (90% of duration)
      if (d.isFullListen && (ev.timestamp - (this.last.get(uid) || 0)) >= (d.trackDuration || 0) * 900 && d.variant !== 'short') {
        u.ful++;
        this.last.set(uid, ev.timestamp);

        const hr = new Date(ev.timestamp).getHours();
        if (hr < 5) inc(u.feat, 'nightPlay');
        else if (hr < 8) inc(u.feat, 'earlyPlay');
        if (d.quality === 'hi') inc(u.feat, 'hiQuality');

        const pc = window.playerCore;
        if (pc) {
          const isFav = localStorage.getItem('favoritesOnlyMode') === '1', isShuf = pc.isShuffle(), isFavNow = pc.isFavorite(uid);
          if (isShuf) inc(u.feat, 'shufflePlay');
          
          this.sess.favRun = (isFav && !isShuf && isFavNow) ? this.sess.favRun + 1 : 0;
          isFav && isShuf && isFavNow ? this.sess.favShuf.add(uid) : this.sess.favShuf.clear();
          
          const tStr = new Date(ev.timestamp).toTimeString().slice(0, 8);
          if (tStr >= '00:00:00' && tStr <= '00:30:00') {
            if (this.sess.midTrack === uid) this.sess.midCnt++;
            else { this.sess.midTrack = uid; this.sess.midCnt = 1; }
          } else this.sess.midCnt = 0;

          if (this.sess.favRun >= 5 || this.sess.favShuf.size >= 5 || this.sess.midCnt >= 3) {
            const gu = getUpd('global');
            if (this.sess.favRun >= 5) gu.feat.fav_ordered_5 = 5;
            if (this.sess.favShuf.size >= 5) gu.feat.fav_shuffle_5 = 5;
            if (this.sess.midCnt >= 3) gu.feat.midnight_triple = 1;
          }
        }
      }
    }

    const cloudLmt = parseInt(localStorage.getItem('cloud:listenThreshold')) || 5;

    // 2. O(Unique UIDs) Fast DB Commit (Promise.all prevents sequential thread blocking)
    await Promise.all(Array.from(updates.entries()).map(([uid, u]) => 
      metaDB.updateStat(uid, s => {
        s.globalListenSeconds += u.sec;
        if (u.last > s.lastPlayedAt) s.lastPlayedAt = u.last;
        s.globalValidListenCount += u.val;
        
        const oldFul = s.globalFullListenCount || 0;
        s.globalFullListenCount = oldFul + u.ful;
        
        // Exact boundary trigger for Cloud Cache
        if (uid !== 'global' && oldFul < cloudLmt && s.globalFullListenCount >= cloudLmt) {
          setTimeout(() => window.dispatchEvent(new CustomEvent('analytics:cloudThresholdReached', { detail: { uid } })), 0);
        }
        
        s.featuresUsed = s.featuresUsed || {};
        for (const [k, v] of Object.entries(u.feat)) s.featuresUsed[k] = (s.featuresUsed[k] || 0) + v;
        
        if (u.val > 0 && uid !== 'global') {
          s.byHour = s.byHour || Array(24).fill(0);
          s.byWeekday = s.byWeekday || Array(7).fill(0);
          for (const [h, v] of Object.entries(u.hr)) s.byHour[h] += v;
          for (const [w, v] of Object.entries(u.wk)) s.byWeekday[w] += v;
        }
        return s;
      })
    ));

    // 3. Streaks Management
    if (dailyActive) {
      const st = (await metaDB.getGlobal('global_streak'))?.value || { current: 0, longest: 0, lastActiveDate: '' };
      if (st.lastActiveDate !== todayStr) {
        const yest = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        st.current = st.lastActiveDate === yest ? st.current + 1 : 1;
        st.longest = Math.max(st.longest, st.current);
        st.lastActiveDate = todayStr;
        await metaDB.setGlobal('global_streak', st);
      }
    }

    // 4. Queue Rotation
    await metaDB.addEvents(events, 'events_warm');
    await metaDB.clearEvents('events_hot');
    window.dispatchEvent(new CustomEvent('stats:updated'));
  }
}

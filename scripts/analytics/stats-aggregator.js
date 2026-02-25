import { metaDB } from './meta-db.js';

export class StatsAggregator {
  constructor() {
    this.lastFullListens = new Map(); // Anti-tamper & Rate Limiting (in-memory)
    window.addEventListener('analytics:logUpdated', () => this.processHotEvents());
  }

  async processHotEvents() {
    const events = await metaDB.getEvents('events_hot');
    if (!events.length) return;

    let globalSecs = 0, todayStr = new Date().toISOString().split('T')[0];
    let dailyActive = false;

    for (const ev of events) {
      if (ev.type === 'LISTEN_COMPLETE' && ev.data) {
        const { isFullListen, isValidListen, listenedSeconds, variant } = ev.data;
        globalSecs += (listenedSeconds || 0);
        
        // Rate Limiting (ТЗ 7.1)
        const lastPlay = this.lastFullListens.get(ev.uid) || 0;
        const timeSince = ev.timestamp - lastPlay;
        const minInterval = (ev.data.trackDuration || 0) * 1000 * 0.9;
        const isRateLimited = isFullListen && timeSince < minInterval;

        await metaDB.updateStat(ev.uid, (stat) => {
          stat.globalListenSeconds += (listenedSeconds || 0);
          stat.lastPlayedAt = ev.timestamp;
          if (!stat.featuresUsed) stat.featuresUsed = {};
          
          if (isValidListen) {
            stat.globalValidListenCount++;
            dailyActive = true;
          }
          if (isFullListen && !isRateLimited && variant !== 'short') {
            stat.globalFullListenCount++;
            this.lastFullListens.set(ev.uid, ev.timestamp);
            
            // Расширенная аналитика для Достижений (ТЗ 11.3)
            const hour = new Date(ev.timestamp).getHours();
            if (hour >= 0 && hour < 5) stat.featuresUsed.nightPlay = (stat.featuresUsed.nightPlay || 0) + 1;
            if (hour >= 5 && hour < 8) stat.featuresUsed.earlyPlay = (stat.featuresUsed.earlyPlay || 0) + 1;
            if (ev.data?.quality === 'hi') stat.featuresUsed.hiQuality = (stat.featuresUsed.hiQuality || 0) + 1;

            // Триггер облачного кэширования (ТЗ 5.2)
            const cN = parseInt(localStorage.getItem('cloud:listenThreshold')) || 5;
            if (stat.globalFullListenCount >= cN) {
               window.dispatchEvent(new CustomEvent('analytics:cloudThresholdReached', { detail: { uid: ev.uid } }));
            }
          }
          return stat;
        });
      } else if (ev.type === 'FEATURE_USED') {
         // Для фич самого приложения используем системный uid "global"
         const targetUid = ev.uid || 'global';
         await metaDB.updateStat(targetUid, s => {
           if (!s.featuresUsed) s.featuresUsed = {};
           s.featuresUsed[ev.data.feature] = (s.featuresUsed[ev.data.feature] || 0) + 1;
           return s;
         });
      }
    }

    // Управление стриками (ТЗ 10.2)
    if (dailyActive) {
      const streakObj = (await metaDB.getGlobal('global_streak'))?.value || { current: 0, longest: 0, lastActiveDate: '' };
      if (streakObj.lastActiveDate !== todayStr) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        streakObj.current = (streakObj.lastActiveDate === yesterday) ? streakObj.current + 1 : 1;
        streakObj.longest = Math.max(streakObj.longest, streakObj.current);
        streakObj.lastActiveDate = todayStr;
        await metaDB.setGlobal('global_streak', streakObj);
      }
    }

    // Ротация: Hot -> Warm
    await metaDB.addEvents(events, 'events_warm');
    await metaDB.clearEvents('events_hot');
    window.dispatchEvent(new CustomEvent('stats:updated'));
  }
}

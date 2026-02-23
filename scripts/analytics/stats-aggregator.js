import { metaDB } from './meta-db.js';

export class StatsAggregator {
  constructor() { window.addEventListener('analytics:logUpdated', () => this.processHotEvents()); }
  async processHotEvents() {
    const events = await metaDB.getEvents();
    if (!events.length) return;
    
    for (const ev of events) {
      if (ev.type === 'LISTEN_FULL') {
        await metaDB.updateStat('globalFullListens', (stat) => {
          stat.value++;
          stat.details[ev.payload.uid] = (stat.details[ev.payload.uid] || 0) + 1;
          if (stat.details[ev.payload.uid] >= 5) window.dispatchEvent(new CustomEvent('analytics:cloudThresholdReached', { detail: { uid: ev.payload.uid }}));
          return stat;
        });
      }
      if (ev.type === 'LISTEN_VALID' || ev.type === 'LISTEN_FULL') {
        await metaDB.updateStat('totalListenTime', (stat) => { stat.value += (ev.payload.seconds || 0); return stat; });
        await metaDB.updateStat('lastPlayed', (stat) => { stat.details[ev.payload.uid] = ev.timestamp; return stat; });
      }
      if (ev.type === 'FEATURE_USED') {
         await metaDB.updateStat('features', (stat) => { stat.details[ev.payload.feature] = true; return stat; });
      }
    }
    await metaDB.clearEvents();
    window.dispatchEvent(new CustomEvent('stats:updated'));
  }
}

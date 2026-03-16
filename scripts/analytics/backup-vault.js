import { metaDB } from './meta-db.js';

export class BackupVault {
  static async buildBackupObject() {
    const [stats, warm, achievements, streaks] = await Promise.all([metaDB.getAllStats(), metaDB.getEvents('events_warm'), metaDB.getGlobal('unlocked_achievements'), metaDB.getGlobal('global_streak')]);
    return { version: "4.0", timestamp: Date.now(), deviceHash: localStorage.getItem('deviceHash'), data: { stats, eventLog: { warm }, achievements: achievements?.value || {}, streaks: streaks?.value || {} } };
  }

  static async exportData() {
    const data = await this.buildBackupObject(), blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `vi3na1bita_backup_${new Date().toISOString().split('T')[0]}.vi3bak`; 
    a.click(); URL.revokeObjectURL(url);
    if (window.eventLogger) { window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup' }); window.dispatchEvent(new CustomEvent('analytics:forceFlush')); }
  }

  static async importData(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = async e => {
        try {
          const b = JSON.parse(e.target.result); if (!b.data || !b.data.eventLog) throw new Error("Invalid format v4.0 required");
          const localWarm = await metaDB.getEvents('events_warm'), cloudWarm = b.data.eventLog.warm || [], seen = new Set();
          const merged = [...localWarm, ...cloudWarm].filter(ev => seen.has(ev.eventId) ? false : (seen.add(ev.eventId), true)).sort((x, y) => x.timestamp - y.timestamp);
          await metaDB.clearEvents('events_warm'); await metaDB.addEvents(merged, 'events_warm');
          for (const s of b.data.stats) await metaDB.tx('stats', 'readwrite', st => st.put(s));
          if (b.data.achievements) await metaDB.setGlobal('unlocked_achievements', b.data.achievements);
          if (b.data.streaks) await metaDB.setGlobal('global_streak', b.data.streaks);
          window.dispatchEvent(new CustomEvent('stats:updated')); res(true);
        } catch (err) { rej(err); }
      };
      r.readAsText(file);
    });
  }
}

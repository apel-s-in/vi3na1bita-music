import { metaDB } from './meta-db.js';

export class BackupVault {
  static async buildBackupObject() {
    const stats = await metaDB.getAllStats();
    const warm = await metaDB.getEvents('events_warm');
    const achievements = await metaDB.getGlobal('unlocked_achievements');
    const streaks = await metaDB.getGlobal('global_streak');

    return {
      version: "4.0", timestamp: Date.now(), deviceHash: localStorage.getItem('deviceHash'),
      data: { stats, eventLog: { warm }, achievements: achievements?.value || {}, streaks: streaks?.value || {} }
    };
  }

  static async exportData() {
    const data = await this.buildBackupObject();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; 
    a.download = `vi3na1bita_backup_${new Date().toISOString().split('T')[0]}.vi3bak`; 
    a.click(); URL.revokeObjectURL(url);
    
    if (window.eventLogger) {
      window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup' });
      window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
    }
  }

  static async importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const backup = JSON.parse(e.target.result);
          if (!backup.data || !backup.data.eventLog) throw new Error("Invalid format v4.0 required");
          
          // ТЗ 8.1: Слияние журналов (Merge Logs)
          const localWarm = await metaDB.getEvents('events_warm');
          const cloudWarm = backup.data.eventLog.warm || [];
          const seen = new Set();
          const merged = [...localWarm, ...cloudWarm].filter(ev => {
            if (seen.has(ev.eventId)) return false;
            seen.add(ev.eventId); return true;
          }).sort((a, b) => a.timestamp - b.timestamp);

          await metaDB.clearEvents('events_warm');
          await metaDB.addEvents(merged, 'events_warm');
          
          // Полный пересчёт Stats из объединённого журнала здесь (упрощенно восстанавливаем)
          for (const s of backup.data.stats) await metaDB.tx('stats', 'readwrite', st => st.put(s));
          if (backup.data.achievements) await metaDB.setGlobal('unlocked_achievements', backup.data.achievements);
          if (backup.data.streaks) await metaDB.setGlobal('global_streak', backup.data.streaks);
          
          window.dispatchEvent(new CustomEvent('stats:updated'));
          resolve(true);
        } catch (err) { reject(err); }
      };
      reader.readAsText(file);
    });
  }
}

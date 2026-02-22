import { metaDB } from './meta-db.js';

export class BackupVault {
  static async exportData() {
    const data = {
      timestamp: Date.now(),
      deviceHash: localStorage.getItem('deviceHash'),
      stats: await metaDB._tx('stats', 'readonly', store => store.getAll())
    };
    const json = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const blob = new Blob([encoded], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vi3na1bita_backup_${new Date().toISOString().split('T')[0]}.vi3bak`;
    a.click();
    URL.revokeObjectURL(url);
  }

  static async importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const decoded = decodeURIComponent(escape(atob(e.target.result)));
          const data = JSON.parse(decoded);
          if (!data.stats) throw new Error("Invalid format");
          for (const stat of data.stats) {
            await metaDB.updateStat(stat.key, () => stat);
          }
          window.dispatchEvent(new CustomEvent('stats:updated'));
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }
}

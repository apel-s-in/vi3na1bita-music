/**
 * scripts/analytics/backup-manager.js
 * Менеджер резервных копий по ТЗ.txt (v4.0)
 * Интегрирован с AnalyticsEngine и LocalStorage.
 */

export class BackupManager {
  /**
   * Формирует структуру данных для бэкапа (метод prepareBackupJson по ТЗ)
   */
  static async prepareBackupJson() {
    const stats = window.AnalyticsEngine ? await window.AnalyticsEngine.StatsAggregator.getStats() : {};
    
    const backup = {
      device_hash: localStorage.getItem('device_uid') || 'unknown',
      app_version: '4.0',
      exported_at: new Date().toISOString(),
      local_stats: {
        global: stats,
        // Сюда можно добавить детализацию по трекам, если она хранится отдельно
      },
      likedTracks: JSON.parse(localStorage.getItem('likedTracks') || '[]'),
      ui_prefs: {
        theme: localStorage.getItem('theme') || 'dark',
        quality: localStorage.getItem('player_quality') || 'auto'
      },
      current_achievements: stats.unlocked || [],
      crc: '' // Место для подписи/хэша
    };

    // Простейший хэш для защиты от ручного редактирования файла (по ТЗ)
    backup.crc = btoa(JSON.stringify(backup.local_stats)).substring(0, 16);
    return backup;
  }

  /**
   * Сохранение файла (метод saveBackupJson по ТЗ)
   */
  static async saveBackupJson() {
    try {
      const data = await this.prepareBackupJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `vi3na1bita_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      window.NotificationSystem?.success('Резервная копия успешно сохранена');
    } catch (e) {
      console.error('[BackupManager] Ошибка сохранения:', e);
      window.NotificationSystem?.error('Ошибка при создании бэкапа');
    }
  }

  /**
   * Чтение и валидация файла (метод loadBackupJson по ТЗ)
   */
  static async loadBackupJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          
          // Валидация по ТЗ: проверка хэша
          const expectedCrc = btoa(JSON.stringify(data.local_stats || {})).substring(0, 16);
          if (data.crc !== expectedCrc) {
             throw new Error('BACKUP_INVALID: Файл поврежден или изменен');
          }
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsText(file);
    });
  }

  /**
   * Восстановление данных (метод restoreFromBackupJson по ТЗ)
   */
  static async restoreFromBackupJson(file) {
    try {
      const data = await this.loadBackupJson(file);
      
      // Восстанавливаем избранное и настройки
      localStorage.setItem('likedTracks', JSON.stringify(data.likedTracks || []));
      if (data.ui_prefs) {
        localStorage.setItem('theme', data.ui_prefs.theme || 'dark');
        localStorage.setItem('player_quality', data.ui_prefs.quality || 'auto');
      }

      // Перезапускаем UI, если требуется
      window.dispatchEvent(new CustomEvent('app:dataRestored'));
      window.NotificationSystem?.success('Прогресс успешно восстановлен!');
    } catch (e) {
      console.error('[BackupManager] Ошибка восстановления:', e);
      window.NotificationSystem?.error(e.message || 'Ошибка восстановления данных');
    }
  }
}

window.BackupManager = BackupManager;

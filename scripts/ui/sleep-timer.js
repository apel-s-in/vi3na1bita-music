/**
 * scripts/ui/sleep-timer.js
 * Реализация Sleep-таймера по ТЗ-UID (v4.0)
 * Поддерживает интервалы и точное время. Изолирован от ядра плеера.
 */

export class SleepTimer {
  constructor() {
    this.timeoutId = null;
    this.targetTimestamp = null;
  }

  /**
   * Запуск таймера через заданное количество минут
   */
  startMinutes(minutes) {
    this.stop();
    const ms = minutes * 60 * 1000;
    this.targetTimestamp = Date.now() + ms;
    
    this.timeoutId = setTimeout(() => this._trigger(), ms);
    this._notify(`Таймер сна установлен на ${minutes} мин.`);
    this._logEvent('sleep_timer_set', { minutes });
  }

  /**
   * Запуск таймера до конкретного времени (ЧЧ:ММ)
   */
  startAt(timeString) {
    this.stop();
    const [hours, minutes] = timeString.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    // Если время уже прошло, ставим на следующий день (согласно ТЗ)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const msUntil = target.getTime() - now.getTime();
    this.targetTimestamp = target.getTime();
    
    this.timeoutId = setTimeout(() => this._trigger(), msUntil);
    this._notify(`Таймер сна установлен на ${timeString}`);
    this._logEvent('sleep_timer_set', { exactTime: timeString });
  }

  /**
   * Отключение таймера
   */
  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
      this.targetTimestamp = null;
      this._notify('Таймер сна отключен');
    }
  }

  _trigger() {
    this.timeoutId = null;
    this.targetTimestamp = null;
    
    // Безопасная остановка плеера
    if (window.PlayerCore && typeof window.PlayerCore.pause === 'function') {
      window.PlayerCore.pause();
    }
    
    this._notify('Время вышло. Воспроизведение остановлено.');
    this._logEvent('sleep_timer_fired', {});
  }

  _notify(message) {
    if (window.NotificationSystem) {
      window.NotificationSystem.info(message);
    } else {
      console.log(`[SleepTimer] ${message}`);
    }
  }

  _logEvent(action, payload) {
    window.dispatchEvent(new CustomEvent('analytics:event', { 
      detail: { type: action, payload } 
    }));
  }
}

// Экспорт синглтона для глобального доступа из UI
export const sleepTimerInstance = new SleepTimer();
window.SleepTimer = sleepTimerInstance;

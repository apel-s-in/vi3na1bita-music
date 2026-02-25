import { metaDB } from './meta-db.js';

class EventLogger {
  constructor() {
    this.queue = [];
    this.deviceHash = localStorage.getItem('deviceHash') || crypto.randomUUID();
    this.sessionId = crypto.randomUUID();
    localStorage.setItem('deviceHash', this.deviceHash);
  }

  async init() {
    await metaDB.init();
    window.addEventListener('visibilitychange', () => document.hidden && this.flush());
    window.addEventListener('beforeunload', () => this.flush());
    window.addEventListener('analytics:forceFlush', () => this.flush()); // Мгновенный сброс при окончании трека для выдачи ачивок
    setInterval(() => this.flush(), 15000); // Оптимизированный фоновый сброс
  }

  log(type, uid, data = {}) {
    this.queue.push({
      eventId: crypto.randomUUID(),
      sessionId: this.sessionId,
      deviceHash: this.deviceHash,
      platform: window.Utils?.getPlatform()?.isIOS ? 'ios' : 'web',
      type, uid, timestamp: Date.now(), data
    });
    if (this.queue.length > 20) this.flush();
  }

  async flush() {
    if (!this.queue.length) return;
    const batch = [...this.queue];
    this.queue = [];
    try {
      await metaDB.addEvents(batch, 'events_hot');
      window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    } catch (e) {
      this.queue = [...batch, ...this.queue]; // Возврат в очередь при ошибке
    }
  }
}
export const eventLogger = new EventLogger();

import { metaDB } from './meta-db.js';

class EventLogger {
  constructor() {
    this.queue = []; this.deviceHash = localStorage.getItem('deviceHash') || crypto.randomUUID(); this.sessionId = crypto.randomUUID();
    localStorage.setItem('deviceHash', this.deviceHash);
  }

  async init() {
    await metaDB.init();
    ['visibilitychange', 'beforeunload'].forEach(e => window.addEventListener(e, () => document.hidden !== false && this.flush()));
    window.addEventListener('analytics:forceFlush', () => this.flush());
    setInterval(() => this.flush(), 15000);
  }

  log(type, uid, data = {}) {
    this.queue.push({ eventId: crypto.randomUUID(), sessionId: this.sessionId, deviceHash: this.deviceHash, platform: window.Utils?.getPlatform()?.isIOS ? 'ios' : 'web', type, uid, timestamp: Date.now(), data });
    if (this.queue.length > 20) this.flush();
  }

  async flush() {
    if (!this.queue.length) return;
    const b = [...this.queue]; this.queue = [];
    try { await metaDB.addEvents(b, 'events_hot'); window.dispatchEvent(new CustomEvent('analytics:logUpdated')); } 
    catch { this.queue = [...b, ...this.queue]; }
  }
}
export const eventLogger = new EventLogger(); window.eventLogger = eventLogger;

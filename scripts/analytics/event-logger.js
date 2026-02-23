import { metaDB } from './meta-db.js';

class EventLogger {
  constructor() {
    this.hotQueue = [];
    this.deviceHash = localStorage.getItem('deviceHash') || crypto.randomUUID();
    localStorage.setItem('deviceHash', this.deviceHash);
  }
  async init() {
    await metaDB.init();
    window.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    setInterval(() => this.flush(), 30000);
  }
  log(type, payload) {
    this.hotQueue.push({ type, payload, timestamp: Date.now(), deviceHash: this.deviceHash, uuid: crypto.randomUUID() });
    if (this.hotQueue.length > 50) this.flush();
  }
  async flush() {
    if (!this.hotQueue.length) return;
    const batch = [...this.hotQueue]; this.hotQueue = [];
    for (const ev of batch) await metaDB.addEvent(ev);
    window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
  }
}
export const eventLogger = new EventLogger();

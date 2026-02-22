import { metaDB } from './meta-db.js';

class EventLogger {
  constructor() {
    this.hotQueue = [];
    this.flushInterval = null;
    this.deviceHash = this._generateDeviceHash();
  }
  async init() {
    await metaDB.init();
    window.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }
  log(type, payload) {
    const event = {
      type,
      payload,
      timestamp: Date.now(),
      deviceHash: this.deviceHash,
      uuid: crypto.randomUUID()
    };
    this.hotQueue.push(event);
    if (this.hotQueue.length > 50) this.flush();
  }
  async flush() {
    if (!this.hotQueue.length) return;
    const batch = [...this.hotQueue];
    this.hotQueue = [];
    for (const ev of batch) {
      await metaDB.addEvent(ev);
    }
    window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
  }
  _generateDeviceHash() {
    let hash = localStorage.getItem('deviceHash');
    if (!hash) { hash = crypto.randomUUID(); localStorage.setItem('deviceHash', hash); }
    return hash;
  }
}
export const eventLogger = new EventLogger();

export class MetaDB {
  constructor() { this.dbName = 'MetaDB_v4'; this.version = 1; this.db = null; }
  
  async init() {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('events_hot')) db.createObjectStore('events_hot', { keyPath: 'eventId' });
        if (!db.objectStoreNames.contains('events_warm')) db.createObjectStore('events_warm', { keyPath: 'eventId' });
        if (!db.objectStoreNames.contains('stats')) db.createObjectStore('stats', { keyPath: 'uid' });
        if (!db.objectStoreNames.contains('global')) db.createObjectStore('global', { keyPath: 'key' });
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async tx(storeName, mode, op) {
    if (!this.db) await this.init();
    return new Promise((res, rej) => {
      const transaction = this.db.transaction(storeName, mode);
      const request = op(transaction.objectStore(storeName));
      request.onsuccess = () => res(request.result);
      request.onerror = () => rej(request.error);
    });
  }

  async addEvents(events, store = 'events_hot') {
    if (!this.db) await this.init();
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      events.forEach(ev => s.put(ev));
      t.oncomplete = () => res(true);
      t.onerror = () => rej(t.error);
    });
  }

  async getEvents(store = 'events_hot') { return this.tx(store, 'readonly', s => s.getAll()); }
  async clearEvents(store = 'events_hot') { return this.tx(store, 'readwrite', s => s.clear()); }
  
  async updateStat(uid, mutatorFn) {
    return this.tx('stats', 'readwrite', store => {
      const req = store.get(uid);
      req.onsuccess = () => {
        const data = req.result || { 
          uid, globalListenSeconds: 0, globalValidListenCount: 0, globalFullListenCount: 0, 
          firstPlayedAt: Date.now(), lastPlayedAt: Date.now(), featuresUsed: {} 
        };
        store.put(mutatorFn(data));
      };
      return req;
    });
  }
  
  async getStat(uid) { return this.tx('stats', 'readonly', s => s.get(uid)); }
  async getAllStats() { return this.tx('stats', 'readonly', s => s.getAll()); }
  async getGlobal(key) { return this.tx('global', 'readonly', s => s.get(key)); }
  async setGlobal(key, value) { return this.tx('global', 'readwrite', s => s.put({ key, value })); }
}
export const metaDB = new MetaDB();

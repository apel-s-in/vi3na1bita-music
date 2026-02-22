export class MetaDB {
  constructor() {
    this.dbName = 'MetaDB';
    this.version = 1;
    this.db = null;
  }
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('events_hot')) db.createObjectStore('events_hot', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('stats')) db.createObjectStore('stats', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('achievements')) db.createObjectStore('achievements', { keyPath: 'id' });
      };
      request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      request.onerror = (e) => reject(e.target.error);
    });
  }
  async addEvent(event) {
    return this._tx('events_hot', 'readwrite', store => store.add(event));
  }
  async getEvents() {
    return this._tx('events_hot', 'readonly', store => store.getAll());
  }
  async clearEvents() {
    return this._tx('events_hot', 'readwrite', store => store.clear());
  }
  async updateStat(key, mutatorFn) {
    const tx = this.db.transaction('stats', 'readwrite');
    const store = tx.objectStore('stats');
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const data = req.result || { key, value: 0, details: {} };
        const updated = mutatorFn(data);
        store.put(updated).onsuccess = resolve;
      };
      req.onerror = reject;
    });
  }
  async getStat(key) {
    return this._tx('stats', 'readonly', store => store.get(key));
  }
  _tx(storeName, mode, op) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');
      const tx = this.db.transaction(storeName, mode);
      const req = op(tx.objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}
export const metaDB = new MetaDB();

export class MetaDB {
  constructor() { 
    this.dbName = 'MetaDB_v4'; 
    this.version = 1;
    this.db = null; 
    this._initPromise = null;
  }
  
  async init() {
    if (this.db) return this.db;
    if (this._initPromise) return this._initPromise;
    this._initPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject('IndexedDB is not supported');
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('events_hot')) db.createObjectStore('events_hot', { keyPath: 'eventId' });
        if (!db.objectStoreNames.contains('events_warm')) db.createObjectStore('events_warm', { keyPath: 'eventId' });
        if (!db.objectStoreNames.contains('stats')) db.createObjectStore('stats', { keyPath: 'uid' });
        if (!db.objectStoreNames.contains('global')) db.createObjectStore('global', { keyPath: 'key' });
      };
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
    return this._initPromise;
  }

  async addEvents(events, store = 'events_hot') {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      events.forEach(ev => s.put(ev));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getEvents(store = 'events_hot') {
    await this.init();
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async clearEvents(store = 'events_hot') {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  
  async updateStat(uid, mutatorFn) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('stats', 'readwrite');
      const store = tx.objectStore('stats');
      const getReq = store.get(uid);
      getReq.onsuccess = () => {
        const data = getReq.result || { 
          uid, globalListenSeconds: 0, globalValidListenCount: 0, globalFullListenCount: 0, 
          firstPlayedAt: Date.now(), lastPlayedAt: Date.now(), featuresUsed: {} 
        };
        store.put(mutatorFn(data));
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  
  async getStat(uid) {
    await this.init();
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('stats', 'readonly').objectStore('stats').get(uid);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllStats() {
    await this.init();
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('stats', 'readonly').objectStore('stats').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getGlobal(key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const req = this.db.transaction('global', 'readonly').objectStore('global').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async setGlobal(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('global', 'readwrite');
      tx.objectStore('global').put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const metaDB = new MetaDB();

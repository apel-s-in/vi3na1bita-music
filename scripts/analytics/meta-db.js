// UID.003_(Event log truth)_(сохранять локальную правду пользователя)_(не ломать старые stores и добавлять только новые)
// UID.044_(ListenerProfile core)_(подготовить persistent кэш профиля слушателя)_(добавить отдельный store listener_profile)
// UID.069_(Internal user identity)_(подготовить локальное хранение identity и sync state)_(добавить provider_identity и hybrid_sync)
// UID.062_(Recommendation memory and feedback)_(подготовить кэш взаимодействий с рекомендациями)_(добавить recommendation_state)
// UID.051_(Collection state)_(подготовить коллекционный слой)_(добавить collection_state)
// UID.089_(Future MetaDB stores)_(дать intel-слою устойчивый persistence contour)_(повысить схему только additively)

export class MetaDB {
  constructor() {
    this.dbName = 'MetaDB_v4';
    this.version = 2;
    this.db = null;
    this._initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this._initPromise) return this._initPromise;
    return (this._initPromise = new Promise((res, rej) => {
      if (!window.indexedDB) return rej('IndexedDB is not supported');
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        ['events_hot', 'events_warm'].forEach(n => !db.objectStoreNames.contains(n) && db.createObjectStore(n, { keyPath: 'eventId' }));
        if (!db.objectStoreNames.contains('stats')) db.createObjectStore('stats', { keyPath: 'uid' });
        if (!db.objectStoreNames.contains('global')) db.createObjectStore('global', { keyPath: 'key' });

        [
          'listener_profile',
          'provider_identity',
          'hybrid_sync',
          'recommendation_state',
          'collection_state',
          'intel_runtime'
        ].forEach(n => {
          if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'key' });
        });
      };
      req.onsuccess = () => { this.db = req.result; res(this.db); };
      req.onerror = () => rej(req.error);
    }));
  }

  _exec(store, mode, fn) {
    return this.init().then(() => new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode);
      const r = fn(tx.objectStore(store), tx);
      if (r?.onsuccess !== undefined) {
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } else {
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
      }
    }));
  }

  addEvents(events, store = 'events_hot') { return this._exec(store, 'readwrite', s => events.forEach(ev => s.put(ev))); }
  getEvents(store = 'events_hot') { return this._exec(store, 'readonly', s => s.getAll()); }
  clearEvents(store = 'events_hot') { return this._exec(store, 'readwrite', s => s.clear()); }

  updateStat(uid, fn) {
    return this._exec('stats', 'readwrite', s => {
      const r = s.get(uid);
      r.onsuccess = () => s.put(fn(r.result || {
        uid,
        globalListenSeconds: 0,
        globalValidListenCount: 0,
        globalFullListenCount: 0,
        firstPlayedAt: Date.now(),
        lastPlayedAt: Date.now(),
        featuresUsed: {}
      }));
    });
  }

  getStat(uid) { return this._exec('stats', 'readonly', s => s.get(uid)); }
  getAllStats() { return this._exec('stats', 'readonly', s => s.getAll()); }
  getGlobal(key) { return this._exec('global', 'readonly', s => s.get(key)); }
  setGlobal(key, value) { return this._exec('global', 'readwrite', s => s.put({ key, value })); }

  getStoreValue(store, key) { return this._exec(store, 'readonly', s => s.get(String(key))); }
  setStoreValue(store, key, value) { return this._exec(store, 'readwrite', s => s.put({ key: String(key), value })); }
  getStoreAll(store) { return this._exec(store, 'readonly', s => s.getAll()); }

  tx(sName, mode, fn) {
    return this._exec(sName, mode, (s, tx) => {
      fn(s, tx);
      tx.onabort = () => { throw tx.error || new Error(`Abort: ${sName}`); };
    });
  }
}
export const metaDB = new MetaDB();

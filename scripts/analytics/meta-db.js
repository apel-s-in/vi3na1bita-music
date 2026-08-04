export const META_DB_STORES = Object.freeze([
  'events_hot',
  'events_warm',
  'stats',
  'global',
  'listener_profile',
  'recommendation_state',
  'intel_runtime',
  'backup_sync_state',
  'backup_event_ranges',
  'backup_chain_watermarks',
  'backup_recovery_checkpoints',
  'backup_chain_quarantine',
  'backup_stats_rollups'
]);

export const ACCOUNT_SNAPSHOT_STORES = Object.freeze([
  'events_hot',
  'events_warm',
  'stats',
  'global',
  'listener_profile',
  'recommendation_state',
  'intel_runtime',
  'backup_sync_state',
  'backup_event_ranges',
  'backup_chain_watermarks',
  'backup_chain_quarantine',
  'backup_stats_rollups'
]);

export class MetaDB {
  constructor() { this.dbName = 'MetaDB_v6'; this.version = 4; this.db = null; }
  async init() {
    if (this.db) return this.db;
    return window.Utils.func.memoAsyncOnce('analytics:meta-db:init', () => new Promise((res, rej) => {
      if (!window.indexedDB) return rej('IndexedDB is not supported');
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        ['events_hot', 'events_warm'].forEach(n => !db.objectStoreNames.contains(n) && db.createObjectStore(n, { keyPath: 'eventId' }));
        if (!db.objectStoreNames.contains('stats')) db.createObjectStore('stats', { keyPath: 'uid' });
        if (!db.objectStoreNames.contains('global')) db.createObjectStore('global', { keyPath: 'key' });
        ['listener_profile', 'recommendation_state', 'intel_runtime', 'backup_sync_state', 'backup_recovery_checkpoints'].forEach(n => !db.objectStoreNames.contains(n) && db.createObjectStore(n, { keyPath: 'key' }));
        ['provider_identity', 'hybrid_sync', 'collection_state'].forEach(n => {
          if (db.objectStoreNames.contains(n)) db.deleteObjectStore(n);
        });
        if (db.objectStoreNames.contains('backup_known_ranges')) db.deleteObjectStore('backup_known_ranges');
        if (!db.objectStoreNames.contains('backup_event_ranges')) db.createObjectStore('backup_event_ranges', { keyPath: 'rangeKey' });
        if (!db.objectStoreNames.contains('backup_chain_watermarks')) db.createObjectStore('backup_chain_watermarks', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('backup_chain_quarantine')) db.createObjectStore('backup_chain_quarantine', { keyPath: 'key' });
        const rollups = db.objectStoreNames.contains('backup_stats_rollups') ? e.target.transaction.objectStore('backup_stats_rollups') : db.createObjectStore('backup_stats_rollups', { keyPath: 'rangeKey' });
        if (!rollups.indexNames.contains('chainSeq')) rollups.createIndex('chainSeq', 'chainSeq', { unique: false });
      };
      req.onsuccess = () => {
        this.db = req.result;
        try {
          indexedDB.deleteDatabase('MetaDB_v4');
        } catch {}
        res(this.db);
      };
      req.onerror = () => rej(req.error);
    }));
  }
  _exec(store, mode, fn) {
    return this.init().then(() => new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode), r = fn(tx.objectStore(store), tx);
      if (r?.onsuccess !== undefined) { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
      else { tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }
    }));
  }
  addEvents(events, store = 'events_hot') { return this._exec(store, 'readwrite', s => events.forEach(ev => s.put(ev))); }
  getEvents(store = 'events_hot') { return this._exec(store, 'readonly', s => s.getAll()); }
  clearEvents(store = 'events_hot') { return this._exec(store, 'readwrite', s => s.clear()); }
  deleteEvents(events, store = 'events_hot') { const ids = (Array.isArray(events) ? events : []).map(e => String(e?.eventId || '').trim()).filter(Boolean); return ids.length ? this._exec(store, 'readwrite', s => ids.forEach(id => s.delete(id))) : Promise.resolve(true); }
  updateStat(uid, fn) { return this._exec('stats', 'readwrite', s => { const r = s.get(uid); r.onsuccess = () => s.put(fn(r.result || { uid, globalListenSeconds: 0, globalValidListenCount: 0, globalFullListenCount: 0, firstPlayedAt: Date.now(), lastPlayedAt: Date.now(), featuresUsed: {} })); }); }
  getStat(uid) { return this._exec('stats', 'readonly', s => s.get(uid)); }
  getAllStats() { return this._exec('stats', 'readonly', s => s.getAll()); }
  getGlobal(key) { return this._exec('global', 'readonly', s => s.get(key)); }
  setGlobal(key, value) { return this._exec('global', 'readwrite', s => s.put({ key, value })); }
  getStoreValue(store, key) { return this._exec(store, 'readonly', s => s.get(String(key))); }
  setStoreValue(store, key, value) { return this._exec(store, 'readwrite', s => s.put({ key: String(key), value })); }
  getStoreAll(store) { return this._exec(store, 'readonly', s => s.getAll()); }

  async exportSnapshot() {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        ACCOUNT_SNAPSHOT_STORES,
        'readonly'
      );
      const snapshot = {};
      let pending = ACCOUNT_SNAPSHOT_STORES.length;

      ACCOUNT_SNAPSHOT_STORES.forEach(name => {
        const request = tx.objectStore(name).getAll();

        request.onsuccess = () => {
          snapshot[name] = request.result || [];
          pending--;

          if (!pending) resolve(snapshot);
        };

        request.onerror = () =>
          reject(request.error);
      });

      tx.onerror = () =>
        reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error('meta_snapshot_aborted'));
    });
  }

  async replaceSnapshot(snapshot = {}) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        META_DB_STORES,
        'readwrite'
      );

      META_DB_STORES.forEach(name => {
        const store = tx.objectStore(name);
        store.clear();

        const rows = Array.isArray(snapshot[name])
          ? snapshot[name]
          : [];

        rows.forEach(row => store.put(row));
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error('meta_replace_aborted'));
    });
  }

  tx(sName, mode, fn) { return this._exec(sName, mode, (s, tx) => { fn(s, tx); tx.onabort = () => { throw tx.error || new Error(`Abort: ${sName}`); }; }); }
}
export const metaDB = new MetaDB();

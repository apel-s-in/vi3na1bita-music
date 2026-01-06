//=================================================
// FILE: scripts/offline-manager.js
// Pinned, Cloud, eviction, 100% OFFLINE, индикаторы
class OfflineManager {
  constructor() {
    this.dbName = 'vr-audio-cache';
    this.storeName = 'blobs';
    this.initDB();
  }

  async initDB() {
    // простая обёртка над IndexedDB (без внешней библиотеки)
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async hasLocal(uid, variant) {
    const tx = this.db.transaction(this.storeName);
    const store = tx.objectStore(this.storeName);
    const key = `${uid}:${variant}`;
    const val = await store.get(key);
    return !!val;
  }

  async getBlobUrl(uid, variant) {
    const tx = this.db.transaction(this.storeName);
    const store = tx.objectStore(this.storeName);
    const key = `${uid}:${variant}`;
    const blob = await store.get(key);
    return blob ? URL.createObjectURL(blob) : null;
  }

  async downloadAndStore(uid, variant, kind = 'pinned') {
    const track = W.config.tracks.find(t => t.uid === uid);
    const url = variant === 'hi' ? track.audio : track.audio_low;
    if (!url) return;

    const resp = await fetch(url);
    const blob = await resp.blob();

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await store.put(blob, `${uid}:${variant}`);

    // метаданные для индикаторов и eviction
    const metaKey = `meta:${uid}`;
    let meta = JSON.parse(localStorage.getItem(metaKey) || '{}');
    meta[`cached${variant === 'hi' ? 'Hi' : 'Lo'}Complete`] = true;
    meta.kind = kind; // pinned | cloud | transient
    localStorage.setItem(metaKey, JSON.stringify(meta));
  }

  async togglePinned(uid, on) {
    if (on) {
      const cq = localStorage.getItem('offline:cacheQuality:v1') || 'hi';
      await this.downloadAndStore(uid, cq, 'pinned');
    } else {
      // становится cloud-кандидатом
      statsManager.setCloudActive(uid, true);
    }
    this.updateTrackIndicators(uid);
  }

  updateTrackIndicators(uid) {
    // вызывать после изменений — обновит все .track с data-uid
    document.querySelectorAll(`.track[data-uid="${uid}"] .offline-indicator`).forEach(el => {
      const meta = JSON.parse(localStorage.getItem(`meta:${uid}`) || '{}');
      if (meta.pinned) el.textContent = '🔒';
      else if (meta.cloud && meta.cachedHiComplete || meta.cachedLoComplete) el.textContent = '☁';
      else el.textContent = '🔒'; // серый по умолчанию
      el.className = meta.pinned ? 'pinned' : meta.cloud ? 'cloud' : 'gray';
    });
  }

  // 100% OFFLINE — упрощённо
  async startFullOffline(selection) {
    const cq = localStorage.getItem('offline:cacheQuality:v1') || 'hi';
    const tracks = selection === 'favorites' 
      ? W.config.tracks.filter(t => t.favorite)
      : W.config.tracks.filter(t => selection.albums.includes(t.album));

    for (const t of tracks) {
      await this.downloadAndStore(t.uid, cq, 'full-offline');
    }
  }
}

window.offlineManager = new OfflineManager();

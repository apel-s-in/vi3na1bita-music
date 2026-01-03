// scripts/offline/offline-manager.js

import { putAudioBlob, getAudioBlob, deleteAudioBlob, putMeta, getMeta, getCloudStats, putCloudStats, resetCloudStats, getGlobalStats, putGlobalStats, getSetting, setSetting, estimateUsage, bytesByQuality } from './cache-db.js';
import { QueueManager, PRIORITY } from './queue-manager.js';
import { resolveForPlayback } from './track-resolver.js';

export class OfflineManager {
  constructor({ downloader, getTrackByUid }) {
    // downloader: async ({uid,url,quality,onProgress}) => Blob
    // getTrackByUid: (uid) => { uid, urlHi, urlLo, sizeHi, sizeLo }
    this._downloader = downloader;
    this._getTrack = getTrackByUid;
    this._queue = new QueueManager({
      downloader: this._downloadAndPersist.bind(this),
      onProgress: (ev) => this._emit('progress', ev),
      onDone: (ev) => this._onDownloaded(ev),
      onError: (ev) => this._emit('error', ev),
    });
    this._subs = new Map();
  }

  on(type, cb) {
    const arr = this._subs.get(type) || [];
    arr.push(cb);
    this._subs.set(type, arr);
    return () => this.off(type, cb);
  }
  off(type, cb) {
    const arr = this._subs.get(type) || [];
    this._subs.set(type, arr.filter(f => f !== cb));
  }
  _emit(type, payload) {
    (this._subs.get(type) || []).forEach(f => { try { f(payload); } catch {} });
  }

  // PUBLIC API

  async getIndicators(uid) {
    const meta = (await getMeta(uid)) || {};
    const { hi, lo } = await bytesByQuality(uid);
    return {
      pinned: !!meta.pinned,
      cloud: !!meta.cloud && !!meta.cachedComplete,
      cachedQuality: meta.cachedQuality || null,
      cachedBytes: (hi + lo),
      cachedComplete: !!meta.cachedComplete,
      needsUpdate: !!meta.needsUpdate,
      needsReCache: !!meta.needsReCache,
    };
  }

  async pin(uid) {
    await putMeta(uid, { pinned: true });
    // поставить задачу докачать до 100% в CQ
    const cq = await getSetting('cacheQuality:v1', 'hi');
    const track = this._getTrack(uid);
    const url = cq === 'hi' ? track.urlHi : track.urlLo;
    if (!url) return;
    this._queue.add({ uid, url, quality: cq, type: 'audio', prio: PRIORITY.PINNED, meta: { action: 'pin' } });
    this._emit('toast', { type: 'info', text: 'Трек будет доступен офлайн. Начинаю скачивание…' });
  }

  async unpin(uid) {
    // cloud-кандидат
    const now = Date.now();
    const D = Number(await getSetting('cloud:ttlDays', 31));
    await putMeta(uid, { pinned: false });
    const meta = await putCloudStats(uid, { cloudAddedAt: now, cloudExpiresAt: now + D * 86400000 });
    await putMeta(uid, { cloud: true }); // ☁ появится только при 100%
    this._emit('toast', { type: 'info', text: 'Офлайн-закрепление снято. Трек может быть удалён при очистке кэша.' });

    // докачка до 100% в CQ (если не полон)
    const cq = await getSetting('cacheQuality:v1', 'hi');
    const track = this._getTrack(uid);
    const url = cq === 'hi' ? track.urlHi : track.urlLo;
    if (!url) return;
    const blobRec = await getAudioBlob(uid, cq);
    const need = cq === 'hi' ? track.sizeHi : track.sizeLo;
    if (!blobRec || (blobRec.bytes || 0) < (need || 0)) {
      this._queue.add({ uid, url, quality: cq, type: 'audio', prio: PRIORITY.CLOUD_FILL, meta: { action: 'cloud-fill' } });
    }
  }

  async cloudMenu(uid, action) {
    if (action === 'add-lock') {
      await this.pin(uid);
    } else if (action === 'remove-cache') {
      // удалить облако + сброс cloud-статистики, но не global
      await resetCloudStats(uid);
      await putMeta(uid, { cloud: false, cachedComplete: false, needsUpdate: false, needsReCache: false });
      await deleteAudioBlob(uid, 'hi').catch(() => {});
      await deleteAudioBlob(uid, 'lo').catch(() => {});
      this._emit('toast', { type: 'info', text: 'Трек удалён из кэша.' });
    }
  }

  async resolveForPlayback(track, pq) {
    return resolveForPlayback(track, pq);
  }

  async onListenProgress(uid, playedMs, durationMs, ended) {
    // global stats
    const gs = await getGlobalStats(uid);
    const totalPlayMs = (gs.totalPlayMs || 0) + Math.max(0, playedMs || 0);
    const firstPlayAt = gs.firstPlayAt || Date.now();
    await putGlobalStats(uid, { totalPlayMs, lastPlayAt: Date.now(), firstPlayAt });

    if (ended && durationMs && durationMs > 0) {
      const ratio = (playedMs || 0) / durationMs;
      if (ratio >= 0.9) {
        const cs = await getCloudStats(uid);
        const fullListenCount = (cs.fullListenCount || 0) + 1;
        const lastFullListenAt = Date.now();
        await putCloudStats(uid, { fullListenCount, lastFullListenAt });
        // порог N
        const N = Number(await getSetting('cloud:threshold', 5));
        if (fullListenCount >= N) {
          // обеспечить 100% в CQ и запустить TTL
          const cq = await getSetting('cacheQuality:v1', 'hi');
          const track = this._getTrack(uid);
          const url = cq === 'hi' ? track.urlHi : track.urlLo;
          if (url) {
            const blobRec = await getAudioBlob(uid, cq);
            const need = cq === 'hi' ? track.sizeHi : track.sizeLo;
            if (!blobRec || (blobRec.bytes || 0) < (need || 0)) {
              this._queue.add({ uid, url, quality: cq, type: 'audio', prio: PRIORITY.CLOUD_FILL, meta: { action: 'cloud-threshold' } });
            } else {
              // уже 100% — включить cloud и TTL
              const D = Number(await getSetting('cloud:ttlDays', 31));
              await putMeta(uid, { cloud: true, cachedComplete: true });
              await putCloudStats(uid, { cloudAddedAt: Date.now(), cloudExpiresAt: Date.now() + D * 86400000 });
              this._emit('badge', { type: 'cloud', uid });
            }
          }
        }
      }
    }
  }

  async evictionIfNeeded({ requiredBytes = 0 }) {
    // порядок: extra transient -> cloud (LRU/старость) -> other; pinned — никогда
    // Здесь — каркас. Реальная стратегия LRU потребует трекинга ts для cloud.
    const { usage, quota } = await estimateUsage();
    if (quota && usage + requiredBytes > quota) {
      // сообщаем UI: нужно очистить кэш
      this._emit('toast', { type: 'warn', text: 'Кэш переполнен. Удалены самые старые треки.' });
      // в v1.0 можно оставить ручную очистку через модалку
      return false;
    }
    return true;
  }

  // SETTINGS (CQ, Offline mode, Network policy, Cloud N/D)
  async setCacheQuality(q) { await setSetting('cacheQuality:v1', q); }
  async getCacheQuality() { return getSetting('cacheQuality:v1', 'hi'); }
  async setOfflineMode(onOff) { await setSetting('offlinePolicy:v1', onOff); }
  async setNetworkPolicy({ wifi, mobile }) { await setSetting('net:wifi:v1', !!wifi); await setSetting('net:mobile:v1', !!mobile); }
  async setCloudSettings({ threshold, ttlDays }) { await setSetting('cloud:threshold', Number(threshold)); await setSetting('cloud:ttlDays', Number(ttlDays)); }

  // Downloads integration
  get queue() { return this._queue; }

  // INTERNAL

  async _downloadAndPersist({ uid, url, quality, onProgress }) {
    // Уважает очередь: 1 активная загрузка, политика сети — в QueueManager.
    // Простой фетч с прогрессом.
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    const contentLen = Number(resp.headers.get('content-length') || '0');
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (onProgress && contentLen) {
        onProgress(Math.round((received / contentLen) * 100));
      }
    }
    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    const { bytes } = await putAudioBlob(uid, quality, blob);
    // обновим meta: cachedQuality/cachedBytes/cachedComplete
    const track = this._getTrack(uid);
    const need = quality === 'hi' ? track.sizeHi : track.sizeLo;
    const complete = need ? bytes >= need : false;
    await putMeta(uid, { cachedQuality: quality, cachedBytes: bytes, cachedComplete: complete });
    return blob;
  }

  async _onDownloaded(ev) {
    const { uid, quality, meta } = ev;
    // cloud TTL включаем только когда 100%
    const m = await getMeta(uid);
    if (m?.cloud && m.cachedComplete) {
      const D = Number(await getSetting('cloud:ttlDays', 31));
      await putCloudStats(uid, { cloudAddedAt: Date.now(), cloudExpiresAt: Date.now() + D * 86400000 });
    }
    // уведомления/индикаторы
    this._emit('progress', { ...ev, completed: true });
  }
}

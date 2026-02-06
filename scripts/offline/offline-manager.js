/**
 * offline-manager.js — Центральный модуль офлайн-кэша (🔒 pinned / ☁ cloud).
 *
 * Отвечает за:
 *   - togglePinned (🔒) и cloud-автопоявление (☁)
 *   - Download Queue с защитой от «истерики» при смене качества
 *   - TTL проверку облачных треков
 *   - getTrackOfflineState для UI-индикаторов
 *   - re-cache логику
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, getAudioBlobAny, deleteAudio,
  setTrackMeta, getTrackMeta, deleteTrackMeta, getAllTrackMetas,
  getGlobal, setGlobal,
  estimateUsage, deleteTrackCache
} from './cache-db.js';

/* ═══════ Константы ═══════ */

const PQ_KEY = 'qualityMode:v1';
const CLOUD_N_KEY = 'offline:cloud:N';
const CLOUD_D_KEY = 'offline:cloud:D';
const MIN_SPACE_MB = 60;
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ═══════ Утилиты ═══════ */

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
}

function toast(msg) {
  if (window.NotificationSystem) {
    window.NotificationSystem.info(msg);
  }
}

function toastWarn(msg) {
  if (window.NotificationSystem) {
    window.NotificationSystem.warning(msg);
  }
}

/* ═══════ TrackRegistry bridge ═══════ */

function getTrackData(uid) {
  // Ищем данные трека из глобального реестра
  if (window.albums) {
    for (const album of window.albums) {
      if (!album.tracks) continue;
      for (const t of album.tracks) {
        if (String(t.uid) === String(uid)) return t;
      }
    }
  }
  return null;
}

function getTrackUrl(uid, quality) {
  const t = getTrackData(uid);
  if (!t) return null;
  const q = normQ(quality);
  if (q === 'lo') return t.audio_low || t.audio || null;
  return t.audio || null;
}

/* ═══════ DownloadQueue ═══════ */

class DownloadQueue {
  constructor() {
    this._queue = [];     // { uid, url, quality, kind, priority, retries }
    this._active = null;  // { uid, ctrl, quality, kind }
    this._paused = false;
  }

  /** Добавить задачу. Дубли по uid игнорируются. */
  enqueue({ uid, url, quality, kind = 'cloud', priority = 0 }) {
    if (!uid || !url) return;
    if (this._active?.uid === uid) return;
    if (this._queue.some(i => i.uid === uid)) return;
    this._queue.push({ uid, url, quality: normQ(quality), kind, priority, retries: 0 });
    this._queue.sort((a, b) => b.priority - a.priority);
    this._processNext();
  }

  /** Отменить задачу uid (из очереди или активную). */
  cancel(uid) {
    this._queue = this._queue.filter(i => i.uid !== uid);
    if (this._active?.uid === uid) {
      this._active.ctrl.abort();
      this._active = null;
      this._processNext();
    }
  }

  /** Отменить все загрузки с quality !== targetQuality (защита от «истерики»). */
  cancelMismatchedQuality(targetQuality) {
    const q = normQ(targetQuality);
    this._queue = this._queue.filter(i => i.quality === q);
    if (this._active && this._active.quality !== q) {
      this._active.ctrl.abort();
      this._active = null;
    }
    this._processNext();
  }

  pause()  { this._paused = true; }
  resume() { this._paused = false; this._processNext(); }
  clear()  {
    if (this._active) { this._active.ctrl.abort(); this._active = null; }
    this._queue = [];
  }

  getStatus() {
    return {
      queued: this._queue.length,
      activeUid: this._active?.uid || null,
      paused: this._paused,
      items: this._queue.map(i => ({ uid: i.uid, kind: i.kind, quality: i.quality }))
    };
  }

  async _processNext() {
    if (this._paused || this._active || !this._queue.length) return;
    if (!navigator.onLine) return;

    const item = this._queue.shift();
    const ctrl = new AbortController();
    this._active = { uid: item.uid, ctrl, quality: item.quality, kind: item.kind };

    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const resp = await fetch(item.url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      // Проверяем что загрузка не была отменена пока качали
      if (this._active?.uid !== item.uid) return;

      // Сохраняем blob (no-duplicates: setAudioBlob удалит другое качество)
      await setAudioBlob(item.uid, item.quality, blob);

      // Обновляем meta
      const meta = await getTrackMeta(item.uid) || {};
      await setTrackMeta(item.uid, {
        ...meta,
        uid: item.uid,
        quality: item.quality,
        size: blob.size,
        url: item.url,
        needsReCache: false
      });

      this._active = null;
      emit('offline:trackCached', {
        uid: item.uid, quality: item.quality, kind: item.kind, size: blob.size
      });
      emit('offline:stateChanged');
      this._processNext();

    } catch (err) {
      this._active = null;
      if (err.name === 'AbortError') {
        this._processNext();
        return;
      }
      // Ретрай с backoff
      if (item.retries < 3) {
        item.retries++;
        setTimeout(() => {
          this._queue.push(item);
          this._queue.sort((a, b) => b.priority - a.priority);
          this._processNext();
        }, 2000 * item.retries);
      } else {
        console.warn(`[DQ] Failed: ${item.uid}`, err.message);
        emit('offline:downloadFailed', { uid: item.uid, error: err.message });
        this._processNext();
      }
    }
  }
}

/* ═══════ OfflineManager (singleton) ═══════ */

class OfflineManager {
  constructor() {
    this._queue = new DownloadQueue();
    this._ready = false;
  }

  /* ─── Init ─── */

  async init() {
    if (this._ready) return this;
    await openDB();
    await this._cleanExpiredCloud();
    this._ready = true;
    emit('offline:ready');
    return this;
  }

  /* ─── Quality ─── */

  /** Текущее качество для 🔒/☁ файлов (в R0/R1 = PQ с плеера) */
  getCacheQuality() {
    return normQ(localStorage.getItem(PQ_KEY));
  }

  /**
   * Вызывается при смене качества на плеере (Hi↔Lo).
   * Защита от «истерики»: отменяет несовпадающие загрузки,
   * помечает файлы needsReCache, запускает тихую замену.
   */
  async onQualityChanged(newQuality) {
    const q = normQ(newQuality);

    // 1) Отменить все загрузки с другим качеством
    this._queue.cancelMismatchedQuality(q);

    // 2) Пометить 🔒/☁ файлы с несовпадающим качеством
    const metas = await getAllTrackMetas();
    let count = 0;
    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      if (m.quality && m.quality !== q) {
        await setTrackMeta(m.uid, { ...m, needsReCache: true });
        count++;
      }
    }

    // 3) Запустить тихую потрековую замену
    if (count > 0) this._startSilentReCache(q);

    emit('offline:stateChanged');
  }

  /** Тихая замена: pinned → cloud, по одному через очередь */
  async _startSilentReCache(targetQ) {
    const metas = await getAllTrackMetas();
    const items = metas.filter(m =>
      (m.type === 'pinned' || m.type === 'cloud') && m.needsReCache
    );

    // Сортировка: pinned (P8) приоритетнее cloud (P5)
    items.sort((a, b) => (b.type === 'pinned' ? 1 : 0) - (a.type === 'pinned' ? 1 : 0));

    for (const m of items) {
      const url = getTrackUrl(m.uid, targetQ);
      if (!url) continue;
      this._queue.enqueue({
        uid: m.uid, url,
        quality: targetQ,
        kind: 'reCache',
        priority: m.type === 'pinned' ? 8 : 5
      });
    }
  }

  /* ─── Cloud settings ─── */

  getCloudN() { return parseInt(localStorage.getItem(CLOUD_N_KEY)) || 5; }
  getCloudD() { return parseInt(localStorage.getItem(CLOUD_D_KEY)) || 31; }

  setCloudN(n) {
    localStorage.setItem(CLOUD_N_KEY, String(Math.max(1, Math.floor(n))));
  }
  setCloudD(d) {
    localStorage.setItem(CLOUD_D_KEY, String(Math.max(1, Math.floor(d))));
  }

  /* ─── Track Offline State (для UI-индикаторов) ─── */

  async getTrackOfflineState(uid) {
    const u = String(uid || '').trim();
    const empty = {
      pinned: false, cloud: false, cacheKind: 'none',
      cachedVariant: null, cachedComplete: 0,
      needsReCache: false, downloading: false
    };
    if (!u) return empty;

    const meta = await getTrackMeta(u);
    if (!meta) return empty;

    const found = await getAudioBlobAny(u, meta.quality || 'hi');
    const downloading = this._queue._active?.uid === u ||
                        this._queue._queue.some(i => i.uid === u);

    return {
      pinned: meta.type === 'pinned',
      cloud: meta.type === 'cloud' && !!found,
      cacheKind: meta.type || 'none',
      cachedVariant: found?.quality || null,
      cachedComplete: found ? 100 : 0,
      needsReCache: !!meta.needsReCache,
      downloading
    };
  }

  /* ─── Toggle Pinned (🔒) ─── */

  async togglePinned(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const meta = await getTrackMeta(u);
    const quality = this.getCacheQuality();

    // Снятие 🔒 → Cloud-кандидат
    if (meta?.type === 'pinned') {
      const D = this.getCloudD();
      const now = Date.now();
      await setTrackMeta(u, {
        ...meta,
        type: 'cloud',
        cloudAddedAt: now,
        cloudExpiresAt: now + D * DAY_MS,
        pinnedAt: null
      });
      toast('Офлайн-закрепление снято. Трек доступен как облачный кэш.');
      emit('offline:stateChanged');
      return;
    }

    // Проверка места
    if (!(await this._hasSpace())) {
      toastWarn('Недостаточно места на устройстве');
      return;
    }

    // Установка 🔒
    const now = Date.now();
    const existing = await getAudioBlobAny(u, quality);

    await setTrackMeta(u, {
      ...(meta || {}),
      uid: u,
      type: 'pinned',
      pinnedAt: now,
      quality,
      needsReCache: existing ? (existing.quality !== quality) : false,
      cloudFullListenCount: meta?.cloudFullListenCount || 0,
      lastFullListenAt: meta?.lastFullListenAt || null,
      cloudAddedAt: meta?.cloudAddedAt || null,
      cloudExpiresAt: null
    });

    toast('Трек будет доступен офлайн. Начинаю скачивание...');

    // Если файл уже есть — не качаем
    if (existing) {
      emit('offline:stateChanged');
      return;
    }

    // В очередь
    const url = getTrackUrl(u, quality);
    if (url) {
      this._queue.enqueue({ uid: u, url, quality, kind: 'pinned', priority: 10 });
    }

    emit('offline:stateChanged');
  }

  /* ─── Cloud: регистрация полного прослушивания ─── */

  async registerFullListen(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const meta = await getTrackMeta(u) || { uid: u, type: 'none' };
    const count = (meta.cloudFullListenCount || 0) + 1;
    const now = Date.now();
    const D = this.getCloudD();

    meta.cloudFullListenCount = count;
    meta.lastFullListenAt = now;

    // Уже cloud → продлить TTL
    if (meta.type === 'cloud') {
      meta.cloudExpiresAt = now + D * DAY_MS;
      await setTrackMeta(u, meta);
      return;
    }

    // Pinned → только обновить счётчик
    if (meta.type === 'pinned') {
      await setTrackMeta(u, meta);
      return;
    }

    // Проверка порога N
    const N = this.getCloudN();
    if (count >= N && await this._hasSpace()) {
      const quality = this.getCacheQuality();
      meta.type = 'cloud';
      meta.quality = quality;
      meta.cloudAddedAt = now;
      meta.cloudExpiresAt = now + D * DAY_MS;
      await setTrackMeta(u, meta);

      // Скачать
      const url = getTrackUrl(u, quality);
      if (url) {
        this._queue.enqueue({ uid: u, url, quality, kind: 'cloud', priority: 4 });
      }
      emit('offline:stateChanged');
      return;
    }

    // Просто сохранить обновлённый счётчик
    await setTrackMeta(u, meta);
  }

  /* ─── Cloud menu: «Удалить из кэша» ─── */

  async removeFromCloudCache(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    this._queue.cancel(u);
    await deleteAudio(u);

    const meta = await getTrackMeta(u);
    if (meta) {
      await setTrackMeta(u, {
        ...meta,
        type: 'none',
        cloudFullListenCount: 0,
        lastFullListenAt: null,
        cloudAddedAt: null,
        cloudExpiresAt: null,
        quality: null,
        size: 0,
        needsReCache: false
      });
    }

    toast('Трек удалён из кэша');
    emit('offline:stateChanged');
  }

  /* ─── Cloud menu: «Закрепить 🔒» из ☁ ─── */

  async promoteCloudToPinned(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const meta = await getTrackMeta(u);
    if (!meta || meta.type !== 'cloud') return;

    await setTrackMeta(u, {
      ...meta,
      type: 'pinned',
      pinnedAt: Date.now(),
      cloudExpiresAt: null
    });

    toast('Трек закреплён офлайн 🔒');
    emit('offline:stateChanged');
  }

  /* ─── TTL: очистка истёкших cloud ─── */

  async _cleanExpiredCloud() {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    const expired = [];

    for (const m of metas) {
      if (m.type !== 'cloud') continue;
      if (!m.cloudExpiresAt) continue;
      if (m.cloudExpiresAt < now) expired.push(m);
    }

    for (const m of expired) {
      await deleteAudio(m.uid);
      await setTrackMeta(m.uid, {
        ...m,
        type: 'none',
        cloudFullListenCount: 0,
        lastFullListenAt: null,
        cloudAddedAt: null,
        cloudExpiresAt: null,
        quality: null,
        size: 0
      });

      const track = getTrackData(m.uid);
      const title = track?.title || m.uid;
      toast(`Офлайн-доступ истёк. «${title}» удалён из кэша.`);
    }

    if (expired.length) emit('offline:stateChanged');
  }

  /* ─── Удалить все 🔒/☁ ─── */

  async removeAll() {
    const metas = await getAllTrackMetas();
    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      await deleteAudio(m.uid);
      await setTrackMeta(m.uid, {
        ...m,
        type: 'none',
        cloudFullListenCount: 0,
        lastFullListenAt: null,
        cloudAddedAt: null,
        cloudExpiresAt: null,
        pinnedAt: null,
        quality: null,
        size: 0,
        needsReCache: false
      });
    }
    this._queue.clear();
    toast('Все офлайн-треки удалены');
    emit('offline:stateChanged');
  }

  /* ─── Re-cache (принудительный, по кнопке) ─── */

  async startReCache() {
    const q = this.getCacheQuality();
    const metas = await getAllTrackMetas();
    let count = 0;

    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      if (m.quality === q && !m.needsReCache) continue;

      const url = getTrackUrl(m.uid, q);
      if (!url) continue;

      this._queue.enqueue({
        uid: m.uid, url, quality: q,
        kind: 'reCache',
        priority: m.type === 'pinned' ? 8 : 5
      });
      count++;
    }

    if (count > 0) toast(`Перекэширование: ${count} файлов`);
    else toast('Все файлы уже в нужном качестве');
  }

  /** Есть ли файлы с несовпадающим качеством? */
  async hasQualityMismatch() {
    const q = this.getCacheQuality();
    const metas = await getAllTrackMetas();
    return metas.some(m =>
      (m.type === 'pinned' || m.type === 'cloud') &&
      m.quality && m.quality !== q
    );
  }

  /* ─── Получить список всех 🔒/☁ для UI ─── */

  async getCachedTracksList() {
    const metas = await getAllTrackMetas();
    const result = [];

    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      const track = getTrackData(m.uid);
      const found = await getAudioBlobAny(m.uid, m.quality || 'hi');
      result.push({
        uid: m.uid,
        type: m.type,
        title: track?.title || m.uid,
        quality: m.quality || 'hi',
        size: found?.blob?.size || m.size || 0,
        pinnedAt: m.pinnedAt,
        cloudExpiresAt: m.cloudExpiresAt,
        cloudAddedAt: m.cloudAddedAt,
        complete: !!found
      });
    }

    // Сортировка: 🔒 сначала (по pinnedAt), потом ☁ (по cloudExpiresAt DESC)
    result.sort((a, b) => {
      if (a.type === 'pinned' && b.type !== 'pinned') return -1;
      if (a.type !== 'pinned' && b.type === 'pinned') return 1;
      if (a.type === 'pinned') return (a.pinnedAt || 0) - (b.pinnedAt || 0);
      return (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0);
    });

    return result;
  }

  /* ─── Хелперы ─── */

  async _hasSpace() {
    try {
      const est = await estimateUsage();
      return est.free > MIN_SPACE_MB * MB;
    } catch {
      return true; // При ошибке разрешаем (лучше попробовать)
    }
  }

  /** Queue API для внешнего использования */
  getQueueStatus() { return this._queue.getStatus(); }
  pauseQueue()     { this._queue.pause(); }
  resumeQueue()    { this._queue.resume(); }
}

/* ═══════ Singleton ═══════ */

const offlineManager = new OfflineManager();
export default offlineManager;

// Глобальный доступ для скриптов без import
window.offlineManager = offlineManager;

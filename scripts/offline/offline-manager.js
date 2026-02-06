/**
 * offline-manager.js — Центральный модуль офлайн-кэша (🔒 pinned / ☁ cloud).
 *
 * ТЗ: Приложение к ТЗ П.1–П.15
 *
 * Реализует:
 *   - togglePinned (🔒) и cloud-автопоявление (☁)
 *   - Download Queue с приоритетами (P0–P5)
 *   - TTL проверку облачных треков (с учётом R3)
 *   - getTrackOfflineState для UI-индикаторов
 *   - re-cache логику (тихая + принудительная)
 *   - applyCloudSettings с пересчётом жертв (П.5.7)
 *   - removeCached с сохранением global stats (П.5.5)
 *   - cleanExpiredPending при выходе из R3 (П.5.6)
 *   - Полный API для offline-modal, PlayerCore, statistics-modal
 *   - EventEmitter для UI-обновлений
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, getAudioBlobAny, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, deleteTrackMeta,
  getAllTrackMetas, resetCloudStats, markExpiredPending,
  getGlobal, setGlobal,
  estimateUsage, deleteTrackCache, hasAudioForUid
} from './cache-db.js';

/* ═══════ Константы ═══════ */

const PQ_KEY = 'qualityMode:v1';
const MODE_KEY = 'offline:mode:v1';
const CLOUD_N_KEY = 'offline:cloud:N';
const CLOUD_D_KEY = 'offline:cloud:D';
const NET_POLICY_KEY = 'offline:netPolicy:v1';
const PRESET_KEY = 'offline:preset:v1';
const MIN_SPACE_MB = 60;
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_N = 5;
const DEFAULT_D = 31;

/* ═══════ Утилиты ═══════ */

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
}

function toast(msg) {
  window.NotificationSystem?.info?.(msg);
}

function toastWarn(msg) {
  window.NotificationSystem?.warning?.(msg);
}

/* ═══════ TrackRegistry bridge ═══════ */

function getTrackData(uid) {
  return window.TrackRegistry?.getTrackByUid?.(uid) || null;
}

function getTrackUrl(uid, quality) {
  const t = getTrackData(uid);
  if (!t) return null;
  const q = normQ(quality);
  if (q === 'lo') return t.audio_low || t.audio || t.src || null;
  return t.audio || t.src || null;
}

/* ═══════ DownloadQueue ═══════ */

class DownloadQueue {
  constructor() {
    this._queue = [];
    this._active = new Map();
    this._paused = false;
    this._maxParallel = 1;
  }

  setMaxParallel(n) { this._maxParallel = Math.max(1, Math.min(n, 4)); }

  enqueue({ uid, url, quality, kind = 'cloud', priority = 0 }) {
    if (!uid || !url) return;
    if (this._active.has(uid)) return;
    if (this._queue.some(i => i.uid === uid)) return;
    this._queue.push({ uid, url, quality: normQ(quality), kind, priority, retries: 0 });
    this._queue.sort((a, b) => b.priority - a.priority);
    this._processNext();
  }

  cancel(uid) {
    this._queue = this._queue.filter(i => i.uid !== uid);
    const active = this._active.get(uid);
    if (active) {
      active.ctrl.abort();
      this._active.delete(uid);
      this._processNext();
    }
  }

  cancelMismatchedQuality(targetQuality) {
    const q = normQ(targetQuality);
    this._queue = this._queue.filter(i => i.quality === q);
    for (const [uid, info] of this._active) {
      if (info.quality !== q) {
        info.ctrl.abort();
        this._active.delete(uid);
      }
    }
    this._processNext();
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._processNext(); }
  clear() {
    for (const [, info] of this._active) info.ctrl.abort();
    this._active.clear();
    this._queue = [];
  }

  isDownloading(uid) {
    return this._active.has(uid) || this._queue.some(i => i.uid === uid);
  }

  getStatus() {
    return {
      queued: this._queue.length,
      active: this._active.size,
      activeUid: this._active.size ? [...this._active.keys()][0] : null,
      paused: this._paused,
      items: this._queue.map(i => ({ uid: i.uid, kind: i.kind, quality: i.quality }))
    };
  }

  async _processNext() {
    if (this._paused) return;
    if (!navigator.onLine) return;

    while (this._active.size < this._maxParallel && this._queue.length > 0) {
      const item = this._queue.shift();
      this._startDownload(item);
    }
  }

  async _startDownload(item) {
    const ctrl = new AbortController();
    this._active.set(item.uid, { ctrl, quality: item.quality, kind: item.kind });

    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const resp = await fetch(item.url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      if (!this._active.has(item.uid)) return;

      await setAudioBlob(item.uid, item.quality, blob);
      await updateTrackMeta(item.uid, {
        quality: item.quality,
        size: blob.size,
        url: item.url,
        needsReCache: false
      });

      this._active.delete(item.uid);
      emit('offline:trackCached', {
        uid: item.uid, quality: item.quality, kind: item.kind, size: blob.size
      });
      emit('offline:stateChanged');
      this._processNext();

    } catch (err) {
      this._active.delete(item.uid);
      if (err.name === 'AbortError') { this._processNext(); return; }

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
    this.queue = new DownloadQueue();
    this._ready = false;
    this._listeners = new Map();
    this._spaceOk = true;
  }

  /* ─── EventEmitter ─── */

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach(fn => { try { fn(data); } catch {} });
  }

  /* ─── Init ─── */

  async initialize() {
    if (this._ready) return this;
    await openDB();
    await this._checkSpace();
    await this._cleanExpiredCloud();

    /* Пробрасываем window-события в внутренний EventEmitter */
    window.addEventListener('offline:trackCached', (e) => {
      this._emit('trackCached', e.detail || {});
    });
    window.addEventListener('offline:downloadFailed', (e) => {
      this._emit('downloadFailed', e.detail || {});
    });

    this._ready = true;
    emit('offline:ready');
    return this;
  }

  async init() { return this.initialize(); }

  /* ─── Mode (R0/R1/R2/R3) ─── */

  getMode() {
    return localStorage.getItem(MODE_KEY) || 'R0';
  }

  async setMode(mode) {
    const valid = ['R0', 'R1', 'R2', 'R3'];
    if (!valid.includes(mode)) return;
    const prevMode = this.getMode();
    localStorage.setItem(MODE_KEY, mode);

    if (prevMode === 'R3' && mode !== 'R3') {
      await this.cleanExpiredPending();
    }

    this._emit('progress', { phase: 'modeChanged', mode });
    emit('offline:uiChanged');
  }

  isOfflineMode() {
    return this.getMode() !== 'R0';
  }

  /* ─── Quality ─── */

  getCacheQuality() {
    return normQ(localStorage.getItem(PQ_KEY));
  }

  getCacheQualitySetting() {
    return this.getCacheQuality();
  }

  setCacheQualitySetting(q) {
    const val = normQ(q);
    localStorage.setItem(PQ_KEY, val);
    this._onQualityChanged(val);
    emit('offline:uiChanged');
  }

  getActivePlaybackQuality() {
    return this.getCacheQuality();
  }

  async _onQualityChanged(newQuality) {
    const q = normQ(newQuality);
    this.queue.cancelMismatchedQuality(q);

    const metas = await getAllTrackMetas();
    let count = 0;
    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      if (m.quality && m.quality !== q) {
        await updateTrackMeta(m.uid, { needsReCache: true });
        count++;
      }
    }
    if (count > 0) {
      toast(`Качество → ${q.toUpperCase()}. ${count} файл(ов) нужно перекачать.`);
      /* ТЗ П.3.2: Запустить тихую фоновую замену */
      this.startSilentReCache();
    }
  }

  /* ─── Net policy ─── */

  getNetPolicy() {
    return localStorage.getItem(NET_POLICY_KEY) || 'any';
  }

  setNetPolicy(policy) {
    const valid = ['any', 'wifi', 'none'];
    if (!valid.includes(policy)) return;
    localStorage.setItem(NET_POLICY_KEY, policy);
    if (policy === 'none') this.queue.pause();
    else this.queue.resume();
    emit('offline:uiChanged');
  }

  /* ─── Cloud N / D (ТЗ П.5.1) ─── */

  getCloudN() {
    return parseInt(localStorage.getItem(CLOUD_N_KEY), 10) || DEFAULT_N;
  }

  getCloudD() {
    return parseInt(localStorage.getItem(CLOUD_D_KEY), 10) || DEFAULT_D;
  }

  setCloudN(n) {
    localStorage.setItem(CLOUD_N_KEY, String(Math.max(1, n | 0)));
  }

  setCloudD(d) {
    localStorage.setItem(CLOUD_D_KEY, String(Math.max(1, d | 0)));
  }

  /**
   * ТЗ П.5.7 — Preview пересчёта при «Применить».
   */
  async previewCloudSettings(newN, newD) {
    const oldN = this.getCloudN();
    const metas = await getAllTrackMetas();
    const cloudTracks = metas.filter(m => m.type === 'cloud');
    const now = Date.now();
    const warnings = [];
    const toRemove = [];

    for (const m of cloudTracks) {
      const base = m.lastFullListenAt || m.cloudAddedAt || now;
      const newExpires = base + newD * DAY_MS;

      if (newExpires <= now) {
        toRemove.push(m.uid);
      } else if (newN > oldN && (m.cloudFullListenCount || 0) < newN) {
        toRemove.push(m.uid);
      }
    }

    if (toRemove.length > 0) {
      warnings.push(`${toRemove.length} облачных трек(ов) будут удалены из кэша.`);
    }

    const toPromote = [];
    if (newN < oldN) {
      const nonCloud = metas.filter(m => !m.type || m.type === 'none');
      for (const m of nonCloud) {
        if ((m.cloudFullListenCount || 0) >= newN) {
          toPromote.push(m.uid);
        }
      }
      if (toPromote.length) {
        warnings.push(`${toPromote.length} трек(ов) получат статус ☁ (набрали ${newN}+ прослушиваний).`);
      }
    }

    return { toRemove, toPromote, warnings, newN, newD };
  }

  async confirmApplyCloudSettings({ toRemove, toPromote, newN, newD }) {
    this.setCloudN(newN);
    this.setCloudD(newD);
    const now = Date.now();
    const quality = this.getCacheQuality();

    for (const uid of (toRemove || [])) {
      await this.removeCached(uid);
    }

    for (const uid of (toPromote || [])) {
      await updateTrackMeta(uid, {
        type: 'cloud',
        cloudAddedAt: now,
        cloudExpiresAt: now + newD * DAY_MS,
        quality
      });
      const url = getTrackUrl(uid, quality);
      if (url && (await this.hasSpace())) {
        this.queue.enqueue({ uid, url, quality, kind: 'cloud', priority: 1 });
      }
    }

    const metas = await getAllTrackMetas();
    for (const m of metas) {
      if (m.type !== 'cloud') continue;
      const base = m.lastFullListenAt || m.cloudAddedAt || now;
      const newExpires = base + newD * DAY_MS;
      await updateTrackMeta(m.uid, { cloudExpiresAt: newExpires });
    }

    emit('offline:stateChanged');
    toast(`Настройки: N=${newN}, D=${newD}. Удалено: ${(toRemove || []).length}.`);
  }

  /* ─── Preset ─── */

  getPreset() {
    return localStorage.getItem(PRESET_KEY) || 'balanced';
  }

  setPreset(name) {
    const presets = { conservative: 1, balanced: 2, aggressive: 3 };
    if (!presets[name]) return;
    localStorage.setItem(PRESET_KEY, name);
    this.queue.setMaxParallel(presets[name]);
    emit('offline:uiChanged');
  }

  /* ─── Space check (ТЗ П.2) ─── */

  async _checkSpace() {
    try {
      const est = await estimateUsage();
      this._spaceOk = est.free > MIN_SPACE_MB * MB;
    } catch {
      this._spaceOk = true;
    }
  }

  async hasSpace(needed = 0) {
    try {
      const est = await estimateUsage();
      this._spaceOk = est.free > (MIN_SPACE_MB * MB + needed);
      return this._spaceOk;
    } catch { return true; }
  }

  isSpaceOk() { return this._spaceOk; }

  /* ─── togglePinned (ТЗ П.4.2–П.4.4) ─── */

  async togglePinned(uid) {
    if (!this._ready) {
      toast('Офлайн-система загружается, подождите…');
      return 'none';
    }
    const meta = (await getTrackMeta(uid)) || {};
    const quality = this.getCacheQuality();

    if (meta.type === 'pinned') {
      /* Снять пиннинг → ☁ cloud (ТЗ П.4.4, П.5.4) */
      const now = Date.now();
      const D = this.getCloudD();
      await updateTrackMeta(uid, {
        type: 'cloud',
        pinnedAt: null,
        cloudAddedAt: now,
        cloudExpiresAt: now + D * DAY_MS
      });
      toast('Офлайн-закрепление снято. Трек доступен как ☁ на ' + D + ' дней.');
      emit('offline:stateChanged');
      return 'cloud';
    }

    if (meta.type === 'cloud') {
      /* Cloud → Pin (ТЗ П.5.5 пункт 1) */
      await updateTrackMeta(uid, {
        type: 'pinned',
        pinnedAt: Date.now(),
        expiredPending: false
      });

      const found = await getAudioBlobAny(uid, quality);
      if (found && found.quality === quality) {
        toast('Трек закреплён 🔒');
      } else if (found) {
        await updateTrackMeta(uid, { needsReCache: true });
        toast('Закреплён 🔒 (качество будет обновлено)');
      } else {
        const url = getTrackUrl(uid, quality);
        if (url) {
          this.queue.enqueue({ uid, url, quality, kind: 'pinned', priority: 5 });
          toast('Закрепляю и скачиваю 🔒...');
        } else {
          toast('Закреплён 🔒 (скачаю при появлении сети)');
        }
      }
      emit('offline:stateChanged');
      return 'pinned';
    }

    /* Новый пиннинг — ТЗ П.4.3 */
    if (!(await this.hasSpace())) {
      toastWarn('Недостаточно места на устройстве. Освободите память для офлайн-кэша.');
      return 'none';
    }

    await setTrackMeta(uid, {
      uid,
      type: 'pinned',
      pinnedAt: Date.now(),
      quality,
      size: 0,
      cloudAddedAt: meta.cloudAddedAt || null,
      cloudExpiresAt: meta.cloudExpiresAt || null,
      cloudFullListenCount: meta.cloudFullListenCount || 0,
      lastFullListenAt: meta.lastFullListenAt || null,
      needsReCache: false,
      expiredPending: false,
      globalFullListenCount: meta.globalFullListenCount || 0,
      globalListenSeconds: meta.globalListenSeconds || 0
    });

    const existingBlob = await getAudioBlobAny(uid, quality);
    if (existingBlob) {
      toast('Трек закреплён 🔒');
    } else {
      const url = getTrackUrl(uid, quality);
      if (url) {
        this.queue.enqueue({ uid, url, quality, kind: 'pinned', priority: 5 });
        toast('Трек будет доступен офлайн. Начинаю скачивание…');
      } else {
        toast('Закреплён 🔒 (скачаю при появлении сети)');
      }
    }

    emit('offline:stateChanged');
    return 'pinned';
  }

  /* ─── Enqueue helpers ─── */

  async enqueueForCloud(uid) {
    const quality = this.getCacheQuality();
    const url = getTrackUrl(uid, quality);
    if (!url) return;
    if (!(await this.hasSpace())) return;
    this.queue.enqueue({ uid, url, quality, kind: 'cloud', priority: 1 });
  }

  async enqueueForPin(uid) {
    const quality = this.getCacheQuality();
    const url = getTrackUrl(uid, quality);
    if (!url) return;
    this.queue.enqueue({ uid, url, quality, kind: 'pinned', priority: 5 });
  }

  /**
   * Мост для PlayerCore: поставить трек в очередь на фоновое кэширование.
   * ТЗ П.10: P4 — Cloud fill
   */
  async enqueueAudioDownload(uid, opts = {}) {
    const quality = this.getCacheQuality();
    const url = getTrackUrl(uid, quality);
    if (!url) return;
    if (!(await this.hasSpace())) return;
    const priority = opts.priority || 1;
    const kind = opts.kind || 'playbackCache';
    this.queue.enqueue({ uid, url, quality, kind, priority });
  }

  /* ─── registerFullListen (ТЗ П.5.2, П.5.3) ─── */

  async registerFullListen(uid, { duration, position } = {}) {
    if (!uid || !this._ready) return;

    /* ТЗ П.5.2: Full listen ТОЛЬКО если duration > 0 и прогресс > 90% */
    const dur = Number(duration) || 0;
    const pos = Number(position) || 0;
    if (dur <= 0 || (pos / dur) < 0.9) return;

    const meta = await getTrackMeta(uid);
    if (!meta) return;

    /* Защита от повторного подсчёта того же прослушивания:
       если трек ещё играет и уже засчитан в этой сессии — пропускаем */

    const count = (meta.cloudFullListenCount || 0) + 1;
    await updateTrackMeta(uid, { cloudFullListenCount: count });

    console.log(`[OfflineMgr] Full listen #${count} for ${uid} (threshold: ${this._settings.cloudThreshold || 5})`);

    const N = this._settings.cloudThreshold || 5;
    if (count >= N && meta.status === 'none') {
    }

    const now = Date.now();
    const D = this.getCloudD();
    const N = this.getCloudN();
    const quality = this.getCacheQuality();

    let meta = (await getTrackMeta(uid)) || {
      uid,
      type: 'none',
      quality: null,
      size: 0,
      cloudFullListenCount: 0,
      lastFullListenAt: null,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      globalFullListenCount: 0,
      globalListenSeconds: 0,
      needsReCache: false,
      expiredPending: false,
      pinnedAt: null
    };

    /* Обновляем global stats (ТЗ П.5.5: НЕ трогать global stats при удалении cloud) */
    meta.globalFullListenCount = (meta.globalFullListenCount || 0) + 1;
    meta.globalListenSeconds = (meta.globalListenSeconds || 0) + (duration || 0);

    /* Обновляем cloud stats */
    meta.cloudFullListenCount = (meta.cloudFullListenCount || 0) + 1;
    meta.lastFullListenAt = now;

    /* ТЗ П.5.6: Продление TTL — каждое полное прослушивание обновляет cloudExpiresAt */
    if (meta.type === 'cloud') {
      meta.cloudExpiresAt = now + D * DAY_MS;
    }

    /* ТЗ П.5.3: Автоматическое появление ☁ */
    if (meta.type !== 'pinned' && meta.type !== 'cloud') {
      if (meta.cloudFullListenCount >= N) {
        const hasBlob = await hasAudioForUid(uid);

        if (this.getMode() === 'R3' && hasBlob) {
          /* В R3 файл уже локальный — просто присваиваем статус */
          meta.type = 'cloud';
          meta.cloudAddedAt = now;
          meta.cloudExpiresAt = now + D * DAY_MS;
          meta.quality = quality;
        } else if (await this.hasSpace()) {
          meta.type = 'cloud';
          meta.cloudAddedAt = now;
          meta.cloudExpiresAt = now + D * DAY_MS;
          meta.quality = quality;

          if (!hasBlob) {
            const url = getTrackUrl(uid, quality);
            if (url) {
              this.queue.enqueue({ uid, url, quality, kind: 'cloud', priority: 1 });
            }
          }
        }
        /* Если нет места — счётчик считается, но файл не скачивается (ТЗ П.2) */
      }
    }

    await setTrackMeta(uid, meta);
    emit('offline:stateChanged');
  }

  /** Алиас registerFullListen для совместимости. */
  async recordListenStats(uid, params = {}) {
    return this.registerFullListen(uid, params);
  }

  /**
   * Инкрементальная запись секунд прослушивания (globalListenSeconds).
   * Вызывается из stats-tracker каждую секунду.
   * НЕ инкрементирует cloudFullListenCount.
   */
  async recordTickStats(uid, { deltaSec = 1 } = {}) {
    if (!uid || !this._ready) return;
    const meta = await getTrackMeta(uid);
    if (!meta) return;
    await updateTrackMeta(uid, {
      globalListenSeconds: (meta.globalListenSeconds || 0) + deltaSec
    });
  }

  /**
   * Инкрементальная запись секунд прослушивания (для globalListenSeconds).
   * Вызывается из stats-tracker.onTick() каждую секунду.
   * НЕ инкрементирует cloudFullListenCount и НЕ проверяет порог N.
   */
  async recordTickStats(uid, { deltaSec = 1 } = {}) {
    if (!uid || !this._ready) return;
    const meta = await getTrackMeta(uid);
    if (!meta) return;
    await updateTrackMeta(uid, {
      globalListenSeconds: (meta.globalListenSeconds || 0) + deltaSec
    });
  }

  /* ─── getTrackOfflineState (для UI индикаторов, ТЗ П.7.2) ─── */

  async getTrackOfflineState(uid) {
    // Guard: если DB ещё не инициализирована — возвращаем безопасный дефолт
    if (!this._ready) {
      return {
        status: 'none', icon: '🔒', color: 'grey', opacity: 0.4,
        clickable: false, downloading: false, quality: null,
        cloudFullListenCount: 0, cloudExpiresAt: null, needsReCache: false
      };
    }
    const meta = await getTrackMeta(uid);
    const downloading = this.queue.isDownloading(uid);
    const spaceOk = this.isSpaceOk();

    if (!meta || meta.type === 'none' || !meta.type) {
      return {
        status: 'none',
        icon: '🔒',
        color: 'grey',
        opacity: spaceOk ? 0.4 : 0.2,
        clickable: true,
        downloading: downloading,
        quality: null,
        cloudFullListenCount: meta?.cloudFullListenCount || 0,
        cloudExpiresAt: null,
        needsReCache: false
      };
    }

    if (meta.type === 'pinned') {
      const hasBlob = await hasAudioForUid(uid);
      return {
        status: 'pinned',
        icon: '🔒',
        color: 'gold',
        opacity: 1.0,
        clickable: true,
        downloading: downloading || !hasBlob,
        quality: meta.quality,
        cloudFullListenCount: meta.cloudFullListenCount || 0,
        cloudExpiresAt: meta.cloudExpiresAt,
        needsReCache: !!meta.needsReCache
      };
    }

    if (meta.type === 'cloud') {
      const hasBlob = await hasAudioForUid(uid);
      /* ТЗ П.7.2: ☁ отображается только при cloud=true И cachedComplete=100% */
      if (hasBlob && !downloading) {
        const daysLeft = meta.cloudExpiresAt
          ? Math.max(0, Math.ceil((meta.cloudExpiresAt - Date.now()) / DAY_MS))
          : 0;
        return {
          status: 'cloud',
          icon: '☁',
          color: 'blue',
          opacity: 1.0,
          clickable: true,
          downloading: false,
          quality: meta.quality,
          cloudFullListenCount: meta.cloudFullListenCount || 0,
          cloudExpiresAt: meta.cloudExpiresAt,
          daysLeft,
          needsReCache: !!meta.needsReCache
        };
      }
      /* Cloud но ещё не загружен — серый 🔒 */
      return {
        status: 'cloud_loading',
        icon: '🔒',
        color: 'grey',
        opacity: 0.4,
        clickable: true,
        downloading: true,
        quality: meta.quality,
        cloudFullListenCount: meta.cloudFullListenCount || 0,
        cloudExpiresAt: meta.cloudExpiresAt,
        needsReCache: false
      };
    }

    /* Fallback: transient / dynamic */
    return {
      status: meta.type || 'none',
      icon: '🔒',
      color: 'grey',
      opacity: 0.4,
      clickable: true,
      downloading: false,
      quality: meta.quality,
      cloudFullListenCount: meta.cloudFullListenCount || 0,
      cloudExpiresAt: null,
      needsReCache: false
    };
  }

  /**
   * Batch-версия для рендера трек-листа (один await вместо N).
   */
  async getTrackOfflineStates(uids) {
    const results = {};
    for (const uid of uids) {
      results[uid] = await this.getTrackOfflineState(uid);
    }
    return results;
  }

  /* ─── removeCached (ТЗ П.5.5 пункт 2) ─── */

  async removeCached(uid) {
    const meta = await getTrackMeta(uid);
    if (!meta) return;

    /* Удалить blob */
    await deleteAudio(uid);

    /* Сбросить cloud-статистику, НЕ трогать global stats */
    await updateTrackMeta(uid, {
      type: 'none',
      quality: null,
      size: 0,
      cloudFullListenCount: 0,
      lastFullListenAt: null,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      pinnedAt: null,
      needsReCache: false,
      expiredPending: false
      /* globalFullListenCount и globalListenSeconds остаются */
    });

    this.queue.cancel(uid);
    emit('offline:stateChanged');
  }

  /* ─── removeAllCached (ТЗ П.8.6) ─── */

  async removeAllCached() {
    const metas = await getAllTrackMetas();
    let count = 0;
    let totalSize = 0;

    for (const m of metas) {
      if (m.type === 'pinned' || m.type === 'cloud') {
        await deleteAudio(m.uid);
        totalSize += m.size || 0;
        await updateTrackMeta(m.uid, {
          type: 'none',
          quality: null,
          size: 0,
          cloudFullListenCount: 0,
          lastFullListenAt: null,
          cloudAddedAt: null,
          cloudExpiresAt: null,
          pinnedAt: null,
          needsReCache: false,
          expiredPending: false
        });
        count++;
      }
    }

    this.queue.clear();
    emit('offline:stateChanged');
    return { count, totalSize };
  }

  /**
   * Алиас для PlayerCore / offline-modal.
   */
  async removeAllPinnedAndCloud() {
    return this.removeAllCached();
  }

  /* ─── TTL cleanup (ТЗ П.5.6) ─── */

  async _cleanExpiredCloud() {
    const mode = this.getMode();
    const metas = await getAllTrackMetas();
    const now = Date.now();
    const expired = [];

    for (const m of metas) {
      if (m.type !== 'cloud') continue;
      if (!m.cloudExpiresAt) continue;
      if (m.cloudExpiresAt >= now) continue;

      if (mode === 'R3') {
        /* ТЗ П.5.6: В R3 не удаляем, помечаем expiredPending */
        await updateTrackMeta(m.uid, { expiredPending: true });
        continue;
      }

      expired.push(m);
    }

    for (const m of expired) {
      await deleteAudio(m.uid);
      await updateTrackMeta(m.uid, {
        type: 'none',
        quality: null,
        size: 0,
        cloudFullListenCount: 0,
        lastFullListenAt: null,
        cloudAddedAt: null,
        cloudExpiresAt: null,
        needsReCache: false,
        expiredPending: false
      });

      const trackData = getTrackData(m.uid);
      const title = trackData?.title || m.uid;
      toast(`Офлайн-доступ истёк. Трек «${title}» удалён из кэша.`);
    }

    if (expired.length > 0) emit('offline:stateChanged');
    return expired.length;
  }

  /* ─── cleanExpiredPending — при выходе из R3 (ТЗ П.5.6) ─── */

  async cleanExpiredPending() {
    const metas = await getAllTrackMetas();
    let count = 0;

    for (const m of metas) {
      if (!m.expiredPending) continue;

      await deleteAudio(m.uid);
      await updateTrackMeta(m.uid, {
        type: 'none',
        quality: null,
        size: 0,
        cloudFullListenCount: 0,
        lastFullListenAt: null,
        cloudAddedAt: null,
        cloudExpiresAt: null,
        needsReCache: false,
        expiredPending: false
      });

      const trackData = getTrackData(m.uid);
      const title = trackData?.title || m.uid;
      toast(`Офлайн-доступ истёк. Трек «${title}» удалён из кэша.`);
      count++;
    }

    if (count > 0) emit('offline:stateChanged');
    return count;
  }

  /* ─── Re-cache (ТЗ П.3.2, П.3.3) ─── */

  /**
   * Тихая фоновая замена — одна за одной (ТЗ П.3.2)
   */
  async startSilentReCache() {
    const quality = this.getCacheQuality();
    const metas = await getAllTrackMetas();
    const curUid = window.playerCore?.getCurrentTrackUid?.();

    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      if (!m.needsReCache) continue;
      if (m.uid === curUid) continue; /* CUR пропускается */

      const url = getTrackUrl(m.uid, quality);
      if (!url) continue;

      const priority = m.type === 'pinned' ? 4 : 3;
      this.queue.enqueue({ uid: m.uid, url, quality, kind: 'reCache', priority });
    }
  }

  /**
   * Принудительный ускоренный Re-cache (ТЗ П.3.3)
   * Возвращает { total, onProgress(done, total) }
   */
  async startForceReCache(onProgress) {
    const quality = this.getCacheQuality();
    const metas = await getAllTrackMetas();
    const curUid = window.playerCore?.getCurrentTrackUid?.();

    const toReCache = metas.filter(m =>
      (m.type === 'pinned' || m.type === 'cloud') &&
      m.needsReCache &&
      m.uid !== curUid
    );

    if (toReCache.length === 0) return { total: 0 };

    /* Ускоренный режим: 2-3 параллельных загрузки */
    const savedParallel = this.queue._maxParallel;
    this.queue.setMaxParallel(3);

    let done = 0;
    const total = toReCache.length;

    const unsub = this.on('trackCached', ({ uid }) => {
      if (toReCache.some(t => t.uid === uid)) {
        done++;
        if (onProgress) onProgress(done, total);
      }
      if (done >= total) {
        this.queue.setMaxParallel(savedParallel);
        unsub();
      }
    });

    for (const m of toReCache) {
      const url = getTrackUrl(m.uid, quality);
      if (!url) { done++; continue; }
      this.queue.enqueue({ uid: m.uid, url, quality, kind: 'reCache', priority: 4 });
    }

    return { total };
  }

  /**
   * Сколько файлов нуждаются в re-cache (для UI)
   */
  async getReCacheCount() {
    const metas = await getAllTrackMetas();
    return metas.filter(m =>
      (m.type === 'pinned' || m.type === 'cloud') && m.needsReCache
    ).length;
  }

  /* ─── getCacheSummary (для OFFLINE modal) ─── */

  async getCacheSummary() {
    const metas = await getAllTrackMetas();
    let pinnedCount = 0, pinnedSize = 0;
    let cloudCount = 0, cloudSize = 0;
    let dynamicCount = 0, dynamicSize = 0;
    let reCacheCount = 0;

    for (const m of metas) {
      const sz = m.size || 0;
      if (m.type === 'pinned') { pinnedCount++; pinnedSize += sz; }
      else if (m.type === 'cloud') { cloudCount++; cloudSize += sz; }
      else if (m.type === 'dynamic' || m.type === 'playbackCache') {
        dynamicCount++; dynamicSize += sz;
      }
      if ((m.type === 'pinned' || m.type === 'cloud') && m.needsReCache) {
        reCacheCount++;
      }
    }

    const est = await estimateUsage().catch(() => ({ used: 0, quota: 0, free: 0 }));

    return {
      pinned: { count: pinnedCount, size: pinnedSize },
      cloud: { count: cloudCount, size: cloudSize },
      dynamic: { count: dynamicCount, size: dynamicSize },
      total: {
        count: pinnedCount + cloudCount + dynamicCount,
        size: pinnedSize + cloudSize + dynamicSize
      },
      reCacheCount,
      storage: {
        used: est.used || 0,
        quota: est.quota || 0,
        free: est.free || 0
      },
      quality: this.getCacheQuality(),
      mode: this.getMode(),
      cloudN: this.getCloudN(),
      cloudD: this.getCloudD(),
      spaceOk: this._spaceOk
    };
  }

  /**
   * Мост для offline-modal: getCacheStats() → getCacheSummary()
   */
  async getCacheStats() {
    return this.getCacheSummary();
  }

  /* ─── getCacheList (для «Список 🔒/☁» в OFFLINE modal, ТЗ П.8.5) ─── */

  async getCacheList() {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    const pinnedList = [];
    const cloudList = [];

    for (const m of metas) {
      const trackData = getTrackData(m.uid);
      const title = trackData?.title || m.uid;

      if (m.type === 'pinned') {
        pinnedList.push({
          uid: m.uid,
          title,
          type: 'pinned',
          quality: m.quality || '?',
          size: m.size || 0,
          pinnedAt: m.pinnedAt || 0,
          label: 'Закреплён'
        });
      } else if (m.type === 'cloud') {
        const daysLeft = m.cloudExpiresAt
          ? Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY_MS))
          : 0;
        cloudList.push({
          uid: m.uid,
          title,
          type: 'cloud',
          quality: m.quality || '?',
          size: m.size || 0,
          cloudExpiresAt: m.cloudExpiresAt || 0,
          daysLeft,
          label: `Осталось ${daysLeft} дн.`
        });
      }
    }

    /* ТЗ П.8.5: Pinned в порядке добавления, Cloud по cloudExpiresAt DESC */
    pinnedList.sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
    cloudList.sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));

    return [...pinnedList, ...cloudList];
  }

  /* ─── getGlobalStatistics (для statistics-modal) ─── */

  async getGlobalStatistics() {
    const metas = await getAllTrackMetas();
    let totalListens = 0;
    let totalSeconds = 0;
    let totalCloudListens = 0;
    const perTrack = [];

    for (const m of metas) {
      totalListens += m.globalFullListenCount || 0;
      totalSeconds += m.globalListenSeconds || 0;
      totalCloudListens += m.cloudFullListenCount || 0;

      if ((m.globalFullListenCount || 0) > 0) {
        const trackData = getTrackData(m.uid);
        perTrack.push({
          uid: m.uid,
          title: trackData?.title || m.uid,
          listens: m.globalFullListenCount || 0,
          seconds: m.globalListenSeconds || 0,
          cloudListens: m.cloudFullListenCount || 0,
          type: m.type || 'none'
        });
      }
    }

    perTrack.sort((a, b) => b.listens - a.listens);

    return {
      totalListens,
      totalSeconds,
      totalCloudListens,
      tracksWithListens: perTrack.length,
      topTracks: perTrack.slice(0, 20),
      allTracks: perTrack
    };
  }

  /* ─── resolveTrackSource (ТЗ П.6.1) ─── */

  async resolveTrackSource(uid, trackData = {}) {
    const quality = this.getCacheQuality();

    /* 1. Локальная копия в текущем качестве */
    const exact = await getAudioBlob(uid, quality);
    if (exact) {
      return {
        source: 'local',
        blob: exact,
        quality,
        needsReCache: false
      };
    }

    /* 2. Локальная копия в другом качестве */
    const any = await getAudioBlobAny(uid);
    if (any) {
      /* Пометить needsReCache */
      await updateTrackMeta(uid, { needsReCache: true });
      return {
        source: 'local',
        blob: any.blob,
        quality: any.quality,
        needsReCache: true
      };
    }

    /* 3. Стриминг с GitHub */
    const q = quality;
    const url = (q === 'lo')
      ? (trackData.audio_low || trackData.audio || trackData.src || null)
      : (trackData.audio || trackData.src || null);

    if (url && navigator.onLine) {
      return {
        source: 'stream',
        url,
        quality: q,
        needsReCache: false
      };
    }

    /* 4. Нет ни копии, ни сети */
    return {
      source: 'unavailable',
      url: null,
      quality: null,
      needsReCache: false
    };
  }

  /* ─── Download Queue status ─── */

  getDownloadStatus() {
    return this.queue.getStatus();
  }

  isDownloading(uid) {
    return this.queue.isDownloading(uid);
  }

  cancelDownload(uid) {
    this.queue.cancel(uid);
  }

  pauseDownloads() { this.queue.pause(); }
  resumeDownloads() { this.queue.resume(); }
}

/* ═══════ Singleton ═══════ */

let _instance = null;

/**
 * Получить (и при необходимости создать) синглтон OfflineManager.
 * Импорт: import offlineManager, { getOfflineManager } from './offline-manager.js'
 */
export function getOfflineManager() {
  if (!_instance) {
    _instance = new OfflineManager();
  }
  return _instance;
}

/* Default export — тот же синглтон */
const offlineManager = getOfflineManager();
export default offlineManager;

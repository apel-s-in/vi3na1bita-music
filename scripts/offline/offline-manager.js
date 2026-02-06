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
const MIN_SPACE_MB = 60;           // ТЗ П.2
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_N = 5;               // ТЗ П.5.1
const DEFAULT_D = 31;              // ТЗ П.5.1

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
    this._active = new Map();  // uid -> { ctrl, quality, kind }
    this._paused = false;
    this._maxParallel = 1;     // default; re-cache sets 2-3
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

      if (!this._active.has(item.uid)) return; // cancelled

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
    this._spaceOk = true;   // cached result of hasSpace
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

    /* ТЗ П.5.6: При выходе из R3 — удалить expiredPending */
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
   * ТЗ П.5.7 — Пересчёт при «Применить».
   */
  async previewCloudSettings(newN, newD) {
    const oldN = this.getCloudN();
    const metas = await getAllTrackMetas();
    const cloudTracks = metas.filter(m => m.type === 'cloud');
    const now = Date.now();
    const warnings = [];
    const toRemove = [];

    for (const m of cloudTracks) {
      /* ТЗ П.5.7: cloudExpiresAt = lastFullListenAt + новый_D дней */
      const base = m.lastFullListenAt || m.cloudAddedAt || now;
      const newExpires = base + newD * DAY_MS;

      if (newExpires <= now) {
        toRemove.push(m.uid);
      } else if (newN > oldN && (m.cloudFullListenCount || 0) < newN) {
        /* ТЗ П.5.7: При N↑ треки с count < newN теряют cloud-статус */
        toRemove.push(m.uid);
      }
    }

    if (toRemove.length > 0) {
      warnings.push(`${toRemove.length} облачных трек(ов) будут удалены из кэша.`);
    }

    /* Промоушн: N↓ может дать новые ☁ */
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

    /* Удалить */
    for (const uid of (toRemove || [])) {
      await this.removeCached(uid);
    }

    /* Промоушн (N↓) */
    for (const uid of (toPromote || [])) {
      const meta = (await getTrackMeta(uid)) || {};
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

    /* Пересчитать cloudExpiresAt для оставшихся — ТЗ: от lastFullListenAt */
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
      this._spaceOk = true; // assume ok if can't check
    }
  }

  async hasSpace(needed = 0) {
    try {
      const est = await estimateUsage();
      this._spaceOk = est.free > (MIN_SPACE_MB * MB + needed);
      return this._spaceOk;
    } catch { return true; }
  }

  /** Синхронная проверка из последнего кэша (для индикаторов) */
  isSpaceOk() { return this._spaceOk; }

  /* ─── togglePinned (ТЗ П.4.2–П.4.4) ─── */

  async togglePinned(uid) {
    const meta = (await getTrackMeta(uid)) || {};
    const quality = this.getCacheQuality();

    if (meta.type === 'pinned') {
      /* ═══ Снять пиннинг → становится ☁ cloud (ТЗ П.4.4, П.5.4) ═══ */
      const now = Date.now();
      const D = this.getCloudD();
      await updateTrackMeta(uid, {
        type: 'cloud',
        pinnedAt: null,
        cloudAddedAt: now,
        cloudExpiresAt: now + D * DAY_MS
        /* ТЗ П.5.4: cloudFullListenCount НЕ модифицируется — оставляем как есть */
      });
      toast('Офлайн-закрепление снято. Трек доступен как ☁ на ' + D + ' дней.');
      emit('offline:stateChanged');
      return 'cloud';
    }

    if (meta.type === 'cloud') {
      /* ═══ Cloud → Pin (ТЗ П.5.5 пункт 1: cloud-статистика НЕ сбрасывается) ═══ */
      await updateTrackMeta(uid, {
        type: 'pinned',
        pinnedAt: Date.now(),
        expiredPending: false
        /* НЕ трогаем: cloudFullListenCount, lastFullListenAt, cloudAddedAt, cloudExpiresAt */
      });

      /* Проверим, нужно ли скачать blob в нужном качестве */
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

    /* ═══ Новый пиннинг (type=none или нет меты) — ТЗ П.4.3 ═══ */
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

    /* Если blob уже есть (от предыдущего cloud), скачивание не нужно — ТЗ П.4.3 */
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

  /* ─── registerFullListen (ТЗ П.5.2, П.5.3) ─── */

  /**
   * Вызывается при каждом полном прослушивании (>90% длительности).
   * Обновляет cloud-статистику для ВСЕХ треков (не только cloud).
   * Если порог N достигнут — автоматически присваивает ☁.
   */
  async registerFullListen(uid, { duration = 0, position = 0 } = {}) {
    if (!uid) return;

    /* ТЗ П.5.2: Full listen = прогресс > 90% и duration валидна */
    if (duration > 0 && position > 0 && (position / duration) < 0.9) return;

    const now = Date.now();
    const meta = (await getTrackMeta(uid)) || {};
    const D = this.getCloudD();
    const N = this.getCloudN();

    /* ═══ Инкремент cloud-статистики (для ВСЕХ треков — ТЗ П.5.2) ═══ */
    const newCount = (meta.cloudFullListenCount || 0) + 1;
    const updates = {
      cloudFullListenCount: newCount,
      lastFullListenAt: now,
      /* Global stats — инкрементируем тоже */
      globalFullListenCount: (meta.globalFullListenCount || 0) + 1,
      globalListenSeconds: (meta.globalListenSeconds || 0) + (duration || 0)
    };

    /* ═══ Продление TTL для существующих ☁ (ТЗ П.5.6) ═══ */
    if (meta.type === 'cloud') {
      updates.cloudExpiresAt = now + D * DAY_MS;
    }

    /* ═══ Автоматическое появление ☁ (ТЗ П.5.3) ═══ */
    if (meta.type !== 'pinned' && meta.type !== 'cloud' && newCount >= N) {
      const hasBlob = await hasAudioForUid(uid);

      if (this.getMode() === 'R3' && hasBlob) {
        /* ТЗ П.5.3: В R3 файл уже локальный — просто присваиваем статус */
        updates.type = 'cloud';
        updates.cloudAddedAt = now;
        updates.cloudExpiresAt = now + D * DAY_MS;
        updates.quality = this.getCacheQuality();
      } else if (await this.hasSpace()) {
        /* Обычный режим: ставим cloud, запускаем скачивание */
        updates.type = 'cloud';
        updates.cloudAddedAt = now;
        updates.cloudExpiresAt = now + D * DAY_MS;
        updates.quality = this.getCacheQuality();

        if (!hasBlob) {
          /* Скачивание — иконка ☁ появится ПОСЛЕ 100% загрузки (ТЗ П.5.3) */
          this.enqueueForCloud(uid);
        }
      }
      /* Если нет места — ТЗ П.2: счётчик считается, но файл не скачивается */
    }

    /* Гарантируем что мета существует */
    if (!meta.uid) {
      await setTrackMeta(uid, {
        uid,
        type: updates.type || 'none',
        pinnedAt: null,
        quality: updates.quality || null,
        size: 0,
        cloudAddedAt: updates.cloudAddedAt || null,
        cloudExpiresAt: updates.cloudExpiresAt || null,
        cloudFullListenCount: updates.cloudFullListenCount || newCount,
        lastFullListenAt: now,
        needsReCache: false,
        expiredPending: false,
        globalFullListenCount: updates.globalFullListenCount || 1,
        globalListenSeconds: updates.globalListenSeconds || (duration || 0)
      });
    } else {
      await updateTrackMeta(uid, updates);
    }

    emit('offline:stateChanged');
  }

  /* ─── removeCached (ТЗ П.5.5 пункт 2) ─── */

  /**
   * Удалить трек из кэша и сбросить cloud-статистику.
   * Global stats НЕ трогается.
   */
  async removeCached(uid) {
    if (!uid) return;

    /* Отменить любые текущие загрузки */
    this.queue.cancel(uid);

    /* Удалить аудио blob */
    try { await deleteAudio(uid, 'hi'); } catch {}
    try { await deleteAudio(uid, 'lo'); } catch {}

    /* Сбросить cloud-статистику, сохранить global stats (ТЗ П.5.5) */
    const meta = (await getTrackMeta(uid)) || {};
    await updateTrackMeta(uid, {
      type: 'none',
      pinnedAt: null,
      quality: null,
      size: 0,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      cloudFullListenCount: 0,
      lastFullListenAt: null,
      needsReCache: false,
      expiredPending: false
      /* globalFullListenCount и globalListenSeconds НЕ трогаем */
    });

    emit('offline:stateChanged');
  }

  /* ─── removeAllCached (ТЗ П.8.6) ─── */

  async removeAllCached() {
    const metas = await getAllTrackMetas();
    let count = 0;
    let totalSize = 0;

    for (const m of metas) {
      if (m.type === 'pinned' || m.type === 'cloud') {
        totalSize += m.size || 0;
        await this.removeCached(m.uid);
        count++;
      }
    }

    this.queue.clear();
    toast(`Удалено ${count} офлайн-треков (${(totalSize / MB).toFixed(1)} МБ).`);
    emit('offline:stateChanged');
  }

  /* ─── getTrackOfflineState (ТЗ П.7.2) ─── */

  /**
   * Возвращает визуальное состояние трека для индикатора.
   *
   * Возвращаемые значения cacheKind:
   *   'none'              — серый 🔒 (opacity 0.4 или 0.2 если нет места)
   *   'pinned'            — жёлтый 🔒 (загружен 100%)
   *   'pinned_downloading' — жёлтый 🔒 мигающий
   *   'cloud'             — голубой ☁ (cloud=true И cachedComplete=100%)
   *   'cloud_downloading'  — серый 🔒 (ТЗ П.7.2: Cloud, загружается = серый)
   */
  async getTrackOfflineState(uid) {
    const meta = (await getTrackMeta(uid)) || {};
    const isDownloading = this.queue.isDownloading(uid);
    const hasBlob = await hasAudioForUid(uid);
    const quality = this.getCacheQuality();
    const spaceOk = this.isSpaceOk();

    /* Pinned */
    if (meta.type === 'pinned') {
      if (isDownloading || !hasBlob) {
        return {
          cacheKind: 'pinned_downloading',
          quality: meta.quality || quality,
          size: meta.size || 0,
          needsReCache: meta.needsReCache || false
        };
      }
      return {
        cacheKind: 'pinned',
        quality: meta.quality || quality,
        size: meta.size || 0,
        needsReCache: meta.needsReCache || false
      };
    }

    /* Cloud */
    if (meta.type === 'cloud') {
      /* ТЗ П.7.2: ☁ отображается ТОЛЬКО при cloud=true И cachedComplete=100% */
      if (isDownloading || !hasBlob) {
        return {
          cacheKind: 'cloud_downloading',  /* → серый 🔒 в UI */
          quality: meta.quality || quality,
          size: meta.size || 0,
          needsReCache: meta.needsReCache || false,
          cloudExpiresAt: meta.cloudExpiresAt,
          cloudFullListenCount: meta.cloudFullListenCount || 0
        };
      }
      return {
        cacheKind: 'cloud',
        quality: meta.quality || quality,
        size: meta.size || 0,
        needsReCache: meta.needsReCache || false,
        cloudExpiresAt: meta.cloudExpiresAt,
        cloudFullListenCount: meta.cloudFullListenCount || 0
      };
    }

    /* None */
    return {
      cacheKind: 'none',
      spaceOk,
      quality: null,
      size: 0,
      cloudFullListenCount: meta.cloudFullListenCount || 0
    };
  }

  /* ─── Re-cache (ТЗ П.3.2, П.3.3, П.8.3) ─── */

  /**
   * Получить список файлов, нуждающихся в перекэшировании.
   */
  async getReCacheList() {
    const metas = await getAllTrackMetas();
    const quality = this.getCacheQuality();
    return metas.filter(m =>
      (m.type === 'pinned' || m.type === 'cloud') &&
      (m.needsReCache || (m.quality && m.quality !== quality))
    );
  }

  /**
   * Запуск тихой фоновой замены (после смены качества).
   * По одному файлу за раз (ТЗ §5.2).
   */
  async startSilentReCache() {
    const list = await this.getReCacheList();
    const quality = this.getCacheQuality();
    const curUid = this._getCurrentPlayingUid();

    this.queue.setMaxParallel(1); /* тихий = по одному */

    for (const m of list) {
      if (m.uid === curUid) continue; /* CUR пропускается */
      const url = getTrackUrl(m.uid, quality);
      if (!url) continue;

      const priority = m.type === 'pinned' ? 4 : 3;
      this.queue.enqueue({ uid: m.uid, url, quality, kind: 're-cache', priority });
    }
  }

  /**
   * Запуск принудительного перекэширования (кнопка Re-cache в OFFLINE modal).
   * ТЗ П.8.3: 2-3 параллельных загрузки.
   */
  async startForcedReCache() {
    const list = await this.getReCacheList();
    if (list.length === 0) return { total: 0 };

    const quality = this.getCacheQuality();
    const curUid = this._getCurrentPlayingUid();

    this.queue.setMaxParallel(3); /* ускоренный */

    let queued = 0;
    for (const m of list) {
      if (m.uid === curUid) continue;
      const url = getTrackUrl(m.uid, quality);
      if (!url) continue;

      const priority = m.type === 'pinned' ? 4 : 3;
      this.queue.enqueue({ uid: m.uid, url, quality, kind: 're-cache', priority });
      queued++;
    }

    emit('offline:reCacheStarted', { total: queued });
    return { total: queued, skippedCur: list.some(m => m.uid === curUid) };
  }

  /**
   * Отмена принудительного перекэширования.
   */
  cancelReCache() {
    /* Убираем все re-cache задачи из очереди */
    this.queue._queue = this.queue._queue.filter(i => i.kind !== 're-cache');
    this.queue.setMaxParallel(1);
    emit('offline:reCacheCancelled');
  }

  _getCurrentPlayingUid() {
    /* Пытаемся получить uid текущего играющего трека */
    return window.playerCore?.currentTrack?.uid ||
           window.playerCore?._currentUid ||
           null;
  }

  /* ─── TTL Cleanup (ТЗ П.5.6) ─── */

  /**
   * Проверяется при старте приложения.
   * Удаляет cloud-треки с истёкшим TTL (кроме R3).
   */
  async _cleanExpiredCloud() {
    const now = Date.now();
    const mode = this.getMode();
    const metas = await getAllTrackMetas();

    for (const m of metas) {
      if (m.type !== 'cloud') continue;
      if (!m.cloudExpiresAt) continue;
      if (m.cloudExpiresAt >= now) continue;

      /* TTL истёк */
      if (mode === 'R3') {
        /* ТЗ П.5.6: В R3 не удаляем, помечаем expiredPending */
        await updateTrackMeta(m.uid, { expiredPending: true });
        continue;
      }

      /* Удаляем + toast (ТЗ П.5.6) */
      const trackData = getTrackData(m.uid);
      const title = trackData?.title || m.uid;
      await this.removeCached(m.uid);
      toast(`Офлайн-доступ истёк. Трек «${title}» удалён из кэша.`);
    }
  }

  /**
   * ТЗ П.5.6: При выходе из R3 — удалить все expiredPending.
   */
  async cleanExpiredPending() {
    const metas = await getAllTrackMetas();

    for (const m of metas) {
      if (!m.expiredPending) continue;

      const trackData = getTrackData(m.uid);
      const title = trackData?.title || m.uid;
      await this.removeCached(m.uid);
      toast(`Офлайн-доступ истёк. Трек «${title}» удалён из кэша.`);
    }
  }

  /* ─── Списки для UI (ТЗ П.8.5) ─── */

  /**
   * Возвращает список всех 🔒/☁ треков для отображения в OFFLINE modal.
   * Порядок: pinned (по pinnedAt ASC), cloud (по cloudExpiresAt DESC).
   */
  async getCachedTrackList() {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    const result = [];

    const pinned = metas
      .filter(m => m.type === 'pinned')
      .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));

    const cloud = metas
      .filter(m => m.type === 'cloud')
      .sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));

    for (const m of [...pinned, ...cloud]) {
      const trackData = getTrackData(m.uid);
      const daysLeft = m.cloudExpiresAt
        ? Math.max(0, Math.ceil((m.cloudExpiresAt - now) / DAY_MS))
        : null;

      result.push({
        uid: m.uid,
        type: m.type,
        title: trackData?.title || m.uid,
        album: trackData?.album || '',
        quality: m.quality || '?',
        size: m.size || 0,
        sizeMB: ((m.size || 0) / MB).toFixed(1),
        daysLeft: m.type === 'cloud' ? daysLeft : null,
        label: m.type === 'pinned' ? 'Закреплён' : `Осталось ${daysLeft} дн.`,
        needsReCache: m.needsReCache || false,
        cloudFullListenCount: m.cloudFullListenCount || 0
      });
    }

    return result;
  }

  /**
   * Итого по 🔒/☁ для секции «Хранилище».
   */
  async getCacheSummary() {
    const metas = await getAllTrackMetas();
    let pinnedCount = 0, pinnedSize = 0;
    let cloudCount = 0, cloudSize = 0;
    let needsReCacheCount = 0;

    for (const m of metas) {
      if (m.type === 'pinned') {
        pinnedCount++;
        pinnedSize += m.size || 0;
      } else if (m.type === 'cloud') {
        cloudCount++;
        cloudSize += m.size || 0;
      }
      if ((m.type === 'pinned' || m.type === 'cloud') &&
          (m.needsReCache || (m.quality && m.quality !== this.getCacheQuality()))) {
        needsReCacheCount++;
      }
    }

    return {
      pinnedCount, pinnedSize, pinnedSizeMB: (pinnedSize / MB).toFixed(1),
      cloudCount, cloudSize, cloudSizeMB: (cloudSize / MB).toFixed(1),
      totalCount: pinnedCount + cloudCount,
      totalSize: pinnedSize + cloudSize,
      totalSizeMB: ((pinnedSize + cloudSize) / MB).toFixed(1),
      needsReCacheCount,
      spaceOk: this.isSpaceOk()
    };
  }

  /* ─── Download Queue status ─── */

  getDownloadStatus() {
    return this.queue.getStatus();
  }

  /* ─── Storage estimate ─── */

  async getStorageEstimate() {
    return estimateUsage();
  }

  /* ─── Resolve: приоритет локальной копии (ТЗ П.6.1) ─── */

  /**
   * Попытаться получить blob URL для трека из кэша.
   * Если blob есть — возвращает { blobUrl, quality, needsReCache }.
   * Если нет — возвращает null (caller должен использовать стриминг).
   */
  async resolveLocalBlob(uid) {
    if (!uid) return null;

    const meta = (await getTrackMeta(uid)) || {};
    if (meta.type !== 'pinned' && meta.type !== 'cloud') return null;

    const preferredQ = this.getCacheQuality();

    /* 1. Попытка в текущем качестве */
    const exact = await getAudioBlob(uid, preferredQ);
    if (exact) {
      const url = URL.createObjectURL(exact);
      return { blobUrl: url, quality: preferredQ, needsReCache: false };
    }

    /* 2. Fallback: другое качество (ТЗ П.6.1 шаг 2) */
    const other = preferredQ === 'hi' ? 'lo' : 'hi';
    const fallback = await getAudioBlob(uid, other);
    if (fallback) {
      const url = URL.createObjectURL(fallback);
      /* Пометить needsReCache */
      await updateTrackMeta(uid, { needsReCache: true });
      return { blobUrl: url, quality: other, needsReCache: true };
    }

    return null;
  }

  /* ─── Diagnostic / Debug ─── */

  async getFullState() {
    const metas = await getAllTrackMetas();
    return {
      mode: this.getMode(),
      quality: this.getCacheQuality(),
      cloudN: this.getCloudN(),
      cloudD: this.getCloudD(),
      netPolicy: this.getNetPolicy(),
      spaceOk: this.isSpaceOk(),
      queue: this.queue.getStatus(),
      tracks: metas
    };
  }
}

/* ═══════ Singleton ═══════ */

const offlineManager = new OfflineManager();
export default offlineManager;

/* ═══════ Обработчики событий Download Queue → meta update ═══════ */

window.addEventListener('offline:trackCached', async (e) => {
  const { uid, quality, size } = e.detail;
  const meta = (await getTrackMeta(uid)) || {};

  /* Если это re-cache — удалить старый blob другого качества */
  if (meta.quality && meta.quality !== quality) {
    try { await deleteAudio(uid, meta.quality); } catch {}
  }

  await updateTrackMeta(uid, {
    quality,
    size,
    needsReCache: false
  });

  emit('offline:stateChanged');
});

/* ═══════ Обработчик online/offline ═══════ */

window.addEventListener('online', () => {
  offlineManager.queue.resume();
});

window.addEventListener('offline', () => {
  offlineManager.queue.pause();
});


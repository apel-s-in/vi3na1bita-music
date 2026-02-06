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
  estimateUsage, deleteTrackCache
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

/* ═══════ Presets ═══════ */

const PRESETS = {
  conservative: { name: 'conservative', label: 'Экономный', parallel: 1, delayMs: 2000 },
  balanced: { name: 'balanced', label: 'Сбалансированный', parallel: 2, delayMs: 500 },
  aggressive: { name: 'aggressive', label: 'Быстрый', parallel: 3, delayMs: 100 }
};

/* ═══════ DownloadQueue ═══════ */

class DownloadQueue {
  constructor() {
    this._queue = [];
    this._active = null;
    this._paused = false;
  }

  enqueue({ uid, url, quality, kind = 'cloud', priority = 0 }) {
    if (!uid || !url) return;
    if (this._active?.uid === uid) return;
    if (this._queue.some(i => i.uid === uid)) return;
    this._queue.push({ uid, url, quality: normQ(quality), kind, priority, retries: 0 });
    this._queue.sort((a, b) => b.priority - a.priority);
    this._processNext();
  }

  cancel(uid) {
    this._queue = this._queue.filter(i => i.uid !== uid);
    if (this._active?.uid === uid) {
      this._active.ctrl.abort();
      this._active = null;
      this._processNext();
    }
  }

  cancelMismatchedQuality(targetQuality) {
    const q = normQ(targetQuality);
    this._queue = this._queue.filter(i => i.quality === q);
    if (this._active && this._active.quality !== q) {
      this._active.ctrl.abort();
      this._active = null;
    }
    this._processNext();
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._processNext(); }
  clear() {
    if (this._active) { this._active.ctrl.abort(); this._active = null; }
    this._queue = [];
  }

  isDownloading(uid) {
    return this._active?.uid === uid || this._queue.some(i => i.uid === uid);
  }

  getStatus() {
    return {
      queued: this._queue.length,
      active: this._active ? 1 : 0,
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

      if (this._active?.uid !== item.uid) return;

      await setAudioBlob(item.uid, item.quality, blob);

      await updateTrackMeta(item.uid, {
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

    /* ТЗ П.5.6: При выходе из R3 — удалить expiredPending треки */
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
    this.onQualityChanged(val);
    emit('offline:uiChanged');
  }

  getActivePlaybackQuality() {
    return this.getCacheQuality();
  }

  async onQualityChanged(newQuality) {
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
      toast(`Качество изменено → ${q}. ${count} трек(ов) нужно перекачать.`);
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

  /* ─── Cloud N / D ─── */

  getCloudN() {
    return parseInt(localStorage.getItem(CLOUD_N_KEY), 10) || 3;
  }

  getCloudD() {
    return parseInt(localStorage.getItem(CLOUD_D_KEY), 10) || 30;
  }

  setCloudN(n) {
    localStorage.setItem(CLOUD_N_KEY, String(Math.max(1, n | 0)));
  }

  setCloudD(d) {
    localStorage.setItem(CLOUD_D_KEY, String(Math.max(1, d | 0)));
  }

  /**
   * ТЗ П.5.7 — Пересчёт при «Применить».
   * Возвращает { toRemove: uid[], toPromote: uid[], warnings: string[] }
   * Не применяет сразу — вызывающий код показывает предупреждение,
   * потом вызывает confirmApplyCloudSettings(result).
   */
  async previewCloudSettings(newN, newD) {
    const oldN = this.getCloudN();
    const oldD = this.getCloudD();
    const metas = await getAllTrackMetas();

    const cloudTracks = metas.filter(m => m.type === 'cloud');
    const now = Date.now();
    const warnings = [];
    const toRemove = [];
    const toKeep = [];

    for (const m of cloudTracks) {
      const newExpires = (m.cloudAddedAt || now) + newD * DAY_MS;
      const listenOk = (m.cloudFullListenCount || 0) >= newN;

      if (newExpires <= now) {
        /* TTL истёк по новым правилам */
        toRemove.push(m.uid);
      } else if (newN > oldN && !listenOk) {
        /* N увеличили — трек ещё не набрал новый порог */
        toKeep.push(m.uid); /* остаётся, просто не «зрелый» ещё */
      } else {
        toKeep.push(m.uid);
      }
    }

    if (toRemove.length > 0) {
      warnings.push(`${toRemove.length} облачных трек(ов) будут удалены (TTL истёк по новым правилам).`);
    }
    if (newN > oldN) {
      const affected = cloudTracks.filter(m => (m.cloudFullListenCount || 0) < newN && (m.cloudFullListenCount || 0) >= oldN);
      if (affected.length > 0) {
        warnings.push(`${affected.length} трек(ов) ещё не набрали ${newN} прослушиваний — останутся в облаке, но не будут считаться «зрелыми».`);
      }
    }
    if (newD < oldD) {
      warnings.push(`TTL уменьшен: ${oldD}→${newD} дн. Некоторые треки могут истечь раньше.`);
    }

    return { toRemove, toKeep, warnings, newN, newD };
  }

  async confirmApplyCloudSettings({ toRemove, newN, newD }) {
    this.setCloudN(newN);
    this.setCloudD(newD);

    for (const uid of toRemove) {
      await this.removeCached(uid);
    }

    /* Пересчитать cloudExpiresAt для оставшихся */
    const metas = await getAllTrackMetas();
    for (const m of metas) {
      if (m.type === 'cloud' && m.cloudAddedAt) {
        const newExpires = m.cloudAddedAt + newD * DAY_MS;
        await updateTrackMeta(m.uid, { cloudExpiresAt: newExpires });
      }
    }

    emit('offline:stateChanged');
    toast(`Настройки облака применены: N=${newN}, D=${newD}. Удалено: ${toRemove.length}.`);
  }

  /* ─── Preset ─── */

  getPreset() {
    return localStorage.getItem(PRESET_KEY) || 'balanced';
  }

  setPreset(name) {
    if (!PRESETS[name]) return;
    localStorage.setItem(PRESET_KEY, name);
    emit('offline:uiChanged');
  }

  /* ─── Space check ─── */

  async hasSpace(needed = 10 * MB) {
    try {
      const est = await estimateUsage();
      return est.free > needed + MIN_SPACE_MB * MB;
    } catch { return true; }
  }

  /* ─── togglePinned (ТЗ П.4.2–П.4.4) ─── */

  async togglePinned(uid) {
    const meta = (await getTrackMeta(uid)) || {};
    const quality = this.getCacheQuality();

    if (meta.type === 'pinned') {
      /* Снять пиннинг → становится ☁ cloud */
      const now = Date.now();
      const D = this.getCloudD();
      await updateTrackMeta(uid, {
        type: 'cloud',
        pinnedAt: null,
        cloudAddedAt: now,
        cloudExpiresAt: now + D * DAY_MS,
        cloudFullListenCount: 0,
        lastFullListenAt: null
      });
      toast('Трек откреплён → ☁');
      emit('offline:stateChanged');
      return 'cloud';
    }

    /* Если cloud → pin */
    if (meta.type === 'cloud') {
      await updateTrackMeta(uid, {
        type: 'pinned',
        pinnedAt: Date.now(),
        cloudAddedAt: null,
        cloudExpiresAt: null,
        cloudFullListenCount: null,
        lastFullListenAt: null,
        expiredPending: false
      });

      /* Проверим, есть ли blob нужного качества */
      const found = await getAudioBlobAny(uid, quality);
      if (found && found.quality === quality) {
        toast('Трек закреплён 🔒');
      } else {
        /* Нужно скачать / перекачать */
        const url = getTrackUrl(uid, quality);
        if (url) {
          this.queue.enqueue({ uid, url, quality, kind: 'pinned', priority: 5 });
          toast('Закрепляю и скачиваю 🔒...');
        } else {
          toast('Закреплён 🔒 (файл будет скачан при появлении сети)');
        }
      }
      emit('offline:stateChanged');
      return 'pinned';
    }

    /* Новый пиннинг (type=none или нет меты) */
    if (!(await this.hasSpace())) {
      toastWarn('Недостаточно места для кэширования');
      return 'none';
    }

    await setTrackMeta(uid, {
      uid,
      type: 'pinned',
      pinnedAt: Date.now(),
      quality,
      size: 0,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      cloudFullListenCount: null,
      lastFullListenAt: null,
      needsReCache: false,
      expiredPending: false,
      /* Сохраняем global stats если были */
      globalFullListenCount: meta.globalFullListenCount || 0,
      globalListenSeconds: meta.globalListenSeconds || 0
    });

    const url = getTrackUrl(uid, quality);
    if (url) {
      this.queue.enqueue({ uid, url, quality, kind: 'pinned', priority: 5 });
      toast('Скачиваю для офлайн 🔒...');
    } else {
      toast('Закреплён 🔒 (файл будет скачан при появлении сети)');
    }

    emit('offline:stateChanged');
    return 'pinned';
  }

  /* ─── Enqueue for download ─── */

  async enqueueAudioDownload(uid, { kind = 'cloud', priority = 0 } = {}) {
    const quality = this.getCacheQuality();
    const url = getTrackUrl(uid, quality);
    if (!url) return;
    if (!(await this.hasSpace())) return;
    this.queue.enqueue({ uid, url, quality, kind, priority });
  }

  /* ─── registerFullListen (ТЗ П.5.2–П.5.3) ─── */

  async registerFullListen(uid) {
    const meta = (await getTrackMeta(uid)) || {};
    const now = Date.now();
    const N = this.getCloudN();
    const D = this.getCloudD();
    const quality = this.getCacheQuality();

    /* Глобальная статистика прослушиваний */
    const globalCount = (meta.globalFullListenCount || 0) + 1;
    const patch = {
      globalFullListenCount: globalCount,
      lastFullListenAt: now
    };

    /* Cloud-логика: если трек уже cloud, инкрементируем cloudFullListenCount */
    if (meta.type === 'cloud') {
      patch.cloudFullListenCount = (meta.cloudFullListenCount || 0) + 1;
      patch.lastFullListenAt = now;
    }

    /* Авто-cloud при достижении N прослушиваний (П.5.2) */
    if (!meta.type || meta.type === 'none') {
      if (globalCount >= N) {
        /* Проверяем, есть ли место */
        if (await this.hasSpace()) {
          patch.type = 'cloud';
          patch.cloudAddedAt = now;
          patch.cloudExpiresAt = now + D * DAY_MS;
          patch.cloudFullListenCount = globalCount;
          patch.quality = quality;

          const url = getTrackUrl(uid, quality);
          if (url) {
            this.queue.enqueue({ uid, url, quality, kind: 'cloud', priority: 1 });
          }
          toast('Трек добавлен в облако ☁');
        }
      }
    }

    /* Обновить TTL для cloud-трека при прослушивании (П.5.3) */
    if (meta.type === 'cloud' || patch.type === 'cloud') {
      patch.cloudExpiresAt = now + D * DAY_MS;
      if (meta.expiredPending) {
        patch.expiredPending = false;
      }
    }

    await updateTrackMeta(uid, patch);
    emit('offline:stateChanged');
  }

  /* ─── removeCached (ТЗ П.5.5) — сбрасываем cloud, НЕ удаляем всю мету ─── */

  async removeCached(uid) {
    await deleteTrackCache(uid);
    await resetCloudStats(uid);
    emit('offline:stateChanged');
    this._emit('trackRemoved', { uid });
  }

  /* ─── Удалить всё 🔒/☁ (ТЗ П.8.6) ─── */

  async removeAllPinnedAndCloud() {
    const metas = await getAllTrackMetas();
    let count = 0;
    for (const m of metas) {
      if (m.type === 'pinned' || m.type === 'cloud') {
        await deleteTrackCache(m.uid);
        await resetCloudStats(m.uid);
        count++;
      }
    }
    this.queue.clear();
    emit('offline:stateChanged');
    toast(`Удалено ${count} трек(ов) из кэша`);
    return count;
  }

  /* ─── _cleanExpiredCloud (ТЗ П.5.6 — с учётом R3) ─── */

  async _cleanExpiredCloud() {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    const mode = this.getMode();
    let cleaned = 0;

    for (const m of metas) {
      if (m.type !== 'cloud') continue;
      if (!m.cloudExpiresAt) continue;
      if (m.cloudExpiresAt > now) continue;

      /* TTL истёк */
      if (mode === 'R3') {
        /* ТЗ П.5.6: В R3 не удаляем, помечаем expiredPending */
        if (!m.expiredPending) {
          await markExpiredPending(m.uid);
        }
      } else {
        await deleteTrackCache(m.uid);
        await resetCloudStats(m.uid);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[OfflineManager] Cleaned ${cleaned} expired cloud tracks`);
    }
  }

  /* ─── cleanExpiredPending — вызывается при выходе из R3 (ТЗ П.5.6) ─── */

  async cleanExpiredPending() {
    const metas = await getAllTrackMetas();
    let cleaned = 0;

    for (const m of metas) {
      if (m.expiredPending) {
        await deleteTrackCache(m.uid);
        await resetCloudStats(m.uid);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[OfflineManager] Cleaned ${cleaned} expiredPending tracks (exit R3)`);
      emit('offline:stateChanged');
    }
  }

  /* ─── getTrackOfflineState (ТЗ П.7.2) ─── */

  async getTrackOfflineState(uid) {
    const meta = (await getTrackMeta(uid)) || {};
    const found = await getAudioBlobAny(uid, this.getCacheQuality());
    const downloading = this.queue.isDownloading(uid);
    const hasBlob = !!found;

    /* cachedComplete: 100 если есть blob, 0 если нет */
    const cachedComplete = hasBlob ? 100 : 0;

    let cacheKind = 'none';
    if (meta.type === 'pinned') {
      cacheKind = 'pinned';
    } else if (meta.type === 'cloud' && cachedComplete === 100) {
      /* ТЗ П.7.2: ☁ отображается только если cloud=true И cachedComplete=100% */
      cacheKind = 'cloud';
    } else if (meta.type === 'cloud' && cachedComplete < 100) {
      /* Cloud мета есть, но файл ещё не скачан — показываем как «загружается» */
      cacheKind = downloading ? 'cloud' : 'none';
    }

    return {
      cacheKind,
      pinned: meta.type === 'pinned',
      cloud: meta.type === 'cloud' && cachedComplete === 100,
      downloading,
      cachedComplete,
      quality: found?.quality || meta.quality || null,
      needsReCache: !!meta.needsReCache,
      expiredPending: !!meta.expiredPending,
      meta
    };
  }

  /* ─── Re-cache (ТЗ П.8.3) ─── */

  async reCacheAll(progressCb) {
    const metas = await getAllTrackMetas();
    const quality = this.getCacheQuality();
    const toReCache = [];

    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      const found = await getAudioBlobAny(m.uid, quality);
      if (!found || found.quality !== quality || m.needsReCache) {
        toReCache.push(m);
      }
    }

    const total = toReCache.length;
    if (total === 0) {
      toast('Все треки актуальны, перекачка не нужна.');
      return 0;
    }

    let done = 0;
    for (const m of toReCache) {
      const url = getTrackUrl(m.uid, quality);
      if (url) {
        this.queue.enqueue({
          uid: m.uid, url, quality,
          kind: m.type || 'cloud',
          priority: m.type === 'pinned' ? 4 : 2
        });
      }
      done++;
      if (progressCb) progressCb({ done, total, uid: m.uid });
    }

    toast(`Запущена перекачка: ${total} трек(ов)`);
    return total;
  }

  /* ─── Lists for modal (ТЗ П.8.5) ─── */

  async getPinnedAndCloudList() {
    const metas = await getAllTrackMetas();
    const result = { pinned: [], cloud: [] };

    for (const m of metas) {
      const trackData = getTrackData(m.uid);
      const item = {
        uid: m.uid,
        title: trackData?.title || m.uid,
        artist: trackData?.artist || '',
        type: m.type,
        quality: m.quality,
        size: m.size || 0,
        pinnedAt: m.pinnedAt,
        cloudAddedAt: m.cloudAddedAt,
        cloudExpiresAt: m.cloudExpiresAt,
        cloudFullListenCount: m.cloudFullListenCount || 0,
        needsReCache: !!m.needsReCache,
        expiredPending: !!m.expiredPending
      };

      if (m.type === 'pinned') result.pinned.push(item);
      else if (m.type === 'cloud') result.cloud.push(item);
    }

    result.pinned.sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
    result.cloud.sort((a, b) => (b.cloudAddedAt || 0) - (a.cloudAddedAt || 0));

    return result;
  }

  /* ─── Stats summary ─── */

  async getCacheStats() {
    const metas = await getAllTrackMetas();
    const est = await estimateUsage();
    let pinnedCount = 0, cloudCount = 0, totalSize = 0;

    for (const m of metas) {
      if (m.type === 'pinned') { pinnedCount++; totalSize += m.size || 0; }
      else if (m.type === 'cloud') { cloudCount++; totalSize += m.size || 0; }
    }

    return {
      pinnedCount,
      cloudCount,
      totalTracks: pinnedCount + cloudCount,
      totalSize,
      storageUsed: est.used,
      storageQuota: est.quota,
      storageFree: est.free,
      mode: this.getMode(),
      quality: this.getCacheQuality(),
      cloudN: this.getCloudN(),
      cloudD: this.getCloudD(),
      netPolicy: this.getNetPolicy(),
      queueStatus: this.queue.getStatus()
    };
  }

  /* ─── Compat: recordListenStats (вызывается из PlayerCore stats-tracker) ─── */

  async recordListenStats(uid, { deltaSec = 0, isFullListen = false } = {}) {
    if (!uid) return;
    if (isFullListen) {
      await this.registerFullListen(uid);
    } else if (deltaSec > 0) {
      await updateTrackMeta(uid, {
        globalListenSeconds: ((await getTrackMeta(uid))?.globalListenSeconds || 0) + deltaSec
      });
    }
  }

  /* ─── Compat: getGlobalStatistics (вызывается из statistics-modal.js) ─── */

  async getGlobalStatistics() {
    const stats = await this.getCacheStats();
    const metas = await getAllTrackMetas();

    let totalListens = 0, totalSeconds = 0;
    const items = [];

    for (const m of metas) {
      if (m.type === 'pinned' || m.type === 'cloud') {
        totalListens += m.globalFullListenCount || 0;
        totalSeconds += m.globalListenSeconds || 0;
        items.push(m);
      }
    }

    const avg = items.length > 0 ? Math.round(totalListens / items.length) : 0;

    return {
      storage: { used: stats.storageUsed, quota: stats.storageQuota },
      counts: {
        pinned: stats.pinnedCount,
        cloud: stats.cloudCount,
        dynamic: 0,
        total: stats.totalTracks,
        needsReCache: items.filter(m => m.needsReCache).length,
        cloudExpiringSoon: items.filter(m => m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt - Date.now() < 3 * 24 * 60 * 60 * 1000).length
      },
      listens: { total: totalListens, average: avg },
      queue: stats.queueStatus,
      settings: {
        mode: stats.mode,
        quality: stats.quality,
        cloudN: stats.cloudN,
        cloudD: stats.cloudD,
        preset: this.getPreset()
      },
      items
    };
  }

  /* ─── Download queue proxy ─── */

  getDownloadQueueStatus() {
    return this.queue.getStatus();
  }
}

/* ═══════ Singleton ═══════ */

let _instance = null;

export function getOfflineManager() {
  if (!_instance) _instance = new OfflineManager();
  return _instance;
}

export default getOfflineManager;

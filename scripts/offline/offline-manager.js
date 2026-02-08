/**
 * scripts/offline/offline-manager.js
 * Central Offline Logic (v1.0 Spec Compliant)
 * Implements: R0/R1 Modes, Pinned/Cloud, NetPolicy Integration, Priority Queue.
 */

import {
  openDB, setAudioBlob, getAudioBlob, deleteAudioVariant, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, getAllTrackMetas,
  hasAudioForUid, getStoredVariant, deleteTrackCache, deleteTrackMeta
} from './cache-db.js';

const WIN = window;
const LS = localStorage;
const MB = 1024 * 1024;
const DAY_MS = 86400000;

// Config Keys & Defaults
const K = {
  Q: 'qualityMode:v1',       // Единое качество
  MODE: 'offline:mode:v1',   // R0/R1
  N: 'cloud:listenThreshold',
  D: 'cloud:ttlDays'
};
const DEF = { N: 5, D: 31, MIN_MB: 60 };

// Priorities (ТЗ 10.2)
const PRIO = { CUR: 100, NEIGHBOR: 90, PIN: 80, UPD: 70, CLOUD: 60, ASSET: 50 };

// Helpers
const emit = (n, d) => WIN.dispatchEvent(new CustomEvent(n, { detail: d }));
const toast = (m, t='info') => WIN.NotificationSystem?.show?.(m, t);
const normQ = (v) => (String(v||'').toLowerCase() === 'lo' ? 'lo' : 'hi');
const netOk = () => WIN.NetPolicy ? WIN.NetPolicy.isNetworkAllowed() : navigator.onLine;

const getUrl = (u, q) => {
  const t = WIN.TrackRegistry?.getTrackByUid?.(u);
  if (!t) return null;
  return normQ(q) === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
};

/* ═══════ COMPACT PRIORITY QUEUE ═══════ */
class DownloadQueue {
  constructor() {
    this.q = [];
    this.active = new Map(); // uid -> {ctrl, item}
    this.paused = false;
    this.limit = 1; // Default 1 active download
  }

  add(item) { // item: {uid, url, quality, kind, priority}
    const { uid, quality, priority } = item;
    
    // Anti-hysteria: Если уже качается этот UID
    if (this.active.has(uid)) {
      const act = this.active.get(uid);
      // Если качество не совпадает — отменяем текущую (ТЗ 4.4)
      if (act.item.quality !== quality) this.cancel(uid); 
      else return; // Уже качается то что нужно
    }

    // Dedup: ищем в очереди ожидания
    const idx = this.q.findIndex(i => i.uid === uid);
    if (idx > -1) {
      // Если качество другое — заменяем задачу
      if (this.q[idx].quality !== quality) {
        this.q[idx] = { ...item, added: Date.now() };
      } else {
        // Если качество то же, но приоритет выше — повышаем
        if (priority > this.q[idx].priority) this.q[idx].priority = priority;
      }
    } else {
      this.q.push({ ...item, added: Date.now() });
    }
    
    this._process();
  }

  cancel(uid) {
    this.q = this.q.filter(i => i.uid !== uid);
    const act = this.active.get(uid);
    if (act) { act.ctrl.abort(); this.active.delete(uid); }
    this._process();
  }

  pause(v=true) { 
    this.paused = v; 
    if(!v) this._process(); 
  }
  
  setParallel(n) { 
    this.limit = n; 
    this._process(); 
  }
  
  getStatus() { return { active: this.active.size, queued: this.q.length }; }
  isBusy(uid) { return this.active.has(uid); }

  _process() {
    // Сортировка: Сначала по Приоритету (DESC), потом по Времени добавления (ASC)
    this.q.sort((a,b) => (b.priority - a.priority) || (a.added - b.added));

    if (this.paused || this.active.size >= this.limit || !this.q.length || !netOk()) return;

    const item = this.q.shift();
    this._run(item);
  }

  async _run(item) {
    const ctrl = new AbortController();
    this.active.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid });

    try {
      // 1. Check Space (Soft check before download)
      if (WIN.OfflineManager && !(await WIN.OfflineManager.hasSpace())) throw new Error('DiskFull');

      // 2. Fetch
      const res = await fetch(item.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      // 3. Save (Two-phase)
      // Сначала сохраняем новую версию
      await setAudioBlob(item.uid, item.quality, blob);
      await updateTrackMeta(item.uid, {
        quality: item.quality, size: blob.size, url: item.url,
        cachedComplete: true, needsReCache: false, needsUpdate: false
      });

      // Потом удаляем старую версию (противоположного качества)
      // ТЗ 1.7: No duplicates rule. 
      // Исключение: если трек сейчас играет, не удаляем (безопасность playback).
      const curUid = WIN.playerCore?.getCurrentTrackUid?.();
      if (curUid !== item.uid) {
        await deleteAudioVariant(item.uid, item.quality === 'hi' ? 'lo' : 'hi').catch(()=>{});
      }

      emit('offline:trackCached', { uid: item.uid });
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn(`[DL] ${item.uid} error:`, e);
        emit('offline:downloadFailed', { uid: item.uid });
        if (e.message === 'DiskFull') toast('Мало места, загрузка остановлена', 'warning');
      }
    } finally {
      this.active.delete(item.uid);
      emit('offline:stateChanged');
      this._process(); // Trigger next
    }
  }
}

/* ═══════ OFFLINE MANAGER ═══════ */
class OfflineManager {
  constructor() {
    this.q = new DownloadQueue();
    this.ready = false;
    this.protected = new Set(); // UIDs protected from eviction
    WIN._offlineManagerInstance = this;
  }

  async initialize() {
    if (this.ready) return;
    await openDB();
    
    // Events
    WIN.addEventListener('netPolicy:changed', () => this.q.pause(false)); // Retry on net change
    WIN.addEventListener('quality:changed', (e) => this._onQualityChanged(e.detail?.quality));
    
    // Startup Validation
    this._cleanExpired(); // TTL check (ТЗ 6.7)
    
    // R1 Space Check (ТЗ 1.6)
    if (this.getMode() === 'R1' && !(await this.hasSpace())) {
      this.setMode('R0');
      toast('Недостаточно места, PlaybackCache отключён', 'warning');
    }

    this.ready = true;
    emit('offline:ready');
  }

  /* --- Settings & State --- */
  
  getMode() { return LS.getItem(K.MODE) || 'R0'; }
  setMode(m) { 
    LS.setItem(K.MODE, m === 'R1' ? 'R1' : 'R0'); 
    emit('offline:uiChanged'); 
  }
  
  // Единое качество (ТЗ 1.2)
  getQuality() { return normQ(LS.getItem(K.Q)); }
  setQuality(v) { LS.setItem(K.Q, normQ(v)); } // Only sets LS, event triggered elsewhere

  getCloudSettings() {
    return { N: parseInt(LS.getItem(K.N)||DEF.N), D: parseInt(LS.getItem(K.D)||DEF.D) };
  }

  async hasSpace() {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return ((est.quota||0) - (est.usage||0)) >= (DEF.MIN_MB * MB);
      }
    } catch {}
    return true;
  }
  
  // Alias for UI compatibility
  async isSpaceOk() { return this.hasSpace(); }

  /* --- Track State Info --- */
  
  async getTrackOfflineState(uid) {
    if (!uid) return { status: 'none' };
    const m = await getTrackMeta(uid);
    const has = await hasAudioForUid(uid);
    const q = this.getQuality();
    
    let st = 'none';
    if (m?.type === 'pinned') st = 'pinned';
    else if (m?.type === 'cloud') st = (has && m.cachedComplete) ? 'cloud' : 'cloud_loading';
    else if (m?.type === 'playbackCache') st = 'transient';

    // Для UI индикатора
    return {
      status: st,
      downloading: this.q.isBusy(uid),
      cachedComplete: has && !!m?.cachedComplete,
      needsReCache: !!m?.needsReCache || (has && m?.quality && m.quality !== q),
      needsUpdate: !!m?.needsUpdate,
      quality: m?.quality,
      daysLeft: m?.cloudExpiresAt ? Math.ceil((m.cloudExpiresAt - Date.now()) / DAY_MS) : 0
    };
  }

  /* --- Actions: Pinned / Cloud --- */

  // ТЗ 5.5 (Pin) и 5.6 (Unpin -> Cloud)
  async togglePinned(uid) {
    const m = (await getTrackMeta(uid)) || { uid };
    const q = this.getQuality();
    const now = Date.now();
    const { D } = this.getCloudSettings();

    if (m.type === 'pinned') {
      // Unpin -> Cloud immediately (ТЗ 5.6)
      await updateTrackMeta(uid, { 
        type: 'cloud', cloudOrigin: 'unpin', pinnedAt: null, 
        cloudAddedAt: now, cloudExpiresAt: now + (D * DAY_MS) 
      });
      toast(`Офлайн-закрепление снято. Доступно как облачный кэш на ${D} дн.`);
    } else {
      // Pin (ТЗ 5.5)
      if (!(await this.hasSpace())) return toast('Недостаточно места на устройстве', 'warning');
      
      await updateTrackMeta(uid, { 
        type: 'pinned', pinnedAt: now, quality: q, cloudExpiresAt: null 
      });
      
      // Если файла нет или качество не то - в очередь
      const storedQ = await getStoredVariant(uid);
      if (!storedQ || storedQ !== q) {
        if (storedQ) await updateTrackMeta(uid, { needsReCache: true });
        this._enqueue(uid, q, 'pinned', PRIO.PIN);
        toast(storedQ ? 'Трек закреплён 🔒 (обновление качества)' : 'Трек будет доступен офлайн. Начинаю скачивание...');
      } else {
        toast('Трек закреплён офлайн 🔒');
      }
    }
    emit('offline:stateChanged');
  }

  // ТЗ 6.6: Удалить из кэша (сброс cloud-статистики)
  async removeCached(uid) {
    this.q.cancel(uid);
    await deleteAudio(uid);
    await deleteTrackMeta(uid); // Стирает cloud-статистику
    emit('offline:stateChanged');
  }

  async removeAllCached() {
    const all = await getAllTrackMetas();
    for (const m of all) {
      if (m.type === 'pinned' || m.type === 'cloud') await this.removeCached(m.uid);
    }
    toast('Все офлайн-треки удалены');
  }

  // ТЗ 6.3 - 6.4: Автоматическое появление Cloud
  async registerFullListen(uid, { duration, position }) {
    if (!duration || (position / duration) < 0.9) return; // Строго > 90%
    const m = (await getTrackMeta(uid)) || { uid };
    const { N, D } = this.getCloudSettings();
    const now = Date.now();
    
    // Update stats
    const count = (m.cloudFullListenCount || 0) + 1;
    const upd = { cloudFullListenCount: count, lastFullListenAt: now };

    if (m.type === 'cloud') upd.cloudExpiresAt = now + (D * DAY_MS); // Продление TTL

    // Auto convert to Cloud
    if (m.type !== 'pinned' && m.type !== 'cloud' && count >= N) {
      if (await this.hasSpace()) {
        upd.type = 'cloud'; upd.cloudOrigin = 'auto'; upd.cloudAddedAt = now;
        upd.cloudExpiresAt = now + (D * DAY_MS); upd.quality = this.getQuality();
        
        // Качаем только если нет
        if (!(await hasAudioForUid(uid))) {
          this._enqueue(uid, upd.quality, 'cloud', PRIO.CLOUD);
          toast(`Трек добавлен в офлайн на ${D} дн.`);
        }
      }
    }
    await updateTrackMeta(uid, upd);
    emit('offline:stateChanged');
  }

  /* --- Playback Resolution (ТЗ 7.2) --- */
  async resolveTrackSource(uid, reqQ) {
    const u = String(uid||'').trim();
    if (!u) return { source: 'none' };
    
    const q = normQ(reqQ || this.getQuality());
    const altQ = q === 'hi' ? 'lo' : 'hi';
    const isNet = netOk();

    // 1. Local Current Priority
    const blob = await getAudioBlob(u, q);
    if (blob) return { source: 'local', blob, quality: q };

    // 2. Local Alternate Priority
    const altBlob = await getAudioBlob(u, altQ);
    if (altBlob) {
      // Если хотим Lo, но есть Hi -> играем Hi (Улучшение)
      if (q === 'lo') {
        await updateTrackMeta(u, { needsReCache: true }); // Метка для возможного даунгрейда потом
        return { source: 'local', blob: altBlob, quality: altQ }; 
      }
      // Если хотим Hi, но есть Lo (Ухудшение)
      if (isNet) {
        // Есть сеть -> стримим Hi, ставим задачу на тихую замену
        const url = getUrl(u, q);
        if (url) {
          await updateTrackMeta(u, { needsReCache: true });
          this._enqueue(u, q, 'reCache', PRIO.UPD);
          return { source: 'stream', url, quality: q };
        }
      }
      // Нет сети -> fallback на Lo
      return { source: 'local', blob: altBlob, quality: altQ };
    }

    // 3. Network (Streaming)
    if (isNet) {
      const url = getUrl(u, q);
      if (url) return { source: 'stream', url, quality: q };
    }

    // 4. Fail
    return { source: 'none' };
  }

  /* --- R1 / PlaybackCache Window Support --- */
  async enqueueAudioDownload(uid, { priority, kind }) {
    if (kind === 'playbackCache') {
      // В R1: если трека нет, создаем transient запись
      const m = await getTrackMeta(uid);
      if (m?.type === 'pinned' || m?.type === 'cloud' || await hasAudioForUid(uid)) return;
      
      // Soft eviction check
      if (!(await this.hasSpace())) {
        if (!(await this._evictOldestTransient())) {
           toast('Мало места, предзагрузка приостановлена', 'warning');
           return;
        }
      }
      if (!m) await setTrackMeta(uid, { uid, type: 'playbackCache', createdAt: Date.now() });
    }
    this._enqueue(uid, this.getQuality(), kind, priority);
  }

  setProtectedUids(uids) { this.protected = new Set(uids || []); }

  /* --- Internal & Maintenance --- */
  
  _enqueue(uid, q, kind, prio) {
    const url = getUrl(uid, q);
    if (url) this.q.add({ uid, url, quality: q, kind, priority: prio });
  }

  // ТЗ 4.4: Защита от истерики при смене качества
  async _onQualityChanged(nq) {
    const q = normQ(nq);
    const all = await getAllTrackMetas();
    const curUid = WIN.playerCore?.getCurrentTrackUid?.();
    let cnt = 0;

    // 1. Отмена загрузок неправильного качества
    for (const m of all) if (this.q.isBusy(m.uid)) this.q.cancel(m.uid);

    // 2. Пометка needsReCache и постановка в очередь
    const targets = all.filter(m => (m.type === 'pinned' || m.type === 'cloud'));
    for (const m of targets) {
      if (m.quality && m.quality !== q) {
        await updateTrackMeta(m.uid, { needsReCache: true });
        // CUR не перекачиваем "на лету" (ТЗ 1.7)
        if (m.uid !== curUid) {
          this._enqueue(m.uid, q, 'reCache', m.type === 'pinned' ? PRIO.PIN : PRIO.UPD);
        }
        cnt++;
      } else if (m.needsReCache) {
        // Если качество совпало (вернули обратно), снимаем флаг
        await updateTrackMeta(m.uid, { needsReCache: false });
      }
    }
    emit('offline:stateChanged');
    emit('offline:reCacheStatus', { count: cnt });
  }

  async _cleanExpired() {
    const all = await getAllTrackMetas();
    const now = Date.now();
    for (const m of all) {
      if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
        await this.removeCached(m.uid);
        toast('Офлайн-доступ истёк. Трек удалён из кэша.');
      }
    }
  }

  async _evictOldestTransient() {
    const all = await getAllTrackMetas();
    const trans = all.filter(m => m.type === 'playbackCache' && !this.protected.has(m.uid))
                     .sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    if (!trans.length) return false;
    await deleteTrackCache(trans[0].uid);
    return true;
  }

  /* --- UI Support --- */
  
  getDownloadStatus() { return this.q.getStatus(); }
  
  // Количество треков не того качества
  async countNeedsReCache(tq) {
    const q = normQ(tq);
    const all = await getAllTrackMetas();
    return all.filter(m => (m.type === 'pinned' || m.type === 'cloud') && m.quality !== q).length;
  }
  
  // Кнопка Re-cache (ускорение)
  async reCacheAll(tq) {
    const q = normQ(tq);
    this.q.setParallel(3); // Boost concurrency
    const all = await getAllTrackMetas();
    let c = 0;
    for (const m of all) {
      if ((m.type === 'pinned' || m.type === 'cloud') && m.quality !== q) {
        this._enqueue(m.uid, q, 'reCache', m.type === 'pinned' ? PRIO.PIN : PRIO.UPD);
        c++;
      }
    }
    return c;
  }

  // Применение настроек N и D (ТЗ 6.8)
  async confirmApplyCloudSettings({ newN, newD }) {
    LS.setItem(K.N, newN); LS.setItem(K.D, newD);
    const all = await getAllTrackMetas();
    const now = Date.now();
    let rm = 0;
    for (const m of all) {
      if (m.type !== 'cloud') continue;
      // N increased -> remove auto clouds
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount||0) < newN) { 
        await this.removeCached(m.uid); rm++; continue; 
      }
      // D changed -> recalc expiry
      if (m.lastFullListenAt) {
        const exp = m.lastFullListenAt + (newD * DAY_MS);
        if (exp < now) { await this.removeCached(m.uid); rm++; }
        else await updateTrackMeta(m.uid, { cloudExpiresAt: exp });
      }
    }
    return rm;
  }
  
  // Statistics breakdown for Modal
  async getStorageBreakdown() {
    const all = await getAllTrackMetas();
    const b = { pinned:0, cloud:0, transient:0, other:0 };
    for(const m of all) {
        const sz = m.size||0;
        if(m.type==='pinned') b.pinned+=sz;
        else if(m.type==='cloud') b.cloud+=sz;
        else if(m.type==='playbackCache') b.transient+=sz;
        else b.other+=sz;
    }
    return b;
  }

  // Compat Stubs (Safe to ignore)
  async checkForUpdates() { return 0; } 
  async updateAll() { return 0; }
  getBackgroundPreset() { return 'balanced'; } // Stub for UI
  setBackgroundPreset() {} 
  setCacheQualitySetting(v) { this.setQuality(v); }
}

const instance = new OfflineManager();
WIN.OfflineManager = instance;
export function getOfflineManager() { return instance; }
export default instance;

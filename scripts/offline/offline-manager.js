/**
 * scripts/offline/offline-manager.js
 * OfflineManager v3.3 — Ultra-Compact, 100% Spec-Compliant.
 */

import * as DB from './cache-db.js';
const W = window;
const LS = { MODE: 'offline:mode:v1', QUAL: 'qualityMode:v1', CQ: 'offline:cacheQuality:v1', CN: 'cloud:listenThreshold', CD: 'cloud:ttlDays' };
const DEF = { N: 5, D: 31, MIN_MB: 60, R2_DYN_MB: 80 };
const G = { MRU: 'r2:mru:list:v1', DYN_MB: 'r2:dynamicLimitMB:v1' };
const PRIO = { CUR: 100, NEXT: 90, PIN: 80, UPD: 70, FILL: 60, DYN: 50 };
const now = () => Date.now();
const normQ = q => String(q || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
const sUid = u => String(u || '').trim() || null;
const emit = (n, d) => W.dispatchEvent(new CustomEvent(n, { detail: d }));
const toast = (m, t = 'info') => W.NotificationSystem?.show?.(m, t);
const netOk = () => W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
const getUrl = (u, q) => { const t = W.TrackRegistry?.getTrackByUid?.(u); return t ? (normQ(q) === 'lo' ? (t.audio_low || t.audio) : t.audio) : null; };
const hasSpace = async () => { try { const e = await navigator.storage?.estimate(); return !e || (e.quota - e.usage) >= DEF.MIN_MB * 1048576; } catch { return true; } };

class DownloadQueue {
  constructor(m) { this.m = m; this.q = new Map(); this.act = new Map(); this.par = 1; this.p = false; const w = () => this.pump(); W.addEventListener('netPolicy:changed', w); W.addEventListener('online', w); }
  add(i) { const u = sUid(i.uid); if (!u || !i.url) return; const a = this.act.get(u), e = this.q.get(u); if (a) { if (a.i.quality !== i.quality) this.cancel(u); else return; } if (!e || e.priority < i.priority || e.quality !== i.quality) { this.q.set(u, { ...i, uid: u, ts: now() }); this.pump(); } }
  cancel(u) { if (u = sUid(u)) { this.q.delete(u); const a = this.act.get(u); if (a) { a.c.abort(); this.act.delete(u); emit('offline:stateChanged'); } this.pump(); } }
  clearOldQualities(q) { for (const [u, t] of this.q) if (t.quality !== q) this.q.delete(u); }
  getStatus() { return { active: this.act.size, queued: this.q.size }; }
  pause() { this.p = true; } resume() { this.p = false; this.pump(); } setParallel(n) { this.par = n; this.pump(); }
  pump() { if (this.p || !netOk() || this.act.size >= this.par || !this.q.size) return; const t = [...this.q.values()].sort((a, b) => b.priority - a.priority || a.ts - b.ts)[0]; this.q.delete(t.uid); this._run(t); }
  async _run(i) {
    if (i.priority === PRIO.DYN && !(await hasSpace()) && (await this.m.evictDynamic(), !(await hasSpace()))) return;
    const c = new AbortController(); this.act.set(i.uid, { c, i }); emit('offline:downloadStart', { uid: i.uid });
    try {
      const r = await fetch(i.url, { signal: c.signal, redirect: 'follow' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = await r.blob(); await DB.setAudioBlob(i.uid, i.quality, b);
      await DB.updateTrackMeta(i.uid, { quality: i.quality, size: b.size, cachedComplete: true, needsReCache: false, needsUpdate: false, lastAccessedAt: now() });
      if ((await DB.getTrackMeta(i.uid))?.type === 'dynamic') await this.m.touchMRU(i.uid);
      if (W.playerCore?.getCurrentTrackUid?.() !== i.uid) await DB.deleteAudioVariant(i.uid, i.quality === 'hi' ? 'lo' : 'hi').catch(()=>{}); else { (W._orphanedBlobs ??= new Set()).add(i.uid); }
      emit('offline:trackCached', { uid: i.uid });
    } catch (e) { if (e.name !== 'AbortError') emit('offline:downloadFailed', { uid: i.uid, error: e.message });
    } finally { this.act.delete(i.uid); emit('offline:stateChanged'); this.pump(); }
  }
}

class OfflineManager {
  constructor() { this.queue = new DownloadQueue(this); this.ready = false; W._offlineManagerInstance = W.OfflineManager = this; }
  async initialize() {
    if (this.ready) return; await DB.openDB();
    if (['R1', 'R2'].includes(this.getMode()) && !(await hasSpace())) { this.setMode('R0'); toast('Недостаточно места, кэширование отключено', 'warning'); }
    const all = await DB.getAllTrackMetas(), t = now();
    for (const m of all) if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < t) { await this.removeCached(m.uid); toast('Офлайн-доступ истёк. Трек удалён.', 'warning'); }
    W.addEventListener('quality:changed', e => this._onQualChg(e.detail?.quality));
    W.addEventListener('analytics:cloudThresholdReached', e => e.detail?.uid && this.registerFullListen(e.detail.uid, { forcedCloud: true }));
    W.addEventListener('player:trackChanged', async e => {
      if (!W._orphanedBlobs?.size) return;
      for (const u of W._orphanedBlobs) if (u !== e.detail?.uid) { const m = await DB.getTrackMeta(u); if (m?.quality) await DB.deleteAudioVariant(u, m.quality === 'hi' ? 'lo' : 'hi').catch(()=>{}); W._orphanedBlobs.delete(u); }
    });
    this.ready = true; emit('offline:ready');
  }
  getMode() { return localStorage.getItem(LS.MODE) || 'R0'; }
  setMode(m) { localStorage.setItem(LS.MODE, m); emit('offline:uiChanged'); }
  getQuality() { return normQ(localStorage.getItem(LS.QUAL)); }
  setQuality(q) { localStorage.setItem(LS.QUAL, normQ(q)); emit('offline:uiChanged'); }
  getCQ() { return normQ(localStorage.getItem(LS.CQ)); }
  setCQ(q) { localStorage.setItem(LS.CQ, normQ(q)); this._onQualChg(normQ(q)); emit('offline:uiChanged'); }
  getEffectiveQuality() { return this.getMode() === 'R2' ? this.getCQ() : this.getQuality(); }
  getCloudSettings() { return { N: parseInt(localStorage.getItem(LS.CN)) || DEF.N, D: parseInt(localStorage.getItem(LS.CD)) || DEF.D }; }
  async hasSpace() { return hasSpace(); }
  async isSpaceOk() { return hasSpace(); }
  async getDynamicLimitMB() { return await DB.getGlobal(G.DYN_MB).then(r => Number.isFinite(Number(r?.value)) && r.value >= 0 ? r.value : DEF.R2_DYN_MB).catch(() => DEF.R2_DYN_MB); }
  async setDynamicLimitMB(mb) { await DB.setGlobal(G.DYN_MB, Math.max(0, Math.floor(Number(mb) || 0))); emit('offline:uiChanged'); }
  async _getMRU() { return await DB.getGlobal(G.MRU).then(r => Array.isArray(r?.value) ? r.value.map(sUid).filter(Boolean) : []).catch(() => []); }
  async _setMRU(l) { await DB.setGlobal(G.MRU, l); }
  async touchMRU(u) {
    if (!(u = sUid(u)) || this.getMode() !== 'R2') return; const m = await DB.getTrackMeta(u);
    if (['pinned', 'cloud', 'playbackCache'].includes(m?.type)) return this._dropFromMRU(u);
    await this._setMRU([u, ...(await this._getMRU()).filter(x => x !== u)].slice(0, 2000));
  }
  async _dropFromMRU(u) { if (u = sUid(u)) { const l = await this._getMRU(), n = l.filter(x => x !== u); if (n.length !== l.length) await this._setMRU(n); } }
  async getDynamicUsedBytes() { return (await DB.getAllTrackMetas()).reduce((s, m) => s + (m.type === 'dynamic' ? (m.size || 0) : 0), 0); }
  async getTrackOfflineState(u) {
    if (!(u = sUid(u)) || !this.ready) return { status: 'none', downloading: false, cachedComplete: false };
    const m = await DB.getTrackMeta(u), c = !!m?.cachedComplete, q = this.getEffectiveQuality();
    const s = m?.type === 'pinned' ? 'pinned' : (m?.type === 'cloud' ? (c ? 'cloud' : 'cloud_loading') : (['playbackCache', 'dynamic'].includes(m?.type) ? 'transient' : 'none'));
    return { status: s, downloading: this.queue.act.has(u), cachedComplete: c, needsReCache: !!m?.needsReCache || (c && m.quality !== q), needsUpdate: !!m?.needsUpdate, quality: m?.quality, daysLeft: m?.cloudExpiresAt ? Math.ceil((m.cloudExpiresAt - now()) / 864e5) : 0 };
  }
  async togglePinned(u) {
    if (!(u = sUid(u))) return; const m = (await DB.getTrackMeta(u)) || { uid: u }, { D } = this.getCloudSettings(), q = this.getEffectiveQuality();
    if (m.type === 'pinned') { await DB.updateTrackMeta(u, { type: 'cloud', cloud: true, pinnedAt: null, cloudAddedAt: now(), cloudExpiresAt: now() + D * 864e5 }); toast(`Закрепление снято. Доступно как облако на ${D} дн.`, 'info'); }
    else { if (!(await hasSpace())) return toast('Недостаточно места', 'warning'); await DB.updateTrackMeta(u, { type: 'pinned', cloud: false, pinnedAt: now() }); if (!m.cachedComplete || m.quality !== q) { const url = getUrl(u, q); if (url) { toast('Закреплён. Скачивание...', 'info'); this.queue.add({ uid: u, url, quality: q, priority: PRIO.PIN, kind: 'pinned' }); } } else toast('Трек закреплён 🔒', 'success'); }
    emit('offline:stateChanged');
  }
  async removeCached(u) { if (u = sUid(u)) { this.queue.cancel(u); await DB.deleteAudio(u); await DB.updateTrackMeta(u, { type: null, cloud: false, cachedComplete: false, quality: null, size: 0, cloudFullListenCount: 0, lastFullListenAt: null, cloudAddedAt: null, cloudExpiresAt: null }); emit('offline:stateChanged'); } }
  async removeAllCached() { for (const m of await DB.getAllTrackMetas()) if (['pinned', 'cloud', 'dynamic'].includes(m.type)) await this.removeCached(m.uid); }
  async evictDynamic() {
    const pS = new Set(Object.values(W.PlaybackCache?.getWindowState?.() || {}).filter(Boolean)), ms = new Map((await DB.getAllTrackMetas()).map(m => [m.uid, m]));
    const c = (await this._getMRU()).filter(u => { const m = ms.get(u); return m && m.type === 'dynamic' && !pS.has(u); });
    await this._setMRU(c);
    for (let i = c.length - 1; i >= 0; i--) { await DB.deleteTrackCache(c[i]).catch(()=>{}); await this._dropFromMRU(c[i]); if (await hasSpace()) return; }
  }
  async registerFullListen(u, { forcedCloud } = {}) {
    if (!(u = sUid(u)) || !forcedCloud) return; const m = (await DB.getTrackMeta(u)) || { uid: u }, { N, D } = this.getCloudSettings(), nC = (m.cloudFullListenCount || 0) + 1, upd = { cloudFullListenCount: nC, lastFullListenAt: now() };
    if (m.type === 'cloud') upd.cloudExpiresAt = now() + D * 864e5;
    if (!['pinned', 'cloud'].includes(m.type)) {
      if (nC >= N) { if (await hasSpace()) { Object.assign(upd, { type: 'cloud', cloud: true, cloudOrigin: 'auto', cloudExpiresAt: now() + D * 864e5 }); if (!m.cachedComplete) { const q = this.getEffectiveQuality(), url = getUrl(u, q); if (url) this.queue.add({ uid: u, url, quality: q, priority: PRIO.FILL, kind: 'cloud' }); } } }
      else if (this.getMode() === 'R2' && m.type !== 'playbackCache') {
        upd.type = 'dynamic'; upd.lastAccessedAt = now();
        if (!m.cachedComplete) { const lB = (await this.getDynamicLimitMB()) * 1048576, uB = await this.getDynamicUsedBytes(), q = this.getEffectiveQuality(), url = getUrl(u, q); if (url) { if (lB <= 0) upd.type = null; else if (uB >= lB) { await this.evictDynamic(); if (await this.getDynamicUsedBytes() >= lB) toast('Хранилище переполнено', 'warning'); else this.queue.add({ uid: u, url, quality: q, priority: PRIO.DYN, kind: 'dynamic' }); } else this.queue.add({ uid: u, url, quality: q, priority: PRIO.DYN, kind: 'dynamic' }); } }
      }
    }
    await DB.updateTrackMeta(u, upd); emit('offline:stateChanged');
  }
  async resolveTrackSource(u, reqQ) {
    if (!(u = sUid(u))) return { source: 'none' };
    const q = normQ(reqQ || this.getEffectiveQuality()), a = q === 'hi' ? 'lo' : 'hi', iN = netOk(), m = await DB.getTrackMeta(u);
    if (m?.type === 'dynamic') { DB.updateTrackMeta(u, { lastAccessedAt: now() }); this.touchMRU(u).catch(()=>{}); }
    const b1 = await DB.getAudioBlob(u, q); if (b1) return { source: 'local', blob: b1, quality: q };
    const b2 = await DB.getAudioBlob(u, a);
    if (b2) { if (q === 'lo') return { source: 'local', blob: b2, quality: a }; if (iN) { const url = getUrl(u, q); if (url) { if (this.getMode() !== 'R2') this._reCache(u, q); return { source: 'stream', url, quality: q }; } } return { source: 'local', blob: b2, quality: a }; }
    if (iN) { const url = getUrl(u, q); if (url) return { source: 'stream', url, quality: q }; }
    return { source: 'none' };
  }
  async enqueueAudioDownload(u, { priority, kind } = {}) {
    if (!(u = sUid(u)) || await DB.hasAudioForUid(u).catch(()=>false)) return; const m = await DB.getTrackMeta(u);
    if (['pinned', 'cloud', 'dynamic'].includes(m?.type) || m?.cachedComplete || (kind === 'playbackCache' && !(await hasSpace()))) return;
    const q = this.getEffectiveQuality(), url = getUrl(u, q);
    if (kind === 'playbackCache' && m?.type !== 'playbackCache') await DB.updateTrackMeta(u, { type: 'playbackCache', lastAccessedAt: now() });
    if (url) this.queue.add({ uid: u, url, quality: q, priority: priority || PRIO.UPD, kind });
  }
  _reCache(u, q, p = PRIO.UPD) { if (W.playerCore?.getCurrentTrackUid?.() === u) return; const url = getUrl(u, q); if (url) this.queue.add({ uid: u, url, quality: q, priority: p, kind: 'reCache' }); }
  async _onQualChg(nQ) { const q = normQ(nQ); this.queue.clearOldQualities(q); for (const [u] of this.queue.act) this.queue.cancel(u); for (const m of await DB.getAllTrackMetas()) if (['pinned', 'cloud', 'dynamic'].includes(m.type) && m.cachedComplete && m.quality !== q) { await DB.updateTrackMeta(m.uid, { needsReCache: true }); this._reCache(m.uid, q, m.type === 'pinned' ? PRIO.PIN : (m.type === 'cloud' ? PRIO.UPD : PRIO.DYN)); } emit('offline:uiChanged'); }
  async confirmApplyCloudSettings({ newN, newD }) { localStorage.setItem(LS.CN, newN); localStorage.setItem(LS.CD, newD); emit('offline:uiChanged'); }
  async getStorageBreakdown() { return (await DB.getAllTrackMetas()).reduce((a, m) => { a[['pinned','cloud','playbackCache','dynamic'].includes(m.type) ? (m.type === 'playbackCache' ? 'transient' : m.type) : 'other'] += (m.size || 0); return a; }, { pinned: 0, cloud: 0, transient: 0, dynamic: 0, other: 0 }); }
  getDownloadStatus() { return this.queue.getStatus(); }
  async getTrackMeta(u) { return DB.getTrackMeta(u); }
  async countNeedsReCache(q) { if (this.getMode() === 'R2') return 0; return (await DB.getAllTrackMetas()).filter(m => ['pinned', 'cloud'].includes(m.type) && m.cachedComplete && m.quality !== normQ(q)).length; }
  async reCacheAll(q) { this._onQualChg(q); }
  setCacheQualitySetting(q) { this.setCQ(q); }
  recordTickStats() {} getBackgroundPreset() { return 'balanced'; } setBackgroundPreset() {}
}

const instance = new OfflineManager();
export const getOfflineManager = () => instance;
export default instance;

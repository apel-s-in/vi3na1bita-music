import { getOfflineManager } from '../offline/offline-manager.js';
import { deleteTrackCache, getTrackMeta } from '../offline/cache-db.js';

let _init = false, _protected = false, _win = { prev: null, cur: null, next: null }, _pendingGC = new Set();
const uidOf = t => String(t?.uid || '').trim() || null;

function getWin(pl, idx) {
  const len = pl.length, cur = (len > 0 && idx >= 0) ? uidOf(pl[idx]) : null;
  if (!cur) return { prev: null, cur: null, next: null };
  if (len === 1) return { prev: cur, cur, next: cur };
  const wrap = i => (i % len + len) % len;
  return { prev: uidOf(pl[wrap(idx - 1)]) || cur, cur, next: uidOf(pl[wrap(idx + 1)]) || cur };
}

async function rebuild(dir = 1) {
  const mgr = getOfflineManager(), pc = window.playerCore;
  if (!['R1', 'R2'].includes(mgr.getMode())) {
    Object.values(_win).filter(Boolean).forEach(u => _pendingGC.add(u));
    _win = { prev: null, cur: null, next: null };
    if (pc && !pc.isPlaying?.()) flushGC().catch(()=>{}); return;
  }

  const pl = pc?.getPlaylistSnapshot?.() || [], idx = pc?.getIndex?.() ?? -1;
  if (idx < 0 || !pl.length) return;

  const nW = getWin(pl, idx); if (!nW.cur) return;
  const keep = new Set(Object.values(nW).filter(Boolean));
  Object.values(_win).filter(u => u && !keep.has(u)).forEach(u => _pendingGC.add(u));
  _win = nW;

  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine) || !(await mgr.hasSpace())) return;

  let curIsStreaming = false;
  try { if (nW.cur) curIsStreaming = (await window.TrackResolver?.resolve?.(nW.cur, mgr.getEffectiveQuality?.()))?.source === 'stream'; } catch {}

  const order = dir >= 0 ? [nW.cur, nW.next, nW.prev] : [nW.cur, nW.prev, nW.next], prio = [100, 90, 80];
  [...new Set(order)].filter(Boolean).forEach((u, i) => {
    if (i > 0 && curIsStreaming) return;
    mgr.enqueueAudioDownload(u, { priority: prio[i] || 50, kind: 'playbackCache' });
  });
}

async function flushGC() {
  if (_protected || !_pendingGC.size) return;
  const keep = new Set(Object.values(_win).filter(Boolean)), toDel = [..._pendingGC].filter(u => u && !keep.has(u));
  _pendingGC.clear();
  for (const u of toDel) {
    try { const m = await getTrackMeta(u); if (m && ['pinned', 'cloud', 'dynamic'].includes(m.type)) continue; await deleteTrackCache(u); } catch {}
  }
}

export function initPlaybackCache() {
  if (_init) return; _init = true;
  const r = e => rebuild(Number(e?.detail?.dir) || 1).catch(()=>{});
  window.addEventListener('player:trackChanged', r);
  const toggleNet = () => { const b = !navigator.onLine || (window.NetPolicy && !window.NetPolicy.isNetworkAllowed()); b ? protectWindow() : unprotectWindow(); if (!b) r(); };
  ['online', 'offline', 'netPolicy:changed'].forEach(e => window.addEventListener(e, toggleNet));
  window.playerCore?.on?.({ onPlay: () => flushGC().catch(()=>{}) });
  toggleNet();
}

export const protectWindow = () => { _protected = true; };
export const unprotectWindow = () => { _protected = false; flushGC().catch(()=>{}); };
export const getWindowState = () => ({ ..._win, protected: _protected, pendingGC: [..._pendingGC] });

window.PlaybackCache = window.PlaybackCache || {};
window.PlaybackCache.getWindowState = getWindowState; window.PlaybackCache.protectWindow = protectWindow; window.PlaybackCache.unprotectWindow = unprotectWindow;

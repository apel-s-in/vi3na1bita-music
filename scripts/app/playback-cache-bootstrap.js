/**
 * playback-cache-bootstrap.js — PlaybackCache window controller.
 * FIX: Fully supports both R1 and R2 specs.
 */
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
  
  // Spec R2 Q.5.1: Window mechanism MUST stay active when R2 is enabled.
  if (!['R1', 'R2'].includes(mgr.getMode())) {
    Object.values(_win).filter(Boolean).forEach(u => _pendingGC.add(u));
    _win = { prev: null, cur: null, next: null };
    if (pc && !pc.isPlaying?.()) flushGC().catch(()=>{});
    return;
  }

  const pl = pc?.getPlaylistSnapshot?.() || [], idx = pc?.getIndex?.() ?? -1;
  if (idx < 0 || !pl.length) return;

  const nW = getWin(pl, idx);
  if (!nW.cur) return;
  
  const keep = new Set(Object.values(nW).filter(Boolean));
  Object.values(_win).filter(u => u && !keep.has(u)).forEach(u => _pendingGC.add(u));
  _win = nW;

  const netOk = window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
  if (!netOk || !(await mgr.hasSpace())) return;

  // Spec 8.5 "anti-stutter": if CUR is streaming, do not prefetch neighbors yet (especially iOS)
  // We keep CUR-first rule always.
  let curIsStreaming = false;
  try {
    const curUid = nW.cur;
    if (curUid) {
      const resolved = await window.TrackResolver?.resolve?.(curUid, mgr.getEffectiveQuality?.());
      curIsStreaming = resolved?.source === 'stream';
    }
  } catch {}

  // Priority: CUR -> direction neighbor -> other neighbor
  const order = dir >= 0 ? [nW.cur, nW.next, nW.prev] : [nW.cur, nW.prev, nW.next];
  const prio = [100, 90, 80];

  // Always allow CUR download task; neighbors only if CUR is not currently streaming.
  const uniq = [...new Set(order)].filter(Boolean);
  for (let i = 0; i < uniq.length; i++) {
    const u = uniq[i];
    if (!u) continue;
    if (i > 0 && curIsStreaming) continue;
    mgr.enqueueAudioDownload(u, { priority: prio[i] || 50, kind: 'playbackCache' });
  }
}

async function flushGC() {
  if (_protected || !_pendingGC.size) return;
  const keep = new Set(Object.values(_win).filter(Boolean));
  const toDel = [..._pendingGC].filter(u => u && !keep.has(u));
  _pendingGC.clear();
  
  for (const u of toDel) {
    try { 
      const m = await getTrackMeta(u); 
      // Do not delete if changed to pinned/cloud/dynamic while pending
      if (m && ['pinned', 'cloud', 'dynamic'].includes(m.type)) continue;
      await deleteTrackCache(u); 
    } catch {}
  }
}

export function initPlaybackCache() {
  if (_init) return; _init = true;
  const r = (e) => rebuild(Number(e?.detail?.dir) || 1).catch(()=>{});
window.addEventListener('player:trackChanged', r);
  
  // Встроенная защита окна при потере сети (заменяет offline-playback.js)
  const toggleNet = () => {
    const isBlocked = !navigator.onLine || (window.NetPolicy && !window.NetPolicy.isNetworkAllowed());
    isBlocked ? protectWindow() : unprotectWindow();
    if (!isBlocked) r();
  };
  ['online', 'offline', 'netPolicy:changed'].forEach(e => window.addEventListener(e, toggleNet));
  
  window.playerCore?.on?.({ onPlay: () => flushGC().catch(()=>{}) });
  toggleNet();
}

export const protectWindow = () => { _protected = true; };
export const unprotectWindow = () => { _protected = false; flushGC().catch(()=>{}); };
export const getWindowState = () => ({ ..._win, protected: _protected, pendingGC: [..._pendingGC] });

// Expose minimal API for other modules (OfflineManager eviction needs protected window, Q.11.1)
window.PlaybackCache = window.PlaybackCache || {};
window.PlaybackCache.getWindowState = getWindowState;
window.PlaybackCache.protectWindow = protectWindow;
window.PlaybackCache.unprotectWindow = unprotectWindow;

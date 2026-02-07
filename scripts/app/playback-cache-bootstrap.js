/**
 * playback-cache-bootstrap.js — Контроллер окна (R1).
 * Fix #3.1: direction-aware priorities
 * Fix #3.2: deferred GC (wait for CUR start)
 * Fix #3.3: NetPolicy check before download
 * Fix #3.4: react to shuffle/repeat/playlist changes
 * Fix #3.5: protectWindow/unprotectWindow
 */
import { getOfflineManager } from '../offline/offline-manager.js';
import { getAllTrackMetas, deleteTrackCache } from '../offline/cache-db.js';

let _initialized = false;
let _currentWindow = new Set();
let _pendingGC = [];      // Fix #3.2: deferred delete list
let _windowProtected = false; // Fix #3.5

export function initPlaybackCache() {
  if (_initialized) return;
  _initialized = true;

  // Fix #3.1: pass direction from event
  window.addEventListener('player:trackChanged', (e) => {
    const dir = e.detail?.dir || 1;
    _updateWindow(dir);
  });
  window.addEventListener('offline:uiChanged', () => _updateWindow(1));
  window.addEventListener('online', () => _updateWindow(1));

  // Fix #3.4: react to shuffle/repeat/playlist changes
  window.addEventListener('playlist:changed', () => _updateWindow(1));

  // Fix #3.2: Execute pending GC only after new track starts playing
  const pc = window.playerCore;
  if (pc?.on) {
    pc.on({
      onPlay: () => _executePendingGC()
    });
  }
}

async function _updateWindow(dir = 1) {
  const mgr = getOfflineManager();
  const mode = mgr.getMode();
  const pc = window.playerCore;

  // R0: clean all transient
  if (mode !== 'R1') {
    if (_currentWindow.size > 0) {
      _currentWindow.clear();
      await _gcImmediate([]);
    }
    return;
  }

  const idx = pc.getIndex();
  const playlist = pc.getPlaylistSnapshot() || [];
  if (idx === -1 || !playlist.length) return;

  const windowUids = new Set();
  const tasks = [];

  const add = (i, p) => {
    const t = playlist[i];
    if (t && t.uid) {
      const u = String(t.uid).trim();
      windowUids.add(u);
      tasks.push({ uid: u, priority: p });
    }
  };

  // CUR always P10
  add(idx, 10);

  if (playlist.length > 1) {
    const nextIdx = (idx + 1) % playlist.length;
    const prevIdx = (idx - 1 + playlist.length) % playlist.length;

    // Fix #3.1: direction-aware priorities
    if (dir >= 0) {
      add(nextIdx, 9);
      if (playlist.length > 2) add(prevIdx, 8);
    } else {
      if (playlist.length > 2) add(prevIdx, 9);
      add(nextIdx, 8);
    }
  }

  // Fix #3.2: Don't GC immediately — schedule for after CUR plays
  const oldWindow = _currentWindow;
  _currentWindow = windowUids;

  // Determine what left the window
  for (const uid of oldWindow) {
    if (!windowUids.has(uid)) {
      _pendingGC.push(uid);
    }
  }

  // Fix #3.3: Check NetPolicy before download
  const netOk = window.NetPolicy ? window.NetPolicy.isNetworkAllowed() : navigator.onLine;

  if (netOk && (await mgr.hasSpace())) {
    for (const t of tasks) {
      mgr.enqueueAudioDownload(t.uid, { priority: t.priority, kind: 'playbackCache' });
    }
  }
}

// Fix #3.2: Execute deferred GC after new CUR started playing
async function _executePendingGC() {
  if (_windowProtected || _pendingGC.length === 0) return;

  const keep = _currentWindow;
  const toDelete = _pendingGC.filter(uid => !keep.has(uid));
  _pendingGC = [];

  try {
    const metas = await getAllTrackMetas();
    for (const m of metas) {
      if (m.type === 'playbackCache' && toDelete.includes(m.uid)) {
        await deleteTrackCache(m.uid);
      }
    }
  } catch (e) {
    console.error('[PlaybackCache] GC error:', e);
  }
}

// Immediate GC (for R0 transition)
async function _gcImmediate(keepUids) {
  try {
    const metas = await getAllTrackMetas();
    for (const m of metas) {
      if (m.type === 'playbackCache' && !keepUids.includes(m.uid)) {
        await deleteTrackCache(m.uid);
      }
    }
  } catch (e) {
    console.error('[PlaybackCache] GC error:', e);
  }
}

// Fix #3.5: Protect/unprotect window from eviction
export function protectWindow() { _windowProtected = true; }
export function unprotectWindow() {
  _windowProtected = false;
  _executePendingGC();
}
export function getWindowState() {
  return {
    uids: [..._currentWindow],
    protected: _windowProtected,
    pendingGC: [..._pendingGC]
  };
}

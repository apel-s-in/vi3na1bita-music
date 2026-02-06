/**
 * DownloadQueue — единый механизм скачивания (ТЗ 14)
 * 1 активная аудио-загрузка, приоритеты P0-P5
 * Background presets (ТЗ 7.10.1)
 */

import { saveAudioBlob, getAudioEntry, saveTrackMeta, getTrackMeta, saveAsset,
         getTotalCacheSize, backupLRUToLocalStorage, getLRUQueue } from './cache-db.js';
import { isNetworkAllowedByPolicy, isNetworkUnknown, getMode, MODES } from './mode-manager.js';

// Priority constants (ТЗ 14.2)
const PRIORITY = {
  P0_CUR: 0,
  P1_NEIGHBOR: 1,
  P2_PINNED: 2,
  P3_UPDATE: 3,
  P4_CLOUD: 4,
  P5_ASSET: 5,
  P6_FULL_OFFLINE: 6
};

// Background Presets (ТЗ 7.10.1)
const BG_PRESETS = {
  conservative: { id: 'conservative', label: 'Conservative (iOS)', pauseBetweenMs: 3000, retryDelayMs: 10000, maxRetries: 3 },
  balanced:     { id: 'balanced',     label: 'Balanced (Android)', pauseBetweenMs: 1000, retryDelayMs: 5000,  maxRetries: 5 },
  aggressive:   { id: 'aggressive',   label: 'Aggressive (Desktop)', pauseBetweenMs: 200,  retryDelayMs: 3000,  maxRetries: 8 }
};

const BG_PROFILE_KEY = 'offline:bgProfile:v1';

let _queue = [];
let _isProcessing = false;
let _isPaused = false;
let _currentTask = null;
let _abortController = null;
let _listeners = [];

function _detectDefaultProfile() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = /Android/i.test(ua) || isIOS;
  if (isIOS) return 'conservative';
  if (isMobile) return 'balanced';
  return 'aggressive';
}

function getBackgroundProfile() {
  const saved = localStorage.getItem(BG_PROFILE_KEY);
  if (saved && BG_PRESETS[saved]) return BG_PRESETS[saved];
  return BG_PRESETS[_detectDefaultProfile()];
}

function setBackgroundProfile(profileId) {
  if (BG_PRESETS[profileId]) {
    localStorage.setItem(BG_PROFILE_KEY, profileId);
  }
}

function getAvailableProfiles() {
  return Object.values(BG_PRESETS);
}

/**
 * Enqueue a download task
 * @param {Object} task - { uid, variant, url, priority, cacheKind, trackObj?, assetKey?, assetType? }
 */
function enqueue(task) {
  // Deduplicate: same uid+variant+cacheKind
  const exists = _queue.find(t =>
    t.uid === task.uid &&
    t.variant === task.variant &&
    t.cacheKind === task.cacheKind &&
    !t.assetKey
  );
  if (exists && !task.assetKey) {
    // Update priority if higher
    if (task.priority < exists.priority) {
      exists.priority = task.priority;
      _sortQueue();
    }
    return;
  }

  _queue.push({ ...task, retries: 0, addedAt: Date.now() });
  _sortQueue();
  _notify();
  _processNext();
}

function _sortQueue() {
  _queue.sort((a, b) => a.priority - b.priority);
}

/** Remove tasks for uid */
function dequeue(uid) {
  _queue = _queue.filter(t => t.uid !== uid);
  _notify();
}

/** Remove all tasks of a cacheKind */
function dequeueByKind(kind) {
  _queue = _queue.filter(t => t.cacheKind !== kind);
  _notify();
}

function pauseQueue() {
  _isPaused = true;
  _notify();
}

function resumeQueue() {
  _isPaused = false;
  _processNext();
  _notify();
}

function cancelCurrent() {
  if (_abortController) {
    _abortController.abort();
  }
}

async function _processNext() {
  if (_isProcessing || _isPaused || _queue.length === 0) return;

  // Check network policy
  if (!isNetworkAllowedByPolicy()) {
    // Wait and retry
    setTimeout(() => _processNext(), 5000);
    return;
  }

  _isProcessing = true;
  const task = _queue.shift();
  _currentTask = task;
  _notify();

  const profile = getBackgroundProfile();

  try {
    _abortController = new AbortController();

    if (task.assetKey) {
      // Asset download (covers, lyrics, etc.)
      await _downloadAsset(task, _abortController.signal);
    } else {
      // Audio download
      await _downloadAudio(task, _abortController.signal);
    }

    // Success — pause between downloads
    await _sleep(profile.pauseBetweenMs);

  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('[DownloadQueue] task aborted', task.uid);
    } else {
      console.error('[DownloadQueue] download failed', task.uid, e);
      task.retries = (task.retries || 0) + 1;
      if (task.retries < profile.maxRetries) {
        // Re-enqueue with backoff
        setTimeout(() => {
          _queue.push(task);
          _sortQueue();
          _processNext();
        }, profile.retryDelayMs * task.retries);
      } else {
        console.warn('[DownloadQueue] max retries reached for', task.uid);
      }
    }
  }

  _currentTask = null;
  _abortController = null;
  _isProcessing = false;
  _notify();
  _processNext();
}

async function _downloadAudio(task, signal) {
  const { uid, variant, url, cacheKind } = task;
  if (!url) throw new Error('No URL for download');

  // Check if already exists with same variant
  const existing = await getAudioEntry(uid);
  if (existing && existing.variant === variant) {
    // Already have this variant, update meta only
    const meta = await getTrackMeta(uid) || { uid };
    meta.cacheKind = cacheKind || meta.cacheKind;
    meta.cachedComplete = 100;
    meta.needsReCache = false;
    meta.needsUpdate = false;
    await saveTrackMeta(meta);
    _emitProgress(uid, 100);
    return;
  }

  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      _emitProgress(uid, Math.round((received / contentLength) * 100));
    }
  }

  const blob = new Blob(chunks, { type: 'audio/mpeg' });

  // ТЗ 1.7: No duplicates — saveAudioBlob handles replacement
  await saveAudioBlob(uid, variant, blob, cacheKind);

  // Update meta
  const meta = await getTrackMeta(uid) || { uid };
  meta.cachedVariant = variant;
  meta.cachedComplete = 100;
  meta.cacheKind = cacheKind || meta.cacheKind || 'dynamic';
  meta.needsReCache = false;
  meta.needsUpdate = false;
  meta.lastAccessAt = Date.now();
  await saveTrackMeta(meta);

  // Backup LRU to localStorage
  const lruQ = await getLRUQueue();
  backupLRUToLocalStorage(lruQ);

  _emitProgress(uid, 100);
  window.dispatchEvent(new CustomEvent('downloadComplete', { detail: { uid, variant, cacheKind } }));
}

async function _downloadAsset(task, signal) {
  const { assetKey, url, assetType } = task;
  if (!url) throw new Error('No URL for asset');

  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  await saveAsset(assetKey, blob, assetType || 'application/octet-stream');
}

function _emitProgress(uid, percent) {
  window.dispatchEvent(new CustomEvent('downloadProgress', { detail: { uid, percent } }));
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _notify() {
  _listeners.forEach(fn => { try { fn(getStatus()); } catch(e) {} });
}

function onStatusChange(fn) { _listeners.push(fn); }
function offStatusChange(fn) { _listeners = _listeners.filter(f => f !== fn); }

function getStatus() {
  return {
    currentTask: _currentTask,
    queueLength: _queue.length,
    isPaused: _isPaused,
    isProcessing: _isProcessing,
    queue: _queue.slice()
  };
}

function getQueueLength() { return _queue.length; }

export {
  PRIORITY, BG_PRESETS,
  enqueue, dequeue, dequeueByKind,
  pauseQueue, resumeQueue, cancelCurrent,
  getBackgroundProfile, setBackgroundProfile, getAvailableProfiles,
  getStatus, getQueueLength,
  onStatusChange, offStatusChange
};

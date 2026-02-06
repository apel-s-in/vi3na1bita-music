/**
 * PlaybackCache — 3-трековое окно PREV/CUR/NEXT (ТЗ 7)
 * State machine для сценария 7.5.3 (S1/S2/S3)
 * Механизм исполнения: источник, докачка, сдвиг окна
 */

import { getAudioEntry, hasAudioLocally, getTrackMeta, saveTrackMeta, getAllTrackMetas } from './cache-db.js';
import { getMode, getActivePlaybackQuality, isNetworkAllowedForPlayback, MODES } from './mode-manager.js';
import { resolvePlayback, resolveVariantUrl } from './track-resolver.js';
import { enqueue, dequeue, PRIORITY } from './download-queue.js';
import { protectWindow, unprotectWindow, onTrackPlayed as omOnTrackPlayed } from './offline-manager.js';
import { onTrackStart as statsTrackStart } from './stats-core.js';

// === STATE ===
let _playlist = [];       // current playing playlist (active tracks only)
let _curIndex = -1;       // index in _playlist
let _direction = 'next';  // last transition direction
let _windowUids = new Set(); // uids in transient playback window
let _baseUrl = '';

// 7.5.3 State Machine
const SM_IDLE = 'idle';
const SM_S1_WAITING = 's1_waiting';
const SM_S2_CHOICE = 's2_choice';
const SM_S3_WAIT = 's3_wait';
const SM_S3_SKIP = 's3_skip';

let _smState = SM_IDLE;
let _recoveryTarget = null;   // { uid, index, track }
let _s1Timer = null;
let _s1RetryInterval = null;
let _forcedOfflineQueue = [];
let _forcedOfflineIndex = -1;
let _windowProtected = false;

// Callbacks (set by PlayerCore integration)
let _onResolvedSource = null;    // (track, sourceResult) => void — start playback
let _onPause = null;             // () => void
let _onShowS2Modal = null;       // (options) => void
let _onShowR3Modal = null;       // (msg) => void
let _onHideModal = null;         // () => void
let _getCurrentlyPlaying = null; // () => { uid, isPlaying, progress }

function configure(callbacks) {
  _onResolvedSource = callbacks.onResolvedSource || null;
  _onPause = callbacks.onPause || null;
  _onShowS2Modal = callbacks.onShowS2Modal || null;
  _onShowR3Modal = callbacks.onShowR3Modal || null;
  _onHideModal = callbacks.onHideModal || null;
  _getCurrentlyPlaying = callbacks.getCurrentlyPlaying || null;
}

function setBaseUrl(url) { _baseUrl = url; }

// ===================== PLAYLIST & WINDOW =====================

/**
 * Set the current playing playlist and position
 * Called when playlist changes (album select, shuffle toggle, favorites filter)
 */
function setPlaylist(tracks, curIndex, direction) {
  _playlist = tracks.filter(t => t && t.uid);
  _curIndex = curIndex >= 0 && curIndex < _playlist.length ? curIndex : 0;
  _direction = direction || 'next';
  _updateWindow();
}

function getPlaylist() { return _playlist; }
function getCurIndex() { return _curIndex; }

function getCurTrack() {
  return _playlist[_curIndex] || null;
}

function _getIndex(offset) {
  if (_playlist.length === 0) return -1;
  return ((_curIndex + offset) % _playlist.length + _playlist.length) % _playlist.length;
}

function getPrevTrack() {
  const i = _getIndex(-1);
  return i >= 0 ? _playlist[i] : null;
}

function getNextTrack() {
  const i = _getIndex(1);
  return i >= 0 ? _playlist[i] : null;
}

/** ТЗ 7.3: compute window of 3 */
function getWindow() {
  const cur = getCurTrack();
  const prev = getPrevTrack();
  const next = getNextTrack();
  return { prev, cur, next };
}

function _updateWindow() {
  const w = getWindow();
  const newUids = new Set();
  if (w.prev) newUids.add(w.prev.uid);
  if (w.cur) newUids.add(w.cur.uid);
  if (w.next) newUids.add(w.next.uid);

  const mode = getMode();
  if (mode === MODES.R1 || mode === MODES.R2) {
    // ТЗ 7.6.3: remove transient tracks no longer in window
    for (const uid of _windowUids) {
      if (!newUids.has(uid)) {
        _removeTransient(uid);
      }
    }
    _windowUids = newUids;

    // ТЗ 7.5.3.4: protect window if in recovery scenario
    if (_windowProtected) {
      protectWindow(Array.from(newUids));
    }

    // ТЗ 7.7: enqueue downloads for window
    _enqueueWindowDownloads();
  } else {
    _windowUids = newUids;
  }
}

async function _removeTransient(uid) {
  const meta = await getTrackMeta(uid);
  if (meta && meta.cacheKind === 'playbackWindow') {
    const { deleteAudioBlob } = await import('./cache-db.js');
    await deleteAudioBlob(uid);
    meta.cacheKind = 'none';
    meta.cachedVariant = null;
    meta.cachedComplete = 0;
    await saveTrackMeta(meta);
  }
}

/** ТЗ 7.7: strict download order CUR → neighbor */
function _enqueueWindowDownloads() {
  const mode = getMode();
  if (mode !== MODES.R1 && mode !== MODES.R2) return;
  if (!isNetworkAllowedForPlayback()) return;

  const apq = getActivePlaybackQuality();
  const w = getWindow();

  // P0: CUR
  if (w.cur) _enqueueIfNeeded(w.cur, apq, PRIORITY.P0_CUR);

  // P1: neighbor by direction
  if (_direction === 'prev') {
    if (w.prev) _enqueueIfNeeded(w.prev, apq, PRIORITY.P1_NEIGHBOR);
    if (w.next) _enqueueIfNeeded(w.next, apq, PRIORITY.P1_NEIGHBOR);
  } else {
    if (w.next) _enqueueIfNeeded(w.next, apq, PRIORITY.P1_NEIGHBOR);
    if (w.prev) _enqueueIfNeeded(w.prev, apq, PRIORITY.P1_NEIGHBOR);
  }
}

async function _enqueueIfNeeded(track, variant, priority) {
  if (!track || !track.uid) return;
  // ТЗ 7.6.2: don't re-download if already local
  const entry = await getAudioEntry(track.uid);
  if (entry && entry.variant === variant) return;
  // If any local copy exists, still usable (best effort)
  if (entry) return;

  const url = resolveVariantUrl(track, variant, _baseUrl);
  if (!url) return;

  enqueue({
    uid: track.uid,
    variant,
    url,
    priority,
    cacheKind: 'playbackWindow'
  });
}

// ===================== RESOLVE & PLAY =====================

/**
 * Resolve source and start playback for a track
 * ТЗ 7.4.3: Normative Source Resolver
 */
async function resolveAndPlay(track, direction) {
  if (!track) return;
  _direction = direction || 'next';

  const mode = getMode();

  // R3 special handling (ТЗ 7.5.4)
  if (mode === MODES.R3) {
    return _resolveR3(track);
  }

  const result = await resolvePlayback(track, _baseUrl);

  if (result.url) {
    // Success
    _cancelRecovery();
    if (_onResolvedSource) _onResolvedSource(track, result);
    statsTrackStart(track.uid);
    if (mode === MODES.R2) omOnTrackPlayed(track.uid);
    return result;
  }

  // No source — enter 7.5.3 scenario
  return _handleBlockedTransition(track);
}

async function _resolveR3(track) {
  const result = await resolvePlayback(track, _baseUrl);
  if (result.url && result.isLocal) {
    if (_onResolvedSource) _onResolvedSource(track, result);
    statsTrackStart(track.uid);
    return result;
  }
  // ТЗ 7.5.4
  if (_onPause) _onPause();
  if (_onShowR3Modal) {
    _onShowR3Modal('Трек не найден в 100% OFFLINE. Откройте настройки 100% OFFLINE.');
  }
  return null;
}

// ===================== 7.5.3 STATE MACHINE =====================

async function _handleBlockedTransition(targetTrack) {
  _recoveryTarget = {
    uid: targetTrack.uid,
    track: targetTrack,
    index: _playlist.findIndex(t => t.uid === targetTrack.uid)
  };

  // ТЗ 7.5.3.4: protect window
  _windowProtected = true;
  protectWindow(Array.from(_windowUids));

  // Enter S1
  _smState = SM_S1_WAITING;
  _startS1Timer();
}

function _startS1Timer() {
  let elapsed = 0;
  const TIMEOUT = 10000;
  const RETRY_MS = 2000;

  // Retry getting src.url
  _s1RetryInterval = setInterval(async () => {
    if (!_recoveryTarget) { _cancelS1(); return; }

    const result = await resolvePlayback(_recoveryTarget.track, _baseUrl);
    if (result.url) {
      // ТЗ 7.5.3.5: src.url appeared
      _cancelS1();
      _cancelRecovery();
      if (_onResolvedSource) _onResolvedSource(_recoveryTarget.track, result);
      statsTrackStart(_recoveryTarget.uid);
      return;
    }
  }, RETRY_MS);

  _s1Timer = setTimeout(() => {
    // ТЗ 7.5.3.7: 10 sec passed, enter S2
    _cancelS1Timer();
    _enterS2();
  }, TIMEOUT);
}

function _cancelS1Timer() {
  if (_s1Timer) { clearTimeout(_s1Timer); _s1Timer = null; }
}

function _cancelS1() {
  _cancelS1Timer();
  if (_s1RetryInterval) { clearInterval(_s1RetryInterval); _s1RetryInterval = null; }
}

/** Check if current track ended during S1 */
function onCurrentTrackEnded() {
  if (_smState === SM_S1_WAITING) {
    _cancelS1();
    _enterS2();
  }
}

/** ТЗ 7.5.3.7: S2 choice modal */
async function _enterS2() {
  _smState = SM_S2_CHOICE;
  if (_onPause) _onPause();

  const localTracks = await _getLocallyAvailableTracks();
  const hasLocalTracks = localTracks.length > 0;

  if (_onShowS2Modal) {
    _onShowS2Modal({
      hasLocalTracks,
      onWait: () => _enterS3Wait(),
      onSkip: () => _enterS3Skip(localTracks),
      onOpenOfflineSettings: () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('openOfflineModal'));
        }
      }
    });
  }
}

/** ТЗ 7.5.3.8: S3 wait — loop available window tracks */
async function _enterS3Wait() {
  _smState = SM_S3_WAIT;
  if (_onHideModal) _onHideModal();

  // Get locally available tracks from window only
  const windowTracks = await _getLocallyAvailableWindowTracks();

  if (windowTracks.length > 0) {
    _forcedOfflineQueue = windowTracks;
    _forcedOfflineIndex = 0;
    _playForcedNext();
  }

  // Continue retrying for recovery target
  _startRecoveryRetry();
}

/** ТЗ 7.5.3.9: S3 skip — FOQ with all local tracks */
async function _enterS3Skip(localTracks) {
  _smState = SM_S3_SKIP;
  if (_onHideModal) _onHideModal();

  // ТЗ 7.5.3.9: window tracks first, then user cache in random order
  const windowTracks = await _getLocallyAvailableWindowTracks();
  const otherTracks = localTracks.filter(t => !windowTracks.find(w => w.uid === t.uid));
  _shuffleArray(otherTracks);

  _forcedOfflineQueue = [...windowTracks, ...otherTracks];
  _forcedOfflineIndex = 0;

  // Current track finishes, then FOQ
  const cur = _getCurrentlyPlaying ? _getCurrentlyPlaying() : null;
  if (!cur || !cur.isPlaying) {
    _playForcedNext();
  }
  // else: wait for onCurrentTrackEnded to advance

  _startRecoveryRetry();
}

function _playForcedNext() {
  if (_forcedOfflineQueue.length === 0) return;
  _forcedOfflineIndex = _forcedOfflineIndex % _forcedOfflineQueue.length;
  const track = _forcedOfflineQueue[_forcedOfflineIndex];
  _forcedOfflineIndex++;

  resolvePlayback(track, _baseUrl).then(result => {
    if (result.url && _onResolvedSource) {
      _onResolvedSource(track, result);
      statsTrackStart(track.uid);
    }
  });
}

/** Called when forced offline track ends — play next in FOQ */
function onForcedTrackEnded() {
  if (_smState === SM_S3_WAIT || _smState === SM_S3_SKIP) {
    _playForcedNext();
  }
}

let _recoveryRetryInterval = null;

function _startRecoveryRetry() {
  if (_recoveryRetryInterval) clearInterval(_recoveryRetryInterval);
  _recoveryRetryInterval = setInterval(async () => {
    if (!_recoveryTarget) { _cancelRecoveryRetry(); return; }

    const result = await resolvePlayback(_recoveryTarget.track, _baseUrl);
    if (result.url) {
      // ТЗ 7.5.3.10: network restored
      _cancelRecoveryRetry();

      // Let current forced track finish
      const cur = _getCurrentlyPlaying ? _getCurrentlyPlaying() : null;
      if (cur && cur.isPlaying) {
        // Wait for it to end, then play recovery target
        _pendingRecovery = result;
      } else {
        _completeRecovery(result);
      }
    }
  }, 3000);
}

let _pendingRecovery = null;

/** Called when any track ends — check if pending recovery */
function onAnyTrackEnded() {
  if (_pendingRecovery && _recoveryTarget) {
    _completeRecovery(_pendingRecovery);
    _pendingRecovery = null;
    return true; // consumed
  }

  if (_smState === SM_S1_WAITING) {
    onCurrentTrackEnded();
    return true;
  }

  if (_smState === SM_S3_WAIT || _smState === SM_S3_SKIP) {
    onForcedTrackEnded();
    return true;
  }

  return false;
}

function _completeRecovery(result) {
  // ТЗ 7.5.3.10
  if (_onHideModal) _onHideModal();
  if (_onResolvedSource && _recoveryTarget) {
    _onResolvedSource(_recoveryTarget.track, result);
    statsTrackStart(_recoveryTarget.uid);
  }
  _cancelRecovery();
}

function _cancelRecovery() {
  _smState = SM_IDLE;
  _recoveryTarget = null;
  _forcedOfflineQueue = [];
  _forcedOfflineIndex = -1;
  _pendingRecovery = null;
  _windowProtected = false;
  unprotectWindow();
  _cancelS1();
  _cancelRecoveryRetry();
}

function _cancelRecoveryRetry() {
  if (_recoveryRetryInterval) {
    clearInterval(_recoveryRetryInterval);
    _recoveryRetryInterval = null;
  }
}

// ===================== LOCAL TRACK HELPERS =====================

async function _getLocallyAvailableTracks() {
  const tracks = [];
  const metas = await getAllTrackMetas();
  for (const m of metas) {
    if (m.cachedComplete === 100 && m.cachedVariant) {
      const track = _playlist.find(t => t.uid === m.uid) || _findTrackGlobal(m.uid);
      if (track) tracks.push(track);
    }
  }
  return tracks;
}

async function _getLocallyAvailableWindowTracks() {
  const w = getWindow();
  const tracks = [];
  for (const t of [w.cur, w.prev, w.next]) {
    if (!t) continue;
    const has = await hasAudioLocally(t.uid);
    if (has) tracks.push(t);
  }
  return tracks;
}

function _findTrackGlobal(uid) {
  return _playlist.find(t => t.uid === uid) || null;
}

// ===================== NAVIGATION =====================

/** ТЗ 7.8: shift window on next */
async function goNext() {
  if (_smState === SM_S1_WAITING) {
    // ТЗ 7.5.3.6: next during S1, play from window if possible
    return _playNextInWindow();
  }

  if (_playlist.length === 0) return null;
  _direction = 'next';
  const newIndex = _getIndex(1);
  _curIndex = newIndex;
  _updateWindow();
  return resolveAndPlay(_playlist[_curIndex], 'next');
}

async function goPrev() {
  if (_smState === SM_S1_WAITING) {
    return _playPrevInWindow();
  }

  if (_playlist.length === 0) return null;
  _direction = 'prev';
  const newIndex = _getIndex(-1);
  _curIndex = newIndex;
  _updateWindow();
  return resolveAndPlay(_playlist[_curIndex], 'prev');
}

async function goToTrack(uid) {
  const index = _playlist.findIndex(t => t.uid === uid);
  if (index < 0) return null;
  _curIndex = index;
  _direction = 'next';
  _updateWindow();
  return resolveAndPlay(_playlist[_curIndex], 'next');
}

/** ТЗ 7.5.3.6: next/prev inside window during S1 */
async function _playNextInWindow() {
  const available = await _getLocallyAvailableWindowTracks();
  if (available.length === 0) return null;

  const curUid = _getCurrentlyPlaying ? _getCurrentlyPlaying().uid : null;
  const curIdx = available.findIndex(t => t.uid === curUid);
  const nextIdx = (curIdx + 1) % available.length;
  const track = available[nextIdx];

  const result = await resolvePlayback(track, _baseUrl);
  if (result.url && _onResolvedSource) {
    _onResolvedSource(track, result);
    statsTrackStart(track.uid);
  }
  return result;
}

async function _playPrevInWindow() {
  const available = await _getLocallyAvailableWindowTracks();
  if (available.length === 0) return null;

  const curUid = _getCurrentlyPlaying ? _getCurrentlyPlaying().uid : null;
  const curIdx = available.findIndex(t => t.uid === curUid);
  const prevIdx = (curIdx - 1 + available.length) % available.length;
  const track = available[prevIdx];

  const result = await resolvePlayback(track, _baseUrl);
  if (result.url && _onResolvedSource) {
    _onResolvedSource(track, result);
    statsTrackStart(track.uid);
  }
  return result;
}

// ===================== HELPERS =====================

function _shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getState() {
  return {
    smState: _smState,
    recoveryTarget: _recoveryTarget,
    windowUids: Array.from(_windowUids),
    curIndex: _curIndex,
    direction: _direction,
    playlistLength: _playlist.length
  };
}

function isInRecoveryMode() {
  return _smState !== SM_IDLE;
}

export {
  configure, setBaseUrl, setPlaylist,
  getPlaylist, getCurIndex, getCurTrack,
  getPrevTrack, getNextTrack, getWindow,
  resolveAndPlay, goNext, goPrev, goToTrack,
  onAnyTrackEnded, isInRecoveryMode, getState,
  SM_IDLE, SM_S1_WAITING, SM_S2_CHOICE, SM_S3_WAIT, SM_S3_SKIP
};

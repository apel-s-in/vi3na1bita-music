/**
 * Integration Bridge v1.0
 * Связка всех новых модулей с существующим приложением
 * Не ломает существующий код — только расширяет
 */

import { getMode, MODES, onModeChange, getActivePlaybackQuality, getPlaybackQuality } from './mode-manager.js';
import * as CacheDB from './cache-db.js';
import * as StatsCore from './stats-core.js';
import * as TrackResolver from './track-resolver.js';
import * as DownloadQueue from './download-queue.js';
import * as OfflineManager from './offline-manager.js';
import * as PlaybackCache from './playback-cache.js';
import * as OfflineModal from './offline-modal.js';
import * as StatsModal from './stats-modal.js';
import * as OfflineIndicators from './offline-indicators.js';
import * as QualityButton from './quality-button.js';
import * as S2Modal from './s2-modal.js';
import * as R3Modal from './r3-modal.js';

let _playerCore = null;
let _initialized = false;
let _allTracks = [];
let _baseUrl = '';

/**
 * Main initialization
 * Call after DOM ready and config loaded
 * @param {Object} opts
 * @param {Object} opts.playerCore - existing player instance
 * @param {Array}  opts.allTracks - all tracks from config
 * @param {Array}  opts.albumsData - albums from albums.json
 * @param {string} opts.baseUrl - base URL for audio files
 */
function initialize(opts) {
  if (_initialized) return;
  _initialized = true;

  const { playerCore, allTracks, albumsData, baseUrl } = opts;
  _playerCore = playerCore;
  _allTracks = allTracks || [];
  _baseUrl = baseUrl || '';

  console.log('[Bridge] Initializing offline system v1.0');

  // Set base URLs
  TrackResolver.setBaseUrl(_baseUrl);
  PlaybackCache.setBaseUrl(_baseUrl);

  // Store tracks globally for stats modal
  window._allTracksForStats = _allTracks;

  // Init OfflineManager
  OfflineManager.init(_allTracks, albumsData, _baseUrl);

  // Configure PlaybackCache callbacks
  PlaybackCache.configure({
    onResolvedSource: _handleResolvedSource,
    onPause: () => { if (_playerCore && _playerCore.pause) _playerCore.pause(); },
    onShowS2Modal: (options) => S2Modal.show(options),
    onShowR3Modal: (msg) => R3Modal.showTrackNotFound(msg),
    onHideModal: () => { S2Modal.hide(); R3Modal.hide(); },
    getCurrentlyPlaying: _getCurrentPlaying
  });

  // Init quality button
  QualityButton.init(_handleQualitySwitch);

  // Init modals
  OfflineModal.init();
  StatsModal.init();

  // Init indicators
  OfflineIndicators.init();

  // Hook into existing player
  _hookPlayerEvents();
  _hookOfflineButton();
  _hookR3TrackClicks();

  // Check for updates
  if (_allTracks.length > 0) {
    setTimeout(() => OfflineManager.checkForUpdates(_allTracks), 3000);
  }

  // Mode change handler
  onModeChange(_handleModeChange);

  console.log('[Bridge] Init complete. Mode:', getMode());
}

// ===================== PLAYER HOOKS =====================

function _getCurrentPlaying() {
  if (!_playerCore) return { uid: null, isPlaying: false, progress: 0 };
  let uid = null;
  let isPlaying = false;
  let progress = 0;

  try {
    if (_playerCore.getCurrentTrackUid) uid = _playerCore.getCurrentTrackUid();
    else if (_playerCore.currentTrack) uid = _playerCore.currentTrack.uid || _playerCore.currentTrack.id;
  } catch(e) {}

  try {
    if (_playerCore.isPlaying) isPlaying = _playerCore.isPlaying();
    else if (_playerCore.playing !== undefined) isPlaying = _playerCore.playing;
  } catch(e) {}

  try {
    if (_playerCore.getProgress) progress = _playerCore.getProgress();
  } catch(e) {}

  return { uid, isPlaying, progress };
}

function _hookPlayerEvents() {
  if (!_playerCore) {
    console.warn('[Bridge] No playerCore provided, using event-based hooks');
    _hookViaEvents();
    return;
  }

  // Try direct hook methods first
  if (typeof _playerCore.onTrackChange === 'function') {
    _playerCore.onTrackChange((track, direction) => {
      if (track) {
        QualityButton.setCurrentTrack(track);
        OfflineIndicators.setCacheProgressTrack(track.uid);
      }
    });
  }

  if (typeof _playerCore.onTrackEnded === 'function') {
    _playerCore.onTrackEnded((uid, progress, durationValid) => {
      StatsCore.onEnded(uid, progress, durationValid);
      PlaybackCache.onAnyTrackEnded();
    });
  }

  if (typeof _playerCore.onTrackSkipped === 'function') {
    _playerCore.onTrackSkipped((uid, progress, durationValid) => {
      StatsCore.onSkip(uid, progress, durationValid);
    });
  }

  if (typeof _playerCore.onSeek === 'function') {
    _playerCore.onSeek((uid, from, to) => {
      StatsCore.onSeek(uid, from, to);
    });
  }

  if (typeof _playerCore.onPlay === 'function') {
    _playerCore.onPlay(() => StatsCore.resumeTicking());
  }

  if (typeof _playerCore.onPause === 'function') {
    _playerCore.onPause(() => StatsCore.pauseTicking());
  }

  // Fallback: also hook via events
  _hookViaEvents();
}

function _hookViaEvents() {
  // Listen for custom events from existing player
  window.addEventListener('playerTrackStart', (e) => {
    const { uid, track } = e.detail || {};
    if (uid) {
      StatsCore.onTrackStart(uid);
      if (track) {
        QualityButton.setCurrentTrack(track);
        OfflineIndicators.setCacheProgressTrack(uid);
      }
    }
  });

  window.addEventListener('playerTrackEnded', (e) => {
    const { uid, progress, durationValid } = e.detail || {};
    if (uid) {
      const prog = progress !== undefined ? progress : 1;
      const valid = durationValid !== undefined ? durationValid : true;
      StatsCore.onEnded(uid, prog, valid);
      PlaybackCache.onAnyTrackEnded();
    }
  });

  window.addEventListener('playerPlay', () => StatsCore.resumeTicking());
  window.addEventListener('playerPause', () => StatsCore.pauseTicking());

  window.addEventListener('playerSeek', (e) => {
    const { uid, from, to } = e.detail || {};
    if (uid) StatsCore.onSeek(uid, from, to);
  });

  window.addEventListener('playerSkip', (e) => {
    const { uid, progress, durationValid } = e.detail || {};
    if (uid) {
      StatsCore.onSkip(uid, progress || 0, durationValid !== false);
    }
  });
}

function _hookOfflineButton() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  // Clone to remove old handlers
  const newBtn = btn.cloneNode(true);
  if (btn.parentNode) btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    OfflineModal.open();
  });
}

function _hookR3TrackClicks() {
  document.addEventListener('click', async (e) => {
    if (getMode() !== MODES.R3) return;

    const trackRow = e.target.closest('[data-uid]');
    if (!trackRow) return;
    // Don't intercept indicator clicks
    if (e.target.closest('.offline-indicator')) return;

    const uid = trackRow.dataset.uid;
    const isInSet = await OfflineManager.isInFullOfflineSet(uid);
    if (!isInSet) {
      e.preventDefault();
      e.stopPropagation();
      const track = _allTracks.find(t => t.uid === uid);
      R3Modal.showAddTrackPrompt(uid, track ? track.title : uid);
    }
  }, true);

  window.addEventListener('r3AddTrack', async (e) => {
    const { uid } = e.detail;
    if (uid) {
      await OfflineManager.togglePinned(uid, true);
      if (window.showToast) window.showToast('Трек добавлен в загрузку');
    }
  });
}

// ===================== SOURCE RESOLVED =====================

function _handleResolvedSource(track, result) {
  if (!_playerCore || !result || !result.url) return;

  // Save current state (ТЗ 3, 4.2)
  let wasPlaying = false;
  let pos = 0;
  try {
    wasPlaying = _playerCore.isPlaying ? _playerCore.isPlaying() : false;
    pos = _playerCore.getPosition ? _playerCore.getPosition() : 0;
  } catch(e) {}

  const useHtml5 = !result.isLocal; // ТЗ 16.1

  // Try loadSource first (new API)
  if (typeof _playerCore.loadSource === 'function') {
    _playerCore.loadSource(track, result.url, {
      html5: useHtml5,
      preservePosition: pos > 0 ? pos : undefined,
      autoplay: wasPlaying
    });
  } else if (typeof _playerCore.load === 'function') {
    // Fallback: existing load method
    _playerCore.load(track, result.url);
    if (pos > 0) {
      setTimeout(() => {
        try {
          if (_playerCore.seek) _playerCore.seek(pos);
          if (wasPlaying && _playerCore.play) _playerCore.play();
        } catch(e) {}
      }, 200);
    }
  }

  // Emit event for other listeners
  window.dispatchEvent(new CustomEvent('playerTrackStart', {
    detail: { uid: track.uid, track }
  }));

  // Dynamic cache in R2
  if (getMode() === MODES.R2) {
    OfflineManager.onTrackPlayed(track.uid);
  }
}

// ===================== QUALITY SWITCH =====================

function _handleQualitySwitch(newQuality) {
  if (!_playerCore) return;
  const mode = getMode();
  if (mode !== MODES.R0 && mode !== MODES.R1) return;

  const track = PlaybackCache.getCurTrack();
  if (!track) return;

  // ТЗ 4.2: save pos and wasPlaying
  let wasPlaying = false;
  let pos = 0;
  try {
    wasPlaying = _playerCore.isPlaying ? _playerCore.isPlaying() : false;
    pos = _playerCore.getPosition ? _playerCore.getPosition() : 0;
  } catch(e) {}

  const url = TrackResolver.resolveVariantUrl(track, newQuality, _baseUrl);
  if (!url) return;

  if (typeof _playerCore.loadSource === 'function') {
    _playerCore.loadSource(track, url, {
      html5: true,
      preservePosition: pos,
      autoplay: wasPlaying
    });
  } else if (typeof _playerCore.load === 'function') {
    _playerCore.load(track, url);
    setTimeout(() => {
      try {
        if (_playerCore.seek) _playerCore.seek(pos);
        if (wasPlaying && _playerCore.play) _playerCore.play();
      } catch(e) {}
    }, 200);
  }
}

// ===================== MODE CHANGE =====================

function _handleModeChange(mode) {
  console.log('[Bridge] Mode changed to:', mode);
  _updateR3TrackStyling(mode);
}

async function _updateR3TrackStyling(mode) {
  const rows = document.querySelectorAll('[data-uid]');
  if (mode !== MODES.R3) {
    rows.forEach(r => r.classList.remove('r3-inactive'));
    return;
  }
  for (const row of rows) {
    const uid = row.dataset.uid;
    if (!uid) continue;
    const isIn = await OfflineManager.isInFullOfflineSet(uid);
    row.classList.toggle('r3-inactive', !isIn);
  }
}

// ===================== PLAYLIST SYNC =====================

/**
 * Call when playing playlist changes
 */
function syncPlaylist(tracks, curIndex, direction) {
  PlaybackCache.setPlaylist(tracks, curIndex, direction);
}

/**
 * Route next/prev through PlaybackCache
 */
async function handleNext() {
  return PlaybackCache.goNext();
}

async function handlePrev() {
  return PlaybackCache.goPrev();
}

async function handleTrackSelect(uid) {
  return PlaybackCache.goToTrack(uid);
}

// ===================== EXPORTS =====================

export {
  initialize,
  syncPlaylist,
  handleNext,
  handlePrev,
  handleTrackSelect
};

// Make available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.OfflineBridge = {
    initialize,
    syncPlaylist,
    handleNext,
    handlePrev,
    handleTrackSelect,
    // Expose for debugging
    getMode,
    MODES,
    OfflineManager,
    PlaybackCache,
    StatsCore,
    CacheDB,
    TrackResolver,
    DownloadQueue
  };
}

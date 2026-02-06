/**
 * ModeManager — управление режимами R0-R3 (ТЗ 1.5)
 * R0 Streaming (default), R1 PlaybackCache-only, R2 Dynamic Offline, R3 100% OFFLINE
 */

const MODES = { R0: 'R0', R1: 'R1', R2: 'R2', R3: 'R3' };
const STORAGE_KEY = 'offline:mode:v1';
const PQ_KEY = 'qualityMode:v1';
const CQ_KEY = 'offline:cacheQuality:v1';
const FOQ_KEY = 'offline:fullOfflineQuality:v1';
const MIN_STORAGE_MB = 60;
const R1_BEFORE_R2_KEY = 'offline:r1BeforeR2:v1';

let _currentMode = MODES.R0;
let _listeners = [];

function _load() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && Object.values(MODES).includes(saved)) {
    _currentMode = saved;
  } else {
    _currentMode = MODES.R0;
  }
}

function _save() {
  localStorage.setItem(STORAGE_KEY, _currentMode);
}

function _notify() {
  _listeners.forEach(fn => { try { fn(_currentMode); } catch(e) { console.error('[ModeManager] listener error', e); } });
}

/** Check if device can guarantee MIN_STORAGE_MB (ТЗ 1.6) */
async function canGuaranteeStorage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const freeMB = ((est.quota || 0) - (est.usage || 0)) / (1024 * 1024);
      return freeMB >= MIN_STORAGE_MB;
    }
    // Fallback: assume OK on desktop, warn on iOS
    return true;
  } catch(e) {
    console.warn('[ModeManager] storage estimate failed', e);
    return true; // optimistic
  }
}

function getMode() { return _currentMode; }

async function setMode(mode) {
  if (!Object.values(MODES).includes(mode)) {
    console.error('[ModeManager] invalid mode', mode);
    return false;
  }
  if (mode === _currentMode) return true;

  // R1/R2/R3 require 60MB (ТЗ 1.6)
  if (mode !== MODES.R0) {
    const ok = await canGuaranteeStorage();
    if (!ok) {
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('Недостаточно свободного места. Нужно минимум 60 МБ.', 4000);
      }
      return false;
    }
  }

  // R3 mutual exclusion (ТЗ 11.2.A.4)
  if (mode === MODES.R3) {
    // R3 disables R1/R2
  }

  const prev = _currentMode;
  _currentMode = mode;
  _save();

  // When entering R2, auto-sync CQ (ТЗ 6.3)
  // When entering R3, CQ = FOQ (ТЗ 5.3)
  if (mode === MODES.R3) {
    const foq = getFullOfflineQuality();
    setCacheQuality(foq);
  }

  _notify();
  console.log(`[ModeManager] ${prev} → ${mode}`);
  return true;
}

/** ТЗ 11.2.A.2: when enabling R2, remember R1 state */
function enableDynamicOffline() {
  const wasR1 = _currentMode === MODES.R1;
  localStorage.setItem(R1_BEFORE_R2_KEY, wasR1 ? '1' : '0');
  return setMode(MODES.R2);
}

/** ТЗ 11.2.A.3: when disabling R2, restore R1 state */
function disableDynamicOffline() {
  const wasR1 = localStorage.getItem(R1_BEFORE_R2_KEY) === '1';
  localStorage.removeItem(R1_BEFORE_R2_KEY);
  return setMode(wasR1 ? MODES.R1 : MODES.R0);
}

// Quality getters/setters (ТЗ 1.2)
function getPlaybackQuality() {
  return localStorage.getItem(PQ_KEY) || 'hi';
}
function setPlaybackQuality(q) {
  if (q !== 'hi' && q !== 'lo') return;
  localStorage.setItem(PQ_KEY, q);
  _notify();
}

function getCacheQuality() {
  return localStorage.getItem(CQ_KEY) || 'hi';
}
function setCacheQuality(q) {
  if (q !== 'hi' && q !== 'lo') return;
  const prev = getCacheQuality();
  localStorage.setItem(CQ_KEY, q);
  if (prev !== q) {
    // Trigger needsReCache for all cached tracks (ТЗ 5.2)
    window.dispatchEvent(new CustomEvent('cacheQualityChanged', { detail: { from: prev, to: q } }));
  }
  _notify();
}

function getFullOfflineQuality() {
  return localStorage.getItem(FOQ_KEY) || 'hi';
}
function setFullOfflineQuality(q) {
  if (q !== 'hi' && q !== 'lo') return;
  localStorage.setItem(FOQ_KEY, q);
  // ТЗ 5.3: CQ auto-syncs to FOQ
  setCacheQuality(q);
  _notify();
}

/** ТЗ 6.3: ActivePlaybackQuality by mode */
function getActivePlaybackQuality() {
  switch (_currentMode) {
    case MODES.R0: return getPlaybackQuality();
    case MODES.R1: return getPlaybackQuality();
    case MODES.R2: return getCacheQuality();
    case MODES.R3: return getFullOfflineQuality();
    default: return getPlaybackQuality();
  }
}

/** Is network allowed for playback in current mode? */
function isNetworkAllowedForPlayback() {
  if (_currentMode === MODES.R3) return false;
  return isNetworkAllowedByPolicy();
}

/** Network policy (ТЗ 11.2.D) */
function isNetworkAllowedByPolicy() {
  const wifiOk = localStorage.getItem('offline:net:wifi:v1') !== '0';
  const mobileOk = localStorage.getItem('offline:net:mobile:v1') !== '0';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return true; // unknown = allowed (confirm for mass ops separately)
  const type = conn.type || conn.effectiveType || '';
  if (type === 'wifi') return wifiOk;
  if (['cellular', '2g', '3g', '4g', '5g'].includes(type)) return mobileOk;
  return true; // unknown
}

function isNetworkUnknown() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return true;
  const type = conn.type || '';
  return !['wifi', 'cellular', '2g', '3g', '4g', '5g', 'ethernet'].includes(type);
}

function onModeChange(fn) { _listeners.push(fn); }
function offModeChange(fn) { _listeners = _listeners.filter(f => f !== fn); }

// Init
_load();

export {
  MODES,
  getMode, setMode,
  enableDynamicOffline, disableDynamicOffline,
  getPlaybackQuality, setPlaybackQuality,
  getCacheQuality, setCacheQuality,
  getFullOfflineQuality, setFullOfflineQuality,
  getActivePlaybackQuality,
  isNetworkAllowedForPlayback, isNetworkAllowedByPolicy, isNetworkUnknown,
  canGuaranteeStorage,
  onModeChange, offModeChange,
  MIN_STORAGE_MB
};

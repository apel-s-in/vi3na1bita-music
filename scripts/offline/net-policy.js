// scripts/offline/net-policy.js
// Network Policy v3.0 — Audit Fix
// Fixes: #4.1 window.NetPolicy, #4.2 effectiveType removal, #4.5 monthKey format

const LS_WIFI = 'netPolicy:wifi:v1';
const LS_CELLULAR = 'netPolicy:cellular:v1';
const LS_CELLULAR_TOAST = 'netPolicy:cellularToast:v1';
const LS_KILL_SWITCH = 'netPolicy:killSwitch:v1';
const LS_TRAFFIC = 'trafficStats:v2';

let _platformCache = null;
let _interceptorInstalled = false;
let _originalFetch = null;
let _networkListenerInstalled = false;

/* ═══════ Platform & Info ═══════ */

export function getPlatform() {
  if (_platformCache) return _platformCache;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isFirefox = /Firefox\//i.test(ua);
  const hasNetInfo = !!(navigator.connection && navigator.connection.type !== undefined);
  _platformCache = {
    isIOS, isFirefox, hasNetInfo,
    supportsNetControl: hasNetInfo && !isIOS && !isFirefox
  };
  return _platformCache;
}

export function getNetworkSpeed() {
  const p = getPlatform();
  if (!p.hasNetInfo) return null;
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return conn ? (conn.downlink || null) : null;
}

// Fix #4.2: Only use conn.type, NOT effectiveType
export function detectNetworkType() {
  const p = getPlatform();
  if (!p.hasNetInfo) return 'unknown';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return 'unknown';
  const type = String(conn.type || '').toLowerCase();
  if (type === 'wifi' || type === 'ethernet') return 'wifi';
  if (type === 'cellular') return 'cellular';
  // Fix #4.2: If type is not defined, return 'unknown' (treated as wifi per ТЗ 2.5)
  return 'unknown';
}

export function getNetworkLabel() {
  const t = detectNetworkType();
  if (t === 'wifi') return 'Wi-Fi';
  if (t === 'cellular') return 'Cellular';
  return 'Wi-Fi';
}

/* ═══════ Policy State ═══════ */

function _lsGet(k, def) { const v = localStorage.getItem(k); return v === null ? def : v; }
function _lsSet(k, v) { localStorage.setItem(k, v); }

export function getNetPolicyState() {
  const p = getPlatform();
  if (!p.supportsNetControl) {
    const killSwitch = _lsGet(LS_KILL_SWITCH, 'off') === 'on';
    return {
      wifiEnabled: true, cellularEnabled: true, cellularToast: false,
      killSwitch, airplaneMode: killSwitch, supportsNetControl: false
    };
  }
  const wifiEnabled = _lsGet(LS_WIFI, 'on') === 'on';
  const cellularEnabled = _lsGet(LS_CELLULAR, 'on') === 'on';
  return {
    wifiEnabled, cellularEnabled,
    cellularToast: _lsGet(LS_CELLULAR_TOAST, 'off') === 'on',
    killSwitch: false,
    airplaneMode: !wifiEnabled && !cellularEnabled,
    supportsNetControl: true
  };
}

/* ═══════ Helpers for UI ═══════ */

export function getCurrentMonthName() {
  try {
    return new Intl.DateTimeFormat('ru', { month: 'long' }).format(new Date());
  } catch {
    return ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][new Date().getMonth()];
  }
}

export function getStatusText() {
  const s = getNetPolicyState();
  if (s.airplaneMode || s.killSwitch) return 'Интернет полностью отключён';
  if (!s.supportsNetControl) return '';
  const type = detectNetworkType();
  if (!s.wifiEnabled && (type === 'wifi' || type === 'unknown')) return 'Wi-Fi/Ethernet заблокирован настройками';
  if (!s.cellularEnabled && type === 'cellular') return 'Мобильная сеть заблокирована настройками';
  return '';
}

/* ═══════ Actions ═══════ */

function _emitChange() {
  window.dispatchEvent(new CustomEvent('netPolicy:changed', { detail: getNetPolicyState() }));
}

export function toggleWifi() {
  const s = _lsGet(LS_WIFI, 'on') === 'on';
  _lsSet(LS_WIFI, s ? 'off' : 'on');
  _emitChange();
  return !s;
}

export function toggleCellular() {
  const s = _lsGet(LS_CELLULAR, 'on') === 'on';
  _lsSet(LS_CELLULAR, s ? 'off' : 'on');
  _emitChange();
  return !s;
}

export function toggleCellularToast() {
  const s = _lsGet(LS_CELLULAR_TOAST, 'off') === 'on';
  _lsSet(LS_CELLULAR_TOAST, s ? 'off' : 'on');
  return !s;
}

export function toggleKillSwitch() {
  const s = _lsGet(LS_KILL_SWITCH, 'off') === 'on';
  _lsSet(LS_KILL_SWITCH, s ? 'off' : 'on');
  _emitChange();
  return !s;
}

/* ═══════ Checks ═══════ */

export function isNetworkAllowed() {
  if (!navigator.onLine) return false;
  const s = getNetPolicyState();
  if (s.airplaneMode || s.killSwitch) return false;
  if (!s.supportsNetControl) return true;
  const type = detectNetworkType();
  if (type === 'wifi' || type === 'unknown') return s.wifiEnabled;
  if (type === 'cellular') return s.cellularEnabled;
  return true;
}

export function shouldShowCellularToast() {
  const s = getNetPolicyState();
  return s.supportsNetControl && s.cellularEnabled && s.cellularToast && detectNetworkType() === 'cellular';
}

/* ═══════ Traffic Statistics ═══════ */

// Fix #4.5: monthKey format YYYY-MM with zero-padded month
function _mKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _getStatsRaw() {
  try {
    const raw = localStorage.getItem(LS_TRAFFIC);
    const mk = _mKey();
    const def = { wifi: { total: 0, monthly: 0, mKey: mk }, cellular: { total: 0, monthly: 0, mKey: mk }, general: { total: 0, monthly: 0, mKey: mk } };
    if (!raw) return def;
    const d = JSON.parse(raw);
    return { ...def, ...d };
  } catch {
    const mk = _mKey();
    return { wifi: { total: 0, monthly: 0, mKey: mk }, cellular: { total: 0, monthly: 0, mKey: mk }, general: { total: 0, monthly: 0, mKey: mk } };
  }
}

function _saveStats(s) { localStorage.setItem(LS_TRAFFIC, JSON.stringify(s)); }

function recordTraffic(bytes, category = null) {
  if (!bytes || bytes <= 0) return;
  const s = _getStatsRaw();
  const mk = _mKey();
  const p = getPlatform();
  const type = category || detectNetworkType();

  ['wifi', 'cellular', 'general'].forEach(k => { if (s[k].mKey !== mk) { s[k].monthly = 0; s[k].mKey = mk; } });

  if (!p.supportsNetControl) {
    s.general.total += bytes; s.general.monthly += bytes;
  } else {
    if (type === 'cellular') { s.cellular.total += bytes; s.cellular.monthly += bytes; }
    else { s.wifi.total += bytes; s.wifi.monthly += bytes; }
  }
  _saveStats(s);
}

export function getTrafficStats() {
  const s = _getStatsRaw();
  const p = getPlatform();
  if (!p.supportsNetControl) return { type: 'general', monthName: getCurrentMonthName(), general: s.general };
  return { type: 'split', monthName: getCurrentMonthName(), wifi: s.wifi, cellular: s.cellular };
}

export function clearTrafficStats() { localStorage.removeItem(LS_TRAFFIC); }

/* ═══════ Initialization ═══════ */

// Fix #4.1: Bind window.NetPolicy for non-module scripts (PlayerCore, DownloadQueue)
export function initNetPolicy() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;

  // Fix #4.1: Global bridge
  window.NetPolicy = { isNetworkAllowed, shouldShowCellularToast, getStatusText };

  _originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    if (!isNetworkAllowed()) return Promise.reject(new TypeError('Network blocked by NetPolicy'));
    try {
      const res = await _originalFetch(input, init);
      try {
        const clone = res.clone();
        const len = clone.headers.get('content-length');
        if (len) recordTraffic(parseInt(len, 10));
        else clone.blob().then(b => recordTraffic(b.size)).catch(() => {});
      } catch {}
      return res;
    } catch (e) { throw e; }
  };

  if (!_networkListenerInstalled) {
    _networkListenerInstalled = true;
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c) c.addEventListener('change', _emitChange);
    window.addEventListener('online', _emitChange);
    window.addEventListener('offline', _emitChange);
  }
}

export default { initNetPolicy, isNetworkAllowed, shouldShowCellularToast, getStatusText, getCurrentMonthName };

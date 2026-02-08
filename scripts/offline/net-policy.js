// scripts/offline/net-policy.js
// Network Policy v1.0 (spec-aligned, compact)
//
// Hard invariants:
// - Never calls playerCore.stop()/play()/seek/volume.
// - Blocks outgoing requests only in "airplane mode" (both toggles off) or iOS kill-switch.
// - Unknown network type must be treated optimistically as Ethernet/Wi‑Fi.

const LS_WIFI = 'netPolicy:wifi:v1';
const LS_CELLULAR = 'netPolicy:cellular:v1';
const LS_CELLULAR_TOAST = 'netPolicy:cellularToast:v1';
const LS_KILL_SWITCH = 'netPolicy:killSwitch:v1';
const LS_TRAFFIC = 'trafficStats:v1';

let _platform = null;
let _installed = false;
let _origFetch = null;
let _listenersBound = false;

const lsGet = (k, def) => { const v = localStorage.getItem(k); return v == null ? def : v; };
const lsSet = (k, v) => localStorage.setItem(k, v);

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function getPlatform() {
  if (_platform) return _platform;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isFirefox = /Firefox\//i.test(ua);

  // Spec: feature depends on Network Information API.
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const hasNetInfo = !!conn && typeof conn.type !== 'undefined';

  _platform = {
    isIOS,
    isFirefox,
    hasNetInfo,
    supportsNetControl: !!hasNetInfo && !isIOS && !isFirefox
  };
  return _platform;
}

export function getNetworkSpeed() {
  const p = getPlatform();
  if (!p.hasNetInfo) return null;
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return c && typeof c.downlink === 'number' ? c.downlink : null;
}

// Spec: use navigator.connection.type. Unknown/other => treat as Wi‑Fi/Ethernet.
export function detectNetworkType() {
  const p = getPlatform();
  if (!p.hasNetInfo) return 'unknown';
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const t = String(c?.type || '').toLowerCase();
  if (t === 'wifi' || t === 'ethernet') return 'wifi';
  if (t === 'cellular') return 'cellular';
  return 'unknown';
}

export function getNetworkLabel() {
  const t = detectNetworkType();
  return t === 'cellular' ? 'Cellular' : 'Wi-Fi';
}

export function getNetPolicyState() {
  const p = getPlatform();

  if (!p.supportsNetControl) {
    const killSwitch = lsGet(LS_KILL_SWITCH, 'off') === 'on';
    return {
      wifiEnabled: true,
      cellularEnabled: true,
      cellularToast: false,
      killSwitch,
      airplaneMode: killSwitch,
      supportsNetControl: false
    };
  }

  const wifiEnabled = lsGet(LS_WIFI, 'on') === 'on';
  const cellularEnabled = lsGet(LS_CELLULAR, 'on') === 'on';
  const cellularToast = lsGet(LS_CELLULAR_TOAST, 'off') === 'on';

  return {
    wifiEnabled,
    cellularEnabled,
    cellularToast,
    killSwitch: false,
    airplaneMode: !wifiEnabled && !cellularEnabled,
    supportsNetControl: true
  };
}

function emitChange() {
  try {
    window.dispatchEvent(new CustomEvent('netPolicy:changed', { detail: getNetPolicyState() }));
  } catch {}
}

export function toggleWifi() {
  const on = lsGet(LS_WIFI, 'on') === 'on';
  lsSet(LS_WIFI, on ? 'off' : 'on');
  emitChange();
  return !on;
}

export function toggleCellular() {
  const on = lsGet(LS_CELLULAR, 'on') === 'on';
  lsSet(LS_CELLULAR, on ? 'off' : 'on');
  emitChange();
  return !on;
}

export function toggleCellularToast() {
  const on = lsGet(LS_CELLULAR_TOAST, 'off') === 'on';
  lsSet(LS_CELLULAR_TOAST, on ? 'off' : 'on');
  return !on;
}

export function toggleKillSwitch() {
  const on = lsGet(LS_KILL_SWITCH, 'off') === 'on';
  lsSet(LS_KILL_SWITCH, on ? 'off' : 'on');
  emitChange();
  return !on;
}

// Spec: If both toggles off => "airplane mode" => no network requests at all.
export function isNetworkAllowed() {
  if (!navigator.onLine) return false;

  const s = getNetPolicyState();
  if (s.airplaneMode || s.killSwitch) return false;

  if (!s.supportsNetControl) return true;

  const t = detectNetworkType();
  if (t === 'cellular') return s.cellularEnabled;

  // wifi OR unknown => wifi bucket (optimistic)
  return s.wifiEnabled;
}

export function shouldShowCellularToast() {
  const s = getNetPolicyState();
  if (!s.supportsNetControl) return false;
  return !!s.cellularToast && detectNetworkType() === 'cellular' && isNetworkAllowed();
}

export function getStatusText() {
  const s = getNetPolicyState();

  if (!s.supportsNetControl) {
    return s.killSwitch ? 'Интернет полностью отключён' : 'Управление сетью не поддерживается';
  }

  if (s.airplaneMode) return 'Интернет полностью отключён';

  const t = detectNetworkType();
  if (!s.cellularEnabled && t === 'cellular') return 'Мобильная сеть заблокирована настройками';
  if (!s.wifiEnabled && (t === 'wifi' || t === 'unknown')) return 'Wi-Fi/Ethernet заблокирован настройками';
  return '';
}

/* =========================
 * Traffic statistics (localStorage)
 * ========================= */

export function getCurrentMonthName() {
  try {
    return new Intl.DateTimeFormat('ru', { month: 'long' }).format(new Date());
  } catch {
    return ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][new Date().getMonth()];
  }
}

function readStats() {
  const mk = monthKey();
  const def = {
    wifi: { total: 0, monthly: 0, monthKey: mk },
    cellular: { total: 0, monthly: 0, monthKey: mk },
    general: { total: 0, monthly: 0, monthKey: mk }
  };

  try {
    const raw = localStorage.getItem(LS_TRAFFIC);
    if (!raw) return def;
    const s = JSON.parse(raw) || {};
    const out = { ...def, ...s };

    // Ensure structure and monthly reset
    for (const k of ['wifi', 'cellular', 'general']) {
      out[k] = { ...def[k], ...(out[k] || {}) };
      if (out[k].monthKey !== mk) {
        out[k].monthKey = mk;
        out[k].monthly = 0;
      }
    }
    return out;
  } catch {
    return def;
  }
}

function writeStats(s) {
  try { localStorage.setItem(LS_TRAFFIC, JSON.stringify(s)); } catch {}
}

// Spec: attribute traffic to network type at request START.
function recordTraffic(bytes, netTypeAtStart) {
  const b = Number(bytes) || 0;
  if (b <= 0) return;

  const p = getPlatform();
  const s = readStats();

  if (!p.supportsNetControl) {
    s.general.total += b;
    s.general.monthly += b;
    writeStats(s);
    return;
  }

  const t = netTypeAtStart === 'cellular' ? 'cellular' : 'wifi';
  s[t].total += b;
  s[t].monthly += b;
  writeStats(s);
}

export function getTrafficStats() {
  const p = getPlatform();
  const s = readStats();
  const monthName = getCurrentMonthName();

  if (!p.supportsNetControl) {
    return { type: 'general', monthName, general: s.general };
  }
  return { type: 'split', monthName, wifi: s.wifi, cellular: s.cellular };
}

export function clearTrafficStats() {
  try { localStorage.removeItem(LS_TRAFFIC); } catch {}
}

/* =========================
 * Init: global bridge + fetch interceptor + listeners
 * ========================= */

function bindListenersOnce() {
  if (_listenersBound) return;
  _listenersBound = true;

  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (c?.addEventListener) c.addEventListener('change', emitChange);

  window.addEventListener('online', emitChange);
  window.addEventListener('offline', emitChange);
}

export function initNetPolicy() {
  if (_installed) return;
  _installed = true;

  // Global bridge for non-module callers
  window.NetPolicy = {
    isNetworkAllowed,
    shouldShowCellularToast,
    getStatusText,
    detectNetworkType,
    getNetPolicyState
  };

  // Install fetch interceptor
  _origFetch = window.fetch?.bind(window);
  if (typeof _origFetch === 'function') {
    window.fetch = async (input, init) => {
      if (!isNetworkAllowed()) throw new TypeError('Network blocked by NetPolicy');

      const typeAtStart = detectNetworkType();
      const bucket = typeAtStart === 'cellular' ? 'cellular' : 'wifi';

      const res = await _origFetch(input, init);

      try {
        const len = res.headers?.get?.('content-length');
        if (len) {
          recordTraffic(parseInt(len, 10) || 0, bucket);
        } else {
          res.clone().blob().then((b) => recordTraffic(b.size, bucket)).catch(() => {});
        }
      } catch {}

      return res;
    };
  }

  bindListenersOnce();
  emitChange();
}

export default {
  initNetPolicy,
  getPlatform,
  getNetPolicyState,
  getStatusText,
  detectNetworkType,
  getNetworkLabel,
  getNetworkSpeed,
  toggleWifi,
  toggleCellular,
  toggleCellularToast,
  toggleKillSwitch,
  isNetworkAllowed,
  shouldShowCellularToast,
  getTrafficStats,
  clearTrafficStats,
  getCurrentMonthName
};

const K = { W: 'netPolicy:wifi:v1', C: 'netPolicy:cellular:v1', T: 'netPolicy:cellularToast:v1', K: 'netPolicy:killSwitch:v1', S: 'trafficStats:v1' };
let _platform = null, _installed = false, _lastBlocked = null;
const ls = (k, d) => localStorage.getItem(k) ?? d, set = (k, v) => { localStorage.setItem(k, v); emitChange(); return v === 'off'; };

export const getPlatform = () => _platform || (_platform = (() => {
  const u = navigator.userAgent, i = /iPad|iPhone|iPod/.test(u) && !window.MSStream, f = /Firefox\//i.test(u), c = navigator.connection || navigator.mozConnection || navigator.webkitConnection, h = !!c && typeof c.type !== 'undefined';
  return { isIOS: i, isFirefox: f, hasNetInfo: h, supportsNetControl: h && !i && !f };
})());

export const detectNetworkType = () => String((navigator.connection || navigator.mozConnection || navigator.webkitConnection)?.type || '').toLowerCase() === 'cellular' ? 'cellular' : 'wifi';
export const getNetworkLabel = () => detectNetworkType() === 'cellular' ? 'Cellular' : 'Wi-Fi';
export const getNetworkSpeed = () => navigator.connection?.downlink ?? null;

export const getNetPolicyState = () => {
  const p = getPlatform(), k = ls(K.K, 'off') === 'on';
  if (!p.supportsNetControl) return { wifiEnabled: true, cellularEnabled: true, cellularToast: false, killSwitch: k, airplaneMode: k, supportsNetControl: false };
  const w = ls(K.W, 'on') === 'on', c = ls(K.C, 'on') === 'on';
  return { wifiEnabled: w, cellularEnabled: c, cellularToast: ls(K.T, 'off') === 'on', killSwitch: false, airplaneMode: !w && !c, supportsNetControl: true };
};

export const toggleWifi = () => set(K.W, ls(K.W, 'on') === 'on' ? 'off' : 'on');
export const toggleCellular = () => set(K.C, ls(K.C, 'on') === 'on' ? 'off' : 'on');
export const toggleCellularToast = () => set(K.T, ls(K.T, 'off') === 'on' ? 'off' : 'on');
export const toggleKillSwitch = () => set(K.K, ls(K.K, 'off') === 'on' ? 'off' : 'on');

export const isNetworkAllowed = () => {
  const s = getNetPolicyState();
  if (s.killSwitch || s.airplaneMode || !navigator.onLine) return false;
  return s.supportsNetControl ? (detectNetworkType() === 'cellular' ? s.cellularEnabled : s.wifiEnabled) : true;
};

export const shouldShowCellularToast = () => { const s = getNetPolicyState(); return s.supportsNetControl && s.cellularToast && detectNetworkType() === 'cellular' && isNetworkAllowed(); };
export const getStatusText = () => {
  const s = getNetPolicyState();
  if (!s.supportsNetControl || s.airplaneMode) return s.killSwitch || s.airplaneMode ? 'Интернет полностью отключён' : 'Управление сетью не поддерживается';
  const t = detectNetworkType();
  return (!s.cellularEnabled && t === 'cellular') ? 'Мобильная сеть заблокирована настройками' : (!s.wifiEnabled && t === 'wifi' ? 'Wi-Fi/Ethernet заблокирован настройками' : '');
};

const emitChange = () => {
  const s = getNetPolicyState(), t = detectNetworkType();
  let b = 'none';
  if (s.supportsNetControl && !s.airplaneMode) b = (t === 'cellular' && !s.cellularEnabled) ? 'cell' : ((t === 'wifi' && !s.wifiEnabled) ? 'wifi' : 'none');
  if (b !== 'none' && b !== _lastBlocked) window.NotificationSystem?.[b === 'cell' ? 'warning' : 'info']?.(b === 'cell' ? 'Мобильная сеть заблокирована настройками. Работаем офлайн.' : 'Wi-Fi/Ethernet заблокирован настройками. Работаем через мобильную сеть.');
  _lastBlocked = b; try { window.dispatchEvent(new CustomEvent('netPolicy:changed', { detail: s })); } catch {}
};

const mk = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const getCurrentMonthName = () => { try { return new Intl.DateTimeFormat('ru', { month: 'long' }).format(new Date()); } catch { return ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][new Date().getMonth()]; } };

const readStats = () => {
  const m = mk(), def = () => ({ total: 0, monthly: 0, monthKey: m }), o = { wifi: def(), cellular: def(), general: def() };
  try { const r = JSON.parse(localStorage.getItem(K.S) || '{}'); for (const k in o) if (r[k]) { o[k].total = Number(r[k].total) || 0; o[k].monthly = r[k].monthKey === m ? (Number(r[k].monthly) || 0) : 0; } } catch {}
  return o;
};

const writeStats = (b, t) => { if ((b = Number(b)) > 0) { const s = readStats(); s[t].total += b; s[t].monthly += b; localStorage.setItem(K.S, JSON.stringify(s)); } };
export const getTrafficStats = () => { const s = readStats(), n = getCurrentMonthName(); return getPlatform().supportsNetControl ? { type: 'split', monthName: n, wifi: s.wifi, cellular: s.cellular } : { type: 'general', monthName: n, general: s.general }; };
export const clearTrafficStats = () => { localStorage.removeItem(K.S); emitChange(); };

export const initNetPolicy = () => {
  if (_installed) return; _installed = true;
  window.NetPolicy = { isNetworkAllowed, shouldShowCellularToast, getStatusText, detectNetworkType, getNetPolicyState };
  const orig = window.fetch?.bind(window);
  if (orig) window.fetch = async (req, init) => {
    if (!isNetworkAllowed()) throw new TypeError('Network blocked by NetPolicy');
    const res = await orig(req, init), len = res.headers?.get('content-length');
    if (len) writeStats(len, getPlatform().supportsNetControl ? detectNetworkType() : 'general');
    return res;
  };
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  c?.addEventListener?.('change', emitChange); window.addEventListener('online', emitChange); window.addEventListener('offline', emitChange); emitChange();
};
export default { initNetPolicy, getPlatform, getNetPolicyState, getStatusText, detectNetworkType, getNetworkLabel, getNetworkSpeed, toggleWifi, toggleCellular, toggleCellularToast, toggleKillSwitch, isNetworkAllowed, shouldShowCellularToast, getTrafficStats, clearTrafficStats, getCurrentMonthName };

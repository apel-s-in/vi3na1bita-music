import { getCloudTrafficSummary, recordYandexStorageResponse, resetCloudUsage } from '../core/cloud-usage-meter.js';
const K = { W: 'netPolicy:wifi:v1', C: 'netPolicy:cellular:v1', T: 'netPolicy:cellularToast:v1', K: 'netPolicy:killSwitch:v1' };
let _platform = null, _installed = false, _lastBlocked = null;
const ls = (k, d) => localStorage.getItem(k) ?? d, set = (k, v) => { localStorage.setItem(k, v); emitChange(); return v === 'off'; };
export const getPlatform = () => _platform || (_platform = (() => { const u = navigator.userAgent, i = /iPad|iPhone|iPod/.test(u) && !window.MSStream, f = /Firefox\//i.test(u), c = navigator.connection || navigator.mozConnection || navigator.webkitConnection, h = !!c && typeof c.type !== 'undefined'; return { isIOS: i, isFirefox: f, hasNetInfo: h, supportsNetControl: h && !i && !f }; })());
export const detectNetworkType = () => String((navigator.connection || navigator.mozConnection || navigator.webkitConnection)?.type || '').toLowerCase() === 'cellular' ? 'cellular' : 'wifi';
export const getNetworkLabel = () => detectNetworkType() === 'cellular' ? 'Cellular' : 'Wi-Fi';
export const getNetworkSpeed = () => navigator.connection?.downlink ?? null;
export const getNetPolicyState = () => { const p = getPlatform(), k = ls(K.K, 'off') === 'on'; if (!p.supportsNetControl) return { wifiEnabled: true, cellularEnabled: true, cellularToast: false, killSwitch: k, airplaneMode: k, supportsNetControl: false }; const w = ls(K.W, 'on') === 'on', c = ls(K.C, 'on') === 'on'; return { wifiEnabled: w, cellularEnabled: c, cellularToast: ls(K.T, 'off') === 'on', killSwitch: false, airplaneMode: !w && !c, supportsNetControl: true }; };
export const toggleWifi = () => set(K.W, ls(K.W, 'on') === 'on' ? 'off' : 'on');
export const toggleCellular = () => set(K.C, ls(K.C, 'on') === 'on' ? 'off' : 'on');
export const toggleCellularToast = () => set(K.T, ls(K.T, 'off') === 'on' ? 'off' : 'on');
export const toggleKillSwitch = () => set(K.K, ls(K.K, 'off') === 'on' ? 'off' : 'on');
export const isNetworkAllowed = () => { const s = getNetPolicyState(); if (s.killSwitch || s.airplaneMode || !navigator.onLine) return false; return s.supportsNetControl ? (detectNetworkType() === 'cellular' ? s.cellularEnabled : s.wifiEnabled) : true; };
export const shouldShowCellularToast = () => { const s = getNetPolicyState(); return s.supportsNetControl && s.cellularToast && detectNetworkType() === 'cellular' && isNetworkAllowed(); };
export const getStatusText = () => { const s = getNetPolicyState(); if (!s.supportsNetControl || s.airplaneMode) return s.killSwitch || s.airplaneMode ? 'Интернет полностью отключён' : 'Управление сетью не поддерживается'; const t = detectNetworkType(); return (!s.cellularEnabled && t === 'cellular') ? 'Мобильная сеть заблокирована настройками' : (!s.wifiEnabled && t === 'wifi' ? 'Wi-Fi/Ethernet заблокирован настройками' : ''); };
const emitChange = () => { const s = getNetPolicyState(), t = detectNetworkType(); let b = 'none'; if (s.supportsNetControl && !s.airplaneMode) b = (t === 'cellular' && !s.cellularEnabled) ? 'cell' : ((t === 'wifi' && !s.wifiEnabled) ? 'wifi' : 'none'); if (b !== 'none' && b !== _lastBlocked) window.NotificationSystem?.[b === 'cell' ? 'warning' : 'info']?.(b === 'cell' ? 'Мобильная сеть заблокирована настройками. Работаем офлайн.' : 'Wi-Fi/Ethernet заблокирован настройками. Работаем через мобильную сеть.'); _lastBlocked = b; try { window.dispatchEvent(new CustomEvent('netPolicy:changed', { detail: s })); } catch {} };
export const getCurrentMonthName = () => '24 часа';
const requestUrl = request => typeof request === 'string' || request instanceof URL ? String(request) : request?.url || '';
export const trackTrafficFromResponse = (res, forcedType = null, request = null, startedAt = 0) => {
  const len = Number(res?.headers?.get?.('content-length') || 0);
  if (!navigator.serviceWorker?.controller) {
    recordYandexStorageResponse({
      url: requestUrl(request),
      method: request?.method || 'GET',
      response: res,
      responseBytes: len,
      durationMs: startedAt ? performance.now() - startedAt : 0
    });
  }
  return res;
};
export const fetchWithTraffic = async (req, init = {}, forcedType = null) => {
  const startedAt = performance.now();
  const response = await fetch(req, init);
  return trackTrafficFromResponse(response, forcedType, req, startedAt);
};
export const guardedFetch = async (req, init, forcedType = null) => { if (!isNetworkAllowed()) throw new TypeError('Network blocked by NetPolicy'); return fetchWithTraffic(req, init, forcedType); };
export const getTrafficStats = () => {
  const summary = getCloudTrafficSummary();
  return summary.type === 'split'
    ? { type: 'split', monthName: summary.periodLabel, wifi: { total: summary.wifi.total, monthly: summary.wifi.period }, cellular: { total: summary.cellular.total, monthly: summary.cellular.period } }
    : { type: 'general', monthName: summary.periodLabel, general: { total: summary.general.total, monthly: summary.general.period } };
};
export const clearTrafficStats = () => {
  resetCloudUsage();
  emitChange();
};
export const initNetPolicy = () => { if (_installed) return; _installed = true; try { localStorage.removeItem('trafficStats:v1'); } catch {} window.NetPolicy = { isNetworkAllowed, shouldShowCellularToast, getStatusText, detectNetworkType, getNetPolicyState, guardedFetch, fetchWithTraffic, trackTrafficFromResponse }; const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection; c?.addEventListener?.('change', emitChange); window.addEventListener('online', emitChange); window.addEventListener('offline', emitChange); emitChange(); };
export default { initNetPolicy, getPlatform, getNetPolicyState, getStatusText, detectNetworkType, getNetworkLabel, getNetworkSpeed, toggleWifi, toggleCellular, toggleCellularToast, toggleKillSwitch, isNetworkAllowed, shouldShowCellularToast, guardedFetch, fetchWithTraffic, trackTrafficFromResponse, getTrafficStats, clearTrafficStats, getCurrentMonthName };

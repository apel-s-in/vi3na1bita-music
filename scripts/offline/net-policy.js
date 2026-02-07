// scripts/offline/net-policy.js
// Сетевая политика v2.0 — Спецификация "Сетевая политика" (v1.0)
//
// Управление типами сети (Ethernet/Wi-Fi, Cellular),
// "авиарежим" приложения, подсчёт трафика, уведомления.
//
// Платформенные различия:
//   Android/Desktop (Network Information API) — полный функционал
//   iOS/Firefox (нет API) — урезанный: kill switch, общий трафик

const LS_WIFI = 'netPolicy:wifi:v1';
const LS_CELLULAR = 'netPolicy:cellular:v1';
const LS_CELLULAR_TOAST = 'netPolicy:cellularToast:v1';
const LS_KILL_SWITCH = 'netPolicy:killSwitch:v1';
const LS_TRAFFIC = 'trafficStats:v1';

/* ═══════ Platform detection ═══════ */

let _platformCache = null;

function getPlatform() {
  if (_platformCache) return _platformCache;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isFirefox = /Firefox\//i.test(ua);
  const hasNetInfo = !!(navigator.connection && navigator.connection.type !== undefined);
  _platformCache = {
    isIOS,
    isFirefox,
    hasNetInfo,
    supportsNetControl: hasNetInfo && !isIOS && !isFirefox
  };
  return _platformCache;
}

/* ═══════ Network type detection ═══════ */

/**
 * Определить тип текущей сети.
 * @returns {'ethernet'|'wifi'|'cellular'|'unknown'}
 */
function detectNetworkType() {
  const p = getPlatform();
  if (!p.hasNetInfo) return 'unknown';

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return 'unknown';

  const type = String(conn.type || '').toLowerCase();

  if (type === 'ethernet') return 'ethernet';
  if (type === 'wifi') return 'wifi';
  if (type === 'cellular') return 'cellular';

  // effectiveType fallback (2g/3g/4g — это cellular)
  const eff = String(conn.effectiveType || '').toLowerCase();
  if (/^(2g|3g|4g|5g|slow-2g)$/.test(eff) && type !== 'wifi' && type !== 'ethernet') {
    // Если type не определён, но effectiveType есть — можно только предполагать
    // По спецификации: unknown трактуем как ethernet/wifi (оптимистично)
  }

  // Спецификация: любое неопределённое = Ethernet/Wi-Fi (оптимистично)
  return 'unknown';
}

/**
 * Нормализованная категория: 'wifi' (includes ethernet) или 'cellular'.
 * unknown → 'wifi' (оптимистично, спецификация Часть 2.5)
 */
function getNetworkCategory() {
  const raw = detectNetworkType();
  if (raw === 'cellular') return 'cellular';
  return 'wifi'; // ethernet, wifi, unknown → wifi
}

/**
 * Получить скорость сети (Мбит/с). null если недоступно.
 */
function getNetworkSpeed() {
  const p = getPlatform();
  if (!p.hasNetInfo) return null;
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn || typeof conn.downlink !== 'number') return null;
  return conn.downlink; // Мбит/с
}

/**
 * Человекочитаемое название типа сети для UI.
 */
function getNetworkLabel() {
  const raw = detectNetworkType();
  switch (raw) {
    case 'ethernet': return 'Ethernet';
    case 'wifi': return 'Wi-Fi';
    case 'cellular': return 'Cellular';
    default: return 'Wi-Fi'; // unknown → Wi-Fi
  }
}

/* ═══════ Policy state ═══════ */

function _lsGet(key, def) {
  const v = localStorage.getItem(key);
  return v === null ? def : v;
}

function _lsSet(key, val) {
  localStorage.setItem(key, val);
}

/**
 * Получить состояние политик.
 */
function getNetPolicyState() {
  const p = getPlatform();

  if (!p.supportsNetControl) {
    // iOS / Firefox — управление сетью недоступно, только kill switch
    const killSwitch = _lsGet(LS_KILL_SWITCH, 'off') === 'on';
    return {
      wifiEnabled: true,
      cellularEnabled: true,
      cellularToast: false,
      killSwitch,
      airplaneMode: killSwitch,
      supportsNetControl: false,
      isIOS: p.isIOS,
      isFirefox: p.isFirefox
    };
  }

  const wifiEnabled = _lsGet(LS_WIFI, 'on') === 'on';
  const cellularEnabled = _lsGet(LS_CELLULAR, 'on') === 'on';
  const cellularToast = _lsGet(LS_CELLULAR_TOAST, 'off') === 'on';

  return {
    wifiEnabled,
    cellularEnabled,
    cellularToast,
    killSwitch: false,
    airplaneMode: !wifiEnabled && !cellularEnabled,
    supportsNetControl: true,
    isIOS: false,
    isFirefox: false
  };
}

/**
 * Переключить Ethernet/Wi-Fi.
 */
function toggleWifi() {
  const cur = _lsGet(LS_WIFI, 'on') === 'on';
  _lsSet(LS_WIFI, cur ? 'off' : 'on');
  _emitPolicyChanged();
  return !cur;
}

/**
 * Переключить Cellular.
 */
function toggleCellular() {
  const cur = _lsGet(LS_CELLULAR, 'on') === 'on';
  _lsSet(LS_CELLULAR, cur ? 'off' : 'on');
  _emitPolicyChanged();
  return !cur;
}

/**
 * Переключить уведомления о Cellular-стриминге.
 */
function toggleCellularToast() {
  const cur = _lsGet(LS_CELLULAR_TOAST, 'off') === 'on';
  _lsSet(LS_CELLULAR_TOAST, cur ? 'off' : 'on');
  return !cur;
}

/**
 * Переключить kill switch (только iOS).
 */
function toggleKillSwitch() {
  const cur = _lsGet(LS_KILL_SWITCH, 'off') === 'on';
  _lsSet(LS_KILL_SWITCH, cur ? 'off' : 'on');
  _emitPolicyChanged();
  return !cur;
}

/* ═══════ Permission check ═══════ */

/**
 * Проверить, разрешена ли сеть по текущей политике.
 * Это ОСНОВНАЯ функция, вызываемая перед каждым fetch.
 * @returns {boolean}
 */
function isNetworkAllowed() {
  if (!navigator.onLine) return false;

  const state = getNetPolicyState();

  // Авиарежим приложения
  if (state.airplaneMode) return false;

  // iOS kill switch
  if (state.killSwitch) return false;

  // Если управление сетью недоступно — разрешаем (нет данных для блокировки)
  if (!state.supportsNetControl) return true;

  const category = getNetworkCategory();

  if (category === 'wifi' && state.wifiEnabled) return true;
  if (category === 'cellular' && state.cellularEnabled) return true;

  // Текущий тип сети запрещён
  return false;
}

/**
 * Проверить, нужен ли toast о Cellular-стриминге.
 * Вызывается при начале стриминга трека.
 * @returns {boolean}
 */
function shouldShowCellularToast() {
  const state = getNetPolicyState();
  if (!state.supportsNetControl) return false;
  if (!state.cellularToast) return false;
  return getNetworkCategory() === 'cellular';
}

/**
 * Получить строку статуса для UI.
 */
function getStatusText() {
  const state = getNetPolicyState();

  if (state.airplaneMode || state.killSwitch) {
    return 'Интернет полностью отключён';
  }

  if (!state.supportsNetControl) {
    return 'Управление сетью не поддерживается';
  }

  if (!state.wifiEnabled && state.cellularEnabled) {
    const cat = getNetworkCategory();
    if (cat === 'wifi') {
      return 'Wi-Fi/Ethernet заблокирован настройками';
    }
  }

  if (state.wifiEnabled && !state.cellularEnabled) {
    const cat = getNetworkCategory();
    if (cat === 'cellular') {
      return 'Мобильная сеть заблокирована настройками. Работаем офлайн.';
    }
  }

  return '';
}

/* ═══════ Traffic statistics ═══════ */

function _getTrafficStats() {
  try {
    const raw = localStorage.getItem(LS_TRAFFIC);
    if (!raw) return _defaultTrafficStats();
    const data = JSON.parse(raw);
    // Автосброс месячной статистики
    const currentMonth = _currentMonthKey();
    if (data.wifi && data.wifi.monthKey !== currentMonth) {
      data.wifi.monthly = 0;
      data.wifi.monthKey = currentMonth;
    }
    if (data.cellular && data.cellular.monthKey !== currentMonth) {
      data.cellular.monthly = 0;
      data.cellular.monthKey = currentMonth;
    }
    if (data.general && data.general.monthKey !== currentMonth) {
      data.general.monthly = 0;
      data.general.monthKey = currentMonth;
    }
    return data;
  } catch {
    return _defaultTrafficStats();
  }
}

function _saveTrafficStats(data) {
  try {
    localStorage.setItem(LS_TRAFFIC, JSON.stringify(data));
  } catch { /* ignore */ }
}

function _defaultTrafficStats() {
  const mk = _currentMonthKey();
  return {
    wifi: { total: 0, monthly: 0, monthKey: mk },
    cellular: { total: 0, monthly: 0, monthKey: mk },
    general: { total: 0, monthly: 0, monthKey: mk }
  };
}

function _currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Получить название текущего месяца (локализованное, без года).
 */
function getCurrentMonthName() {
  try {
    return new Intl.DateTimeFormat(navigator.language || 'ru', { month: 'long' }).format(new Date());
  } catch {
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    return months[new Date().getMonth()];
  }
}

/**
 * Записать потреблённый трафик.
 * @param {number} bytes - количество байт
 * @param {'wifi'|'cellular'|null} category - тип сети (null = определить автоматически)
 */
function recordTraffic(bytes, category = null) {
  if (!bytes || bytes <= 0) return;

  const p = getPlatform();
  const stats = _getTrafficStats();

  if (!p.supportsNetControl) {
    // iOS/Firefox — всё в general
    stats.general.total += bytes;
    stats.general.monthly += bytes;
  } else {
    const cat = category || getNetworkCategory();
    if (cat === 'cellular') {
      stats.cellular.total += bytes;
      stats.cellular.monthly += bytes;
    } else {
      stats.wifi.total += bytes;
      stats.wifi.monthly += bytes;
    }
  }

  _saveTrafficStats(stats);
}

/**
 * Получить статистику трафика для UI.
 */
function getTrafficStats() {
  const p = getPlatform();
  const stats = _getTrafficStats();
  const monthName = getCurrentMonthName();

  if (!p.supportsNetControl) {
    // iOS — одна строка "Общий трафик"
    return {
      type: 'general',
      monthName,
      general: {
        total: stats.general.total,
        monthly: stats.general.monthly
      }
    };
  }

  return {
    type: 'split',
    monthName,
    wifi: {
      total: stats.wifi.total,
      monthly: stats.wifi.monthly
    },
    cellular: {
      total: stats.cellular.total,
      monthly: stats.cellular.monthly
    }
  };
}

/**
 * Очистить всю статистику трафика.
 */
function clearTrafficStats() {
  _saveTrafficStats(_defaultTrafficStats());
}

/* ═══════ Fetch interceptor ═══════ */

let _originalFetch = null;
let _interceptorInstalled = false;

/**
 * Установить перехватчик fetch для:
 * 1. Блокировки запросов при "авиарежиме"
 * 2. Подсчёта трафика
 */
function installFetchInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;

  _originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    // Проверка: разрешена ли сеть?
    if (!isNetworkAllowed()) {
      // Авиарежим или тип сети запрещён — блокируем
      return Promise.reject(new TypeError('Network request blocked by app policy'));
    }

    // Фиксируем тип сети на момент начала запроса
    const category = getNetworkCategory();

    try {
      const response = await _originalFetch(input, init);

      // Подсчёт трафика
      _countResponseTraffic(response, category);

      return response;
    } catch (err) {
      throw err;
    }
  };
}

/**
 * Подсчитать размер ответа и записать в статистику.
 */
function _countResponseTraffic(response, category) {
  // Пытаемся использовать Content-Length
  const cl = response.headers.get('content-length');
  if (cl) {
    const bytes = parseInt(cl, 10);
    if (bytes > 0) {
      recordTraffic(bytes, category);
      return;
    }
  }

  // Если Content-Length нет — клонируем и считаем через blob
  // Делаем это асинхронно, чтобы не блокировать основной поток
  try {
    const clone = response.clone();
    clone.blob().then(blob => {
      if (blob.size > 0) {
        recordTraffic(blob.size, category);
      }
    }).catch(() => { /* ignore */ });
  } catch {
    /* ignore */
  }
}

/* ═══════ Event emission ═══════ */

let _lastToastState = null;

function _emitPolicyChanged() {
  window.dispatchEvent(new CustomEvent('netPolicy:changed', {
    detail: getNetPolicyState()
  }));

  // Показать toast при смене состояния (один раз)
  const status = getStatusText();
  if (status && status !== _lastToastState) {
    _lastToastState = status;
    window.NotificationSystem?.info?.(status);
  } else if (!status) {
    _lastToastState = null;
  }
}

/* ═══════ Network change listener ═══════ */

let _networkListenerInstalled = false;

function installNetworkListener() {
  if (_networkListenerInstalled) return;
  _networkListenerInstalled = true;

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.addEventListener) {
    conn.addEventListener('change', () => {
      _emitPolicyChanged();
    });
  }

  window.addEventListener('online', () => {
    _lastToastState = null; // Сбросить для нового toast при смене
    _emitPolicyChanged();
  });

  window.addEventListener('offline', () => {
    _emitPolicyChanged();
  });
}

/* ═══════ Initialization ═══════ */

function initNetPolicy() {
  installFetchInterceptor();
  installNetworkListener();
}

/* ═══════ Legacy compatibility ═══════ */

/**
 * Совместимость с существующими вызовами getNetPolicy() в offline-manager.js
 */
function getNetPolicy() {
  const state = getNetPolicyState();
  return {
    wifiOnly: !state.cellularEnabled,
    allowMobile: state.cellularEnabled,
    confirmOnMobile: false,
    saveDataBlock: false
  };
}

function setNetPolicy(next) {
  if (next.wifiOnly !== undefined) {
    _lsSet(LS_CELLULAR, next.wifiOnly ? 'off' : 'on');
  }
  if (next.allowMobile !== undefined) {
    _lsSet(LS_CELLULAR, next.allowMobile ? 'on' : 'off');
  }
  _emitPolicyChanged();
  return getNetPolicy();
}

/**
 * Совместимость с isAllowedByNetPolicy(params)
 */
function isAllowedByNetPolicy(params = {}) {
  return isNetworkAllowed();
}

/* ═══════ Exports ═══════ */

export {
  // New API (v2.0)
  initNetPolicy,
  getPlatform,
  detectNetworkType,
  getNetworkCategory,
  getNetworkSpeed,
  getNetworkLabel,
  getNetPolicyState,
  toggleWifi,
  toggleCellular,
  toggleCellularToast,
  toggleKillSwitch,
  isNetworkAllowed,
  shouldShowCellularToast,
  getStatusText,
  recordTraffic,
  getTrafficStats,
  clearTrafficStats,
  getCurrentMonthName,
  installFetchInterceptor,

  // Legacy compatibility
  getNetPolicy,
  setNetPolicy,
  isAllowedByNetPolicy
};

export default {
  initNetPolicy,
  getPlatform,
  getNetPolicyState,
  isNetworkAllowed,
  shouldShowCellularToast,
  getStatusText,
  getTrafficStats,
  clearTrafficStats,
  toggleWifi,
  toggleCellular,
  toggleCellularToast,
  toggleKillSwitch,
  getNetworkSpeed,
  getNetworkLabel,
  getCurrentMonthName
};

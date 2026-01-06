// scripts/offline/network-manager.js
// NetworkManager (ESM) — мониторинг состояния сети (ТЗ 12.1)

const LS_LAST_STATUS = 'offline:lastNetStatus:v1';

function getConnectionInfo() {
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return null;

    return {
      type: conn.type || null,
      effectiveType: conn.effectiveType || null,
      downlink: conn.downlink || null,
      rtt: conn.rtt || null,
      saveData: conn.saveData === true
    };
  } catch {
    return null;
  }
}

function determineKind(connInfo) {
  if (!connInfo) return 'unknown';

  const type = String(connInfo.type || '').toLowerCase();
  const effectiveType = String(connInfo.effectiveType || '').toLowerCase();

  if (type === 'wifi') return 'wifi';
  if (type === 'ethernet') return 'wifi'; // treat as fast connection
  if (type === 'cellular') return 'cellular';

  // Fallback to effectiveType
  if (effectiveType === '4g') return 'cellular';
  if (effectiveType === '3g') return 'cellular';
  if (effectiveType === '2g') return 'cellular';
  if (effectiveType === 'slow-2g') return 'cellular';

  return 'unknown';
}

function buildStatus() {
  const online = navigator.onLine !== false;
  const connInfo = getConnectionInfo();
  const kind = determineKind(connInfo);
  const saveData = connInfo?.saveData === true;

  return {
    online,
    kind,
    saveData,
    raw: connInfo,
    ts: Date.now()
  };
}

class NetworkManagerSingleton {
  constructor() {
    this._status = buildStatus();
    this._listeners = new Set();
    this._init();
  }

  _init() {
    // Online/offline events
    window.addEventListener('online', () => this._update());
    window.addEventListener('offline', () => this._update());

    // Connection change event
    try {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && typeof conn.addEventListener === 'function') {
        conn.addEventListener('change', () => this._update());
      }
    } catch {}

    // Periodic check
    setInterval(() => this._update(), 30000);

    // Save initial status
    this._persist();
  }

  _update() {
    const prev = this._status;
    const next = buildStatus();

    const changed =
      prev.online !== next.online ||
      prev.kind !== next.kind ||
      prev.saveData !== next.saveData;

    this._status = next;
    this._persist();

    if (changed) {
      this._notify(next, prev);
    }
  }

  _persist() {
    try {
      localStorage.setItem(LS_LAST_STATUS, JSON.stringify(this._status));
    } catch {}
  }

  _notify(status, prev) {
    this._listeners.forEach((cb) => {
      try { cb(status, prev); } catch {}
    });

    try {
      window.dispatchEvent(new CustomEvent('network:statusChanged', {
        detail: { status, prev }
      }));
    } catch {}
  }

  getStatus() {
    return { ...this._status };
  }

  isOnline() {
    return this._status.online;
  }

  isWifi() {
    return this._status.kind === 'wifi';
  }

  isCellular() {
    return this._status.kind === 'cellular';
  }

  isSaveData() {
    return this._status.saveData === true;
  }

  onChange(callback) {
    if (typeof callback !== 'function') return () => {};
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  forceUpdate() {
    this._update();
    return this.getStatus();
  }
}

let _instance = null;

export function getNetworkManager() {
  if (!_instance) {
    _instance = new NetworkManagerSingleton();
  }
  return _instance;
}

export function initNetworkManager() {
  const mgr = getNetworkManager();
  // Expose globally for legacy code
  window.NetworkManager = mgr;
  return mgr;
}

export const NetworkManager = {
  getStatus: () => getNetworkManager().getStatus(),
  isOnline: () => getNetworkManager().isOnline(),
  isWifi: () => getNetworkManager().isWifi(),
  isCellular: () => getNetworkManager().isCellular(),
  isSaveData: () => getNetworkManager().isSaveData(),
  onChange: (cb) => getNetworkManager().onChange(cb),
  forceUpdate: () => getNetworkManager().forceUpdate()
};

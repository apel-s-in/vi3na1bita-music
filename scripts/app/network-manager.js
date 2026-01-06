// scripts/app/network-manager.js
// Определение состояния сети (ТЗ 11.1)

function detectKind() {
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return 'unknown';

    const type = String(conn.type || '').toLowerCase();
    const eff = String(conn.effectiveType || '').toLowerCase();

    if (type === 'wifi') return 'wifi';
    if (type === 'cellular') return 'cellular';
    if (type === 'ethernet') return 'wifi';
    if (type === 'none') return 'none';

    if (eff === '4g') return '4g';
    if (eff === '3g') return '3g';
    if (eff === '2g') return '2g';
    if (eff === 'slow-2g') return '2g';

    return type || 'unknown';
  } catch {
    return 'unknown';
  }
}

function detectSaveData() {
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return !!(conn && conn.saveData);
  } catch {
    return false;
  }
}

function getStatus() {
  const online = navigator.onLine !== false;
  const kind = detectKind();
  const saveData = detectSaveData();

  return { online, kind, saveData };
}

function init() {
  window.addEventListener('online', () => {
    window.dispatchEvent(new CustomEvent('network:changed', { detail: getStatus() }));
  });

  window.addEventListener('offline', () => {
    window.dispatchEvent(new CustomEvent('network:changed', { detail: getStatus() }));
  });

  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      conn.addEventListener('change', () => {
        window.dispatchEvent(new CustomEvent('network:changed', { detail: getStatus() }));
      });
    }
  } catch {}
}

export const NetworkManager = {
  getStatus,
  init
};

window.NetworkManager = NetworkManager;

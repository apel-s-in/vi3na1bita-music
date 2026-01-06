// scripts/ui/ui-utils.js
// Общие UI-утилиты (без влияния на playback)

export function esc(s) {
  const fn = window.Utils?.escapeHtml;
  return (typeof fn === 'function') ? fn(String(s ?? '')) : String(s ?? '');
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${Math.floor(b)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getNetworkStatusSafe() {
  // ✅ сеть — core helper (offline слой тоже использует)
  if (window.Utils?.getNetworkStatusSafe) return window.Utils.getNetworkStatusSafe();
  try {
    if (window.NetworkManager?.getStatus) return window.NetworkManager.getStatus();
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown', saveData: false };
}

// ✅ Non-ESM доступ (sysinfo.js / sw-manager.js / прочие IIFE)
try {
  window.UIUtils = window.UIUtils || {};
  window.UIUtils.esc = esc;
  window.UIUtils.formatBytes = formatBytes;
  window.UIUtils.getNetworkStatusSafe = getNetworkStatusSafe;
} catch {}

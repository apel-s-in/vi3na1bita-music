// scripts/ui/ui-utils.js
// Общие UI-утилиты (без влияния на playback)
// ВАЖНО: это фасад над window.Utils для старых модулей.

export function esc(s) {
  const fn = window.Utils?.escapeHtml;
  return (typeof fn === 'function') ? fn(String(s ?? '')) : String(s ?? '');
}

export function formatBytes(n) {
  const fn = window.Utils?.formatBytes;
  return (typeof fn === 'function') ? fn(n) : `${Number(n) || 0} B`;
}

export function getNetworkStatusSafe() {
  const fn = window.Utils?.getNetworkStatusSafe;
  return (typeof fn === 'function')
    ? fn()
    : { online: navigator.onLine !== false, kind: 'unknown', saveData: false };
}

// ✅ Non-ESM доступ (sysinfo.js / sw-manager.js / прочие IIFE)
try {
  window.UIUtils = window.UIUtils || {};
  window.UIUtils.esc = esc;
  window.UIUtils.formatBytes = formatBytes;
  window.UIUtils.getNetworkStatusSafe = getNetworkStatusSafe;
} catch {}

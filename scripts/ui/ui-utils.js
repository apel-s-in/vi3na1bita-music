// scripts/ui/ui-utils.js
// Общие UI-утилиты (без влияния на playback)
// ВАЖНО: не дублируем core utils. Здесь только тонкий фасад (back-compat для старых модулей).

const _escFallback = (s) => String(s ?? '').replace(/[<>&'"]/g, (m) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;'
}[m]));

export function esc(s) {
  const fn = window.Utils?.escapeHtml;
  return typeof fn === 'function' ? fn(String(s ?? '')) : _escFallback(s);
}

export function formatBytes(n) {
  const fn = window.Utils?.formatBytes;
  if (typeof fn === 'function') return fn(n);
  // fallback (очень короткий)
  const b = Number(n) || 0;
  if (b < 1024) return `${Math.floor(b)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getNetworkStatusSafe() {
  const fn = window.Utils?.getNetworkStatusSafe;
  if (typeof fn === 'function') return fn();
  return { online: navigator.onLine !== false, kind: 'unknown', saveData: false };
}

// ✅ Non-ESM доступ (sysinfo.js / sw-manager.js / прочие IIFE)
try {
  window.UIUtils = window.UIUtils || {};
  window.UIUtils.esc = esc;
  window.UIUtils.formatBytes = formatBytes;
  window.UIUtils.getNetworkStatusSafe = getNetworkStatusSafe;
} catch {}

// scripts/ui/ui-utils.js
// Фасад над window.Utils для совместимости импортов
export const esc = (s) => window.Utils?.escapeHtml ? window.Utils.escapeHtml(s) : String(s || '');
export const formatBytes = (n) => window.Utils?.formatBytes ? window.Utils.formatBytes(n) : '0 B';
export const getNetworkStatusSafe = () => window.Utils?.getNetworkStatusSafe ? window.Utils.getNetworkStatusSafe() : { online: true, kind: 'unknown' };

// Legacy global exposure check
try {
  window.UIUtils = window.UIUtils || {};
  window.UIUtils.esc = esc;
  window.UIUtils.formatBytes = formatBytes;
  window.UIUtils.getNetworkStatusSafe = getNetworkStatusSafe;
} catch {}

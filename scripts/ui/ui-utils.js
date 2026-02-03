//=================================================
// FILE: /scripts/ui/ui-utils.js
// scripts/ui/ui-utils.js
// Facade over window.Utils to maintain module compatibility.
// All logic moved to scripts/core/utils.js

export const esc = (s) => window.Utils?.ui?.escapeHtml(s) ?? String(s || '');
export const formatBytes = (n) => window.Utils?.fmt?.bytes(n) ?? '0 B';
export const getNetworkStatusSafe = () => window.Utils?.getNetworkStatusSafe?.() ?? { online: true, kind: 'unknown' };

try {
  window.UIUtils = window.UIUtils || {};
  window.UIUtils.esc = esc;
  window.UIUtils.formatBytes = formatBytes;
  window.UIUtils.getNetworkStatusSafe = getNetworkStatusSafe;
} catch {}

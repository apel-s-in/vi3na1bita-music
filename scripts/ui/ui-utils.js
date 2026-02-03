// scripts/ui/ui-utils.js
// Facade over core/utils.js to maintain backward compatibility
import { Utils } from '../core/utils.js';

export const esc = (s) => Utils.ui.escapeHtml(s);
export const formatBytes = (n) => Utils.fmt.bytes(n);
export const getNetworkStatusSafe = () => Utils.getNet();

try {
  window.UIUtils = window.UIUtils || {};
  window.UIUtils.esc = esc;
  window.UIUtils.formatBytes = formatBytes;
  window.UIUtils.getNetworkStatusSafe = getNetworkStatusSafe;
} catch {}

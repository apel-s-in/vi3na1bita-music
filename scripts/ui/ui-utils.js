// scripts/ui/ui-utils.js
// Facade over core/utils.js to maintain backward compatibility for imports
import { Utils } from '../core/utils.js';

export const esc = (s) => Utils.ui.escapeHtml(s);
export const escapeHtml = (s) => Utils.ui.escapeHtml(s);
export const formatBytes = (n) => Utils.fmt.bytes(n);
export const formatTime = (s) => Utils.fmt.time(s);
export const getNetworkStatusSafe = () => Utils.getNet();
export const isMobile = () => Utils.isMobile();
export const setBtnActive = (id, a) => Utils.setBtnActive(id, a);
export const setAriaDisabled = (el, d) => Utils.setAriaDisabled(el, d);
export const waitFor = (fn, t) => Utils.waitFor(fn, t);

// Для кода, который использует window.UIUtils
try {
  window.UIUtils = window.UIUtils || {};
  Object.assign(window.UIUtils, {
    esc, escapeHtml, formatBytes, formatTime, 
    getNetworkStatusSafe, isMobile, setBtnActive, setAriaDisabled, waitFor
  });
} catch {}

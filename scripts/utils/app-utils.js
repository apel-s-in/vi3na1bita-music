// scripts/app/utils/app-utils.js
// Фасад над window.Utils и DOM
export const $ = (id) => document.getElementById(id);
export const toStr = (v) => (v == null ? '' : String(v));
export const isMobileUA = () => !!window.Utils?.isMobile?.();
export const escHtml = (s) => window.Utils?.escapeHtml ? window.Utils.escapeHtml(toStr(s)) : toStr(s);

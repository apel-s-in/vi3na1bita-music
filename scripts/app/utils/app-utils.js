// scripts/app/utils/app-utils.js

export const $ = (id) => document.getElementById(id);

export const toStr = (v) => (v == null ? '' : String(v));

export const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const ESC = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' };
export const escHtml = (s) =>
  window.Utils?.escapeHtml ? window.Utils.escapeHtml(toStr(s)) : toStr(s).replace(/[<>&'"]/g, (m) => ESC[m]);

// scripts/app/utils/app-utils.js

export const $ = (id) => document.getElementById(id);

export const toStr = (v) => (v == null ? '' : String(v));

export const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function _escFallback(s) {
  const v = toStr(s);
  return v.replace(/[<>&'"]/g, (m) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;'
  }[m]));
}

export const escHtml = (s) => {
  const fn = window.Utils?.escapeHtml;
  return (typeof fn === 'function') ? fn(toStr(s)) : _escFallback(s);
};

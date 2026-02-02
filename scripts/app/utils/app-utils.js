// scripts/app/utils/app-utils.js
// Тонкий фасад над window.Utils (без дублей логики).
// Важно: не трогаем воспроизведение, только утилиты.

export const $ = (id) => document.getElementById(String(id || ''));

export const toStr = (v) => (v == null ? '' : String(v));

export const isMobileUA = () => !!window.Utils?.isMobile?.() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const escHtml = (s) => {
  const fn = window.Utils?.escapeHtml;
  return (typeof fn === 'function') ? fn(toStr(s)) : toStr(s);
};

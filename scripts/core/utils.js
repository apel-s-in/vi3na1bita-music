// scripts/core/utils.js
// Общие утилиты приложения

export function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

export function formatTime(s) {
  if (isNaN(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function $(id) {
  return document.getElementById(id);
}

export function $q(sel) {
  return document.querySelector(sel);
}

export function $qa(sel) {
  return document.querySelectorAll(sel);
}

export async function waitFor(condition, maxMs = 2000, stepMs = 50) {
  let waited = 0;
  while (!condition() && waited < maxMs) {
    await new Promise(r => setTimeout(r, stepMs));
    waited += stepMs;
  }
  return condition();
}

export function createModal(html, onClose) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg active';
  bg.innerHTML = html;
  bg.addEventListener('click', e => { if (e.target === bg) { bg.remove(); onClose?.(); } });
  bg.querySelector('.bigclose')?.addEventListener('click', () => { bg.remove(); onClose?.(); });
  document.body.appendChild(bg);
  return bg;
}

export function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Глобальный экспорт для совместимости
if (typeof window !== 'undefined') {
  window.Utils = { escapeHtml, formatTime, $, $q, $qa, waitFor, createModal, isMobile, isIOS, isStandalone };
}

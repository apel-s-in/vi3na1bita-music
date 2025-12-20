// scripts/core/utils.js — Общие утилиты
const Utils = {
  $(id) { return document.getElementById(id); },
  $q(sel) { return document.querySelector(sel); },
  $qa(sel) { return document.querySelectorAll(sel); },
  
  escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  },
  
  formatTime(s) {
    if (isNaN(s) || s < 0) return '--:--';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  },
  
  async waitFor(fn, maxMs = 2000, step = 50) {
    let t = 0;
    while (!fn() && t < maxMs) { await new Promise(r => setTimeout(r, step)); t += step; }
    return fn();
  },
  
  createModal(html, onClose) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg active';
    bg.innerHTML = html;
    const close = () => { bg.remove(); onClose?.(); };
    bg.addEventListener('click', e => e.target === bg && close());
    bg.querySelector('.bigclose')?.addEventListener('click', close);
    document.body.appendChild(bg);
    return bg;
  },
  
  isMobile: () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
  isStandalone: () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
};

if (typeof window !== 'undefined') window.Utils = Utils;
export default Utils;

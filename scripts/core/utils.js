// scripts/core/utils.js — Общие утилиты
(function() {
  'use strict';
  
  const Utils = {
    $(id) {
      return document.getElementById(id);
    },
    
    $q(sel) {
      return document.querySelector(sel);
    },
    
    $qa(sel) {
      return document.querySelectorAll(sel);
    },
    
    escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    },
    
    formatTime(s) {
      if (isNaN(s) || s < 0) return '--:--';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    },
    
    async waitFor(fn, maxMs = 2000, step = 50) {
      let t = 0;
      while (!fn() && t < maxMs) {
        await new Promise(r => setTimeout(r, step));
        t += step;
      }
      return fn();
    },
    
    createModal(html, onClose) {
      const bg = document.createElement('div');
      bg.className = 'modal-bg active';
      bg.innerHTML = html;

      const close = () => {
        bg.remove();
        if (onClose) onClose();
      };

      bg.addEventListener('click', (e) => {
        if (e.target === bg) close();
      });

      const closeBtn = bg.querySelector('.bigclose');
      if (closeBtn) {
        closeBtn.addEventListener('click', close);
      }

      // ✅ Единый контейнер для модалок (если есть), иначе fallback в body.
      const host = document.getElementById('modals-container') || document.body;
      host.appendChild(bg);

      return bg;
    },
    
    isMobile() {
      return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    },
    
    isIOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    },
    
    isStandalone() {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    }
  };

  // Глобальный экспорт
  window.Utils = Utils;
  
  console.log('✅ Utils loaded');
})();

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
    
    // createModal удалён: проект использует единый механизм window.Modals.open (scripts/ui/modal-templates.js)
    
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

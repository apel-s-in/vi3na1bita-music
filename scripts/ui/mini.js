// scripts/ui/mini.js
// Управление мини-режимом отображения плеера

(function() {
  'use strict';

  class MiniModeManager {
    constructor() {
      this.isMiniMode = false;
      this.scrollThreshold = 300; // Порог прокрутки для активации мини-режима
      this.lastScrollTop = 0;
      this.init();
    }

    init() {
      // Восстановить состояние
      this.isMiniMode = localStorage.getItem('miniMode') === '1';
      
      if (this.isMiniMode) {
        this.enableMiniMode();
      }

      // Слушатель прокрутки
      this.setupScrollListener();

      // Кнопка переключения (если есть)
      this.setupToggleButton();
    }

    setupScrollListener() {
      let ticking = false;

      window.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            this.handleScroll();
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    }

    handleScroll() {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      // Автоматический мини-режим при прокрутке вниз
      if (scrollTop > this.scrollThreshold && scrollTop > this.lastScrollTop) {
        if (!this.isMiniMode) {
          this.enableMiniMode();
        }
      } else if (scrollTop < 100) {
        if (this.isMiniMode) {
          this.disableMiniMode();
        }
      }

      this.lastScrollTop = scrollTop;
    }

    setupToggleButton() {
      // Можно добавить кнопку переключения мини-режима
      const toggleBtn = document.getElementById('mini-mode-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          this.toggleMiniMode();
        });
      }
    }

    enableMiniMode() {
      if (this.isMiniMode) return;

      this.isMiniMode = true;
      document.body.classList.add('mini-mode');
      localStorage.setItem('miniMode', '1');

      // Скрыть ненужные элементы
      this.hideElements([
        '#cover-wrap',
        '#social-links',
        '.album-icons',
        '.active-album-title'
      ]);

      // Показать мини-заголовок и "Далее"
      const miniNow = document.getElementById('mini-now');
      const nextUp = document.getElementById('next-up');
      
      if (miniNow) miniNow.style.display = 'flex';
      if (nextUp) nextUp.style.display = 'flex';

      // Зафиксировать now-playing вверху
      const nowPlaying = document.getElementById('now-playing');
      if (nowPlaying) {
        nowPlaying.style.position = 'sticky';
        nowPlaying.style.top = '0';
        nowPlaying.style.zIndex = '10';
        nowPlaying.style.background = 'var(--primary-bg)';
        nowPlaying.style.padding = '10px';
        nowPlaying.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      }

      // Обновить мини-заголовок
      this.updateMiniNowHeader();

      console.log('📱 Mini mode enabled');
    }

    disableMiniMode() {
      if (!this.isMiniMode) return;

      this.isMiniMode = false;
      document.body.classList.remove('mini-mode');
      localStorage.setItem('miniMode', '0');

      // Показать элементы обратно
      this.showElements([
        '#cover-wrap',
        '#social-links',
        '.album-icons',
        '.active-album-title'
      ]);

      // Скрыть мини-элементы
      const miniNow = document.getElementById('mini-now');
      const nextUp = document.getElementById('next-up');
      
      if (miniNow) miniNow.style.display = 'none';
      if (nextUp) nextUp.style.display = 'none';

      // Вернуть now-playing в нормальное состояние
      const nowPlaying = document.getElementById('now-playing');
      if (nowPlaying) {
        nowPlaying.style.position = '';
        nowPlaying.style.top = '';
        nowPlaying.style.zIndex = '';
        nowPlaying.style.background = '';
        nowPlaying.style.padding = '';
        nowPlaying.style.boxShadow = '';
      }

      console.log('📱 Mini mode disabled');
    }

    updateMiniNowHeader() {
      const miniNow = document.getElementById('mini-now');
      if (!miniNow || !window.playerCore) return;

      const track = window.playerCore.getCurrentTrack();
      const index = window.playerCore.getIndex();

      if (!track) {
        miniNow.style.display = 'none';
        return;
      }

      const num = document.getElementById('mini-now-num');
      const title = document.getElementById('mini-now-title');
      const star = document.getElementById('mini-now-star');

      if (num) num.textContent = `${String(index + 1).padStart(2, '0')}.`;
      if (title) title.textContent = track.title || '—';

      if (star) {
        const albumKey = window.AlbumsManager?.getCurrentAlbum();
        const liked = window.FavoritesManager?.isFavorite(albumKey, index);
        star.src = liked ? 'img/star.png' : 'img/star2.png';
      }
    }

    disableMiniMode() {
      if (!this.isMiniMode) return;

      this.isMiniMode = false;
      document.body.classList.remove('mini-mode');
      localStorage.setItem('miniMode', '0');

      // Показать элементы обратно
      this.showElements([
        '#cover-wrap',
        '#social-links',
        '.album-icons',
        '.active-album-title'
      ]);

      // Вернуть now-playing в нормальное состояние
      const nowPlaying = document.getElementById('now-playing');
      if (nowPlaying) {
        nowPlaying.style.position = '';
        nowPlaying.style.top = '';
        nowPlaying.style.zIndex = '';
        nowPlaying.style.background = '';
        nowPlaying.style.padding = '';
        nowPlaying.style.boxShadow = '';
      }

      console.log('📱 Mini mode disabled');
    }

    toggleMiniMode() {
      if (this.isMiniMode) {
        this.disableMiniMode();
      } else {
        this.enableMiniMode();
      }
    }

    hideElements(selectors) {
      selectors.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
          el.style.display = 'none';
        }
      });
    }

    showElements(selectors) {
      selectors.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
          el.style.display = '';
        }
      });
    }

    isMini() {
      return this.isMiniMode;
    }
  }

  // Глобальный экземпляр
  window.MiniModeManager = new MiniModeManager();

  console.log('✅ Mini mode manager initialized');
})();

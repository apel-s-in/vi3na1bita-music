// scripts/app.js
// Главный модуль приложения - инициализация и оркестрация

import { APP_CONFIG } from './core/config.js';

class MusicApp {
  constructor() {
    this.initialized = false;
    this.playerReady = false;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      // Проверка промокода
      await this.checkPromocode();
      
      // Инициализация PlayerCore
      await this.initPlayerCore();
      
      // Инициализация UI
      await this.initUI();
      
      // Загрузка альбомов
      await this.loadAlbums();
      
      // Восстановление состояния
      await this.restoreState();
      
      this.initialized = true;
      console.log('✅ App initialized');
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      window.NotificationSystem?.error('Ошибка инициализации приложения');
    }
  }

  async checkPromocode() {
    const passed = localStorage.getItem('promoPassed') === '1';
    
    if (passed) {
      this.showMain();
      return;
    }

    // Обработчик промокода
    const input = document.getElementById('promo-inp');
    const button = document.getElementById('promo-btn');
    const error = document.getElementById('promo-error');

    const check = () => {
      const value = (input?.value || '').trim();
      if (!value) {
        if (error) error.innerText = 'Введите промокод';
        return;
      }
      
      if (value.toUpperCase() === APP_CONFIG.PROMO_CODE.toUpperCase()) {
        localStorage.setItem('promoPassed', '1');
        this.showMain();
      } else {
        if (error) error.innerText = 'Неверный промокод';
      }
    };

    button?.addEventListener('click', check);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') check();
    });
  }

  showMain() {
    document.getElementById('promocode-block')?.classList.add('hidden');
    document.getElementById('main-block')?.classList.remove('hidden');
  }

  async initPlayerCore() {
    // Ждём загрузки Howler.js
    return new Promise((resolve) => {
      const checkHowler = () => {
        if (typeof Howler === 'undefined') {
          setTimeout(checkHowler, 50);
          return;
        }
      
        // Затем ждём PlayerCore
        const checkCore = () => {
          if (window.playerCore) {
            this.playerReady = true;
            console.log('✅ PlayerCore ready');
            resolve();
          } else {
            setTimeout(checkCore, 100);
          }
        };
        checkCore();
      };
      checkHowler();
    });
  }

  async initUI() {
    // UI модули загружаются через script tags
    // Здесь только финальная инициализация
    
    // Логотипы
    this.applyLogos();
    
    // PWA install button
    this.initPWA();
    
    // Обработчики событий
    this.attachEventListeners();
  }

  applyLogos() {
    const dpr = window.devicePixelRatio || 1;
    const mobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    let logoUrl;
    if (mobile) {
      logoUrl = dpr >= 2 ? 'img/mobile/logo@2x.jpg' : 'img/mobile/logo@1x.jpg';
    } else {
      if (dpr >= 3) logoUrl = 'img/desktop/logo@3x.png';
      else if (dpr >= 2) logoUrl = 'img/desktop/logo@2x.png';
      else logoUrl = 'img/desktop/logo@1x.png';
    }

    const logoBottom = document.getElementById('logo-bottom');
    const promoCover = document.getElementById('promo-cover');
    if (logoBottom) logoBottom.src = logoUrl;
    if (promoCover) promoCover.src = logoUrl;
  }

  initPWA() {
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = document.getElementById('install-pwa-btn');
      if (btn) btn.style.display = '';
    });

    document.getElementById('install-pwa-btn')?.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(() => {
          const btn = document.getElementById('install-pwa-btn');
          if (btn) btn.style.display = 'none';
          deferredPrompt = null;
        });
      }
    });
  }

  attachEventListeners() {
    // Логотип
    document.getElementById('logo-bottom')?.addEventListener('click', () => {
      const logo = document.getElementById('logo-bottom');
      if (!logo) return;
      logo.style.transition = 'transform .08s ease-out';
      logo.style.transform = 'scale(1.13)';
      setTimeout(() => {
        logo.style.transform = 'scale(1)';
        logo.style.transition = 'transform .1s ease-out';
      }, 120);
    });

    // Обратная связь
    document.getElementById('feedback-link')?.addEventListener('click', () => {
      window.NotificationSystem?.info('Раздел в разработке. Напишите нам в Telegram: @vitrina_razbita');
    });

    // Фильтр избранного
    document.getElementById('filter-favorites-btn')?.addEventListener('click', () => {
      if (typeof window.toggleFavoritesFilter === 'function') {
        window.toggleFavoritesFilter();
      }
    });

    // Скачать альбом
    document.getElementById('download-album-main')?.addEventListener('click', () => {
      window.NotificationSystem?.info('Функция скачивания альбома в разработке');
    });

    // Оффлайн кнопка
    document.getElementById('offline-btn')?.addEventListener('click', () => {
      window.NotificationSystem?.info('Оффлайн режим в разработке');
    });
  }

  async loadAlbums() {
    try {
      const response = await fetch('./albums.json', { cache: 'no-cache' });
      const data = await response.json();
      window.albumsIndex = Array.isArray(data.albums) ? data.albums : [];
    } catch (error) {
      console.warn('Failed to load albums.json, using fallback');
      window.albumsIndex = APP_CONFIG.ALBUMS_FALLBACK.slice();
    }

    if (window.albumsIndex.length > 0) {
      // Инициализация альбомов через albums.js модуль
      if (typeof window.AlbumsManager?.initialize === 'function') {
        await window.AlbumsManager.initialize();
      }
    }
  }

  async restoreState() {
    try {
      // Восстановление режимов
      window.shuffleMode = localStorage.getItem('shuffleMode') === '1';
      window.repeatMode = localStorage.getItem('repeatMode') === '1';
      window.favoritesOnlyMode = localStorage.getItem('favoritesOnlyMode') === '1';
      window.animationEnabled = localStorage.getItem('animationEnabled') === '1';
      
      // Восстановление последнего альбома
      const lastAlbum = localStorage.getItem('currentAlbum');
      if (lastAlbum && typeof window.AlbumsManager?.loadAlbum === 'function') {
        await window.AlbumsManager.loadAlbum(lastAlbum);
      }
    } catch (error) {
      console.warn('Failed to restore state:', error);
    }
  }
}

// Автостарт при загрузке
window.addEventListener('DOMContentLoaded', () => {
  window.musicApp = new MusicApp();
  window.musicApp.init();
});

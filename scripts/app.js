// scripts/app.js
// Главная точка входа приложения

// import { APP_CONFIG } from './core/config.js';
// ВАЖНО: config.js уже подключён в index.html как type="module" и экспортирует window.APP_CONFIG.
// Чтобы не ломаться из-за путей/кэша/SW на GitHub Pages — используем глобальный window.APP_CONFIG.

(function AppModule() {
  'use strict';

  const w = window;

  class Application {
    constructor() {
      this.initialized = false;
      this.serviceWorkerRegistered = false;
    }

    async initialize() {
      if (this.initialized) return;
      this.initialized = true;

      console.log(`🎵 Initializing app v${w.VERSION}`);

      try {
        // 1. Загрузка индекса альбомов
        await this.loadAlbumsIndex();

        // 2. Ожидаем, что PlayerCore уже инициализировался (src/PlayerCore.js делает это сам)
        // 3. Инициализация избранного
        await this.initializeFavorites();

        // 4. Инициализация галереи
        await this.initializeGallery();

        // 5. Инициализация менеджера альбомов
        await this.initializeAlbums();

        // 6. Инициализация UI плеера
        await this.initializePlayerUI();

        // 6. Инициализация дополнительных модулей
        this.initializeModules();

        // 7. Восстановление состояния плеера (если есть сохранённый PlayerState)
        if (w.PlayerState && typeof w.PlayerState.apply === 'function') {
          await w.PlayerState.apply();
        }

        // 8. Настройка горячих клавиш
        this.setupHotkeys();

        // 9. Обработка PWA установки
        this.setupPWAInstall();

        // 10. Обработка сообщений от Service Worker (update flow)
        this.setupServiceWorkerMessaging();

        console.log('✅ Application initialized successfully');

      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        w.NotificationSystem?.error('Ошибка инициализации приложения');
      }
    }

    async loadAlbumsIndex() {
      // Индекс альбомов загружается в scripts/core/bootstrap.js из ./albums.json
      // и публикуется в window.albumsIndex. Здесь дожидаемся, чтобы не стартовать раньше bootstrap.
      const maxWaitMs = 2000;
      const stepMs = 50;
      let waited = 0;

      // Если уже есть валидный индекс — просто используем его
      if (Array.isArray(w.albumsIndex) && w.albumsIndex.length > 0) {
        console.log(`✅ Albums index already loaded: ${w.albumsIndex.length} albums`);
        return;
      }

      // Подождём, пока bootstrap поднимет albumsIndex
      while ((!Array.isArray(w.albumsIndex) || w.albumsIndex.length === 0) && waited < maxWaitMs) {
        await new Promise(r => setTimeout(r, stepMs));
        waited += stepMs;
      }

      if (Array.isArray(w.albumsIndex) && w.albumsIndex.length > 0) {
        console.log(`✅ Albums index loaded after bootstrap wait: ${w.albumsIndex.length} albums`);
        return;
      }

      console.warn(
        '⚠️ albumsIndex is empty in Application.loadAlbumsIndex() даже после ожидания. ' +
        'Проверьте загрузку ./albums.json в scripts/core/bootstrap.js'
      );
      w.albumsIndex = w.albumsIndex || [];
    }

    async initializeFavorites() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.FavoritesManager && typeof w.FavoritesManager.initialize === 'function') {
            w.FavoritesManager.initialize();
            console.log('✅ Favorites initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    async initializeAlbums() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.AlbumsManager && typeof w.AlbumsManager.initialize === 'function') {
            w.AlbumsManager.initialize();
            console.log('✅ Albums initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    async initializePlayerUI() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.PlayerUI && typeof w.PlayerUI.initialize === 'function') {
            w.PlayerUI.initialize();
            console.log('✅ PlayerUI initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }
    async initializeGallery() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.GalleryManager && typeof w.GalleryManager.initialize === 'function') {
            w.GalleryManager.initialize();
            console.log('✅ Gallery initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    initializeModules() {
      // Таймер сна
      // (scripts/ui/sleep.js) сам автоинициализируется, но оставим безопасный вызов при наличии initialize()
      if (w.SleepTimer && typeof w.SleepTimer.initialize === 'function') {
        w.SleepTimer.initialize();
      }

      // Модальное окно текста
      // (scripts/ui/lyrics-modal.js) не требует initialize()
      if (w.LyricsModal && typeof w.LyricsModal.initialize === 'function') {
        w.LyricsModal.initialize();
      }

      // Системная информация
      // Реальное имя: SystemInfoManager (scripts/ui/sysinfo.js), initialize() нет — он сам запускается в ctor.
      if (w.SystemInfoManager && typeof w.SystemInfoManager.initialize === 'function') {
        w.SystemInfoManager.initialize();
      }

      // Менеджер загрузок
      // Реальное имя: DownloadsManager (scripts/app/downloads.js), initialize() нет.
      if (w.DownloadsManager && typeof w.DownloadsManager.initialize === 'function') {
        w.DownloadsManager.initialize();
      }

      // Background Audio API
      // Реальное имя: BackgroundAudioManager (scripts/app/background-audio.js), initialize() нет — ctor сам вызывает init().
      if (w.BackgroundAudioManager && typeof w.BackgroundAudioManager.initialize === 'function') {
        w.BackgroundAudioManager.initialize();
      }
    }

    setupServiceWorkerMessaging() {
      // ✅ Реальный update flow через сообщения от SW.
      // Это нужно для:
      // - предложения обновления,
      // - сохранения позиции/трека перед reload,
      // - корректного восстановления через PlayerState после reload.
      if (!('serviceWorker' in navigator)) return;

      // Защита от повторной установки обработчика
      if (this.__swMsgBound) return;
      this.__swMsgBound = true;

      const handle = async (event) => {
        const msg = event?.data || {};
        if (!msg || typeof msg !== 'object') return;

        // Сообщение о версии SW (может присылать SW или тест)
        if (msg.type === 'SW_VERSION') {
          const swVer = String(msg.version || '');
          const appVer = String(w.VERSION || '');

          // Если версия не указана — игнорируем
          if (!swVer) return;

          // Если версии совпадают — обновлять нечего
          if (appVer && swVer === appVer) return;

          // Предложение пользователю
          const agree = window.confirm(
            `Доступно обновление плеера (${swVer}). Обновить сейчас? Воспроизведение продолжится с того же места.`
          );

          if (!agree) return;

          // Сохраняем состояние (для восстановления после reload)
          try {
            if (w.PlayerState && typeof w.PlayerState.save === 'function') {
              w.PlayerState.save({ forReload: true });
            }
          } catch (e) {
            console.warn('PlayerState.save before SW update failed:', e);
          }

          // Пытаемся применить обновление через ServiceWorkerManager (если есть)
          try {
            if (w.ServiceWorkerManager && typeof w.ServiceWorkerManager.applyUpdate === 'function') {
              await w.ServiceWorkerManager.applyUpdate();
              return;
            }
          } catch (e) {
            console.warn('ServiceWorkerManager.applyUpdate failed:', e);
          }

          // Fallback: напрямую попросим waiting-SW активироваться
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            const waiting = reg?.waiting || null;
            if (waiting) {
              waiting.postMessage({ type: 'SKIP_WAITING' });
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
              }, { once: true });
              return;
            }
          } catch (e) {
            console.warn('Fallback SW update failed:', e);
          }

          // Если не удалось — просто перезагрузим страницу (лучше чем “ничего”)
          window.location.reload();
        }
      };

      // Реальные сообщения от SW
      navigator.serviceWorker.addEventListener('message', handle);

      // ✅ Для e2e (и для безопасного fallback): позволяем симулировать сообщение через window.dispatchEvent(...)
      // Никаких побочных эффектов без confirm().
      window.addEventListener('message', handle);
    }

    setupHotkeys() {
      document.addEventListener('keydown', (e) => {
        // Игнорируем если фокус в input/textarea
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

        const key = e.key.toLowerCase();

        switch (key) {
          case 'k':
          case ' ':
            e.preventDefault();
            w.PlayerUI?.togglePlayPause?.();
            break;

          case 'n':
            e.preventDefault();
            w.playerCore?.next();
            break;

          case 'p':
            e.preventDefault();
            w.playerCore?.prev();
            break;

          case 'x':
            e.preventDefault();
            w.playerCore?.stop();
            break;

          case 'm':
            e.preventDefault();
            document.getElementById('mute-btn')?.click();
            break;

          case 'r':
            e.preventDefault();
            document.getElementById('repeat-btn')?.click();
            break;

          case 'u':
            e.preventDefault();
            document.getElementById('shuffle-btn')?.click();
            break;

          case 'a':
            e.preventDefault();
            document.getElementById('animation-btn')?.click();
            break;

          case 'b':
            e.preventDefault();
            document.getElementById('bit-btn')?.click();
            break;

          case 'f':
            e.preventDefault();
            document.getElementById('favorites-btn')?.click();
            break;

          case 't':
            e.preventDefault();
            w.SleepTimer?.show?.();
            break;

          case 'y':
            e.preventDefault();
            document.getElementById('lyrics-toggle-btn')?.click();
            break;

          case 'arrowleft':
            e.preventDefault();
            w.playerCore?.seek(Math.max(0, w.playerCore.getPosition() - 5));
            break;

          case 'arrowright':
            e.preventDefault();
            w.playerCore?.seek(Math.min(w.playerCore.getDuration(), w.playerCore.getPosition() + 5));
            break;

          case 'arrowup':
            e.preventDefault();
            const currentVol = w.playerCore?.getVolume() || 100;
            w.playerCore?.setVolume(Math.min(100, currentVol + 5));
            break;

          case 'arrowdown':
            e.preventDefault();
            const vol = w.playerCore?.getVolume() || 100;
            w.playerCore?.setVolume(Math.max(0, vol - 5));
            break;
        }
      });

      console.log('✅ Hotkeys enabled');
    }

    setupPWAInstall() {
      let deferredPrompt = null;

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        const btn = document.getElementById('install-pwa-btn');
        if (btn) {
          btn.style.display = 'block';
          btn.onclick = async () => {
            if (!deferredPrompt) return;

            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
              w.NotificationSystem?.success('Приложение установлено!');
            }

            deferredPrompt = null;
            btn.style.display = 'none';
          };
        }
      });

      window.addEventListener('appinstalled', () => {
        w.NotificationSystem?.success('Приложение успешно установлено!');
        const btn = document.getElementById('install-pwa-btn');
        if (btn) btn.style.display = 'none';
      });
    }
  }

  // Создание глобального экземпляра
  w.app = new Application();

  // Автоматический запуск если промокод уже введён
  if (localStorage.getItem('promocode') === 'VITRINA2025') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => w.app.initialize());
    } else {
      w.app.initialize();
    }
  }

})(); // end of AppModule IIFE

// ========== PlayerState (сохранение/восстановление состояния плеера) ==========
(function PlayerStateModule() {
  'use strict';

  const STORAGE_KEY = 'playerStateV1';
  const SESSION_RESUME_KEY = 'resumeAfterReloadV1';

  function save(options = {}) {
    try {
      if (!window.playerCore) return;

      const track = window.playerCore.getCurrentTrack();
      const index = window.playerCore.getIndex();
      const position = window.playerCore.getPosition();
      const volume = window.playerCore.getVolume();
      const wasPlaying = window.playerCore.isPlaying();

      const playingAlbum = window.AlbumsManager?.getPlayingAlbum?.() || null;
      const currentAlbum = window.AlbumsManager?.getCurrentAlbum?.() || null;

      // ✅ Сохраняем режим отображения и состояние анимации
      const lyricsViewMode = localStorage.getItem('lyricsViewMode') || 'normal';
      const animationEnabled = localStorage.getItem('lyricsAnimationEnabled') === '1';

      const state = {
        album: playingAlbum,
        currentAlbum: currentAlbum, // ✅ Добавляем текущий просматриваемый альбом
        trackIndex: typeof index === 'number' ? index : 0,
        position: Math.floor(position || 0),
        volume: typeof volume === 'number' ? volume : 100,
        wasPlaying: !!wasPlaying,
        // ✅ Сохраняем UI состояние
        lyricsViewMode: lyricsViewMode,
        animationEnabled: animationEnabled,
        // ✅ Сохраняем режим мини-плеера
        isMiniMode: !!(playingAlbum && currentAlbum && playingAlbum !== currentAlbum)
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      if (options.forReload) {
        // Краткоживущий стейт для SW‑обновления (одна перезагрузка)
        sessionStorage.setItem(SESSION_RESUME_KEY, '1');
      }

      // Не трогаем воспроизведение: только фиксируем снимок.
    } catch (e) {
      console.warn('PlayerState.save failed:', e);
    }
  }

  async function apply() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const state = JSON.parse(raw);
      if (!state || typeof state !== 'object') return;

      const albumKey = state.album;
      const currentAlbum = state.currentAlbum || albumKey; // ✅ Восстанавливаем просматриваемый альбом
      const trackIndex = Number.isFinite(state.trackIndex) ? state.trackIndex : 0;
      const position = Number.isFinite(state.position) ? state.position : 0;
      const volume = Number.isFinite(state.volume) ? state.volume : 100;
      const wasPlaying = !!state.wasPlaying;

      // ✅ Восстанавливаем UI состояние
      if (state.lyricsViewMode) {
        localStorage.setItem('lyricsViewMode', state.lyricsViewMode);
      }
      if (typeof state.animationEnabled === 'boolean') {
        localStorage.setItem('lyricsAnimationEnabled', state.animationEnabled ? '1' : '0');
      }

      if (!albumKey || !window.AlbumsManager || !window.playerCore) return;

      // 1. ✅ Сначала загружаем ПРОСМАТРИВАЕМЫЙ альбом (для корректного UI)
      if (currentAlbum && currentAlbum !== albumKey) {
        await window.AlbumsManager.loadAlbum(currentAlbum);
      }

      // 2. Формируем плейлист так же, как при обычном клике по треку
      if (albumKey === window.SPECIAL_FAVORITES_KEY) {
        // Виртуальный плейлист избранного
        await window.AlbumsManager.ensureFavoritesPlayback(trackIndex);
      } else {
        // Обычный альбом
        const albumData = window.AlbumsManager.getAlbumData(albumKey);
        const albumInfo = (window.albumsIndex || []).find(a => a.key === albumKey);
        if (!albumData || !albumInfo) return;

        const base = albumInfo.base || '';
        const tracksForCore = albumData.tracks
          .filter(t => !!t.file)
          .map((t) => ({
            src: t.file,
            title: t.title,
            artist: albumData.artist || 'Витрина Разбита',
            album: albumKey,
            cover: albumData.cover
              ? new URL(albumData.cover, base).toString()
              : (albumInfo ? new URL('cover.jpg', albumInfo.base).toString() : 'img/logo.png'),
            lyrics: t.lyrics || null,
            fulltext: t.fulltext || null,
            uid: (typeof t.uid === 'string' && t.uid.trim()) ? t.uid.trim() : null
          }));

        if (tracksForCore.length > 0) {
          window.playerCore.setPlaylist(tracksForCore, trackIndex, {
            artist: albumData.artist || 'Витрина Разбита',
            album: albumData.title || albumInfo.title || '',
            cover: albumData.cover
              ? new URL(albumData.cover, base).toString()
              : (albumInfo ? new URL('cover.jpg', albumInfo.base).toString() : 'img/logo.png')
          });
          window.AlbumsManager.setPlayingAlbum(albumKey);
          window.playerCore.play(trackIndex);
        }
      }

      // 3. Громкость и позиция
      window.playerCore.setVolume(volume);
      if (position > 0) {
        try { window.playerCore.seek(position); } catch {}
      }

      // 4. Если до этого играло — продолжаем; если нет — ставим на паузу в нужном месте
      if (!wasPlaying && window.playerCore.isPlaying()) {
        window.playerCore.pause();
      }

      // Правило «ничто не останавливает» соблюдено: мы либо продолжаем играть,
      // либо мягко ставим на паузу только если до этого была пауза.
    } catch (e) {
      console.warn('PlayerState.apply failed:', e);
    } finally {
      try {
        // После удачного применения сбрасываем одноразовый флаг SW‑реюма
        sessionStorage.removeItem(SESSION_RESUME_KEY);
      } catch {}
    }
  }

  window.PlayerState = {
    save,
    apply
  };
})();


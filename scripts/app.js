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

    async _waitForReady(checkFn, maxMs = 2000) {
      // ✅ Единый механизм ожидания: используем Utils.waitFor если доступно,
      // иначе делаем минимальный fallback.
      const waitFor = w.Utils?.waitFor;
      if (typeof waitFor === 'function') {
        return waitFor(checkFn, maxMs, 50);
      }

      const started = Date.now();
      while (!checkFn() && (Date.now() - started) < maxMs) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 50));
      }
      return checkFn();
    }

    async initializeFavorites() {
      const ok = await this._waitForReady(() =>
        !!(w.FavoritesManager && typeof w.FavoritesManager.initialize === 'function')
      );

      if (ok) {
        w.FavoritesManager.initialize();
        console.log('✅ Favorites initialized');
      } else {
        console.warn('⚠️ FavoritesManager not ready');
      }
    }

    async initializeGallery() {
      const ok = await this._waitForReady(() =>
        !!(w.GalleryManager && typeof w.GalleryManager.initialize === 'function')
      );

      if (ok) {
        w.GalleryManager.initialize();
        console.log('✅ Gallery initialized');
      } else {
        console.warn('⚠️ GalleryManager not ready');
      }
    }

    async initializeAlbums() {
      const ok = await this._waitForReady(() =>
        !!(w.AlbumsManager && typeof w.AlbumsManager.initialize === 'function')
      );

      if (ok) {
        w.AlbumsManager.initialize();
        console.log('✅ Albums initialized');
      } else {
        console.warn('⚠️ AlbumsManager not ready');
      }
    }

    async initializePlayerUI() {
      const ok = await this._waitForReady(() =>
        !!(w.PlayerUI && typeof w.PlayerUI.initialize === 'function')
      );

      if (ok) {
        w.PlayerUI.initialize();
        console.log('✅ PlayerUI initialized');
      } else {
        console.warn('⚠️ PlayerUI not ready');
      }
    }

    // initializePlayerUI / initializeGallery должны быть объявлены только один раз.
    // Инициализацию выполняем через единый _waitForReady, без дублей.

    initializeModules() {
      // Большинство модулей в проекте самоинициализируются при загрузке скрипта.
      // Здесь оставляем только безопасные no-op вызовы на случай появления initialize() в будущем.
      const maybeInit = (obj, name) => {
        try {
          if (obj && typeof obj.initialize === 'function') {
            obj.initialize();
            console.log(`✅ ${name} initialized`);
          }
        } catch (e) {
          console.warn(`${name}.initialize failed:`, e);
        }
      };

      maybeInit(w.SleepTimer, 'SleepTimer');
      maybeInit(w.LyricsModal, 'LyricsModal');
      maybeInit(w.SystemInfoManager, 'SystemInfoManager');
      maybeInit(w.DownloadsManager, 'DownloadsManager');
      maybeInit(w.BackgroundAudioManager, 'BackgroundAudioManager');
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
            document.getElementById('pulse-btn')?.click();
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

  const STORAGE_KEY_V2 = 'playerStateV2';
  const SESSION_RESUME_KEY_V2 = 'resumeAfterReloadV2';

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

      const trackUid = String(track?.uid || '').trim() || null;
      const sourceAlbum = String(track?.sourceAlbum || '').trim() || null;

      const state = {
        album: playingAlbum,
        currentAlbum: currentAlbum, // ✅ Добавляем текущий просматриваемый альбом

        // ✅ Новый источник правды для восстановления: uid
        trackUid,
        sourceAlbum,

        // legacy fallback (если uid нет)
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

      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));

      if (options.forReload) {
        // Краткоживущий стейт для SW‑обновления (одна перезагрузка)
        sessionStorage.setItem(SESSION_RESUME_KEY_V2, '1');
      }

      // Не трогаем воспроизведение: только фиксируем снимок.
    } catch (e) {
      console.warn('PlayerState.save failed:', e);
    }
  }

  async function apply() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_V2);
      if (!raw) return;

      const state = JSON.parse(raw);
      if (!state || typeof state !== 'object') return;

      const albumKey = state.album;
      const currentAlbum = state.currentAlbum || albumKey; // ✅ Восстанавливаем просматриваемый альбом
      const trackUid = String(state.trackUid || '').trim();
      const sourceAlbum = String(state.sourceAlbum || '').trim();
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
        // ✅ Восстановление по uid: найдём индекс строки в favoritesRefsModel
        let idxToPlay = trackIndex;

        if (trackUid) {
          const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
          const found = model.findIndex(it =>
            it &&
            String(it.__uid || '').trim() === trackUid &&
            (!sourceAlbum || String(it.__a || '').trim() === sourceAlbum)
          );
          if (found >= 0) idxToPlay = found;
        }

        await window.AlbumsManager.ensureFavoritesPlayback(idxToPlay);
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
            cover: 'img/logo.png',
            lyrics: t.lyrics || null,
            fulltext: t.fulltext || null,
            uid: (typeof t.uid === 'string' && t.uid.trim()) ? t.uid.trim() : null,
            hasLyrics: (typeof t.hasLyrics === 'boolean') ? t.hasLyrics : null
          }));

        if (tracksForCore.length > 0) {
          // ✅ Восстановление по uid (если есть), иначе — trackIndex
          let startIndex = trackIndex;

          if (trackUid) {
            const found = tracksForCore.findIndex(t => String(t?.uid || '').trim() === trackUid);
            if (found >= 0) startIndex = found;
          }

          window.playerCore.setPlaylist(tracksForCore, startIndex, {
            artist: albumData.artist || 'Витрина Разбита',
            album: albumData.title || albumInfo.title || '',
            cover: 'img/logo.png'
          });
          window.AlbumsManager.setPlayingAlbum(albumKey);
          window.playerCore.play(startIndex);
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
        sessionStorage.removeItem(SESSION_RESUME_KEY_V2);
      } catch {}
    }
  }

  window.PlayerState = {
    save,
    apply
  };
})();

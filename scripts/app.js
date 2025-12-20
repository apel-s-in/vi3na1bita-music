// scripts/app.js — Главная точка входа (оптимизировано)
(function AppModule() {
  'use strict';
  const w = window;

  class Application {
    constructor() {
      this.initialized = false;
    }

    async initialize() {
      if (this.initialized) return;
      this.initialized = true;
      console.log(`🎵 Initializing app v${w.VERSION}`);

      try {
        await w.Utils?.waitFor?.(() => w.albumsIndex?.length > 0, 2000);
        
        const modules = [
          ['FavoritesManager', 'initialize'],
          ['GalleryManager', 'initialize'],
          ['AlbumsManager', 'initialize'],
          ['PlayerUI', 'initialize']
        ];
        
        for (const [name, method] of modules) {
          await w.Utils?.waitFor?.(() => w[name]?.[method], 2000);
          w[name][method]();
          console.log(`✅ ${name} initialized`);
        }

        await w.PlayerState?.apply?.();
        this.setupHotkeys();
        this.setupPWA();
        this.setupSWMessaging();
        
        // Download button
        document.getElementById('download-album-main')?.addEventListener('click', () => {
          const album = w.AlbumsManager?.getCurrentAlbum?.();
          if (!album || album.startsWith('__')) {
            w.NotificationSystem?.info('Этот раздел нельзя скачать');
            return;
          }
          w.DownloadsManager?.downloadAlbum(album);
        });

        console.log('✅ Application initialized');
      } catch (e) {
        console.error('❌ Init failed:', e);
        w.NotificationSystem?.error('Ошибка инициализации');
      }
    }

    setupHotkeys() {
      document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        const k = e.key.toLowerCase();
        const pc = w.playerCore;
        
        const actions = {
          'k': () => w.PlayerUI?.togglePlayPause?.(),
          ' ': () => w.PlayerUI?.togglePlayPause?.(),
          'n': () => pc?.next(),
          'p': () => pc?.prev(),
          'x': () => pc?.stop(),
          'm': () => document.getElementById('mute-btn')?.click(),
          'r': () => document.getElementById('repeat-btn')?.click(),
          'u': () => document.getElementById('shuffle-btn')?.click(),
          'a': () => document.getElementById('animation-btn')?.click(),
          'b': () => document.getElementById('pulse-btn')?.click(),
          'f': () => document.getElementById('favorites-btn')?.click(),
          't': () => w.SleepTimer?.show?.(),
          'y': () => document.getElementById('lyrics-toggle-btn')?.click(),
          'arrowleft': () => pc?.seek(Math.max(0, pc.getPosition() - 5)),
          'arrowright': () => pc?.seek(Math.min(pc.getDuration(), pc.getPosition() + 5)),
          'arrowup': () => pc?.setVolume(Math.min(100, (pc.getVolume() || 100) + 5)),
          'arrowdown': () => pc?.setVolume(Math.max(0, (pc.getVolume() || 100) - 5))
        };
        
        if (actions[k]) { e.preventDefault(); actions[k](); }
      });
    }

    setupPWA() {
      let prompt = null;
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        prompt = e;
        const btn = document.getElementById('install-pwa-btn');
        if (btn) {
          btn.style.display = 'block';
          btn.onclick = async () => {
            prompt?.prompt();
            const { outcome } = await prompt?.userChoice || {};
            if (outcome === 'accepted') w.NotificationSystem?.success('Установлено!');
            prompt = null;
            btn.style.display = 'none';
          };
        }
      });
    }

    setupSWMessaging() {
      if (!('serviceWorker' in navigator)) return;
      const handle = async (e) => {
        const msg = e?.data;
        if (msg?.type !== 'SW_VERSION' || !msg.version || msg.version === w.VERSION) return;
        if (!confirm(`Обновить до ${msg.version}?`)) return;
        w.PlayerState?.save?.({ forReload: true });
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        } catch { location.reload(); }
      };
      navigator.serviceWorker.addEventListener('message', handle);
      window.addEventListener('message', handle);
    }
  }

  w.app = new Application();
  if (localStorage.getItem('promocode') === 'VITRINA2025') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => w.app.initialize());
    } else w.app.initialize();
  }
})();

// PlayerState
(function() {
  const KEY = 'playerStateV2';

  function save(opts = {}) {
    try {
      const pc = window.playerCore;
      if (!pc) return;
      const track = pc.getCurrentTrack();
      const state = {
        album: window.AlbumsManager?.getPlayingAlbum?.(),
        currentAlbum: window.AlbumsManager?.getCurrentAlbum?.(),
        trackUid: track?.uid?.trim() || null,
        sourceAlbum: track?.sourceAlbum?.trim() || null,
        trackIndex: pc.getIndex() || 0,
        position: Math.floor(pc.getPosition() || 0),
        volume: pc.getVolume() ?? 100,
        wasPlaying: pc.isPlaying()
      };
      localStorage.setItem(KEY, JSON.stringify(state));
      if (opts.forReload) sessionStorage.setItem('resumeAfterReloadV2', '1');
    } catch {}
  }

  async function apply() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s?.album || !window.AlbumsManager || !window.playerCore) return;

      if (s.currentAlbum && s.currentAlbum !== s.album) {
        await window.AlbumsManager.loadAlbum(s.currentAlbum);
      }

      if (s.album === '__favorites__') {
        let idx = s.trackIndex || 0;
        if (s.trackUid) {
          const model = window.favoritesRefsModel || [];
          const found = model.findIndex(it => it?.__uid === s.trackUid);
          if (found >= 0) idx = found;
        }
        await window.AlbumsManager.ensureFavoritesPlayback(idx);
      } else {
        const data = window.AlbumsManager.getAlbumData(s.album);
        const info = window.albumsIndex?.find(a => a.key === s.album);
        if (!data || !info) return;
        
        const tracks = data.tracks.filter(t => t.file).map(t => ({
          src: t.file, title: t.title, artist: data.artist || 'Витрина Разбита',
          album: s.album, cover: 'img/logo.png', lyrics: t.lyrics, fulltext: t.fulltext,
          uid: t.uid?.trim() || null, hasLyrics: t.hasLyrics
        }));
        
        if (tracks.length) {
          let idx = s.trackIndex || 0;
          if (s.trackUid) {
            const found = tracks.findIndex(t => t.uid === s.trackUid);
            if (found >= 0) idx = found;
          }
          window.playerCore.setPlaylist(tracks, idx, { artist: data.artist, album: data.title, cover: 'img/logo.png' });
          window.AlbumsManager.setPlayingAlbum(s.album);
          window.playerCore.play(idx);
        }
      }

      window.playerCore.setVolume(s.volume ?? 100);
      if (s.position > 0) try { window.playerCore.seek(s.position); } catch {}
      if (!s.wasPlaying && window.playerCore.isPlaying()) window.playerCore.pause();
    } catch {} finally {
      try { sessionStorage.removeItem('resumeAfterReloadV2'); } catch {}
    }
  }

  window.PlayerState = { save, apply };
})();

// scripts/core/utils.js — Общие утилиты
(function() {
  'use strict';
  
  const Utils = {
    // ===== DOM =====
    $(id) {
      return document.getElementById(id);
    },

    dom: (() => {
      // Микро‑кэш по id. Безопасность:
      // - если узел удалили из DOM => кэш сбросится при следующем запросе
      // - не держим "мертвые" ссылки
      function cacheById() {
        const m = new Map();
        return function byId(id) {
          const key = String(id || '');
          if (!key) return null;

          const cached = m.get(key);
          if (cached && cached.isConnected) return cached;

          const el = document.getElementById(key);
          if (el) m.set(key, el);
          else m.delete(key);
          return el || null;
        };
      }

      const byId = cacheById();

      return {
        cacheById,
        byId,
        on(el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); },
        raf(fn) { return requestAnimationFrame(fn); },
        qs(sel, root = document) { return root.querySelector(sel); }
      };
    })(),

    // ✅ Общие простые утилиты (убираем дубли из player-ui.js и других модулей)
    clamp(n, a, b) {
      const nn = Number(n);
      const aa = Number(a);
      const bb = Number(b);
      if (!Number.isFinite(nn) || !Number.isFinite(aa) || !Number.isFinite(bb)) return aa;
      return Math.max(aa, Math.min(bb, nn));
    },

    toInt(v, d = 0) {
      const n = parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : d;
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
      return !!fn();
    },

    onceEvent(target, eventName, opts = {}) {
      const timeoutMs = (opts && Number.isFinite(opts.timeoutMs)) ? opts.timeoutMs : null;
      return new Promise((resolve, reject) => {
        let tm = null;
        const onEv = (ev) => {
          cleanup();
          resolve(ev);
        };
        const cleanup = () => {
          try { target.removeEventListener(eventName, onEv); } catch {}
          if (tm) clearTimeout(tm);
        };
        try { target.addEventListener(eventName, onEv, { once: true }); } catch { /* noop */ }
        if (timeoutMs != null) {
          tm = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout waiting for event "${eventName}"`));
          }, timeoutMs);
        }
      });
    },

    debounceFrame(fn) {
      let raf = 0;
      let lastArgs = null;
      return function (...args) {
        lastArgs = args;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          fn.apply(this, lastArgs);
        });
      };
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
    },

    // ✅ Core helper: единый safe network status (используют offline/player/ui)
    getNetworkStatusSafe() {
      try {
        if (window.NetworkManager?.getStatus) return window.NetworkManager.getStatus();
      } catch {}
      return { online: navigator.onLine !== false, kind: 'unknown', saveData: false };
    },

    // ✅ Core helper: единый bytes formatter (чтобы sysinfo/sw-manager могли брать без ESM импорта)
    formatBytes(n) {
      const b = Number(n) || 0;
      if (b < 1024) return `${Math.floor(b)} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
      return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    },

    // ===== LocalStorage =====
    lsGet(key, fallback = null) {
      try {
        const v = localStorage.getItem(String(key || ''));
        return v === null ? fallback : v;
      } catch {
        return fallback;
      }
    },

    lsSet(key, value) {
      try { localStorage.setItem(String(key || ''), String(value)); return true; } catch { return false; }
    },

    lsGetBool01(key, fallback = false) {
      const v = Utils.lsGet(key, fallback ? '1' : '0');
      return v === '1';
    },

    lsSetBool01(key, on) {
      return Utils.lsSet(key, on ? '1' : '0');
    },

    // ===== UI helpers =====
    setBtnActive(id, active) {
      const el = Utils.dom.byId(id);
      if (el) el.classList.toggle('active', !!active);
    },

    setAriaDisabled(el, disabled) {
      if (!el) return;
      el.classList.toggle('disabled', !!disabled);
      el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    },

    // ===== App helpers (thin) =====
    isBrowsingOtherAlbum() {
      const playing = window.AlbumsManager?.getPlayingAlbum?.();
      const current = window.AlbumsManager?.getCurrentAlbum?.();
      if (!playing) return false;
      if (playing === window.SPECIAL_FAVORITES_KEY && current === window.SPECIAL_FAVORITES_KEY) return false;
      return playing !== current;
    },

    isOnline() {
      try {
        if (window.NetworkManager?.getStatus) return !!window.NetworkManager.getStatus().online;
      } catch {}
      return navigator.onLine !== false;
    },

    // ===== Favorites helpers (mini header like status) =====
    fav: {
      // Возвращает true/false: лайкнут ли track.uid в контексте playingAlbum
      // Поддерживает __favorites__: лайк хранится в sourceAlbum
      isTrackLikedInContext({ playingAlbum, track } = {}) {
        const fm = window.FavoritesManager;
        const pa = String(playingAlbum || '').trim();
        const uid = String(track?.uid || '').trim();
        if (!fm || !pa || !uid) return false;

        if (pa !== window.SPECIAL_FAVORITES_KEY) {
          return !!fm.isFavorite?.(pa, uid);
        }

        const srcAlbum = String(track?.sourceAlbum || '').trim();
        if (srcAlbum) return !!fm.isFavorite?.(srcAlbum, uid);

        // fallback: пытаемся найти source album по favoritesRefsModel
        const ref = Array.isArray(window.favoritesRefsModel)
          ? window.favoritesRefsModel.find(it => String(it?.__uid || '').trim() === uid)
          : null;

        const a = String(ref?.__a || '').trim();
        return a ? !!fm.isFavorite?.(a, uid) : false;
      }
    },

    // ===== PQ helpers (pq-state + toggle) =====
    pq: {
      key: 'qualityMode:v1',

      getMode() {
        const raw = String(Utils.lsGet(Utils.pq.key, window.playerCore?.getQualityMode?.() || 'hi')).toLowerCase();
        return raw === 'lo' ? 'lo' : 'hi';
      },

      getState() {
        const pc = window.playerCore;
        const mode = Utils.pq.getMode();
        const canToggleByTrack = !!pc?.canToggleQualityForCurrentTrack?.();
        const netOk = Utils.isOnline();
        const canToggle = canToggleByTrack && netOk;

        return { mode, canToggle, canToggleByTrack, netOk };
      },

      toggle() {
        const pc = window.playerCore;
        if (!pc) return { ok: false, reason: 'noPlayerCore' };

        const st = Utils.pq.getState();
        if (!st.netOk) return { ok: false, reason: 'offline' };
        if (!st.canToggleByTrack) return { ok: false, reason: 'trackNoLo' };

        const next = st.mode === 'hi' ? 'lo' : 'hi';
        pc.switchQuality?.(next);
        return { ok: true, next };
      }
    },

    // ===== Download helpers (size hint + apply) =====
    download: {
      // best-effort: вернуть "(~X.XX МБ)" или "".
      getSizeHintMB({ albumData, track } = {}) {
        try {
          const uid = String(track?.uid || '').trim();
          if (!uid || !albumData || !Array.isArray(albumData.tracks)) return '';

          const byUid = albumData.tracks.find(t => t && String(t.uid || '').trim() === uid);
          if (!byUid) return '';

          const curSrc = String(track?.src || '').trim();
          const loSrc = String(byUid.fileLo || '').trim();

          const size = (curSrc && loSrc && curSrc === loSrc)
            ? (typeof byUid.sizeLo === 'number' ? byUid.sizeLo : null)
            : (typeof byUid.sizeHi === 'number' ? byUid.sizeHi : (typeof byUid.size === 'number' ? byUid.size : null));

          return (typeof size === 'number') ? ` (~${size.toFixed(2)} МБ)` : '';
        } catch {
          return '';
        }
      },

      applyDownloadLink(anchorEl, track) {
        if (!anchorEl) return;

        if (!track || !track.src) {
          anchorEl.href = '#';
          anchorEl.removeAttribute('download');
          anchorEl.title = 'Скачать трек';
          return;
        }

        anchorEl.href = track.src;
        anchorEl.download = `${track.title}.mp3`;

        const playingAlbumKey = window.AlbumsManager?.getPlayingAlbum?.();
        const albumData = playingAlbumKey ? window.AlbumsManager?.getAlbumData?.(playingAlbumKey) : null;

        const hint = Utils.download.getSizeHintMB({ albumData, track });
        anchorEl.title = hint ? `Скачать трек${hint}` : 'Скачать трек';
      }
    }
  };

  // Глобальный экспорт
  window.Utils = Utils;
  
  console.log('✅ Utils loaded');
})();

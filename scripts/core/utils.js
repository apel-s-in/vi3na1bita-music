// scripts/core/utils.js — Общие утилиты (clean + меньше дублей)
(function () {
  'use strict';

  const W = window;

  const Utils = {
    // ===== DOM =====
    dom: (() => {
      const m = new Map();
      const byId = (id) => {
        const key = String(id || '');
        if (!key) return null;
        const cached = m.get(key);
        if (cached && cached.isConnected) return cached;
        const el = document.getElementById(key);
        if (el) m.set(key, el);
        else m.delete(key);
        return el || null;
      };

      const on = (el, ev, fn, opts) => {
        if (!el) return () => {};
        el.addEventListener(ev, fn, opts);
        return () => { try { el.removeEventListener(ev, fn, opts); } catch {} };
      };

      const raf = (fn) => requestAnimationFrame(fn);

      const qs = (sel, root = document) => root.querySelector(sel);
      const qsa = (sel, root = document) => root.querySelectorAll(sel);

      const createStyleOnce = (id, cssText) => {
        const key = String(id || '').trim();
        if (!key) return null;
        const existing = document.getElementById(key);
        if (existing) return existing;
        const s = document.createElement('style');
        s.id = key;
        s.textContent = String(cssText || '');
        document.head.appendChild(s);
        return s;
      };

      const onDocClickOutside = (targetEl, handler, opts = {}) => {
        const capture = opts.capture !== false;
        const doc = opts.doc || document;
        const fn = (e) => {
          try {
            if (!targetEl || targetEl.contains(e.target)) return;
            handler && handler(e);
          } catch {}
        };
        doc.addEventListener('click', fn, capture);
        return () => { try { doc.removeEventListener('click', fn, capture); } catch {} };
      };

      const onEscape = (handler, opts = {}) => {
        const doc = opts.doc || document;
        const fn = (e) => { if (e?.key === 'Escape') { try { handler && handler(e); } catch {} } };
        doc.addEventListener('keydown', fn, { passive: true });
        return () => { try { doc.removeEventListener('keydown', fn, { passive: true }); } catch {} };
      };

      return { byId, on, raf, qs, qsa, createStyleOnce, onDocClickOutside, onEscape };
    })(),

    // Back-compat
    $(id) { return Utils.dom.byId(id); },
    $q(sel, root) { return Utils.dom.qs(sel, root); },
    $qa(sel, root) { return Utils.dom.qsa(sel, root); },

    // ===== Common =====
    clamp(n, a, b) {
      n = Number(n); a = Number(a); b = Number(b);
      return Number.isFinite(n) && Number.isFinite(a) && Number.isFinite(b) ? Math.max(a, Math.min(b, n)) : a;
    },

    toInt(v, d = 0) {
      const n = parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : d;
    },

    trimStr(v) {
      const s = String(v ?? '').trim();
      return s || null;
    },

    escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = String(s || '');
      return d.innerHTML;
    },

    formatTime(s) {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return '--:--';
      const m = Math.floor(n / 60);
      const sec = Math.floor(n % 60);
      return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    },

    async waitFor(fn, maxMs = 2000, step = 50) {
      let t = 0;
      while (!fn() && t < maxMs) { // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, step));
        t += step;
      }
      return !!fn();
    },

    onceEvent(target, eventName, opts = {}) {
      const timeoutMs = (opts && Number.isFinite(opts.timeoutMs)) ? opts.timeoutMs : null;
      return new Promise((resolve, reject) => {
        let tm = null;
        const onEv = (ev) => { cleanup(); resolve(ev); };
        const cleanup = () => {
          try { target.removeEventListener(eventName, onEv); } catch {}
          if (tm) clearTimeout(tm);
        };
        try { target.addEventListener(eventName, onEv, { once: true }); } catch {}
        if (timeoutMs != null) {
          tm = setTimeout(() => { cleanup(); reject(new Error(`Timeout waiting for event "${eventName}"`)); }, timeoutMs);
        }
      });
    },

    debounceFrame(fn) {
      let rafId = 0, lastArgs = null;
      return function (...args) {
        lastArgs = args;
        if (rafId) return;
        rafId = requestAnimationFrame(() => { rafId = 0; fn.apply(this, lastArgs); });
      };
    },

    isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); },
    isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !W.MSStream; },
    isStandalone() { return W.matchMedia('(display-mode: standalone)').matches || W.navigator.standalone; },

    // ===== Network =====
    getNetworkStatusSafe() {
      try { if (W.NetworkManager?.getStatus) return W.NetworkManager.getStatus(); } catch {}
      return { online: navigator.onLine !== false, kind: 'unknown', saveData: false };
    },

    isOnline() {
      try { if (W.NetworkManager?.getStatus) return !!W.NetworkManager.getStatus().online; } catch {}
      return navigator.onLine !== false;
    },

    // ===== Bytes =====
    formatBytes(n) {
      const b = Number(n) || 0;
      if (b < 1024) return `${Math.floor(b)} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
      return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    },

    // ===== Storage =====
    lsGet(key, fallback = null) {
      try {
        const v = localStorage.getItem(String(key || ''));
        return v === null ? fallback : v;
      } catch { return fallback; }
    },

    lsSet(key, value) {
      try { localStorage.setItem(String(key || ''), String(value)); return true; } catch { return false; }
    },

    lsRemove(key) {
      try { localStorage.removeItem(String(key || '')); return true; } catch { return false; }
    },

    lsGetBool01(key, fallback = false) {
      return Utils.lsGet(key, fallback ? '1' : '0') === '1';
    },

    lsSetBool01(key, on) {
      return Utils.lsSet(key, on ? '1' : '0');
    },

    lsGetJson(key, fallback = null) {
      try {
        const raw = localStorage.getItem(String(key || ''));
        if (!raw) return fallback;
        const j = JSON.parse(raw);
        return (j === null || j === undefined) ? fallback : j;
      } catch { return fallback; }
    },

    lsSetJson(key, value) {
      try { localStorage.setItem(String(key || ''), JSON.stringify(value)); return true; } catch { return false; }
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

    // ===== App helpers =====
    isSpecialAlbumKey(key) {
      const k = String(key || '');
      return !!k && k.startsWith('__');
    },

    isBrowsingOtherAlbum() {
      const playing = W.AlbumsManager?.getPlayingAlbum?.();
      const current = W.AlbumsManager?.getCurrentAlbum?.();
      if (!playing) return false;
      if (playing === W.SPECIAL_FAVORITES_KEY && current === W.SPECIAL_FAVORITES_KEY) return false;
      return playing !== current;
    },

    // ===== Favorites helpers =====
    fav: {
      isTrackLikedInContext({ playingAlbum, track } = {}) {
        const pc = W.playerCore;
        const pa = String(playingAlbum || '').trim();
        const uid = String(track?.uid || '').trim();
        if (!fm || !pa || !uid) return false;

        if (pa !== W.SPECIAL_FAVORITES_KEY) return !!pc?.isFavorite?.(uid);

        const srcAlbum = String(track?.sourceAlbum || '').trim();
        if (srcAlbum) return !!pc?.isFavorite?.(uid);

        const ref = Array.isArray(W.favoritesRefsModel)
          ? W.favoritesRefsModel.find(it => String(it?.__uid || '').trim() === uid)
          : null;

        const a = String(ref?.__a || '').trim();
        return a ? !!pc?.isFavorite?.(uid) : false;
      }
    },

    // ===== PQ helpers =====
    pq: {
      key: 'qualityMode:v1',

      getMode() {
        const raw = String(Utils.lsGet(Utils.pq.key, W.playerCore?.getQualityMode?.() || 'hi')).toLowerCase();
        return raw === 'lo' ? 'lo' : 'hi';
      },

      getState() {
        const pc = W.playerCore;
        const mode = Utils.pq.getMode();
        const canToggleByTrack = !!pc?.canToggleQualityForCurrentTrack?.();
        const netOk = Utils.isOnline();
        return { mode, canToggle: canToggleByTrack && netOk, canToggleByTrack, netOk };
      },

      toggle() {
        const pc = W.playerCore;
        if (!pc) return { ok: false, reason: 'noPlayerCore' };
        const st = Utils.pq.getState();
        if (!st.netOk) return { ok: false, reason: 'offline' };
        if (!st.canToggleByTrack) return { ok: false, reason: 'trackNoLo' };
        const next = st.mode === 'hi' ? 'lo' : 'hi';
        pc.switchQuality?.(next);
        return { ok: true, next };
      }
    },

    // ===== Download helpers =====
    download: {
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
        } catch { return ''; }
      },

      applyDownloadLink(anchorEl, track) {
        if (!anchorEl) return;

        if (!track?.src) {
          anchorEl.href = '#';
          anchorEl.removeAttribute('download');
          anchorEl.title = 'Скачать трек';
          return;
        }

        anchorEl.href = track.src;
        anchorEl.download = `${track.title}.mp3`;

        const playingAlbumKey = W.AlbumsManager?.getPlayingAlbum?.();
        const albumData = playingAlbumKey ? W.AlbumsManager?.getAlbumData?.(playingAlbumKey) : null;
        const hint = Utils.download.getSizeHintMB({ albumData, track });
        anchorEl.title = hint ? `Скачать трек${hint}` : 'Скачать трек';
      }
    }
  };

  W.Utils = Utils;
})();

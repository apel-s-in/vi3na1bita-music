//=================================================
// FILE: /scripts/core/utils.js
(function(W, D) {
  'use strict';

  const LS = localStorage, J = JSON;
  const pc = () => W.playerCore;
  
  // --- Core Helpers ---
  const str = (v) => String(v || '').trim();
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const esc = (s) => str(s).replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m]));

  // --- Utils Implementation ---
  const U = {
    // DOM
    $: (id) => D.getElementById(id),
    $q: (s, r = D) => r.querySelector(s),
    $qa: (s, r = D) => r.querySelectorAll(s),
    
    dom: {
      byId: (id) => D.getElementById(id),
      qs: (s, r = D) => r.querySelector(s),
      qsa: (s, r = D) => r.querySelectorAll(s),
      raf: (fn) => requestAnimationFrame(fn),
      
      on: (el, ev, fn, opts) => {
        if (!el) return () => {};
        el.addEventListener(ev, fn, opts);
        return () => { try { el.removeEventListener(ev, fn, opts); } catch {} };
      },

      createStyleOnce: (id, css) => {
        if (D.getElementById(id)) return;
        const s = D.createElement('style');
        s.id = id; s.textContent = css;
        D.head.appendChild(s);
      },

      onDocClickOutside: (el, fn) => {
        const h = (e) => { if (el && !el.contains(e.target)) fn(e); };
        setTimeout(() => D.addEventListener('click', h), 0);
        return () => D.removeEventListener('click', h);
      },
      
      onEscape: (fn) => {
        const h = (e) => e.key === 'Escape' && fn(e);
        D.addEventListener('keydown', h, { passive: true });
        return () => D.removeEventListener('keydown', h);
      }
    },

    // Math & Format
    clamp: (n, a, b) => Math.max(a, Math.min(b, num(n))),
    toInt: num,
    trimStr: (v) => str(v) || null,
    escapeHtml: esc,
    
    formatTime: (s) => {
      const n = num(s);
      if (n < 0) return '--:--';
      const m = (n / 60) | 0, sec = (n % 60) | 0;
      return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
    },

    formatBytes: (n) => {
      const b = num(n);
      if (b < 1024) return b + ' B';
      const k = 1024, sizes = ['KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i + 1)).toFixed(2)) + ' ' + sizes[i];
    },

    // Async
    waitFor: async (fn, max = 2000, step = 50) => {
      for (let t = 0; t < max; t += step) {
        if (fn()) return true;
        await new Promise(r => setTimeout(r, step));
      }
      return !!fn();
    },

    onceEvent: (tgt, ev, opts = {}) => new Promise((res, rej) => {
      const tm = opts.timeoutMs ? setTimeout(() => { clean(); rej(new Error('Timeout')); }, opts.timeoutMs) : null;
      const clean = () => { tgt.removeEventListener(ev, h); if (tm) clearTimeout(tm); };
      const h = (e) => { clean(); res(e); };
      tgt.addEventListener(ev, h, { once: true });
    }),

    debounceFrame: (fn) => {
      let f; return (...a) => { if (f) return; f = requestAnimationFrame(() => { f = 0; fn(...a); }); };
    },

    // Environment
    isMobile: () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !W.MSStream,
    isStandalone: () => W.matchMedia('(display-mode: standalone)').matches,
    
    // Network (TZ 7.5)
    isOnline: () => (W.NetworkManager?.getStatus ? W.NetworkManager.getStatus().online : navigator.onLine) !== false,
    getNetworkStatusSafe: () => (W.NetworkManager?.getStatus?.() || { online: navigator.onLine !== false, kind: 'unknown', saveData: false }),

    // Storage
    lsGet: (k, d = null) => { try { return LS.getItem(k) ?? d; } catch { return d; } },
    lsSet: (k, v) => { try { LS.setItem(k, v); return true; } catch { return false; } },
    lsRemove: (k) => { try { LS.removeItem(k); } catch {} },
    lsGetBool01: (k, d = false) => (LS.getItem(k) ?? (d ? '1' : '0')) === '1',
    lsSetBool01: (k, v) => { try { LS.setItem(k, v ? '1' : '0'); } catch {} },
    lsGetJson: (k, d = null) => { try { const r = LS.getItem(k); return r ? J.parse(r) : d; } catch { return d; } },
    lsSetJson: (k, v) => { try { LS.setItem(k, J.stringify(v)); return true; } catch { return false; } },

    // App Logic
    isSpecialAlbumKey: (k) => str(k).startsWith('__'),
    isBrowsingOtherAlbum: () => {
      const p = W.AlbumsManager?.getPlayingAlbum?.(), c = W.AlbumsManager?.getCurrentAlbum?.();
      return p && c && p !== c && !(p === '__favorites__' && c === '__favorites__');
    },

    setBtnActive: (id, a) => U.$(id)?.classList.toggle('active', !!a),
    setAriaDisabled: (el, d) => { if (el) { el.classList.toggle('disabled', !!d); el.setAttribute('aria-disabled', !!d); } },

    // Favorites Helper
    fav: {
      isTrackLikedInContext: ({ playingAlbum: pa, track: t } = {}) => {
        const u = str(t?.uid), c = pc();
        if (!c || !u) return false;
        if (pa !== '__favorites__' && str(t?.sourceAlbum)) return c.isFavorite(u);
        const ref = (W.favoritesRefsModel || []).find(r => str(r?.__uid) === u);
        return ref?.__a ? c.isFavorite(u) : false;
      }
    },

    // PQ Helper (Updated for TZ v1.0)
    pq: {
      key: 'qualityMode:v1',
      getMode: () => str(LS.getItem('qualityMode:v1') || pc()?.getQualityMode() || 'hi').toLowerCase() === 'lo' ? 'lo' : 'hi',
      getState: () => {
        const c = pc(), net = U.isOnline();
        const can = !!c?.canToggleQualityForCurrentTrack?.();
        return { mode: U.pq.getMode(), canToggle: can && net, canToggleByTrack: can, netOk: net };
      },
      toggle: () => {
        const c = pc(); if (!c) return { ok: false, reason: 'noCore' };
        if (!U.isOnline()) return { ok: false, reason: 'offline' }; // TZ 7.5.1
        if (!c.canToggleQualityForCurrentTrack()) return { ok: false, reason: 'trackNoLo' };
        const n = U.pq.getMode() === 'hi' ? 'lo' : 'hi';
        c.switchQuality(n);
        return { ok: true, next: n };
      }
    },

    // Download Helper (TZ 16.1 - 100% Blob/Offline ready)
    download: {
      getSizeHintMB: ({ albumData: a, track: t } = {}) => {
        try {
          const u = str(t?.uid);
          const tr = (a?.tracks || []).find(x => str(x?.uid) === u);
          if (!tr) return '';
          const s = (t?.src === tr.fileLo) ? (tr.sizeLo ?? tr.size_low) : (tr.sizeHi ?? tr.size);
          return num(s) > 0 ? ` (~${num(s).toFixed(2)} МБ)` : '';
        } catch { return ''; }
      },
      applyDownloadLink: (el, t) => {
        if (!el) return;
        if (!t?.src) { el.href = '#'; el.removeAttribute('download'); el.title = 'Скачать трек'; return; }
        el.href = t.src; el.download = `${str(t.title)}.mp3`;
        const aKey = W.AlbumsManager?.getPlayingAlbum?.();
        const hint = U.download.getSizeHintMB({ albumData: aKey ? W.AlbumsManager?.getAlbumData(aKey) : null, track: t });
        el.title = `Скачать трек${hint}`;
      }
    }
  };

  W.Utils = U;
})(window, document);

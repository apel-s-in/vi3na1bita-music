/**
 * scripts/core/utils.js
 * Optimized Utilities v4.0 — Spec Compliant & Memory Safe
 */
(function(W, D) {
  'use strict';

  // Internal Blob Registry
  const _blobReg = new Map(); 

  const U = {
    $: (id) => D.getElementById(id),
    
    dom: {
      byId: (id) => D.getElementById(id),
      on: (el, ev, fn, opts) => {
        if (!el) return () => {};
        el.addEventListener(ev, fn, opts);
        return () => { try { el.removeEventListener(ev, fn, opts); } catch {} };
      },
      raf: requestAnimationFrame,
      defer: (fn) => setTimeout(fn, 0),
      createStyleOnce: (id, css) => {
        if (D.getElementById(id)) return;
        const s = D.createElement('style');
        s.id = id; s.textContent = css;
        D.head.appendChild(s);
      }
    },

    getNet: () => {
      // SOURCE OF TRUTH: NetPolicy (Compliant with Spec)
      const NP = W.NetPolicy;
      if (NP) return { online: NP.isNetworkAllowed(), kind: NP.detectNetworkType(), saveData: false };
      
      // Fallback if NetPolicy is somehow not loaded yet
      const n = navigator, c = n.connection || n.mozConnection || n.webkitConnection, k = c?.type || 'unknown';
      return { online: n.onLine, kind: /cellular|2g|3g|4g/i.test(k) ? 'cellular' : 'wifi', saveData: c?.saveData || false };
    },
    
    getPlatform: () => {
      const ua = navigator.userAgent;
      return { 
        isIOS: /iPad|iPhone|iPod/.test(ua) && !W.MSStream, 
        isPWA: matchMedia('(display-mode: standalone)').matches || navigator.standalone, 
        isDesktop: !/Mobi|Android/i.test(ua), 
        isAndroid: /Android/.test(ua) 
      };
    },

    fmt: {
      time: (s) => {
        const n = Number(s); if (!n || n < 0) return '00:00';
        const h = n / 3600 | 0, m = (n % 3600) / 60 | 0, sc = n % 60 | 0;
        return (h ? h + ':' : '') + String(h ? m % 60 : m).padStart(2, '0') + ':' + String(sc).padStart(2, '0');
      },
      bytes: (b) => {
        const n = Number(b); if (!Number.isFinite(n) || n <= 0) return '0 B';
        const i = Math.floor(Math.log(n) / Math.log(1024));
        return parseFloat((n / Math.pow(1024, i)).toFixed(1)) + ' ' + (['B','KB','MB','GB'][i] || 'TB');
      },
      durationHuman: (s) => { const h = s / 3600 | 0, m = (s % 3600) / 60 | 0; return h ? `${h}ч ${m}м` : `${m}м`; }
    },
    
    math: {
      clamp: (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max),
      toInt: (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d
    },

    obj: {
      safeJson: (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
      trim: (v) => String(v || '').trim() || null,
      normQuality: (q) => String(q || '').toLowerCase() === 'lo' ? 'lo' : 'hi'
    },

    blob: {
      createUrl: (key, blob) => {
        // FIX: Spec 21.2 Strict Compliance - No early/arbitrary revokes. Managed by PlayerCore.
        if (_blobReg.has(key)) URL.revokeObjectURL(_blobReg.get(key));
        const url = URL.createObjectURL(blob);
        _blobReg.set(key, url);
        return url;
      },
      revokeUrl: (key) => {
        if (_blobReg.has(key)) {
          URL.revokeObjectURL(_blobReg.get(key));
          _blobReg.delete(key);
          return true;
        }
        return false;
      }
    },

    ui: {
      toast: (msg, type, dur) => W.NotificationSystem?.show?.(msg, type, dur),
      escapeHtml: (s) => String(s || '').replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m]))
    },
    
    pq: {
      getMode: () => localStorage.getItem('qualityMode:v1') === 'lo' ? 'lo' : 'hi',
      getState: () => {
        const netOk = W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
        const can = !!W.playerCore?.canToggleQualityForCurrentTrack?.();
        return { mode: U.pq.getMode(), canToggle: can && netOk, canToggleByTrack: can, netOk };
      },
      toggle: () => {
        const c = W.playerCore; if (!c) return { ok: false, reason: 'noCore' };
        if (!(W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return { ok: false, reason: 'offline' };
        if (!c.canToggleQualityForCurrentTrack()) return { ok: false, reason: 'trackNoLo' };
        
        const n = U.pq.getMode() === 'hi' ? 'lo' : 'hi';
        c.switchQuality(n); // PlayerCore handles persistence and background events
        return { ok: true, next: n };
      }
    },

    fav: {
      isTrackLikedInContext: ({ track: t } = {}) => !!(W.playerCore && t?.uid && W.playerCore.isFavorite(t.uid))
    },

    download: {
      applyDownloadLink: (btn, track) => {
        if (!btn) return;
        if (!track?.src) { btn.removeAttribute('href'); btn.removeAttribute('download'); btn.classList.add('disabled'); return; }
        btn.href = track.src; 
        btn.download = track.artist && track.title ? `${track.artist} - ${track.title}.mp3` : 'track.mp3'; 
        btn.classList.remove('disabled');
      }
    },

    func: {
      debounceFrame: (fn) => { let f; return (...a) => { if (f) cancelAnimationFrame(f); f = requestAnimationFrame(() => { f = null; fn(...a); }); }; },
      throttle: (fn, w) => { let l = 0; return (...a) => { const n = Date.now(); if (n - l >= w) { l = n; fn(...a); } }; }
    },

    isSpecialAlbumKey: (k) => String(k || '').startsWith('__'),
    isBrowsingOtherAlbum: () => { const p = W.AlbumsManager?.getPlayingAlbum?.(), c = W.AlbumsManager?.getCurrentAlbum?.(); return !!(p && c && p !== c && !(p === '__favorites__' && c === '__favorites__')); },
    setBtnActive: (id, a) => D.getElementById(id)?.classList.toggle('active', !!a),
    setAriaDisabled: (el, d) => { if (el) { el.classList.toggle('disabled', !!d); el.setAttribute('aria-disabled', !!d); } },
    lsGet: (k, d) => localStorage.getItem(k) ?? d,
    lsSet: (k, v) => localStorage.setItem(k, v),
    lsGetBool01: (k, d = false) => (localStorage.getItem(k) ?? (d ? '1' : '0')) === '1',
    lsSetBool01: (k, v) => localStorage.setItem(k, v ? '1' : '0'),
    lsGetJson: (k, d = null) => U.obj.safeJson(k, d)
  };
  
  // Safe Global Aliases
  U.escapeHtml = U.ui.escapeHtml;
  U.isMobile = () => U.getPlatform().isIOS || U.getPlatform().isAndroid;
  
  // ESM-compatible exports via window (ПОСЛЕ определения U.isMobile и U.escapeHtml)
  W.AppUtils = {
    $: U.$,
    toStr: (v) => (v == null ? '' : String(v)),
    isMobileUA: () => U.isMobile(),  // Замыкание, а не прямая ссылка
    escHtml: (s) => U.escapeHtml(s)  // Замыкание, а не прямая ссылка
  };
  U.waitFor = async (fn, t = 2000) => { for (let i = 0; i < t / 50; i++) { if (fn()) return true; await new Promise(r => setTimeout(r, 50)); } return !!fn(); };
  U.onceEvent = (el, ev, { timeoutMs } = {}) => new Promise(r => { const h = () => { el.removeEventListener(ev, h); r(); }; el.addEventListener(ev, h, { once: true }); if (timeoutMs) setTimeout(h, timeoutMs); });

  W.Utils = U;
})(window, document);

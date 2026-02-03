/**
 * scripts/core/utils.js
 * Centralized Utilities for Vitrina PWA v3.1
 * Provides legacy support and new namespaces for PlayerUI/Offline.
 */
(function(W, D) {
  'use strict';

  // Internal Blob Registry for iOS memory safety
  const _blobReg = new Map(); 

  const U = {
    // --- 1. DOM Helpers ---
    $: (id) => D.getElementById(id),
    
    dom: {
      byId: (id) => D.getElementById(id),
      on: (el, ev, fn, opts) => {
        if (!el) return () => {};
        el.addEventListener(ev, fn, opts);
        return () => { try { el.removeEventListener(ev, fn, opts); } catch {} };
      },
      raf: (fn) => requestAnimationFrame(fn),
      defer: (fn) => setTimeout(fn, 0),
      createStyleOnce: (id, css) => {
        if (D.getElementById(id)) return;
        const s = D.createElement('style');
        s.id = id; s.textContent = css;
        D.head.appendChild(s);
      }
    },

    // --- 2. Network & Env ---
    getNet: () => {
      const nav = navigator;
      if (nav.onLine === false) return { online: false, kind: 'offline', saveData: false };
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      if (!conn) return { online: true, kind: 'wifi', saveData: false };
      const kind = conn.type || conn.effectiveType || 'unknown';
      const isCellular = /cellular|2g|3g|4g/i.test(kind);
      return {
        online: true,
        kind: isCellular ? 'cellular' : (kind === 'unknown' ? 'unknown' : 'wifi'),
        saveData: conn.saveData || false
      };
    },
    
    getPlatform: () => {
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !W.MSStream;
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      return { isIOS, isPWA, isDesktop: !/Mobi|Android/i.test(ua), isAndroid: /Android/.test(ua) };
    },

    // --- 3. Format & Math (Required by PlayerUI) ---
    fmt: {
      time: (s) => {
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0) return '00:00';
        const h = (n / 3600) | 0;
        const m = ((n % 3600) / 60) | 0;
        const sec = (n % 60) | 0;
        const mmss = `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
        return h > 0 ? `${h}:${mmss}` : mmss;
      },
      bytes: (n) => {
        const b = Number(n);
        if (!Number.isFinite(b) || b <= 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + (sizes[i] || 'TB');
      },
      durationHuman: (sec) => {
        if (!sec) return '0м';
        const h = (sec / 3600) | 0, m = ((sec % 3600) / 60) | 0;
        return h > 0 ? `${h}ч ${m}м` : `${m}м`;
      }
    },
    
    math: {
      clamp: (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max),
      toInt: (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; }
    },

    // --- 4. Object & Data ---
    obj: {
      safeJson: (k, d = null) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch { return d; } },
      trim: (v) => String(v || '').trim() || null,
      normQuality: (q) => (String(q || '').toLowerCase().trim() === 'lo') ? 'lo' : 'hi'
    },

    // --- 5. Blob Management (Optimized LRU) ---
    blob: {
      createUrl: (key, blob) => {
        // Очистка старых ссылок, если их больше 5 (запас для кроссфейда/прелоада)
        if (_blobReg.size > 5) {
          const oldest = _blobReg.keys().next().value;
          URL.revokeObjectURL(_blobReg.get(oldest));
          _blobReg.delete(oldest);
        }
        
        // Если ключ уже есть, пересоздаем (обновляем "свежесть" в Map порядка вставок)
        if (_blobReg.has(key)) {
          URL.revokeObjectURL(_blobReg.get(key));
          _blobReg.delete(key);
        }
        
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

    // --- 6. UI Helpers ---
    ui: {
      toast: (msg, type, duration) => W.NotificationSystem?.show(msg, type, duration),
      escapeHtml: (s) => String(s || '').replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m]))
    },

    // --- 7. Functions required by PlayerUI (Facades) ---
    
    // Playback Quality (PQ)
    pq: {
      getMode: () => (localStorage.getItem('qualityMode:v1') || 'hi') === 'lo' ? 'lo' : 'hi',
      getState: () => {
        const c = W.playerCore;
        const net = U.getNet().online;
        const can = !!c?.canToggleQualityForCurrentTrack?.();
        return { mode: U.pq.getMode(), canToggle: can && net, canToggleByTrack: can, netOk: net };
      },
      toggle: () => {
        const c = W.playerCore; if (!c) return { ok: false, reason: 'noCore' };
        if (!U.getNet().online) return { ok: false, reason: 'offline' };
        if (!c.canToggleQualityForCurrentTrack()) return { ok: false, reason: 'trackNoLo' };
        const n = U.pq.getMode() === 'hi' ? 'lo' : 'hi';
        c.switchQuality(n);
        return { ok: true, next: n };
      }
    },

    // Favorites Helper
    fav: {
      isTrackLikedInContext: ({ playingAlbum: pa, track: t } = {}) => {
        const u = String(t?.uid || ''), c = W.playerCore;
        if (!c || !u) return false;
        if (pa !== '__favorites__' && t?.sourceAlbum) return c.isFavorite(u);
        const ref = (W.favoritesRefsModel || []).find(r => String(r?.__uid) === u);
        return ref?.__a ? c.isFavorite(u) : false;
      }
    },

    // Download Helper (Fixes PlayerUI crash)
    download: {
      applyDownloadLink: (btn, track) => {
        if (!btn) return;
        if (!track || !track.src) {
          btn.removeAttribute('href');
          btn.removeAttribute('download');
          btn.classList.add('disabled');
          return;
        }
        btn.href = track.src;
        btn.download = (track.artist && track.title) 
          ? `${track.artist} - ${track.title}.mp3` 
          : `track.mp3`;
        btn.classList.remove('disabled');
      }
    },

    // Function Helpers
    func: {
      debounceFrame: (fn) => {
        let frame;
        return (...args) => {
          if (frame) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => { frame = null; fn(...args); });
        };
      },
      throttle: (fn, wait) => {
        let last = 0;
        return (...args) => {
          const now = Date.now();
          if (now - last >= wait) { last = now; fn(...args); }
        };
      }
    },

    // --- 8. Legacy / Root Aliases (Backward Compatibility) ---
    isSpecialAlbumKey: (k) => String(k || '').startsWith('__'),
    isBrowsingOtherAlbum: () => {
      const p = W.AlbumsManager?.getPlayingAlbum?.(), c = W.AlbumsManager?.getCurrentAlbum?.();
      return p && c && p !== c && !(p === '__favorites__' && c === '__favorites__');
    },
    setBtnActive: (id, a) => { const el = D.getElementById(id); if(el) el.classList.toggle('active', !!a); },
    setAriaDisabled: (el, d) => { if(el) { el.classList.toggle('disabled', !!d); el.setAttribute('aria-disabled', !!d); }},
    lsGet: (k, d) => localStorage.getItem(k) || d,
    lsSet: (k, v) => localStorage.setItem(k, v),
    lsGetBool01: (k, d=false) => { const v=localStorage.getItem(k); return v===null ? d : v==='1'; },
    lsSetBool01: (k, v) => localStorage.setItem(k, v?'1':'0'),
    lsGetJson: (k, d=null) => { try { const r=localStorage.getItem(k); return r?JSON.parse(r):d; } catch { return d; } }
  };

  // Direct Aliases
  U.escapeHtml = U.ui.escapeHtml;
  U.formatTime = U.fmt.time;
  U.formatBytes = U.fmt.bytes;
  U.getNetworkStatusSafe = U.getNet;
  U.isMobile = () => { const p = U.getPlatform(); return p.isIOS || p.isAndroid; };
  U.trimStr = U.obj.trim;
  U.waitFor = async (fn, t=2000) => { for(let i=0;i<t/50;i++) { if(fn()) return true; await new Promise(r=>setTimeout(r,50)); } return !!fn(); };
  U.onceEvent = (el, ev, { timeoutMs }={}) => new Promise(r => {
    const h = () => { el.removeEventListener(ev, h); r(); };
    el.addEventListener(ev, h, {once:true});
    if(timeoutMs) setTimeout(h, timeoutMs);
  });

  W.Utils = U;
  if (typeof exports !== 'undefined') exports.Utils = U;
})(window, document);
// export const Utils удален, так как этот файл загружается через <script> без type="module"

//=================================================
// FILE: /scripts/core/utils.js
(function(W, D) {
  'use strict';

  const LS = localStorage, J = JSON;
  const pc = () => W.playerCore;
  
  // Internal Blob Registry for iOS memory safety
  const _blobReg = new Map(); // key -> url

  const U = {
    // --- 1. DOM Helpers ---
    $: (id) => D.getElementById(id),
    $q: (s, r = D) => r.querySelector(s),
    $qa: (s, r = D) => r.querySelectorAll(s),
    
    dom: {
      byId: (id) => D.getElementById(id),
      on: (el, ev, fn, opts) => {
        if (!el) return () => {};
        el.addEventListener(ev, fn, opts);
        return () => { try { el.removeEventListener(ev, fn, opts); } catch {} };
      },
      raf: (fn) => requestAnimationFrame(fn),
      createStyleOnce: (id, css) => {
        if (D.getElementById(id)) return;
        const s = D.createElement('style');
        s.id = id; s.textContent = css;
        D.head.appendChild(s);
      }
    },

    // --- 2. Format & Math ---
    fmt: {
      time: (s) => {
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0) return '--:--';
        const m = (n / 60) | 0, sec = (n % 60) | 0;
        return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
      },
      bytes: (n) => {
        const b = Number(n);
        if (!Number.isFinite(b) || b < 0) return '0 B';
        if (b === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + (sizes[i] || 'TB');
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

    // --- 3. Functional (Throttle/Debounce) ---
    func: {
      debounce: (fn, ms = 100) => {
        let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
      },
      debounceFrame: (fn) => {
        let f; return (...a) => { if (f) return; f = requestAnimationFrame(() => { f = 0; fn(...a); }); };
      },
      throttle: (fn, limit) => {
        let inThrottle;
        return function() {
          const args = arguments, context = this;
          if (!inThrottle) {
            fn.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
          }
        };
      }
    },

    // --- 4. Object & Data ---
    obj: {
      safeJson: (k, d = null) => { try { const r = LS.getItem(k); return r ? J.parse(r) : d; } catch { return d; } },
      isEqual: (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
        const kA = Object.keys(a), kB = Object.keys(b);
        if (kA.length !== kB.length) return false;
        for (const k of kA) {
          if (!kB.includes(k) || !U.obj.isEqual(a[k], b[k])) return false;
        }
        return true;
      }
    },

    // --- 5. Blob Management (iOS Critical) ---
    blob: {
      createUrl: (key, blob) => {
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
      },
      revokeAll: () => {
        _blobReg.forEach(url => URL.revokeObjectURL(url));
        _blobReg.clear();
      }
    },

    // --- 6. UI Utils (Toast/Confirm) ---
    ui: {
      toast: (msg, type = 'info', duration) => W.NotificationSystem?.[type]?.(msg, duration),
      confirm: (msg) => W.confirm(msg), // Wrapper allows for future custom modal replacement
      escapeHtml: (s) => String(s || '').replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m]))
    },

    // --- 7. Network & Env ---
    isMobile: () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    isOnline: () => (W.NetworkManager?.getStatus ? W.NetworkManager.getStatus().online : navigator.onLine) !== false,
    getNetworkStatusSafe: () => (W.NetworkManager?.getStatus?.() || { online: navigator.onLine !== false, kind: 'unknown', saveData: false }),

    // --- 8. Storage Helpers ---
    lsGet: (k, d = null) => LS.getItem(k) ?? d,
    lsSet: (k, v) => { try { LS.setItem(k, v); return true; } catch { return false; } },
    lsGetBool01: (k, d = false) => (LS.getItem(k) ?? (d ? '1' : '0')) === '1',
    lsSetBool01: (k, v) => { try { LS.setItem(k, v ? '1' : '0'); } catch {} },

    // --- 9. App Specific ---
    isSpecialAlbumKey: (k) => String(k || '').startsWith('__'),
    isBrowsingOtherAlbum: () => {
      const p = W.AlbumsManager?.getPlayingAlbum?.(), c = W.AlbumsManager?.getCurrentAlbum?.();
      return p && c && p !== c && !(p === '__favorites__' && c === '__favorites__');
    },
    
    // --- 10. PQ Logic (TZ 1.2, 7.4) ---
    pq: {
      getMode: () => (LS.getItem('qualityMode:v1') || 'hi') === 'lo' ? 'lo' : 'hi',
      getState: () => {
        const c = pc(), net = U.isOnline();
        const can = !!c?.canToggleQualityForCurrentTrack?.();
        return { mode: U.pq.getMode(), canToggle: can && net, canToggleByTrack: can, netOk: net };
      },
      toggle: () => {
        const c = pc(); if (!c) return { ok: false, reason: 'noCore' };
        if (!U.isOnline()) return { ok: false, reason: 'offline' };
        if (!c.canToggleQualityForCurrentTrack()) return { ok: false, reason: 'trackNoLo' };
        const n = U.pq.getMode() === 'hi' ? 'lo' : 'hi';
        c.switchQuality(n);
        return { ok: true, next: n };
      }
    },

    // --- 11. Download Helper ---
    download: {
      getSizeHintMB: ({ albumData: a, track: t } = {}) => {
        try {
          const u = String(t?.uid || '').trim();
          const tr = (a?.tracks || []).find(x => String(x?.uid).trim() === u);
          if (!tr) return '';
          const s = (t?.src === tr.fileLo) ? (tr.sizeLo ?? tr.size_low) : (tr.sizeHi ?? tr.size);
          return (Number(s) > 0) ? ` (~${Number(s).toFixed(2)} МБ)` : '';
        } catch { return ''; }
      },
      applyDownloadLink: (el, t) => {
        if (!el) return;
        if (!t?.src) { el.href = '#'; el.removeAttribute('download'); el.title = 'Скачать трек'; return; }
        el.href = t.src; el.download = `${String(t.title||'track')}.mp3`;
        const aKey = W.AlbumsManager?.getPlayingAlbum?.();
        const hint = U.download.getSizeHintMB({ albumData: aKey ? W.AlbumsManager?.getAlbumData(aKey) : null, track: t });
        el.title = `Скачать трек${hint}`;
      }
    },

    // --- 12. Facade Aliases (Backward Compat) ---
    clamp: (n, a, b) => Math.min(Math.max(n, a), b),
    formatTime: (s) => U.fmt.time(s),
    formatBytes: (n) => U.fmt.bytes(n),
    escapeHtml: (s) => U.ui.escapeHtml(s),
    toInt: (v) => U.math.toInt(v),
    trimStr: (v) => String(v || '').trim() || null,
    waitFor: async (fn, t=2000) => { for(let i=0;i<t/50;i++) { if(fn()) return true; await new Promise(r=>setTimeout(r,50)); } return !!fn(); },
    setBtnActive: (id, a) => U.$(id)?.classList.toggle('active', !!a),
    setAriaDisabled: (el, d) => { if (el) { el.classList.toggle('disabled', !!d); el.setAttribute('aria-disabled', !!d); } },
    
    // Favorites
    fav: {
      isTrackLikedInContext: ({ playingAlbum: pa, track: t } = {}) => {
        const u = String(t?.uid || ''), c = pc();
        if (!c || !u) return false;
        if (pa !== '__favorites__' && t?.sourceAlbum) return c.isFavorite(u);
        const ref = (W.favoritesRefsModel || []).find(r => String(r?.__uid) === u);
        return ref?.__a ? c.isFavorite(u) : false;
      }
    }
  };

  W.Utils = U;
})(window, document);

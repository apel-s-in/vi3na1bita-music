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
      time: s => { const n = Number(s); return (!n || n<0) ? '00:00' : new Date(n*1000).toISOString().slice(n>=3600?11:14, 19); },
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
        if (!track?.src && !track?.uid) { 
          btn.removeAttribute('href'); btn.removeAttribute('download'); btn.classList.add('disabled');
          btn._dlUid = null;
          return; 
        }
        const fileName = (track.artist && track.title) 
          ? `${track.artist} - ${track.title}.mp3` 
          : (track.title ? `${track.title}.mp3` : 'track.mp3');
        
        btn.removeAttribute('href');
        btn.download = fileName;
        btn.classList.remove('disabled');
        
        // Идемпотентность: не перевешиваем обработчик если трек не менялся
        const dlKey = `${track.uid || track.src}:${fileName}`;
        if (btn._dlUid === dlKey) return;
        btn._dlUid = dlKey;
        
        btn.onclick = async (e) => {
          e.preventDefault(); e.stopPropagation();
          if (btn._dlBusy) return;
          btn._dlBusy = true;
          
          try {
            let url = track.src;
            if (track.uid) {
              const smart = await W.TrackRegistry?.getSmartUrlInfo?.(track.uid, 'audio', W.playerCore?.qMode || 'hi');
              if (smart?.url) url = smart.url;
            }
            if (!url) return W.NotificationSystem?.warning?.('Ссылка на трек недоступна');
            
            // Пробуем Web Share API (мобильные)
            if (navigator.share && navigator.canShare) {
              try {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const blob = await resp.blob();
                const file = new File([blob], fileName, { type: 'audio/mpeg' });
                if (navigator.canShare({ files: [file] })) {
                  await navigator.share({ title: track.title || 'Трек', files: [file] });
                  return;
                }
              } catch (shareErr) {
                console.warn('[Download] Share failed, falling back:', shareErr);
              }
            }
            
            W.NotificationSystem?.info?.('Скачивание...');
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = D.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            a.style.display = 'none';
            D.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 5000);
            W.NotificationSystem?.success?.('Файл скачивается');
          } catch (err) {
            console.error('[Download] Error:', err);
            W.NotificationSystem?.error?.('Ошибка скачивания');
          } finally {
            btn._dlBusy = false;
          }
        };
      }
    },

    func: {
      debounceFrame: (fn) => { let f; return (...a) => { if (f) cancelAnimationFrame(f); f = requestAnimationFrame(() => { f = null; fn(...a); }); }; },
      throttle: (fn, w) => { let l = 0; return (...a) => { const n = Date.now(); if (n - l >= w) { l = n; fn(...a); } }; }
    },

    isSpecialAlbumKey: (k) => String(k || '').startsWith('__'),
    normalizeAlbumContextKey: (k) => {
      const s = String(k || '').trim();
      if (!s) return '';
      if (s === '__showcase__' || s.startsWith('__showcase__:')) return '__showcase__';
      if (s === '__favorites__' || s.startsWith('__favorites__:')) return '__favorites__';
      return s;
    },
    isShowcaseContext: (k) => U.normalizeAlbumContextKey(k) === '__showcase__',
    isBrowsingOtherAlbum: () => {
      const p = U.normalizeAlbumContextKey(W.AlbumsManager?.getPlayingAlbum?.());
      const c = U.normalizeAlbumContextKey(W.AlbumsManager?.getCurrentAlbum?.());
      return !!(p && c && p !== c);
    },
    setBtnActive: (id, a) => D.getElementById(id)?.classList.toggle('active', !!a),
    setAriaDisabled: (el, d) => { if (el) { el.classList.toggle('disabled', !!d); el.setAttribute('aria-disabled', !!d); } },
    lsGet: (k, d) => localStorage.getItem(k) ?? d,
    lsSet: (k, v) => localStorage.setItem(k, v),
    lsGetBool01: (k, d = false) => (localStorage.getItem(k) ?? (d ? '1' : '0')) === '1',
    lsSetBool01: (k, v) => localStorage.setItem(k, v ? '1' : '0'),
    lsGetJson: (k, d = null) => U.obj.safeJson(k, d),
    ssGetJson: (k, d = null) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    ssSetJson: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
    fetchCache: (() => {
      const mem = new Map(), pend = new Map();
      const now = () => Date.now();
      const read = (key, ttlMs, store = 'session') => {
        const m = mem.get(key);
        if (m && (!ttlMs || now() - m.ts < ttlMs)) return m.val;
        const box = store === 'local' ? localStorage : sessionStorage;
        try {
          const raw = box.getItem(key);
          if (!raw) return null;
          const rec = JSON.parse(raw);
          if (ttlMs && now() - Number(rec.ts || 0) >= ttlMs) return null;
          mem.set(key, { ts: Number(rec.ts || now()), val: rec.val });
          return rec.val;
        } catch { return null; }
      };
      const write = (key, val, store = 'session') => {
        const rec = { ts: now(), val };
        mem.set(key, rec);
        try { (store === 'local' ? localStorage : sessionStorage).setItem(key, JSON.stringify(rec)); } catch {}
        return val;
      };
      const del = (key, store = 'session') => {
        mem.delete(key);
        try { (store === 'local' ? localStorage : sessionStorage).removeItem(key); } catch {}
      };
      const cached = async ({ key, url, ttlMs = 0, type = 'json', store = 'session', fetchInit = {} }) => {
        const hit = read(key, ttlMs, store);
        if (hit != null) return hit;
        if (pend.has(key)) return pend.get(key);
        const p = (async () => {
          try {
            const res = await fetch(url, fetchInit);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const val = type === 'text' ? await res.text() : await res.json();
            return write(key, val, store);
          } finally {
            pend.delete(key);
          }
        })();
        pend.set(key, p);
        return p;
      };
      return {
        getJson: (opts) => cached({ ...opts, type: 'json' }),
        getText: (opts) => cached({ ...opts, type: 'text' }),
        get: read,
        set: write,
        del
      };
    })(),
    profileModals: {
      promptName: ({ title = '', value = '', btnText = 'Сохранить', onSubmit } = {}) => {
        const esc = U.ui.escapeHtml;
        U.dom.createStyleOnce('pm-name-styles', `.pm-name-inp{width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px}.pm-name-save{width:100%}`);
        const m = W.Modals?.open?.({ title, bodyHtml: `<input type="text" id="pm-name-inp" class="pm-name-inp" value="${esc(value)}"><button class="showcase-btn pm-name-save" id="pm-name-save">${esc(btnText)}</button>` });
        if (!m) return null;
        setTimeout(() => m.querySelector('#pm-name-inp')?.select(), 50);
        m.querySelector('#pm-name-save')?.addEventListener('click', () => {
          const v = m.querySelector('#pm-name-inp')?.value.trim();
          if (!v) return;
          m.remove();
          onSubmit?.(v);
        });
        return m;
      },
      palettePicker: ({ title = 'Выбор цвета', items = [], value = '', resetText = 'Сбросить цвет', onPick } = {}) => {
        const esc = U.ui.escapeHtml;
        U.dom.createStyleOnce('pm-palette-styles', `.pm-palette{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;justify-content:center}.pm-palette__dot{width:34px;height:34px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .2s;box-shadow:0 2px 8px rgba(0,0,0,.5)}.pm-palette__dot:hover{transform:scale(1.15)}.pm-palette__reset{margin-top:15px;width:100%}`);
        const m = W.Modals?.open?.({ title, bodyHtml: `<div class="pm-palette">${items.map(x => `<div class="pm-palette__dot" style="background:${x};${value === (x === 'transparent' ? '' : x) ? 'border-color:#fff;' : ''}" data-col="${esc(x)}"></div>`).join('')}</div><button class="showcase-btn pm-palette__reset" data-col="transparent">${esc(resetText)}</button>` });
        if (!m) return null;
        m.onclick = ev => {
          const b = ev.target.closest('[data-col]');
          if (!b) return;
          const raw = b.dataset.col;
          onPick?.(raw === 'transparent' ? '' : raw, m);
        };
        return m;
      },
      failScreen: (msg) => {
        const esc = U.ui.escapeHtml;
        U.dom.createStyleOnce('boot-fail-screen-styles', `.boot-fail{position:fixed;inset:0;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;font-family:sans-serif}.boot-fail__box{max-width:560px}.boot-fail__title{color:#e80100;margin:0 0 12px}.boot-fail__text{margin:0}`);
        return `<div class="boot-fail"><div class="boot-fail__box"><h2 class="boot-fail__title">Ошибка запуска</h2><p class="boot-fail__text">${esc(msg)}</p></div></div>`;
      },
      avatarPicker: ({ title = 'Аватар', items = [], onPick } = {}) => {
        U.dom.createStyleOnce('profile-avatar-picker-styles', `.prof-ava-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.prof-ava-btn{font-size:24px;background:#232b38}`);
        const m = W.Modals?.open?.({ title, bodyHtml: `<div class="prof-ava-grid">${items.map(a => `<button class="showcase-color-dot prof-ava-btn" data-ava="${U.ui.escapeHtml(a)}">${U.ui.escapeHtml(a)}</button>`).join('')}</div>` });
        if (!m) return null;
        m.onclick = ev => {
          const b = ev.target.closest('[data-ava]');
          if (!b) return;
          onPick?.(b.dataset.ava, m);
        };
        return m;
      },
      resetProfileData: ({ onAction } = {}) => {
        U.dom.createStyleOnce('profile-reset-modal-styles', `.prof-reset-btn{width:100%}.prof-reset-btn--mb{margin-bottom:8px}`);
        const m = W.Modals?.confirm?.({
          title: 'Очистка',
          textHtml: `<button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="stats">Только статистику</button><button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="ach">Только достижения</button><button class="om-btn om-btn--danger prof-reset-btn" data-act="all">Сбросить всё</button>`,
          confirmText: 'Закрыть',
          cancelText: 'Отмена'
        });
        if (!m) return null;
        m.onclick = ev => {
          const act = ev.target.closest('.om-btn')?.dataset?.act;
          if (act) onAction?.(act, m);
        };
        return m;
      }
    }
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

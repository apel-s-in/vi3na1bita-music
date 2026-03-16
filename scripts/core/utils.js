(function(W, D) {
  'use strict';
  const _bR = new Map();
  const U = {
    $: id => D.getElementById(id),
    dom: {
      byId: id => D.getElementById(id),
      on: (el, ev, fn, o) => { if (!el) return () => {}; el.addEventListener(ev, fn, o); return () => { try { el.removeEventListener(ev, fn, o); } catch {} }; },
      raf: requestAnimationFrame, defer: fn => setTimeout(fn, 0),
      createStyleOnce: (id, css) => { if (!D.getElementById(id)) { const s = D.createElement('style'); s.id = id; s.textContent = css; D.head.appendChild(s); } }
    },
    getNet: () => { const NP = W.NetPolicy; if (NP) return { online: NP.isNetworkAllowed(), kind: NP.detectNetworkType(), saveData: false }; const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection; return { online: navigator.onLine, kind: /cellular|2g|3g|4g/i.test(c?.type || '') ? 'cellular' : 'wifi', saveData: c?.saveData || false }; },
    getPlatform: () => { const ua = navigator.userAgent; return { isIOS: /iPad|iPhone|iPod/.test(ua) && !W.MSStream, isPWA: matchMedia('(display-mode: standalone)').matches || navigator.standalone, isDesktop: !/Mobi|Android/i.test(ua), isAndroid: /Android/.test(ua) }; },
    fmt: {
      time: s => { const n = Number(s); return !n || n < 0 ? '00:00' : new Date(n * 1000).toISOString().slice(n >= 3600 ? 11 : 14, 19); },
      bytes: b => { const n = Number(b); if (!Number.isFinite(n) || n <= 0) return '0 B'; const i = Math.floor(Math.log(n) / Math.log(1024)); return parseFloat((n / Math.pow(1024, i)).toFixed(1)) + ' ' + (['B','KB','MB','GB'][i] || 'TB'); },
      durationHuman: s => { const h = s / 3600 | 0, m = (s % 3600) / 60 | 0; return h ? `${h}ч ${m}м` : `${m}м`; }
    },
    math: { clamp: (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b), toInt: (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d },
    obj: { safeJson: (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, trim: v => String(v || '').trim() || null, normQuality: q => String(q || '').toLowerCase() === 'lo' ? 'lo' : 'hi' },
    blob: { createUrl: (k, b) => { if (_bR.has(k)) URL.revokeObjectURL(_bR.get(k)); const u = URL.createObjectURL(b); _bR.set(k, u); return u; }, revokeUrl: k => { if (_bR.has(k)) { URL.revokeObjectURL(_bR.get(k)); _bR.delete(k); return true; } return false; } },
    ui: { toast: (m, t, d) => W.NotificationSystem?.show?.(m, t, d), escapeHtml: s => String(s || '').replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m])) },
    pq: { getMode: () => localStorage.getItem('qualityMode:v1') === 'lo' ? 'lo' : 'hi', getState: () => { const nO = W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine, cT = !!W.playerCore?.canToggleQualityForCurrentTrack?.(); return { mode: U.pq.getMode(), canToggle: cT && nO, canToggleByTrack: cT, netOk: nO }; }, toggle: () => { const c = W.playerCore; if (!c) return { ok: false, reason: 'noCore' }; if (!(W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return { ok: false, reason: 'offline' }; if (!c.canToggleQualityForCurrentTrack()) return { ok: false, reason: 'trackNoLo' }; const n = U.pq.getMode() === 'hi' ? 'lo' : 'hi'; c.switchQuality(n); return { ok: true, next: n }; } },
    fav: { isTrackLikedInContext: ({ track: t } = {}) => !!(W.playerCore && t?.uid && W.playerCore.isFavorite(t.uid)) },
    download: { applyDownloadLink: (btn, t) => { if (!btn) return; if (!t?.src && !t?.uid) { btn.removeAttribute('href'); btn.removeAttribute('download'); btn.classList.add('disabled'); btn._dlUid = null; return; } const fN = t.artist && t.title ? `${t.artist} - ${t.title}.mp3` : (t.title ? `${t.title}.mp3` : 'track.mp3'); btn.removeAttribute('href'); btn.download = fN; btn.classList.remove('disabled'); const dK = `${t.uid || t.src}:${fN}`; if (btn._dlUid === dK) return; btn._dlUid = dK; btn.onclick = async e => { e.preventDefault(); e.stopPropagation(); if (btn._dlBusy) return; btn._dlBusy = true; try { let u = t.src; if (t.uid) { const s = await W.TrackRegistry?.getSmartUrlInfo?.(t.uid, 'audio', W.playerCore?.qMode || 'hi'); if (s?.url) u = s.url; } if (!u) return W.NotificationSystem?.warning?.('Ссылка недоступна'); if (navigator.share && navigator.canShare) { try { const r = await fetch(u); if (!r.ok) throw 1; const file = new File([await r.blob()], fN, { type: 'audio/mpeg' }); if (navigator.canShare({ files: [file] })) return await navigator.share({ title: t.title || 'Трек', files: [file] }); } catch {} } W.NotificationSystem?.info?.('Скачивание...'); const r = await fetch(u); if (!r.ok) throw 1; const bU = URL.createObjectURL(await r.blob()), a = D.createElement('a'); a.href = bU; a.download = fN; a.style.display = 'none'; D.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(bU); a.remove(); }, 5000); W.NotificationSystem?.success?.('Файл скачивается'); } catch { W.NotificationSystem?.error?.('Ошибка скачивания'); } finally { btn._dlBusy = false; } }; } },
    func: { debounceFrame: fn => { let f; return (...a) => { if (f) cancelAnimationFrame(f); f = requestAnimationFrame(() => { f = null; fn(...a); }); }; }, throttle: (fn, w) => { let l = 0; return (...a) => { const n = Date.now(); if (n - l >= w) { l = n; fn(...a); } }; } },
    isSpecialAlbumKey: k => String(k || '').startsWith('__'),
    normalizeAlbumContextKey: k => { const s = String(k || '').trim(); return !s ? '' : (s.startsWith('__showcase__') ? '__showcase__' : (s.startsWith('__favorites__') ? '__favorites__' : s)); },
    isShowcaseContext: k => U.normalizeAlbumContextKey(k) === '__showcase__',
    isBrowsingOtherAlbum: () => { const p = U.normalizeAlbumContextKey(W.AlbumsManager?.getPlayingAlbum?.()), c = U.normalizeAlbumContextKey(W.AlbumsManager?.getCurrentAlbum?.()); return !!(p && c && p !== c); },
    setBtnActive: (id, a) => D.getElementById(id)?.classList.toggle('active', !!a),
    setAriaDisabled: (el, d) => { if (el) { el.classList.toggle('disabled', !!d); el.setAttribute('aria-disabled', !!d); } },
    lsGet: (k, d) => localStorage.getItem(k) ?? d, lsSet: (k, v) => localStorage.setItem(k, v),
    lsGetBool01: (k, d = false) => (localStorage.getItem(k) ?? (d ? '1' : '0')) === '1', lsSetBool01: (k, v) => localStorage.setItem(k, v ? '1' : '0'),
    lsGetJson: (k, d = null) => U.obj.safeJson(k, d), ssGetJson: (k, d = null) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, ssSetJson: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
    fetchCache: (() => {
      const m = new Map(), p = new Map(), rd = (k, t, s = 'session') => { const r = m.get(k); if (r && (!t || Date.now() - r.ts < t)) return r.val; try { const rw = (s === 'local' ? localStorage : sessionStorage).getItem(k); if (!rw) return null; const rc = JSON.parse(rw); if (t && Date.now() - (rc.ts || 0) >= t) return null; m.set(k, { ts: rc.ts || Date.now(), val: rc.val }); return rc.val; } catch { return null; } };
      const wr = (k, v, s = 'session') => { const rc = { ts: Date.now(), val: v }; m.set(k, rc); try { (s === 'local' ? localStorage : sessionStorage).setItem(k, JSON.stringify(rc)); } catch {} return v; };
      const dl = (k, s = 'session') => { m.delete(k); try { (s === 'local' ? localStorage : sessionStorage).removeItem(k); } catch {} };
      const ccd = async ({ key: k, url: u, ttlMs: t = 0, type: y = 'json', store: s = 'session', fetchInit: fI = {} }) => { const h = rd(k, t, s); if (h != null) return h; if (p.has(k)) return p.get(k); const pr = (async () => { try { const r = await fetch(u, fI); if (!r.ok) throw 1; return wr(k, y === 'text' ? await r.text() : await r.json(), s); } finally { p.delete(k); } })(); p.set(k, pr); return pr; };
      return { getJson: o => ccd({ ...o, type: 'json' }), getText: o => ccd({ ...o, type: 'text' }), get: rd, set: wr, del: dl };
    })(),
    profileModals: {
      promptName: ({ title: t = '', value: v = '', btnText: bT = 'Сохранить', onSubmit: oS } = {}) => {
        U.dom.createStyleOnce('pm-name-styles', '.pm-name-inp{width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px}.pm-name-save{width:100%}');
        const m = W.Modals?.open?.({ title: t, bodyHtml: `<input type="text" id="pm-name-inp" class="pm-name-inp" value="${U.ui.escapeHtml(v)}"><button class="showcase-btn pm-name-save" id="pm-name-save">${U.ui.escapeHtml(bT)}</button>` });
        if (!m) return null; setTimeout(() => m.querySelector('#pm-name-inp')?.select(), 50); m.querySelector('#pm-name-save')?.addEventListener('click', () => { const vl = m.querySelector('#pm-name-inp')?.value.trim(); if (vl) { m.remove(); oS?.(vl); } }); return m;
      },
      palettePicker: ({ title: t = 'Выбор цвета', items: i = [], value: v = '', resetText: rT = 'Сбросить цвет', onPick: oP } = {}) => {
        U.dom.createStyleOnce('pm-palette-styles', '.pm-palette{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;justify-content:center}.pm-palette__dot{width:34px;height:34px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .2s;box-shadow:0 2px 8px rgba(0,0,0,.5)}.pm-palette__dot:hover{transform:scale(1.15)}.pm-palette__reset{margin-top:15px;width:100%}');
        const m = W.Modals?.open?.({ title: t, bodyHtml: `<div class="pm-palette">${i.map(x => `<div class="pm-palette__dot" style="background:${x};${v === (x === 'transparent' ? '' : x) ? 'border-color:#fff;' : ''}" data-col="${U.ui.escapeHtml(x)}"></div>`).join('')}</div><button class="showcase-btn pm-palette__reset" data-col="transparent">${U.ui.escapeHtml(rT)}</button>` });
        if (!m) return null; m.onclick = ev => { const b = ev.target.closest('[data-col]'); if (b) oP?.(b.dataset.col === 'transparent' ? '' : b.dataset.col, m); }; return m;
      },
      failScreen: m => {
        U.dom.createStyleOnce('boot-fail-screen-styles', '.boot-fail{position:fixed;inset:0;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;font-family:sans-serif}.boot-fail__box{max-width:560px}.boot-fail__title{color:#e80100;margin:0 0 12px}.boot-fail__text{margin:0}.sysinfo-root{font-size:13px;line-height:1.6;color:#eaf2ff}.sysinfo-group-title{color:#8ab8fd;margin:12px 0 6px}.sysinfo-row{margin:0 0 4px}.sysinfo-footer{margin-top:16px;border-top:1px solid #333;text-align:center;color:#666;font-size:10px;padding-top:10px}');
        return `<div class="boot-fail"><div class="boot-fail__box"><h2 class="boot-fail__title">Ошибка запуска</h2><p class="boot-fail__text">${U.ui.escapeHtml(m)}</p></div></div>`;
      },
      sysInfo: {
        row: (l, v) => `<div class="sysinfo-row"><strong>${U.ui.escapeHtml(l)}:</strong> ${v}</div>`, group: (t, c) => `<h3 class="sysinfo-group-title">${U.ui.escapeHtml(t)}</h3>${c}`,
        render: ({ appVersion: aV, buildDate: bD, isPwa: i, userAgent: uA, screenText: sT, online: o, audioText: aT, ramText: rT, swVersion: sV }) => `<div class="sysinfo-root">${U.profileModals.sysInfo.group('Приложение', U.profileModals.sysInfo.row('Версия', `${U.ui.escapeHtml(aV)} (${U.ui.escapeHtml(bD)})`) + U.profileModals.sysInfo.row('PWA', i ? '✅' : '❌') + `<div id="sw-ver-row" class="sysinfo-row"><strong>SW:</strong> ${U.ui.escapeHtml(sV)}</div>`)}${U.profileModals.sysInfo.group('Среда', U.profileModals.sysInfo.row('UA', U.ui.escapeHtml(uA).slice(0,45) + '...') + U.profileModals.sysInfo.row('Экран', sT) + U.profileModals.sysInfo.row('Online', o ? '✅' : '❌'))}${U.profileModals.sysInfo.group('Система', U.profileModals.sysInfo.row('Audio', aT) + U.profileModals.sysInfo.row('RAM', rT))}<div class="sysinfo-footer">Vi3na1bita © 2025</div></div>`
      },
      avatarPicker: ({ title: t = 'Аватар', items: i = [], onPick: oP } = {}) => {
        U.dom.createStyleOnce('profile-avatar-picker-styles', '.prof-ava-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.prof-ava-btn{font-size:24px;background:#232b38}');
        const m = W.Modals?.open?.({ title: t, bodyHtml: `<div class="prof-ava-grid">${i.map(a => `<button class="showcase-color-dot prof-ava-btn" data-ava="${U.ui.escapeHtml(a)}">${U.ui.escapeHtml(a)}</button>`).join('')}</div>` });
        if (!m) return null; m.onclick = ev => { const b = ev.target.closest('[data-ava]'); if (b) oP?.(b.dataset.ava, m); }; return m;
      },
      resetProfileData: ({ onAction: oA } = {}) => {
        U.dom.createStyleOnce('profile-reset-modal-styles', '.prof-reset-btn{width:100%}.prof-reset-btn--mb{margin-bottom:8px}');
        const m = W.Modals?.confirm?.({ title: 'Очистка', textHtml: '<button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="stats">Только статистику</button><button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="ach">Только достижения</button><button class="om-btn om-btn--danger prof-reset-btn" data-act="all">Сбросить всё</button>', confirmText: 'Закрыть', cancelText: 'Отмена' });
        if (!m) return null; m.onclick = ev => { const a = ev.target.closest('.om-btn')?.dataset?.act; if (a) oA?.(a, m); }; return m;
      }
    }
  };
  U.escapeHtml = U.ui.escapeHtml; U.isMobile = () => U.getPlatform().isIOS || U.getPlatform().isAndroid;
  W.AppUtils = { $: U.$, toStr: v => v == null ? '' : String(v), isMobileUA: () => U.isMobile(), escHtml: s => U.escapeHtml(s) };
  U.waitFor = async (fn, t = 2000) => { for (let i = 0; i < t / 50; i++) { if (fn()) return true; await new Promise(r => setTimeout(r, 50)); } return !!fn(); };
  U.onceEvent = (el, ev, { timeoutMs: t } = {}) => new Promise(r => { const h = () => { el.removeEventListener(ev, h); r(); }; el.addEventListener(ev, h, { once: true }); if (t) setTimeout(h, t); });
  W.Utils = U;
})(window, document);

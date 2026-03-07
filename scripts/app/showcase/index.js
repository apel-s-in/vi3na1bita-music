/**
 * scripts/app/showcase/index.js
 * "Витрина Разбита" — V2 Master Implementation.
 * Draft Architecture, Isolated Contexts, Global Search, Playback Safety.
 */

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils, LS_KEY = 'showcase:state:v2';
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const esc = s => U.escapeHtml(String(s || ''));
const $ = id => D.getElementById(id);
const now = () => Date.now();

class ShowcaseManager {
  constructor() {
    this.state = null;
    this.draft = null;
    this.searchQuery = '';
    this.searchSel = new Set();
    this.controlsBound = false;
    this.renderToken = 0;
    this._ic = {};
    this._stat = new Map();
    this._scrollKeyPrefix = 'showcase:scroll:v1:';
  }

  _getContextKey() {
    const ctx = this.getCtx();
    return ctx.isPl ? `playlist:${ctx.id}` : 'all';
  }

  _saveScrollPosition() {
    try {
      const key = this._scrollKeyPrefix + this._getContextKey();
      localStorage.setItem(key, String(document.documentElement.scrollTop || document.body.scrollTop || 0));
    } catch {}
  }

  _restoreScrollPosition() {
    try {
      const key = this._scrollKeyPrefix + this._getContextKey();
      const y = Number(localStorage.getItem(key) || 0);
      requestAnimationFrame(() => window.scrollTo(0, Number.isFinite(y) ? y : 0));
    } catch {}
  }

  _markDraftDirty() {
    if (!this.draft) return;
    this.draft.dirty = true;
    const btn = $('sc-reset');
    if (btn) btn.disabled = false;
  }

  _getDefaultBaselineOrder() {
    const all = [];
    [...(W.albumsIndex || [])].reverse().forEach(a => {
      if (a.key.startsWith('__')) return;
      (W.TrackRegistry?.getAllUids?.() || []).forEach(u => {
        const t = W.TrackRegistry.getTrackByUid(u);
        if (t?.sourceAlbum === a.key && !all.includes(u)) all.push(u);
      });
    });
    return all;
  }

  async initialize() {
    (W.APP_CONFIG?.ICON_ALBUMS_ORDER || []).forEach(i => this._ic[i.key] = i.icon);
    await W.TrackRegistry?.ensurePopulated?.();
    this.loadState();
    
    W.playerCore?.on({
      onTrackChange: t => {
        if (t?.uid && U.isShowcaseContext(W.AlbumsManager?.getPlayingAlbum())) {
          localStorage.setItem('showcase:lastTrackUid', t.uid);
          localStorage.setItem('showcase:lastPlayingContext', W.AlbumsManager.getPlayingAlbum());
          this.hiTrack(t.uid);
        }
      }
    });
    W.playerCore?.onFavoritesChanged(() => { if (!this.draft) this.renderList(); });
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum() === '__showcase__' && (W.OfflineIndicators?.refreshAllIndicators(), this.updStatus()));
  }

  /* --- STORAGE & MIGRATION --- */
  loadState() {
    try { const j = JSON.parse(localStorage.getItem(LS_KEY)); if (j && j.v === 2) { this.state = j; return; } } catch {}
    this.migrateState();
  }

  saveState() { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); }

  migrateState() {
    const get = (k, d) => { try { return JSON.parse(localStorage.getItem('showcase:'+k)) ?? d; } catch { return d; } };
    let ord = get('userOrder', []);
    if (!ord.length) {
      [...(W.albumsIndex || [])].reverse().forEach(a => {
        if (!a.key.startsWith('__')) W.TrackRegistry?.getAllUids()?.forEach(u => {
          if (W.TrackRegistry.getTrackByUid(u)?.sourceAlbum === a.key && !ord.includes(u)) ord.push(u);
        });
      });
    }
    const oldPls = get('playlists', []), pCol = get('playlistColors', {});
    const pls = oldPls.map(p => ({
      id: p.id, name: p.name, col: pCol[p.id] || '', uids: p.uids||[], ord: p.uids||[], hid: p.hiddenUids||[],
      sort: 'user', createdAt: p.createdAt||now(), snap: { uids: p.uids||[], ord: p.uids||[], hid: p.hiddenUids||[] }
    }));
    let sm = get('sortMode', 'user'); if (sm === 'shuffle') sm = 'user';
    this.state = {
      v: 2, ctx: { type: get('activePlaylistId') ? 'playlist' : 'all', id: get('activePlaylistId') },
      ui: { view: get('viewMode', 'flat'), num: localStorage.getItem('showcase:showNumbers:v1') !== '0', hid: localStorage.getItem('showcase:showHidden:v1') === '1', plc: 'keep' },
      def: { ord, hid: get('hiddenUids', []), sort: sm }, pls, col: get('albumColors', {})
    };
    this.saveState();
  }

  /* --- DATA SELECTORS --- */
  getCtx() {
    if (this.state.ctx.type === 'playlist') {
      const p = this.state.pls.find(x => x.id === this.state.ctx.id);
      if (p) return { isPl: true, ...p };
      this.state.ctx = { type: 'all', id: null }; this.saveState();
    }
    return { isPl: false, ...this.state.def, uids: W.TrackRegistry.getAllUids() };
  }

  async getSorted(uids, mode) {
    if (mode === 'user') return uids;
    const tr = uids.map(u => W.TrackRegistry.getTrackByUid(u)).filter(Boolean);
    if (mode.startsWith('plays') || mode === 'last-played') {
      const db = (await import('../../analytics/meta-db.js')).metaDB;
      const stats = await db.getAllStats();
      const map = new Map(stats.filter(s => s.uid !== 'global').map(s => [s.uid, s]));
      tr.forEach(t => this._stat.set(t.uid, { plays: map.get(t.uid)?.globalFullListenCount || 0, lastAt: map.get(t.uid)?.lastPlayedAt || 0 }));
    }
    const S = this._stat;
    const sorters = {
      'name-asc': (a, b) => a.title.localeCompare(b.title), 'name-desc': (a, b) => b.title.localeCompare(a.title),
      'album-desc': (a, b) => b.sourceAlbum.localeCompare(a.sourceAlbum), 'album-asc': (a, b) => a.sourceAlbum.localeCompare(b.sourceAlbum),
      'favorites-first': (a, b) => (W.playerCore?.isFavorite(b.uid)?1:0) - (W.playerCore?.isFavorite(a.uid)?1:0),
      'plays-desc': (a, b) => (S.get(b.uid)?.plays||0) - (S.get(a.uid)?.plays||0), 'plays-asc': (a, b) => (S.get(a.uid)?.plays||0) - (S.get(b.uid)?.plays||0),
      'last-played': (a, b) => (S.get(b.uid)?.lastAt||0) - (S.get(a.uid)?.lastAt||0)
    };
    if (sorters[mode]) tr.sort(sorters[mode]);
    return tr.map(t => t.uid);
  }

  getCover(t) {
    let cv = this._ic[t.sourceAlbum] || 'img/logo.png';
    if (U.isMobile() && /\/icon_album\/[^/]+\.png$/i.test(cv)) {
      const m = cv.match(/\/icon_album\/([^/]+)\.png$/i);
      if (m) cv = `img/icon_album/mobile/${m[1]}@1x.jpg`;
    }
    return cv;
  }

  async getDisplayList() {
    if (this.draft) return this.draft.ord.map(u => ({ uid: u, status: 'edit', track: W.TrackRegistry.getTrackByUid(u) })).filter(x => x.track);
    const ctx = this.getCtx();
    
    if (this.searchQuery) {
      await ensureLyricsIndexLoaded();
      const matched = searchUidsByQuery({ query: this.searchQuery });
      const hidSet = new Set(ctx.hid), memSet = new Set(ctx.isPl ? ctx.uids : W.TrackRegistry.getAllUids());
      return matched.map(u => {
        let st = 'missing';
        if (memSet.has(u)) st = hidSet.has(u) ? 'hidden' : 'active';
        else if (!ctx.isPl && hidSet.has(u)) st = 'hidden-def';
        return { uid: u, status: st, track: W.TrackRegistry.getTrackByUid(u) };
      }).filter(x => x.track);
    }

    let uids = await this.getSorted([...ctx.ord], ctx.sort);
    const hidSet = new Set(ctx.hid);
    let res = [];
    for (const u of uids) {
      const isH = hidSet.has(u);
      if (isH && !this.state.ui.hid) continue;
      res.push({ uid: u, status: isH ? 'hidden' : 'active', track: W.TrackRegistry.getTrackByUid(u) });
    }
    if (this.state.ui.plc === 'end') res = [...res.filter(x => x.status === 'active'), ...res.filter(x => x.status === 'hidden')];
    return res.filter(x => x.track);
  }

  /* --- RENDER --- */
  async renderTab() {
    this._saveScrollPosition();
    const list = $('track-list'); if (!list) return;
    const ctx = this.getCtx(), isD = !!this.draft;
    const showRes = !isD && !ctx.isPl && JSON.stringify(ctx.ord) !== JSON.stringify(this.getFactoryBaseline());

    list.innerHTML = `
      <div class="showcase-header-controls">
        ${isD ? `<div class="showcase-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<div style="display:flex;gap:8px;margin-top:10px;"><button class="showcase-btn" id="sc-save" style="background:#fff; color:#000;">💾 Сохранить</button><button class="showcase-btn" id="sc-create">✨ Создать</button><button class="showcase-btn" id="sc-reset" style="border-color:#ff9800;color:#ff9800" ${!this.draft.dirty?'disabled':''}>↺ Сброс</button><button class="showcase-btn showcase-btn--danger" id="sc-exit">✕ Выйти</button></div></div>` : ''}
        <div class="showcase-search-wrap"><input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему каталогу..." value="${esc(this.searchQuery)}"><button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this.searchQuery?'':'none'}">✕</button></div>
        ${!isD ? `<div class="showcase-btns-row"><button class="showcase-btn" id="sc-edit">✏️ Редактировать</button>${showRes ? `<button class="showcase-btn" id="sc-master-reset" style="flex:0.5">↺ Сброс</button>` : ''}<button class="showcase-btn" id="sc-sort">↕️ Сортировка ${ctx.sort !== 'user' ? '●' : ''}</button></div><div class="showcase-btns-row"><button class="showcase-btn" id="sc-playall">▶ Играть всё</button><button class="showcase-btn" id="sc-shuffle">🔀 Перемешать</button></div>` : ''}
        <div class="showcase-playlists-actions" id="sc-playlists-actions"></div><div class="showcase-playlists-list" id="sc-playlists"></div><div class="showcase-status-bar" id="sc-status"></div>
      </div><div id="sc-tracks-container"></div>`;

    this.bindCtrl(list);
    this.renderPls();
    await this.renderList();
    this._restoreScrollPosition();

    if (!isD) {
      const lu = localStorage.getItem('showcase:lastTrackUid');
      if (lu && localStorage.getItem('showcase:lastPlayingContext') === (ctx.isPl ? `__showcase__:${ctx.id}` : '__showcase__')) {
        this.hiTrack(lu);
      }
    }
  }

  bindCtrl(root) {
    if (!root || this.controlsBound) return;
    this.controlsBound = true;

    const applyQ = U.func.debounceFrame(async () => { this.searchQuery = ($('sc-search')?.value || '').trim(); this.searchSel.clear(); await this.renderList(); const c=$('sc-search-clear'); if(c) c.style.display = this.searchQuery ? '' : 'none'; });
    root.addEventListener('input', e => e.target.id === 'sc-search' && applyQ());
    root.addEventListener('keydown', e => e.target.id === 'sc-search' && e.key === 'Enter' && e.target.blur());

    const acts = {
      'sc-search-clear': () => { const i=$('sc-search'); if(i){i.value=''; i.blur();} this.searchQuery=''; this.searchSel.clear(); this.renderList(); },
      'sc-edit': () => this.enterEdit(), 'sc-save': () => this.saveEdit(), 'sc-create': () => this.createFromEdit(), 'sc-reset': () => this.resetEdit(), 'sc-exit': () => this.exitEdit(),
      'sc-master-reset': () => W.Modals.confirm({ title: 'Сбросить порядок?', textHtml: 'Мастер-список вернется к начальному виду.', confirmText: 'Сбросить', onConfirm: () => { this.state.def.ord = this.getFactoryBaseline(); this.state.def.hid = []; this.state.def.sort = 'user'; this.saveState(); this.renderTab(); } }),
      'sc-playall': () => this.playCtx(), 'sc-shuffle': () => { const u = this.getPlaybackTracks().map(t=>t.uid); if(u.length){ W.AlbumsManager.setPlayingAlbum(this.getCtx().isPl ? `__showcase__:${this.state.ctx.id}` : '__showcase__'); W.playerCore.setPlaylist(u.map(id=>({ ...W.TrackRegistry.getTrackByUid(id), album:'Витрина Разбита', cover:this.getCover(W.TrackRegistry.getTrackByUid(id)) })), 0, null, { preservePosition: false }); W.playerCore.shufflePlaylist(); W.playerCore.play(0); W.PlayerUI.ensurePlayerBlock(0, { userInitiated: true }); this.hiTrack(W.playerCore.getCurrentTrackUid()); } },
      'sc-sort': () => this.openSort(),
      'sc-tg-e': () => { this.state.ui.hid = !this.state.ui.hid; this.saveState(); this.renderList(); },
      'sc-tg-n': () => { this.state.ui.num = !this.state.ui.num; this.saveState(); this.renderList(); },
      'sc-tg-v': () => { this.state.ui.view = this.state.ui.view === 'flat' ? 'grouped' : 'flat'; this.saveState(); this.renderList(); },
      'sc-b-add': () => {
        const c = this.getCtx();

        if (c.isPl) {
          const p = this.state.pls.find(x => x.id === c.id);
          if (p) {
            [...this.searchSel].forEach(u => {
              if (!W.TrackRegistry?.getTrackByUid?.(u)) return;
              if (!p.uids.includes(u)) {
                p.uids.push(u);
                p.ord.push(u);
              }
              p.hid = p.hid.filter(x => x !== u);
            });
          }
        } else {
          const d = this.state.def;
          [...this.searchSel].forEach(u => {
            if (!W.TrackRegistry?.getTrackByUid?.(u)) return;
            if (!d.ord.includes(u)) d.ord.push(u);
            d.hid = d.hid.filter(x => x !== u);
          });
        }

        this.searchSel.clear();
        this.searchQuery = '';
        this.saveState();
        this.renderTab();
        W.NotificationSystem.success('Добавлено в текущий контекст');
      },
      'sc-b-new': () => this.createFromEdit(true), 'sc-b-clr': () => { this.searchSel.clear(); this.renderList(); }
    };

    let lpTm = null, isLp = false;
    root.addEventListener('touchstart', e => {
      const h = e.target.closest('.showcase-drag-handle'); if (h && this.draft && !this.searchQuery) return e.preventDefault(), this.strtDrg(e, h.closest('.showcase-track'));
      const t = e.target.closest('.showcase-track');
      if (t && (this.draft || this.searchQuery) && !e.target.closest('button')) { isLp = false; lpTm = setTimeout(() => { isLp = true; this.togSel(t.dataset.uid); navigator.vibrate?.(50); }, 500); }
    }, { passive: false });
    root.addEventListener('touchmove', () => clearTimeout(lpTm), { passive: true });
    root.addEventListener('touchend', () => clearTimeout(lpTm));

    root.addEventListener('click', e => {
      const a = e.target.closest('button'); if (a && acts[a.id]) return acts[a.id]();
      if (isLp) return;
      const t = e.target.closest('.showcase-track'), u = t?.dataset.uid; if (!t) return;

      if (this.draft) {
        if (e.target.closest('.showcase-hide-btn')) return this.togHid(u);
        if (e.target.closest('.sc-arrow-up')) return this.swp(u, -1);
        if (e.target.closest('.sc-arrow-down')) return this.swp(u, 1);
        if (e.target.closest('.showcase-checkbox')) return this.togSel(u);
        return;
      }
      if (this.searchQuery) {
        if (e.target.closest('.showcase-checkbox')) return this.togSel(u);
        return this.opnMenu(u);
      }
      if (e.target.closest('.showcase-track-menu-btn')) return this.opnMenu(u);
      if (e.target.closest('.offline-ind')) return;
      if (e.target.closest('.like-star')) return this.opnMenu(u);
      
      const ctx = this.getCtx();
      if (ctx.hid.includes(u)) return;
      this.playCtx(u);
    });

    root.addEventListener('dragstart', e => { if (!this.draft || this.searchQuery) return; const t = e.target.closest('.showcase-track'); if (t) { e.dataTransfer.setData('text/plain', t.dataset.uid); t.classList.add('is-dragging'); }});
    root.addEventListener('dragover', e => { if (!this.draft || this.searchQuery) return; e.preventDefault(); const t = e.target.closest('.showcase-track'); if (t) t.classList.add('drag-over');});
    root.addEventListener('dragleave', e => e.target.closest('.showcase-track')?.classList.remove('drag-over'));
    root.addEventListener('drop', e => {
      if (!this.draft || this.searchQuery) return; e.preventDefault();
      const t = e.target.closest('.showcase-track'), s = e.dataTransfer.getData('text/plain');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (t && s && s !== t.dataset.uid) { t.before(D.querySelector(`.showcase-track[data-uid="${s}"]`)); this.svOrd(); }
    });
    root.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging')));
  }

  /* --- DRAFT ACTIONS --- */
  getFactoryBaseline() {
    return this._getDefaultBaselineOrder();
  }

  enterEdit() {
    const c = this.getCtx();
    const baseAll = this.getFactoryBaseline();

    if (c.isPl) {
      this.draft = {
        isPl: true,
        id: c.id,
        ord: [...c.ord].filter(u => W.TrackRegistry?.getTrackByUid?.(u)),
        chk: new Set((c.uids || []).filter(u => W.TrackRegistry?.getTrackByUid?.(u))),
        hid: new Set((c.hid || []).filter(u => W.TrackRegistry?.getTrackByUid?.(u))),
        dirty: false
      };
    } else {
      const saved = [...(c.ord || [])].filter(u => W.TrackRegistry?.getTrackByUid?.(u));
      const missing = baseAll.filter(u => !saved.includes(u));
      const ord = [...saved, ...missing];

      this.draft = {
        isPl: false,
        id: null,
        ord,
        chk: new Set(ord.filter(u => !(c.hid || []).includes(u))),
        hid: new Set((c.hid || []).filter(u => W.TrackRegistry?.getTrackByUid?.(u))),
        dirty: false
      };
    }

    this.renderTab();
  }

  saveEdit() {
    const d = this.draft;
    if (!d) return;

    if (d.isPl) {
      const p = this.state.pls.find(x => x.id === d.id);
      if (p) {
        const kept = d.ord.filter(u => d.chk.has(u) && W.TrackRegistry?.getTrackByUid?.(u));
        p.uids = [...kept];
        p.ord = [...kept];
        p.hid = kept.filter(u => d.hid.has(u));
      }
    } else {
      const ord = d.ord.filter(u => W.TrackRegistry?.getTrackByUid?.(u));
      this.state.def.ord = [...ord];
      this.state.def.hid = ord.filter(u => !d.chk.has(u));
    }

    this.saveState();
    this.draft = null;
    W.NotificationSystem.success('Сохранено');
    this.renderTab();
  }

  createFromEdit(fromSearch = false) {
    const m = W.Modals.open({ title: 'Название плейлиста', bodyHtml: `<input id="pl-name" value="Мой плейлист ${this.state.pls.length+1}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);color:#fff;border:1px solid #666;margin-bottom:15px"/><button id="pl-ok" class="om-btn om-btn--primary" style="width:100%">Создать</button>` });
    setTimeout(() => m.querySelector('#pl-name')?.focus(), 100);
    m.onclick = e => {
      if(e.target.id === 'pl-ok') {
        const n = m.querySelector('#pl-name').value.trim(); if(!n) return;
        let uids = [];
        if (fromSearch) uids = [...this.searchSel];
        else { const d = this.draft; uids = d.ord.filter(u => d.chk.has(u) && (d.isPl ? !d.hid.has(u) : true)); }
        const id = Date.now().toString(36);
        this.state.pls.push({ id, name: n, col: '', uids, ord: [...uids], hid: [], sort: 'user', createdAt: now(), snap: { uids: [...uids], ord: [...uids], hid: [] } });
        this.state.ctx = { type: 'playlist', id }; this.draft = null; this.searchSel.clear(); this.searchQuery = '';
        this.saveState(); m.remove(); this.renderTab(); W.NotificationSystem.success('Плейлист создан');
      }
    };
  }

  resetEdit() {
    W.Modals.confirm({
      title: 'Сбросить?',
      textHtml: 'Вернуть к начальному виду?',
      confirmText: 'Да',
      onConfirm: () => {
        if (!this.draft) return;

        if (this.draft.isPl) {
          const p = this.state.pls.find(x => x.id === this.draft.id);
          if (p?.snap) {
            this.draft.ord = [...p.snap.ord].filter(u => W.TrackRegistry?.getTrackByUid?.(u));
            this.draft.chk = new Set((p.snap.uids || []).filter(u => W.TrackRegistry?.getTrackByUid?.(u)));
            this.draft.hid = new Set((p.snap.hid || []).filter(u => W.TrackRegistry?.getTrackByUid?.(u)));
          }
        } else {
          const b = this.getFactoryBaseline();
          this.draft.ord = [...b];
          this.draft.chk = new Set(b);
          this.draft.hid = new Set();
        }

        this._markDraftDirty();
        this.renderList();
      }
    });
  }

  exitEdit() {
    if (!this.draft.dirty) { this.draft = null; this.renderTab(); }
    else W.Modals.confirm({ title: 'Выйти?', textHtml: 'Вы внесли изменения. Они не сохранятся.', confirmText: 'Да, выйти', onConfirm: () => { this.draft = null; this.renderTab(); } });
  }

  /* --- ACTIONS --- */
  async playCtx(uid = null) {
    const ctx = this.getCtx();
    let uids = await this.getSorted([...ctx.ord], ctx.sort);
    const hidSet = new Set(ctx.hid);
    uids = uids.filter(u => !hidSet.has(u));

    if (!uids.length) return W.NotificationSystem.warning('Нет активных треков для воспроизведения');
    let idx = uid ? Math.max(0, uids.indexOf(uid)) : 0;
    
    // Explicit play from search: не меняем состав текущего контекста, играем временный single-track context
    if (this.searchQuery && uid && !uids.includes(uid)) {
      const t = W.TrackRegistry.getTrackByUid(uid);
      if (!t) return;
      W.AlbumsManager.setPlayingAlbum('__showcase__:search');
      W.playerCore.setPlaylist([{ ...t, album: 'Поиск', cover: this.getCover(t) }], 0, null, { preservePosition: false });
      W.playerCore.play(0);
      W.PlayerUI.ensurePlayerBlock(0, { userInitiated: true });
      return;
    }

    const trks = uids.map(u => { const t = W.TrackRegistry.getTrackByUid(u); return { ...t, album: 'Витрина Разбита', cover: this.getCover(t) }; });
    W.AlbumsManager.setPlayingAlbum(ctx.isPl ? `__showcase__:${ctx.id}` : '__showcase__');
    W.playerCore.setPlaylist(trks, idx, null, { preservePosition: false });
    W.playerCore.play(idx); W.PlayerUI.ensurePlayerBlock(idx, { userInitiated: true });
    this.hiTrack(trks[idx].uid);
  }

  getPlaybackTracks() {
     const ctx = this.getCtx();
     const hidSet = new Set(ctx.hid);
     return ctx.ord.filter(u => !hidSet.has(u)).map(u => ({ ...W.TrackRegistry.getTrackByUid(u), album: 'Витрина Разбита', cover: this.getCover(W.TrackRegistry.getTrackByUid(u)) }));
  }

  renderPls() {
    const act = $('sc-playlists-actions'), lst = $('sc-playlists'), ctx = this.state.ctx, pls = this.state.pls, col = this.state.col;
    if (!act || !lst) return;
    act.innerHTML = `<button class="sc-pl-action ${ctx.type==='all' ? 'active' : ''}" id="sc-pl-all">Все треки</button><button class="sc-pl-action" id="sc-pl-nw">+ Новый</button>`;
    act.onclick = e => { if (e.target.id === 'sc-pl-all') { this.state.ctx = { type: 'all', id: null }; this.saveState(); this.renderTab(); } else if (e.target.id === 'sc-pl-nw') this.createFromEdit(false); };
    if (!pls.length) return lst.innerHTML = `<div class="sc-pl-empty">Плейлистов пока нет</div>`;
    lst.innerHTML = pls.map(p => `<div class="sc-pl-row ${ctx.type==='playlist'&&ctx.id===p.id ? 'active' : ''}" data-pid="${p.id}" ${p.col ? `style="--pl-color:${p.col};"` : ''}><div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span></div><div class="sc-pl-right"><button class="sc-pl-btn" data-act="ren" data-pid="${p.id}">✏️</button><button class="sc-pl-btn" data-act="col" data-pid="${p.id}">🎨</button><button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}">✖</button></div></div>`).join('');
    lst.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act, pid = e.target.closest('[data-pid]')?.dataset.pid;
      if (a && pid) {
        if (a === 'del') W.Modals.confirm({ title: 'Удалить?', confirmText: 'Да', onConfirm: () => { this.state.pls = this.state.pls.filter(p => p.id !== pid); if (this.state.ctx.id === pid) this.state.ctx = { type: 'all', id: null }; this.saveState(); this.renderTab(); }});
        else if (a === 'col') this.opnCol(null, null, pid);
        else if (a === 'ren') {
            const p = this.state.pls.find(x=>x.id===pid);
            W.Modals.open({ title: 'Переименовать', bodyHtml: `<input id="pl-ren" value="${esc(p.name)}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);color:#fff;border:1px solid #666;margin-bottom:15px"/><button id="pl-rok" class="om-btn om-btn--primary" style="width:100%">Сохранить</button>` }).onclick = ev => {
                if(ev.target.id==='pl-rok') { const n = D.getElementById('pl-ren').value.trim(); if(n) { p.name=n; this.saveState(); this.renderPls(); ev.target.closest('.modal-bg').remove(); } }
            };
        }
      } else if (e.target.closest('.sc-pl-row')?.dataset.pid) { this.state.ctx = { type: 'playlist', id: e.target.closest('.sc-pl-row').dataset.pid }; this.saveState(); this.renderTab(); }
    };
  }

  async renderList() {
    const token = ++this.renderToken;
    const c = $('sc-tracks-container'); if (!c) return;
    const trks = await this.getDisplayList();
    if (token !== this.renderToken) return;

    this.updStatus(trks.length);
    let h = '', grp = null, sN = this.state.ui.num, isD = !!this.draft;
    trks.forEach(({ uid, status, track: t }, i) => {
      if (this.state.ui.view === 'grouped' && !isD && !this.searchQuery && grp !== t.sourceAlbum) {
        grp = t.sourceAlbum; h += `<div class="showcase-group-header">── ${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum) || 'Альбом')} ──</div>`;
      }
      const cl = this.state.col[t.sourceAlbum] || 'transparent';
      const isS = this.searchSel.has(uid) || (isD && this.draft.chk.has(uid));
      const eyeOff = isD ? this.draft.hid.has(uid) : status.includes('hidden');
      
      let badges = '';
      if (this.searchQuery) {
          if (status === 'active') badges = `<span class="showcase-row-badge sc-badge-active">Уже в списке</span>`;
          if (status === 'hidden') badges = `<span class="showcase-row-badge sc-badge-hidden">Скрыт</span>`;
          if (status === 'missing' && this.state.ctx.type === 'playlist') badges = `<span class="showcase-row-badge sc-badge-missing">Нет в плейлисте</span>`;
      }

      h += `<div class="showcase-track ${eyeOff ? 'inactive' : ''} ${isS ? 'selected' : ''}" data-uid="${uid}" style="border-left: 3px solid ${cl}" ${isD ? 'draggable="true"' : ''}>${isD ? `<button class="sc-arrow-up" data-dir="-1">▲</button>` : `<div class="tnum"${sN ? '' : ' style="display:none"'}>${i + 1}.</div>`}${isD || this.searchQuery ? `<div class="showcase-drag-handle">${isD ? '⠿' : ''}</div><div class="showcase-checkbox"></div>` : ''}<img src="${this.getCover(t)}" class="showcase-track-thumb" loading="lazy"><div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${badges} ${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div></div>${!isD ? `<span class="offline-ind" data-uid="${uid}" title="Оффлайн статус">🔒</span><img src="${W.playerCore?.isFavorite(uid) ? 'img/star.png' : 'img/star2.png'}" class="like-star" data-readonly="1" alt="favorite-state" title="Статус избранного"><button class="showcase-track-menu-btn">···</button>` : ''}${isD ? `<button class="showcase-hide-btn">${eyeOff ? '👁‍🗨' : '👁'}</button>` : `<button class="sc-arrow-down" data-dir="1">▼</button>`}</div>`;
    });
    c.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
    if (!isD) W.OfflineIndicators?.injectOfflineIndicators?.(c); 
    this.hiTrack(W.playerCore?.getCurrentTrackUid()); this.rndrMPnl();
  }

  updStatus(cnt) {
    const s = $('sc-status');
    if (!s) return;

    const ctx = this.getCtx();
    const hiddenSet = new Set(ctx.hid || []);
    const total = ctx.isPl ? (ctx.uids || []).length : (ctx.ord || []).length;
    const hidden = [...hiddenSet].filter(u => (ctx.isPl ? (ctx.uids || []).includes(u) : (ctx.ord || []).includes(u)).length).length;
    const active = Math.max(0, total - hidden);
    const found = this.searchQuery ? Number(cnt || 0) : 0;
    const numOn = this.state.ui.num;

    s.innerHTML = `<span>📋 ${total} · ✅ ${active} · 🙈 ${hidden}${this.searchQuery ? ` · 🔎 ${found}` : ''}</span><span style="display:flex;gap:12px;align-items:center"><span id="sc-tg-e" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${this.state.ui.hid ? '👁' : '🙈'}</span><span id="sc-tg-n" style="cursor:pointer;font-size:16px;font-weight:bold;opacity:${numOn ? '1' : '.72'}" aria-pressed="${numOn ? 'true' : 'false'}" title="Нумерация">1,2,3</span><span id="sc-tg-v" style="cursor:pointer;font-size:18px" title="Сменить вид">${this.state.ui.view === 'flat' ? '⊞' : '⊟'}</span></span>`;
  }

  swp(u, d) { const el = D.querySelector(`.showcase-track[data-uid="${u}"]`), sb = d === -1 ? el?.previousElementSibling : el?.nextElementSibling; if (el && sb?.classList.contains('showcase-track')) { d === -1 ? sb.before(el) : sb.after(el); this.svOrd(); } }
  svOrd() {
    if (!this.draft) return;
    this.draft.ord = Array.from(D.querySelectorAll('.showcase-track')).map(e => e.dataset.uid).filter(Boolean);
    this._markDraftDirty();
  }
  strtDrg(e, n) {
    if(!n)return; const t=e.touches[0], c=n.cloneNode(true), r=n.getBoundingClientRect(), os=t.clientY-r.top;
    c.style.cssText=`position:fixed;left:${r.left}px;width:${r.width}px;z-index:10000;opacity:0.9;background:#252d39;box-shadow:0 10px 30px rgba(0,0,0,0.8);pointer-events:none`; D.body.appendChild(c); n.style.opacity=0.3;
    const m = e2 => { e2.preventDefault(); const y=e2.touches[0].clientY; c.style.top=(y-os)+'px'; D.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); const o = D.elementFromPoint(W.innerWidth/2, y)?.closest('.showcase-track'); if(o && o!==n) o.classList.add('drag-over'); };
    const d = e2 => { D.removeEventListener('touchmove',m); D.removeEventListener('touchend',d); c.remove(); n.style.opacity='';
    const y=e2.changedTouches[0].clientY, tg=D.elementFromPoint(W.innerWidth/2,y)?.closest('.showcase-track'); D.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); if(tg && tg!==n) { tg.before(n); this.svOrd(); } };
    D.addEventListener('touchmove',m,{passive:false}); D.addEventListener('touchend',d);
  }

  togHid(u) {
    if (!this.draft) return;
    const el = D.querySelector(`.showcase-track[data-uid="${u}"]`); if (el) { el.classList.toggle('inactive'); const b = el.querySelector('.showcase-hide-btn'); if(b) b.textContent = el.classList.contains('inactive') ? '👁‍🗨' : '👁'; }
    this.draft.hid.has(u) ? this.draft.hid.delete(u) : this.draft.hid.add(u);
    if (!this.draft.isPl) {
      this.draft.hid.has(u) ? this.draft.chk.delete(u) : this.draft.chk.add(u);
    }
    this._markDraftDirty();
    if(!this.draft.isPl) { this.rndrMPnl(); this.updStatus(); }
  }

  togSel(u) {
    const s = this.draft ? this.draft.chk : this.searchSel;
    const el = D.querySelector(`.showcase-track[data-uid="${u}"]`);
    if (s.has(u)) { s.delete(u); el?.classList.remove('selected'); } else { s.add(u); el?.classList.add('selected'); }
    if (this.draft) {
      this._markDraftDirty();
      if (!this.draft.isPl) {
        s.has(u) ? this.draft.hid.delete(u) : this.draft.hid.add(u);
        const b = el?.querySelector('.showcase-hide-btn');
        if (b) b.textContent = s.has(u) ? '👁' : '👁‍🗨';
        el?.classList.toggle('inactive', !s.has(u));
      }
    }
    this.rndrMPnl(); this.updStatus();
  }

  rndrMPnl() {
    let p = $('sc-multi-panel'); 
    const hasSel = this.searchQuery ? this.searchSel.size > 0 : false;
    if (!hasSel) return p?.remove();
    
    if (!p) { p = D.createElement('div'); p.id = 'sc-multi-panel'; p.className = 'showcase-sticky-bar animate-in'; D.body.appendChild(p); }
    p.innerHTML = `<span>Выбрано: ${this.searchSel.size}</span><button id="sc-b-add" class="om-btn om-btn--outline" style="padding:6px 12px">➕ В текущий</button><button id="sc-b-new" class="om-btn om-btn--outline" style="padding:6px 12px">✨ Создать</button><button id="sc-b-clr" class="om-btn om-btn--danger" style="padding:6px 12px">✖</button>`;
  }

  openSort() {
    const sm = this.state.def.sort, m = W.Modals.open({ title: 'Сортировка (Вид)', bodyHtml: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button class="showcase-btn ${sm==='user'?'active':''}" style="grid-column:1/-1" data-val="user">● Пользовательский (Ручной)</button><button class="showcase-btn ${sm==='album-desc'?'active':''}" data-val="album-desc">Альбомы (Новые)</button><button class="showcase-btn ${sm==='album-asc'?'active':''}" data-val="album-asc">Альбомы (Старые)</button><button class="showcase-btn ${sm==='name-asc'?'active':''}" data-val="name-asc">А → Я</button><button class="showcase-btn ${sm==='name-desc'?'active':''}" data-val="name-desc">Я → А</button><button class="showcase-btn ${sm==='plays-desc'?'active':''}" data-val="plays-desc">Топ прослушиваний</button><button class="showcase-btn ${sm==='plays-asc'?'active':''}" data-val="plays-asc">Меньше всего</button><button class="showcase-btn ${sm==='last-played'?'active':''}" data-val="last-played">Недавние</button><button class="showcase-btn ${sm==='favorites-first'?'active':''}" data-val="favorites-first">Сначала ⭐</button><button class="showcase-btn showcase-btn--danger" style="grid-column:1/-1" data-val="user">Сбросить сортировку</button></div>` });
    m.onclick = e => { const b = e.target.closest('[data-val]'); if(b) { const v = b.dataset.val; if (this.state.ctx.type === 'playlist') { const p = this.state.pls.find(x=>x.id===this.state.ctx.id); if(p) p.sort = v; } else { this.state.def.sort = v; } this.saveState(); this.renderTab(); m.remove(); } };
  }

  opnMenu(u) {
    if(this._menu) this._menu.remove(); const t = W.TrackRegistry.getTrackByUid(u); if(!t) return;
    const bg = D.createElement('div'); bg.className = 'sc-bottom-sheet-bg';
    const c = this.getCtx();
    const inPl = c.isPl && c.uids.includes(u);
    bg.innerHTML = `<div class="sc-bottom-sheet"><div class="sc-sheet-title">${esc(t.title)}</div><div class="sc-sheet-sub">${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div><button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><button class="sc-sheet-btn" id="bm-pl">➕ Добавить в другой плейлист</button>${inPl ? `<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из текущего плейлиста</button>` : ''}<button class="sc-sheet-btn" id="bm-hd">👁 Скрыть / Показать (в этом списке)</button><button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite(u) ? '❌ Убрать из Избранного' : '⭐ В Избранное'}</button><button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Убрать из офлайн</button><button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3 файл</button><button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button><button class="sc-sheet-btn" id="bm-sh">📸 Поделиться треком (Карточка)</button><button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button><button class="sc-sheet-btn" style="color:#888;justify-content:center;margin-top:10px" id="bm-cx">Отмена</button></div>`;
    D.body.appendChild(bg); this._menu = bg; requestAnimationFrame(() => bg.classList.add('active'));
    const cls = () => { bg.classList.remove('active'); setTimeout(()=>bg.remove(), 200); this._menu=null; };
    bg.onclick = e => {
      const id = e.target.id; if(e.target===bg || id==='bm-cx') return cls(); if(!id) return; cls();
      if(id==='bm-play') this.playCtx(u); else if(id==='bm-pl') setTimeout(()=>this.opnAddPl([u]),250); else if(id==='bm-rm') { const p=this.state.pls.find(x=>x.id===c.id); if(p) { p.uids=p.uids.filter(x=>x!==u); p.ord=p.uids; this.saveState(); this.renderList(); } } else if(id==='bm-hd') { if (c.isPl) { const p = this.state.pls.find(x=>x.id===c.id); if (p.hid.includes(u)) p.hid = p.hid.filter(x=>x!==u); else p.hid.push(u); } else { if (this.state.def.hid.includes(u)) this.state.def.hid = this.state.def.hid.filter(x=>x!==u); else this.state.def.hid.push(u); } this.saveState(); this.renderList(); this.updStatus(); } else if(id==='bm-fv') W.playerCore?.toggleFavorite(u,{albumKey:t.sourceAlbum}); else if(id==='bm-of') W.OfflineManager?.togglePinned?.(u); else if(id==='bm-dl') { const a=D.createElement('a'); U.download.applyDownloadLink(a,t); if(a.href) a.click(); } else if(id==='bm-st') setTimeout(()=>W.StatisticsModal?.openStatisticsModal?.(u),250); else if(id==='bm-sh') setTimeout(()=>import('../../analytics/share-generator.js').then(m=>m.ShareGenerator.generateAndShare('track',t)),250); else if(id==='bm-cl') setTimeout(()=>this.opnCol(u),250);
    };
  }

  opnAddPl(uids) {
    const pls = this.state.pls; if(!pls.length) return W.NotificationSystem.warning('Сначала создайте новый плейлист');
    const m = W.Modals.open({ title: 'Выберите плейлист', bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px;">${pls.map(p=>`<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>` });
    m.onclick = e => { const b=e.target.closest('[data-pid]'); if(b) { const t=pls.find(x=>x.id===b.dataset.pid); uids.forEach(u=>{if(!t.uids.includes(u)){ t.uids.push(u); t.ord.push(u); }}); this.saveState(); W.NotificationSystem.success(`Добавлено треков: ${uids.length}`); m.remove(); } };
  }

  opnCol(u, aKey = null, pId = null) {
    if (u && !aKey) aKey = W.TrackRegistry.getTrackByUid(u)?.sourceAlbum;
    const cur = pId ? (this.state.pls.find(p=>p.id===pId)?.col || '') : this.state.col[aKey], m = W.Modals.open({ title: pId ? 'Цвет плейлиста' : 'Цвет альбома', bodyHtml: `<div class="showcase-color-picker">${PALETTE.map(c=>`<div class="showcase-color-dot" style="background:${c};${cur===c?'border-color:#fff':''}" data-col="${c}"></div>`).join('')}</div><button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>` });
    m.onclick = e => { const el = e.target.closest('[data-col]'); if(el) { const c = el.dataset.col==='transparent'?'':el.dataset.col; if(pId) { const p = this.state.pls.find(x=>x.id===pId); if(p) p.col=c; this.saveState(); this.renderPls(); } else { this.state.col[aKey]=c; this.saveState(); W.AlbumsManager?.getCurrentAlbum() === '__showcase__' && this.renderList(); } m.remove(); } };
  }

  hiTrack(u) { D.querySelectorAll('.showcase-track.current').forEach(e=>e.classList.remove('current')); if(u) D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(u)}"]`).forEach(e=>e.classList.add('current')); }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

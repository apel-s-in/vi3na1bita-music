/**
 * scripts/app/showcase/index.js
 * Showcase «Витрина Разбита» — полная переработка v3.0
 * Спецификация: Диалог.docx 2026-03
 *
 * Архитектура:
 *  - Layer 1: catalog (immutable, from TrackRegistry)
 *  - Layer 2: context state (default + user playlists) → localStorage
 *  - Layer 3: global UI state → localStorage
 *  - Layer 4: edit draft (in-memory only, never touches live state)
 */

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils;
const ls = localStorage;
const NS = 'sc3:';                                   // namespace для localStorage
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const esc = s => U.escapeHtml(String(s ?? ''));
const $ = id => D.getElementById(id);
const emit = (n, d) => W.dispatchEvent(new CustomEvent(n, d !== undefined ? { detail: d } : undefined));

/* ─── Helpers ─── */
const lsGet = (k, d = null) => { try { const v = ls.getItem(NS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { ls.setItem(NS + k, JSON.stringify(v)); } catch {} };
const uid2track = u => W.TrackRegistry?.getTrackByUid?.(u);
const albumTitle = k => W.TrackRegistry?.getAlbumTitle?.(k) || k;

/* ─── Catalog helpers ─── */
function getCatalogOrder() {
  // Альбомы новые→старые, треки оригинальный порядок
  const idx = W.albumsIndex || [];
  const result = [];
  [...idx].reverse().forEach(a => {
    if (a.key.startsWith('__')) return;
    (W.TrackRegistry?.getTracksForAlbum?.(a.key) || []).forEach(t => {
      if (t.uid) result.push(t.uid);
    });
  });
  return result;
}

function buildTrackObj(uid, coverFallback) {
  const t = uid2track(uid);
  if (!t) return null;
  let cv = coverFallback || 'img/logo.png';
  const ic = W.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(i => i.key === t.sourceAlbum)?.icon;
  if (ic) {
    cv = ic;
    if (U.isMobile() && /\/icon_album\/[^/]+\.png$/i.test(cv)) {
      const m = cv.match(/\/icon_album\/([^/]+)\.png$/i);
      if (m) cv = `img/icon_album/mobile/${m[1]}@1x.jpg`;
    }
  }
  return { ...t, album: 'Витрина Разбита', cover: cv };
}

/* ═══════════════════════════════════════════════════
 *  STORE — Layer 2 + Layer 3
 * ═══════════════════════════════════════════════════ */
const Store = {
  /* default context */
  getDefault() {
    return lsGet('default', null);
  },
  setDefault(ctx) { lsSet('default', ctx); },

  /* playlists */
  getPlaylists() { return lsGet('playlists', []); },
  setPlaylists(pls) { lsSet('playlists', pls); },
  getPlaylist(id) { return this.getPlaylists().find(p => p.id === id) || null; },
  savePlaylist(pl) {
    const pls = this.getPlaylists();
    const idx = pls.findIndex(p => p.id === pl.id);
    if (idx >= 0) pls[idx] = pl; else pls.push(pl);
    this.setPlaylists(pls);
  },
  deletePlaylist(id) { this.setPlaylists(this.getPlaylists().filter(p => p.id !== id)); },

  /* active context id */
  getActiveId() { return lsGet('activeId', '__default__'); },
  setActiveId(id) { lsSet('activeId', id); },

  /* global UI */
  getUI() { return lsGet('ui', { viewMode: 'flat', showNumbers: false, showHidden: false, hiddenPlacement: 'inline' }); },
  setUI(ui) { lsSet('ui', ui); },

  /* album colors */
  getAlbumColors() { return lsGet('albumColors', {}); },
  setAlbumColors(c) { lsSet('albumColors', c); },
  /* playlist colors stored inside playlist object */

  /* baseline reset */
  makeDefaultBaseline() {
    const order = getCatalogOrder();
    return { order, hidden: [], sortMode: 'user', hiddenPlacement: 'inline' };
  },

  getOrCreateDefault() {
    let ctx = this.getDefault();
    if (!ctx) {
      ctx = this.makeDefaultBaseline();
      this.setDefault(ctx);
    } else {
      // merge new catalog tracks that weren't there before
      const catalog = new Set(getCatalogOrder());
      const existing = new Set(ctx.order);
      catalog.forEach(u => { if (!existing.has(u)) ctx.order.push(u); });
      // remove stale
      ctx.order = ctx.order.filter(u => catalog.has(u));
      this.setDefault(ctx);
    }
    return ctx;
  },
};

/* ═══════════════════════════════════════════════════
 *  DRAFT — Layer 4
 * ═══════════════════════════════════════════════════ */
class Draft {
  constructor(contextId) {
    this.contextId = contextId;
    this.isDefault = contextId === '__default__';

    const src = this.isDefault
      ? Store.getOrCreateDefault()
      : Store.getPlaylist(contextId);

    this.baseline = JSON.parse(JSON.stringify(src)); // deep clone for reset
    this.order = [...(src.order || [])];
    this.hidden = new Set(src.hidden || []);
    this.checked = new Set(this.isDefault ? this.order.filter(u => !this.hidden.has(u)) : src.order || []);
    this.dirty = false;
  }

  isDirty() { return this.dirty; }
  markDirty() { this.dirty = true; }

  toggleHidden(uid) {
    if (this.hidden.has(uid)) {
      this.hidden.delete(uid);
      this.checked.add(uid);
    } else {
      this.hidden.add(uid);
      this.checked.delete(uid);
    }
    this.markDirty();
  }

  toggleChecked(uid) {
    if (this.checked.has(uid)) {
      this.checked.delete(uid);
      if (this.isDefault) this.hidden.add(uid);
    } else {
      this.checked.add(uid);
      if (this.isDefault) this.hidden.delete(uid);
    }
    this.markDirty();
  }

  setOrder(uids) { this.order = uids; this.markDirty(); }

  applyReset() {
    const baseline = this.isDefault ? Store.makeDefaultBaseline() : this.baseline;
    this.order = [...(baseline.order || [])];
    this.hidden = new Set(baseline.hidden || []);
    this.checked = new Set(this.isDefault ? this.order.filter(u => !this.hidden.has(u)) : (baseline.order || []));
    this.dirty = false;
  }

  /* Returns display list for edit mode: all catalog (default) or playlist tracks */
  getEditList() {
    if (this.isDefault) {
      // Full catalog in manual order
      const catalog = new Set(getCatalogOrder());
      const inOrder = this.order.filter(u => catalog.has(u));
      getCatalogOrder().forEach(u => { if (!inOrder.includes(u)) inOrder.push(u); });
      return inOrder;
    }
    return [...this.order];
  }
}

/* ═══════════════════════════════════════════════════
 *  ShowcaseManager
 * ═══════════════════════════════════════════════════ */
class ShowcaseManager {
  constructor() {
    this._draft = null;
    this._editMode = false;
    this._searchQ = '';
    this._searchChecked = new Set();
    this._renderTok = 0;       // race-condition guard
    this._listenerBound = false;
    this._menu = null;
  }

  /* ── Init ── */
  async initialize() {
    await W.TrackRegistry?.ensurePopulated?.();
    Store.getOrCreateDefault(); // init default if missing

    // sync new tracks on catalog change
    W.playerCore?.onFavoritesChanged(({ uid }) => {
      if (W.AlbumsManager?.getCurrentAlbum() === '__showcase__') {
        D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(uid)}"] .like-star`)
          .forEach(el => { el.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png'; });
        this._updStatus();
      }
    });
    W.addEventListener('offline:stateChanged', () => {
      if (W.AlbumsManager?.getCurrentAlbum() === '__showcase__') W.OfflineIndicators?.refreshAllIndicators?.();
    });
  }

  /* ── Context helpers ── */
  _activeCtxId() { return Store.getActiveId(); }
  _isDefault(id = this._activeCtxId()) { return id === '__default__'; }

  _getActiveCtx() {
    const id = this._activeCtxId();
    return this._isDefault(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id);
  }

  /* ── Playback list (active tracks only, honoring hidden) ── */
  getActiveListTracks() {
    const ctx = this._getActiveCtx();
    const hidden = new Set(ctx.hidden || []);
    const order = ctx.order || [];

    let uids = order.filter(u => !hidden.has(u) && uid2track(u));

    // sort for playback (user sort only — view sorts don't affect playback)
    return uids.map(u => buildTrackObj(u)).filter(Boolean);
  }

  /* ── Display list for current view ── */
  async _getDisplayList() {
    if (this._editMode) return []; // edit mode has its own render
    const ctx = this._getActiveCtx();
    const ui = Store.getUI();
    const hidden = new Set(ctx.hidden || []);
    let order = [...(ctx.order || [])];

    // apply sort (view-only, doesn't touch saved order)
    const sm = ctx.sortMode || 'user';
    if (sm !== 'user' && sm !== 'shuffle') {
      const tracks = order.map(u => uid2track(u)).filter(Boolean);
      if (sm.startsWith('plays') || sm === 'last-played') {
        try {
          const db = (await import('../../analytics/meta-db.js')).metaDB;
          const stats = await db.getAllStats();
          const smap = new Map(stats.filter(s => s.uid !== 'global').map(s => [s.uid, s]));
          const sorters = {
            'plays-desc': (a, b) => (smap.get(b.uid)?.globalFullListenCount || 0) - (smap.get(a.uid)?.globalFullListenCount || 0),
            'plays-asc':  (a, b) => (smap.get(a.uid)?.globalFullListenCount || 0) - (smap.get(b.uid)?.globalFullListenCount || 0),
            'last-played': (a, b) => (smap.get(b.uid)?.lastPlayedAt || 0) - (smap.get(a.uid)?.lastPlayedAt || 0),
          };
          tracks.sort(sorters[sm] || (() => 0));
        } catch {}
      } else {
        const sorters = {
          'name-asc': (a, b) => a.title.localeCompare(b.title),
          'name-desc': (a, b) => b.title.localeCompare(a.title),
          'album-desc': (a, b) => b.sourceAlbum.localeCompare(a.sourceAlbum),
          'album-asc': (a, b) => a.sourceAlbum.localeCompare(b.sourceAlbum),
          'favorites-first': (a, b) => (W.playerCore?.isFavorite(b.uid) ? 1 : 0) - (W.playerCore?.isFavorite(a.uid) ? 1 : 0),
        };
        if (sorters[sm]) tracks.sort(sorters[sm]);
      }
      order = tracks.map(t => t.uid);
    }

    // hidden placement
    if (ui.hiddenPlacement === 'end') {
      const active = order.filter(u => !hidden.has(u));
      const hidArr = order.filter(u => hidden.has(u));
      order = [...active, ...hidArr];
    }

    // filter hidden from display if showHidden off
    if (!ui.showHidden) order = order.filter(u => !hidden.has(u));

    // search
    if (this._searchQ) {
      await ensureLyricsIndexLoaded();
      const allUids = W.TrackRegistry?.getAllUids?.() || [];
      const found = searchUidsByQuery({ uids: allUids, query: this._searchQ });
      // mark which are in context and which aren't
      return { type: 'search', results: found, ctxOrder: order, ctxHidden: hidden };
    }

    return { type: 'normal', uids: order.filter(u => uid2track(u)), hidden };
  }

  /* ── Main render ── */
  async renderTab() {
    const list = $('track-list');
    if (!list) return;

    const tok = ++this._renderTok;
    const ui = Store.getUI();
    const activeId = this._activeCtxId();
    const ctx = this._getActiveCtx();

    list.innerHTML = this._buildHeader(ctx, ui, activeId);
    this._bindCtrl(list);
    this._renderPls();

    if (this._editMode) {
      await this._renderEditList(tok);
    } else {
      await this._renderNormalList(tok);
    }

    if (!this._editMode) {
      const lu = this._isDefault(activeId) ? lsGet('lastUid_default') : lsGet(`lastUid_${activeId}`);
      if (lu) this._hiTrack(lu);
    }
  }

  _buildHeader(ctx, ui, activeId) {
    const isDefault = this._isDefault(activeId);
    const sm = ctx?.sortMode || 'user';
    const showRes = isDefault && this._hasDefaultChanges();

    const editBtns = this._editMode
      ? `<div class="sc-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ
          <div class="sc-edit-actions">
            <button class="showcase-btn sc-btn-save" style="background:#4caf50;color:#fff;">💾 Сохранить</button>
            <button class="showcase-btn sc-btn-create" style="background:#4daaff;color:#fff;">✨ Создать</button>
            ${isDefault ? `<button class="showcase-btn sc-btn-reset" style="border-color:#ff9800;">↺ Сброс</button>` : `<button class="showcase-btn sc-btn-reset" style="border-color:#ff9800;">↺ Сброс</button>`}
            <button class="showcase-btn sc-btn-exit" style="border-color:#ff6b6b;">✕ Выйти</button>
          </div></div>`
      : '';

    return `
      <div class="showcase-header-controls">
        ${editBtns}
        <div class="showcase-search-wrap">
          <input type="text" class="showcase-search" id="sc-search"
            placeholder="🔍 Поиск по всему каталогу..." value="${esc(this._searchQ)}">
          <button type="button" class="showcase-search-clear" id="sc-search-clear"
            style="display:${this._searchQ ? '' : 'none'}">✕</button>
        </div>
        ${!this._editMode ? `
        <div class="showcase-btns-row">
          <button class="showcase-btn sc-btn-edit">✏️ Редактировать</button>
          ${showRes ? `<button class="showcase-btn sc-btn-master-reset" style="flex:0.5">↺ Сброс</button>` : ''}
          <button class="showcase-btn sc-btn-sort">↕️ ${sm !== 'user' ? '●' : ''} Сортировка</button>
        </div>
        <div class="showcase-btns-row">
          <button class="showcase-btn sc-btn-playall">▶ Играть всё</button>
          <button class="showcase-btn sc-btn-shuffle">🔀 Перемешать</button>
        </div>` : ''}
        <div class="showcase-playlists-actions" id="sc-playlists-actions"></div>
        <div class="showcase-playlists-list" id="sc-playlists"></div>
        <div class="showcase-status-bar" id="sc-status"></div>
      </div>
      <div id="sc-tracks-container"></div>`;
  }

  _hasDefaultChanges() {
    const ctx = Store.getOrCreateDefault();
    const baseline = Store.makeDefaultBaseline();
    return JSON.stringify(ctx.order) !== JSON.stringify(baseline.order)
      || JSON.stringify(ctx.hidden) !== JSON.stringify(baseline.hidden);
  }

  /* ── Normal list render ── */
  async _renderNormalList(tok) {
    const c = $('sc-tracks-container');
    if (!c) return;
    const displayData = await this._getDisplayList();
    if (tok !== this._renderTok) return; // stale

    const ui = Store.getUI();
    const cols = Store.getAlbumColors();

    if (displayData.type === 'search') {
      this._renderSearchResults(c, displayData, ui);
    } else {
      const { uids, hidden } = displayData;
      this._updStatus(uids.length);
      let h = '', grp = null;
      uids.forEach((u, i) => {
        const t = buildTrackObj(u);
        if (!t) return;
        if (ui.viewMode === 'grouped' && grp !== t.sourceAlbum) {
          grp = t.sourceAlbum;
          h += `<div class="showcase-group-header">── ${esc(albumTitle(t.sourceAlbum))} ──</div>`;
        }
        const isH = hidden?.has(u);
        const cl = cols[t.sourceAlbum] || 'transparent';
        h += this._trackRow(t, i, { isHidden: isH, showNumbers: ui.showNumbers, color: cl });
      });
      c.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
      W.OfflineIndicators?.injectOfflineIndicators?.(c);
      this._hiTrack(W.playerCore?.getCurrentTrackUid?.());
      this._updStatus(uids.length);
    }
  }

  _renderSearchResults(c, { results, ctxOrder, ctxHidden }, ui) {
    const ctxSet = new Set(ctxOrder);
    const activeId = this._activeCtxId();
    this._updStatus(results.length, true);

    let h = `<div class="sc-search-info">Найдено: ${results.length} треков</div>`;
    results.forEach(u => {
      const t = buildTrackObj(u);
      if (!t) return;
      const inCtx = ctxSet.has(u);
      const isHidden = ctxHidden?.has(u);
      const badge = inCtx
        ? (isHidden ? '<span class="sc-badge sc-badge-hidden">скрыт</span>' : '<span class="sc-badge sc-badge-active">в плейлисте</span>')
        : '<span class="sc-badge sc-badge-missing">добавить?</span>';
      const checkbox = !inCtx || isHidden
        ? `<input type="checkbox" class="sc-search-chk" data-uid="${u}" ${this._searchChecked.has(u) ? 'checked' : ''}>`
        : '';
      h += `<div class="showcase-track sc-search-result" data-uid="${u}">
        <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
        <div class="track-title">
          <div>${esc(t.title)}</div>
          <div class="showcase-track-meta">${esc(albumTitle(t.sourceAlbum))} ${badge}</div>
        </div>
        ${checkbox}
        <button class="showcase-track-menu-btn" data-uid="${u}">···</button>
      </div>`;
    });

    if (this._searchChecked.size > 0) {
      h += `<div class="sc-search-actions">
        <button class="showcase-btn sc-search-add">➕ Добавить в «${this._ctxName()}»</button>
        <button class="showcase-btn sc-search-create" style="background:#4daaff;color:#fff;">✨ Создать новый</button>
      </div>`;
    }
    c.innerHTML = h;
  }

  _ctxName() {
    const id = this._activeCtxId();
    if (this._isDefault(id)) return 'Все треки';
    return Store.getPlaylist(id)?.name || 'Плейлист';
  }

  /* ── Edit list render ── */
  async _renderEditList(tok) {
    const c = $('sc-tracks-container');
    if (!c || !this._draft) return;
    if (tok !== this._renderTok) return;

    const uids = this._draft.getEditList();
    const ui = Store.getUI();
    let h = '';

    uids.forEach((u, i) => {
      const t = buildTrackObj(u);
      if (!t) return;
      const isH = this._draft.hidden.has(u);
      const isC = this._draft.checked.has(u);
      h += `<div class="showcase-track sc-edit-row ${isH ? 'inactive' : ''} ${isC ? 'sc-checked' : ''}"
              data-uid="${u}" draggable="true">
        <button class="sc-arrow-up">▲</button>
        <div class="showcase-drag-handle">⠿</div>
        <input type="checkbox" class="sc-chk" ${isC ? 'checked' : ''}>
        <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
        <div class="track-title">
          <div>${esc(t.title)}</div>
          <div class="showcase-track-meta">${esc(albumTitle(t.sourceAlbum))}</div>
        </div>
        <button class="sc-eye-btn" title="Показать/Скрыть">${isH ? '🙈' : '👁'}</button>
        <button class="sc-arrow-down">▼</button>
      </div>`;
    });

    c.innerHTML = h || '<div class="fav-empty">Нет треков</div>';
    this._bindDrag(c);
    this._updStatus(uids.filter(u => !this._draft.hidden.has(u)).length);
  }

  _trackRow(t, i, { isHidden, showNumbers, color }) {
    const u = t.uid;
    return `<div class="showcase-track ${isHidden ? 'inactive' : ''}" data-uid="${u}"
              style="border-left:3px solid ${color}">
      <div class="tnum" ${showNumbers ? '' : 'style="display:none"'}>${i + 1}.</div>
      <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
      <div class="track-title">
        <div>${esc(t.title)}</div>
        <div class="showcase-track-meta">${esc(albumTitle(t.sourceAlbum))}</div>
      </div>
      <span class="offline-ind" data-uid="${u}">🔒</span>
      <img src="${W.playerCore?.isFavorite(u) ? 'img/star.png' : 'img/star2.png'}"
           class="like-star" data-uid="${u}" data-album="${t.sourceAlbum}">
      <button class="showcase-track-menu-btn">···</button>
    </div>`;
  }

  /* ── Playlists render ── */
  _renderPls() {
    const act = $('sc-playlists-actions'), lst = $('sc-playlists');
    if (!act || !lst) return;
    const id = this._activeCtxId(), pls = Store.getPlaylists();

    act.innerHTML = `
      <button class="sc-pl-action ${this._isDefault(id) ? 'active' : ''}" id="sc-pl-all">Все треки</button>
      <button class="sc-pl-action" id="sc-pl-pst" title="Вставить ссылку">📋</button>`;

    act.onclick = e => {
      if (e.target.id === 'sc-pl-all') this._switchCtx('__default__');
      else if (e.target.id === 'sc-pl-pst')
        navigator.clipboard.readText().then(t => this._handleSharedPlaylist(
          new URLSearchParams(t.split('?')[1] || t).get('playlist') || t
        )).catch(() => W.NotificationSystem?.error('Ошибка буфера'));
    };

    if (!pls.length) { lst.innerHTML = '<div class="sc-pl-empty">Плейлистов пока нет</div>'; return; }

    lst.innerHTML = pls.map(p => `
      <div class="sc-pl-row ${id === p.id ? 'active' : ''}" data-pid="${p.id}"
           ${p.color ? `style="--pl-color:${p.color};"` : ''}>
        <div class="sc-pl-left">
          <span class="sc-pl-dot"></span>
          <span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span>
        </div>
        <div class="sc-pl-right">
          <button class="sc-pl-btn" data-act="rename" data-pid="${p.id}" title="Переименовать">✏️</button>
          <button class="sc-pl-btn" data-act="shr" data-pid="${p.id}" title="Поделиться">🔗</button>
          <button class="sc-pl-btn" data-act="col" data-pid="${p.id}" title="Цвет">🎨</button>
          <button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}" title="Удалить">✖</button>
        </div>
      </div>`).join('');

    lst.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      const pid = e.target.closest('[data-pid]')?.dataset.pid;
      if (a && pid) {
        e.stopPropagation();
        if (a === 'rename') this._renamePl(pid);
        else if (a === 'shr') this._sharePl(pid);
        else if (a === 'col') this.opnCol(null, null, pid);
        else if (a === 'del') W.Modals?.confirm({ title: 'Удалить плейлист?', confirmText: 'Да', onConfirm: () => { Store.deletePlaylist(pid); if (id === pid) this._switchCtx('__default__'); else this.renderTab(); } });
      } else {
        const row = e.target.closest('.sc-pl-row');
        if (row?.dataset.pid) this._switchCtx(row.dataset.pid);
      }
    };
  }

  _switchCtx(id) {
    if (this._editMode) { W.NotificationSystem?.warning('Выйдите из режима редактирования'); return; }
    Store.setActiveId(id);
    this.renderTab();
  }

  /* ── Bind controls (ONCE per renderTab via delegation, no listener leak) ── */
  _bindCtrl(root) {
    // remove old listener if exists
    if (root._scHandler) { root.removeEventListener('click', root._scHandler); root.removeEventListener('touchstart', root._scTouchStart, { passive: false }); }

    root._scHandler = e => this._onRootClick(e);
    root.addEventListener('click', root._scHandler);

    // touch long-press for drag in edit
    root._scTouchStart = e => {
      const h = e.target.closest('.showcase-drag-handle');
      if (h && this._editMode) { e.preventDefault(); this._strtDrg(e, h.closest('.showcase-track')); }
    };
    root.addEventListener('touchstart', root._scTouchStart, { passive: false });

    // search input
    const inp = $('sc-search'), clr = $('sc-search-clear');
    if (inp) {
      if (inp._scInput) inp.removeEventListener('input', inp._scInput);
      inp._scInput = U.func.debounceFrame(async () => {
        this._searchQ = inp.value.trim();
        this._searchChecked.clear();
        if (clr) clr.style.display = this._searchQ ? '' : 'none';
        await this._renderNormalList(++this._renderTok);
      });
      inp.addEventListener('input', inp._scInput);
      inp.addEventListener('keydown', e => e.key === 'Enter' && inp.blur());
      inp.addEventListener('blur', () => window.scrollTo({ top: window.scrollY, behavior: 'instant' }));
    }
    if (clr) {
      if (clr._scClick) clr.removeEventListener('click', clr._scClick);
      clr._scClick = () => { if (inp) inp.value = ''; this._searchQ = ''; this._searchChecked.clear(); clr.style.display = 'none'; this._renderNormalList(++this._renderTok); };
      clr.addEventListener('click', clr._scClick);
    }
  }

  _onRootClick(e) {
    const id = e.target.id || '';

    // header buttons
    const headerBtns = {
      'sc-btn-edit': () => this._enterEdit(),
      'sc-btn-save': () => this._doSave(),
      'sc-btn-create': () => this._doCreate(),
      'sc-btn-reset': () => this._doReset(),
      'sc-btn-exit': () => this._doExit(),
      'sc-btn-master-reset': () => this._doMasterReset(),
      'sc-btn-playall': () => this._playCtx(),
      'sc-btn-shuffle': () => this._playCtxShuffle(),
      'sc-btn-sort': () => this._openSort(),
      'sc-tg-numbers': () => { const ui = Store.getUI(); ui.showNumbers = !ui.showNumbers; Store.setUI(ui); this._renderNormalList(++this._renderTok); },
      'sc-tg-hidden': () => { const ui = Store.getUI(); ui.showHidden = !ui.showHidden; Store.setUI(ui); this._renderNormalList(++this._renderTok); },
      'sc-tg-view': () => { const ui = Store.getUI(); ui.viewMode = ui.viewMode === 'flat' ? 'grouped' : 'flat'; Store.setUI(ui); this._renderNormalList(++this._renderTok); },
      'sc-tg-placement': () => { const ui = Store.getUI(); ui.hiddenPlacement = ui.hiddenPlacement === 'inline' ? 'end' : 'inline'; Store.setUI(ui); this._renderNormalList(++this._renderTok); },
      'sc-search-add': () => this._addSearchCheckedToCtx(),
      'sc-search-create': () => this._createFromSearchChecked(),
      'sc-pl-all': () => this._switchCtx('__default__'),
    };
    if (headerBtns[id]) { headerBtns[id](); return; }

    // status bar toggles (rendered dynamically)
    const tgE = e.target.closest('#sc-tg-hidden'), tgN = e.target.closest('#sc-tg-numbers');
    const tgV = e.target.closest('#sc-tg-view'), tgP = e.target.closest('#sc-tg-placement');
    if (tgE) { headerBtns['sc-tg-hidden'](); return; }
    if (tgN) { headerBtns['sc-tg-numbers'](); return; }
    if (tgV) { headerBtns['sc-tg-view'](); return; }
    if (tgP) { headerBtns['sc-tg-placement'](); return; }

    // edit mode row actions
    if (this._editMode) {
      const row = e.target.closest('.sc-edit-row, .showcase-track'), u = row?.dataset.uid;
      if (!u) return;
      if (e.target.classList.contains('sc-chk')) { this._draft?.toggleChecked(u); row.classList.toggle('sc-checked', this._draft?.checked.has(u)); row.classList.toggle('inactive', this._draft?.hidden.has(u)); this._draft?.markDirty(); this._updStatus(); return; }
      if (e.target.closest('.sc-eye-btn')) { this._draft?.toggleHidden(u); this._renderEditList(this._renderTok); return; }
      if (e.target.closest('.sc-arrow-up')) { this._swpEdit(u, -1); return; }
      if (e.target.closest('.sc-arrow-down')) { this._swpEdit(u, 1); return; }
      return;
    }

    // search mode
    if (this._searchQ) {
      const row = e.target.closest('.showcase-track'), u = row?.dataset.uid;
      if (!u) return;
      const chk = e.target.closest('.sc-search-chk');
      if (chk) { if (chk.checked) this._searchChecked.add(u); else this._searchChecked.delete(u); this._renderNormalList(++this._renderTok); return; }
      const menuBtn = e.target.closest('.showcase-track-menu-btn');
      if (menuBtn) { this._opnMenu(u, true); return; }
      // tap on row in search → open menu (not play)
      this._opnMenu(u, true);
      return;
    }

    // normal mode
    const menuBtn = e.target.closest('.showcase-track-menu-btn');
    if (menuBtn) { const u = menuBtn.closest('.showcase-track')?.dataset.uid; if (u) this._opnMenu(u, false); return; }

    const star = e.target.closest('.like-star');
    if (star) return; // handled globally by albums.js / PlayerCore

    const offline = e.target.closest('.offline-ind');
    if (offline) return; // read-only in Showcase row (action only via menu)

    const row = e.target.closest('.showcase-track'), u = row?.dataset.uid;
    if (!u || !row) return;
    this._playCtx(u);
  }

  /* ── Edit mode ── */
  _enterEdit() {
    const id = this._activeCtxId();
    const ctx = this._isDefault(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id);
    if (!ctx) return;
    this._draft = new Draft(id);
    this._editMode = true;
    this.renderTab();
  }

  async _doSave() {
    if (!this._draft) return;
    const id = this._activeCtxId();
    if (this._isDefault(id)) {
      // save to default context
      const ctx = Store.getOrCreateDefault();
      ctx.order = this._draft.order.filter(u => uid2track(u));
      ctx.hidden = [...this._draft.hidden];
      Store.setDefault(ctx);
    } else {
      const pl = Store.getPlaylist(id);
      if (!pl) return;
      const activeInDraft = this._draft.order.filter(u => this._draft.checked.has(u) && uid2track(u));
      pl.order = activeInDraft;
      pl.hidden = [...this._draft.hidden].filter(u => this._draft.checked.has(u));
      Store.savePlaylist(pl);
    }
    this._exitEditClean();
    W.NotificationSystem?.success('Сохранено');
  }

  _doCreate() {
    if (!this._draft) return;
    const checked = this._draft.order.filter(u => this._draft.checked.has(u) && !this._draft.hidden.has(u) && uid2track(u));
    if (!checked.length) { W.NotificationSystem?.warning('Отметьте треки чекбоксами'); return; }
    this._askPlaylistName(name => {
      if (!name) return;
      const id = Date.now().toString(36);
      const snapshot = { order: [...checked], hidden: [] };
      const pl = { id, name, order: [...checked], hidden: [], sortMode: 'user', color: '', creationSnapshot: JSON.parse(JSON.stringify(snapshot)), createdAt: Date.now() };
      Store.savePlaylist(pl);
      this._exitEditClean();
      Store.setActiveId(id);
      this.renderTab();
      W.NotificationSystem?.success(`Плейлист «${name}» создан`);
    });
  }

  _doReset() {
    if (!this._draft) return;
    const id = this._activeCtxId();
    const isDefault = this._isDefault(id);
    const msg = isDefault
      ? 'Список вернётся к заводскому: все треки, порядок по альбомам. Продолжить?'
      : 'Плейлист вернётся к состоянию при создании. Продолжить?';
    W.Modals?.confirm({ title: 'Сброс', textHtml: msg, confirmText: 'Сбросить', cancelText: 'Отмена', onConfirm: () => { this._draft.applyReset(); this._renderEditList(++this._renderTok); } });
  }

  _doExit() {
    if (!this._draft?.isDirty()) { this._exitEditClean(); return; }
    W.Modals?.confirm({ title: 'Выйти без сохранения?', textHtml: 'Изменения не будут сохранены.', confirmText: 'Выйти', cancelText: 'Отмена', onConfirm: () => this._exitEditClean() });
  }

  _exitEditClean() {
    this._draft = null;
    this._editMode = false;
    this.renderTab();
  }

  _doMasterReset() {
    W.Modals?.confirm({
      title: 'Сбросить «Все треки»?',
      textHtml: 'Порядок вернётся к заводскому, все скрытые треки станут видимыми.',
      confirmText: 'Сбросить', cancelText: 'Отмена',
      onConfirm: () => {
        const baseline = Store.makeDefaultBaseline();
        Store.setDefault(baseline);
        this.renderTab();
      }
    });
  }

  /* ── Sort ── */
  _openSort() {
    const id = this._activeCtxId();
    const ctx = this._isDefault(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id);
    const sm = ctx?.sortMode || 'user';
    const m = W.Modals?.open({ title: 'Сортировка', bodyHtml: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${[['user','👤 Мой порядок'],['name-asc','А→Я'],['name-desc','Я→А'],['album-desc','Альбомы ↓'],['album-asc','Альбомы ↑'],['plays-desc','Топ прослушиваний'],['plays-asc','Меньше всего'],['last-played','Недавние'],['favorites-first','Сначала ⭐']].map(([v, l]) =>
          `<button class="showcase-btn ${sm === v ? 'active' : ''}" data-val="${v}" style="${v === 'user' ? 'grid-column:1/-1' : ''}">${l}</button>`
        ).join('')}
      </div>` });
    if (!m) return;
    m.onclick = e => {
      const b = e.target.closest('[data-val]');
      if (!b) return;
      const val = b.dataset.val;
      if (this._isDefault(id)) {
        const c = Store.getOrCreateDefault(); c.sortMode = val; Store.setDefault(c);
      } else {
        const pl = Store.getPlaylist(id); if (pl) { pl.sortMode = val; Store.savePlaylist(pl); }
      }
      m.remove(); this.renderTab();
    };
  }

  /* ── Playback ── */
  _playCtx(uid = null) {
    const id = this._activeCtxId();
    const k = this._isDefault(id) ? '__showcase__' : `__showcase__:${id}`;
    const trks = this.getActiveListTracks();
    if (!trks.length) return;
    let idx = uid ? Math.max(0, trks.findIndex(t => t.uid === uid)) : 0;
    W.AlbumsManager?.setPlayingAlbum(k);
    W.playerCore?.setPlaylist(trks, idx, null, { preservePosition: false });
    W.playerCore?.play(idx);
    W.PlayerUI?.ensurePlayerBlock(idx, { userInitiated: true });
    this._hiTrack(trks[idx].uid);
    const lsKey = this._isDefault(id) ? 'lastUid_default' : `lastUid_${id}`;
    lsSet(lsKey, trks[idx].uid);
  }

  _playCtxShuffle() {
    const trks = this.getActiveListTracks();
    if (!trks.length) return;
    const id = this._activeCtxId();
    const k = this._isDefault(id) ? '__showcase__' : `__showcase__:${id}`;
    const shuffled = [...trks].sort(() => Math.random() - 0.5);
    W.AlbumsManager?.setPlayingAlbum(k);
    W.playerCore?.setPlaylist(shuffled, 0, null, { preservePosition: false });
    W.playerCore?.play(0);
    W.PlayerUI?.ensurePlayerBlock(0, { userInitiated: true });
    this._hiTrack(shuffled[0].uid);
  }

  /* ── Track menu ── */
  _opnMenu(u, fromSearch = false) {
    if (this._menu) this._menu.remove();
    const t = uid2track(u);
    if (!t) return;
    const id = this._activeCtxId();
    const inCtx = !this._isDefault(id) && (Store.getPlaylist(id)?.order || []).includes(u);

    const bg = D.createElement('div');
    bg.className = 'sc-bottom-sheet-bg';
    bg.innerHTML = `<div class="sc-bottom-sheet">
      <button class="sc-sheet-close">×</button>
      <div class="sc-sheet-title">${esc(t.title)}</div>
      <div class="sc-sheet-sub">${esc(albumTitle(t.sourceAlbum))}</div>
      ${fromSearch ? `<button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><hr style="border-color:rgba(255,255,255,.08);margin:8px 0">` : ''}
      <button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>
      ${inCtx ? `<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из плейлиста</button>` : ''}
      <button class="sc-sheet-btn" id="bm-eye">${this._isHiddenInCtx(u) ? '👁 Показать в «' + this._ctxName() + '»' : '🙈 Скрыть в «' + this._ctxName() + '»'}</button>
      <button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite(u) ? '❌ Убрать из Избранного' : '⭐ В Избранное'}</button>
      <button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Офлайн</button>
      <button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3</button>
      <button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button>
      <button class="sc-sheet-btn" id="bm-sh">📸 Поделиться (Карточка)</button>
      <button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button>
      <button class="sc-sheet-btn" id="bm-cx" style="color:#888;justify-content:center">Отмена</button>
    </div>`;

    D.body.appendChild(bg);
    this._menu = bg;
    requestAnimationFrame(() => bg.classList.add('active'));

    const cls = () => { bg.classList.remove('active'); setTimeout(() => bg.remove(), 200); this._menu = null; };
    bg.querySelector('.sc-sheet-close').onclick = cls;

    bg.onclick = e => {
      const bid = e.target.id;
      if (e.target === bg || bid === 'bm-cx') { cls(); return; }
      if (!bid) return;
      cls();
      if (bid === 'bm-play') { this._playCtx(u); }
      else if (bid === 'bm-pl') setTimeout(() => this._addToPlaylistModal([u]), 250);
      else if (bid === 'bm-rm') { const pl = Store.getPlaylist(id); if (pl) { pl.order = pl.order.filter(x => x !== u); Store.savePlaylist(pl); this.renderTab(); } }
      else if (bid === 'bm-eye') { this._toggleHiddenInCtx(u); }
      else if (bid === 'bm-fv') W.playerCore?.toggleFavorite(u, { albumKey: t.sourceAlbum });
      else if (bid === 'bm-of') W.OfflineManager?.togglePinned?.(u);
      else if (bid === 'bm-dl') { const a = D.createElement('a'); U.download.applyDownloadLink(a, t); if (a.href) a.click(); }
      else if (bid === 'bm-st') setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(u), 250);
      else if (bid === 'bm-sh') setTimeout(() => import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', t)), 250);
      else if (bid === 'bm-cl') setTimeout(() => this.opnCol(u), 250);
    };
  }

  _isHiddenInCtx(uid) {
    const id = this._activeCtxId();
    const ctx = this._isDefault(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id);
    return (ctx?.hidden || []).includes(uid);
  }

  _toggleHiddenInCtx(uid) {
    const id = this._activeCtxId();
    if (this._isDefault(id)) {
      const ctx = Store.getOrCreateDefault();
      const idx = ctx.hidden.indexOf(uid);
      if (idx >= 0) ctx.hidden.splice(idx, 1); else ctx.hidden.push(uid);
      Store.setDefault(ctx);
    } else {
      const pl = Store.getPlaylist(id);
      if (!pl) return;
      const idx = pl.hidden.indexOf(uid);
      if (idx >= 0) pl.hidden.splice(idx, 1); else { if (!pl.hidden) pl.hidden = []; pl.hidden.push(uid); }
      Store.savePlaylist(pl);
    }
    this.renderTab();
  }

  /* ── Drag/reorder in edit ── */
  _swpEdit(uid, dir) {
    if (!this._draft) return;
    const arr = this._draft.order;
    const i = arr.indexOf(uid);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this._draft.markDirty();
    this._renderEditList(this._renderTok);
  }

  _svOrdFromDom() {
    if (!this._draft) return;
    const uids = Array.from(D.querySelectorAll('.sc-edit-row')).map(el => el.dataset.uid).filter(Boolean);
    this._draft.setOrder(uids);
  }

  _bindDrag(c) {
    c.addEventListener('dragstart', e => {
      const t = e.target.closest('.sc-edit-row');
      if (t) { e.dataTransfer.setData('text/plain', t.dataset.uid); t.classList.add('is-dragging'); }
    });
    c.addEventListener('dragover', e => { e.preventDefault(); e.target.closest('.sc-edit-row')?.classList.add('drag-over'); });
    c.addEventListener('dragleave', e => e.target.closest('.sc-edit-row')?.classList.remove('drag-over'));
    c.addEventListener('drop', e => {
      e.preventDefault();
      const t = e.target.closest('.sc-edit-row'), s = e.dataTransfer.getData('text/plain');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (t && s && s !== t.dataset.uid) {
        t.before(D.querySelector(`.sc-edit-row[data-uid="${s}"]`));
        this._svOrdFromDom();
      }
    });
    c.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging')));
  }

  _strtDrg(e, n) {
    if (!n) return;
    const t0 = e.touches[0], cl = n.cloneNode(true), r = n.getBoundingClientRect(), os = t0.clientY - r.top;
    cl.style.cssText = `position:fixed;left:${r.left}px;width:${r.width}px;z-index:10000;opacity:.9;background:#252d39;box-shadow:0 10px 30px rgba(0,0,0,.8);pointer-events:none`;
    D.body.appendChild(cl); n.style.opacity = '.3';
    const mv = e2 => { e2.preventDefault(); const y = e2.touches[0].clientY; cl.style.top = (y - os) + 'px'; D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); D.elementFromPoint(W.innerWidth / 2, y)?.closest('.sc-edit-row')?.classList.add('drag-over'); };
    const up = e2 => { D.removeEventListener('touchmove', mv); D.removeEventListener('touchend', up); cl.remove(); n.style.opacity = ''; const y = e2.changedTouches[0].clientY, tg = D.elementFromPoint(W.innerWidth / 2, y)?.closest('.sc-edit-row'); D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); if (tg && tg !== n) { tg.before(n); this._svOrdFromDom(); } };
    D.addEventListener('touchmove', mv, { passive: false });
    D.addEventListener('touchend', up);
  }

  /* ── Search actions ── */
  async _addSearchCheckedToCtx() {
    const uids = [...this._searchChecked].filter(u => uid2track(u));
    if (!uids.length) return;
    const id = this._activeCtxId();
    if (this._isDefault(id)) {
      const ctx = Store.getOrCreateDefault();
      const existing = new Set(ctx.order);
      const hiddenSet = new Set(ctx.hidden);
      uids.forEach(u => {
        if (!existing.has(u)) { ctx.order.push(u); }
        hiddenSet.delete(u); // activate if was hidden
      });
      ctx.hidden = [...hiddenSet];
      Store.setDefault(ctx);
    } else {
      const pl = Store.getPlaylist(id);
      if (!pl) return;
      const existing = new Set(pl.order);
      const hiddenSet = new Set(pl.hidden || []);
      uids.forEach(u => { if (!existing.has(u)) pl.order.push(u); hiddenSet.delete(u); });
      pl.hidden = [...hiddenSet];
      Store.savePlaylist(pl);
    }
    this._searchQ = ''; this._searchChecked.clear();
    W.NotificationSystem?.success(`Добавлено ${uids.length} треков`);
    this.renderTab();
  }

  async _createFromSearchChecked() {
    const uids = [...this._searchChecked].filter(u => uid2track(u));
    if (!uids.length) return;
    this._askPlaylistName(name => {
      if (!name) return;
      const newId = Date.now().toString(36);
      const snap = { order: [...uids], hidden: [] };
      const pl = { id: newId, name, order: [...uids], hidden: [], sortMode: 'user', color: '', creationSnapshot: JSON.parse(JSON.stringify(snap)), createdAt: Date.now() };
      Store.savePlaylist(pl);
      this._searchQ = ''; this._searchChecked.clear();
      Store.setActiveId(newId);
      this.renderTab();
      W.NotificationSystem?.success(`Плейлист «${name}» создан`);
    });
  }

  _addToPlaylistModal(uids) {
    const pls = Store.getPlaylists();
    if (!pls.length) { W.NotificationSystem?.warning('Сначала создайте плейлист через «Редактировать → Создать»'); return; }
    const m = W.Modals?.open({ title: 'Добавить в плейлист', bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px">${pls.map(p => `<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>` });
    if (!m) return;
    m.onclick = e => {
      const b = e.target.closest('[data-pid]');
      if (!b) return;
      const pl = Store.getPlaylist(b.dataset.pid);
      if (!pl) return;
      const existing = new Set(pl.order);
      let added = 0;
      uids.forEach(u => { if (!existing.has(u)) { pl.order.push(u); added++; } });
      Store.savePlaylist(pl);
      W.NotificationSystem?.success(`Добавлено: ${added}`);
      m.remove();
    };
  }

  /* ── Color picker ── */
  opnCol(uid = null, aKey = null, pId = null) {
    if (uid && !aKey) aKey = uid2track(uid)?.sourceAlbum;
    const cols = Store.getAlbumColors();
    const plCols = pId ? (Store.getPlaylist(pId)?.color || '') : '';
    const cur = pId ? plCols : (aKey ? cols[aKey] : '');

    const m = W.Modals?.open({ title: pId ? 'Цвет плейлиста' : 'Цвет альбома', bodyHtml: `
      <div class="showcase-color-picker">${PALETTE.map(c => `<div class="showcase-color-dot" style="background:${c};${cur === c ? 'border-color:#fff;' : ''}" data-col="${c}"></div>`).join('')}</div>
      <button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>` });
    if (!m) return;
    m.onclick = e => {
      const el = e.target.closest('[data-col]');
      if (!el) return;
      const c = el.dataset.col === 'transparent' ? '' : el.dataset.col;
      if (pId) {
        const pl = Store.getPlaylist(pId);
        if (pl) { pl.color = c; Store.savePlaylist(pl); this._renderPls(); }
      } else if (aKey) {
        const ac = Store.getAlbumColors(); ac[aKey] = c; Store.setAlbumColors(ac);
        if (W.AlbumsManager?.getCurrentAlbum() === '__showcase__') this._renderNormalList(++this._renderTok);
      }
      m.remove();
    };
  }

  /* ── Share / import playlist ── */
  _sharePl(id) {
    const pl = Store.getPlaylist(id);
    if (!pl) return;
    const url = `${W.location.origin}${W.location.pathname}?playlist=${btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, n: pl.name, u: pl.order }))))}`;
    navigator.share
      ? navigator.share({ title: pl.name, url }).catch(() => {})
      : (navigator.clipboard.writeText(url), W.NotificationSystem?.success('Ссылка скопирована!'));
  }

  _handleSharedPlaylist(b64) {
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!j.n || !Array.isArray(j.u)) throw 1;
      const uids = j.u.filter(u => uid2track(u));
      W.Modals?.confirm({
        title: '🎵 Вам прислан плейлист',
        textHtml: `<b>${esc(j.n)}</b><br><br>Доступно треков: ${uids.length} из ${j.u.length}.${uids.length < j.u.length ? '<br><span style="color:#ff9800">Часть треков недоступна.</span>' : ''}`,
        confirmText: 'Добавить', cancelText: 'Отмена',
        onConfirm: () => {
          const id = Date.now().toString(36);
          const snap = { order: [...uids], hidden: [] };
          Store.savePlaylist({ id, name: j.n + ' (Присланный)', order: [...uids], hidden: [], sortMode: 'user', color: '', creationSnapshot: JSON.parse(JSON.stringify(snap)), createdAt: Date.now() });
          W.NotificationSystem?.success('Плейлист добавлен');
          this.renderTab();
        }
      });
    } catch { W.NotificationSystem?.error('Ошибка чтения ссылки'); }
  }

  /* ── Playlist rename ── */
  _renamePl(id) {
    const pl = Store.getPlaylist(id);
    if (!pl) return;
    const m = W.Modals?.open({ title: 'Переименовать', bodyHtml: `<input type="text" id="rnm-inp" value="${esc(pl.name)}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="rnm-save">Сохранить</button>` });
    if (!m) return;
    setTimeout(() => m.querySelector('#rnm-inp')?.select(), 50);
    m.querySelector('#rnm-save').onclick = () => {
      const n = m.querySelector('#rnm-inp')?.value.trim();
      if (n) { pl.name = n; Store.savePlaylist(pl); this._renderPls(); m.remove(); }
    };
  }

  /* ── Ask playlist name helper ── */
  _askPlaylistName(cb) {
    const n = Store.getPlaylists().length + 1;
    const m = W.Modals?.open({ title: 'Новый плейлист', bodyHtml: `<input type="text" id="pl-name-inp" value="Мой плейлист ${n}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="pl-name-save">Создать</button>` });
    if (!m) return;
    setTimeout(() => m.querySelector('#pl-name-inp')?.select(), 50);
    m.querySelector('#pl-name-save').onclick = () => { const v = m.querySelector('#pl-name-inp')?.value.trim(); if (v) { m.remove(); cb(v); } };
  }

  /* ── Status bar ── */
  _updStatus(cnt, isSearch = false) {
    const s = $('sc-status');
    if (!s) return;
    const all = D.querySelectorAll('.showcase-track');
    const favs = D.querySelectorAll('.showcase-track .like-star[src*="star.png"]').length;
    const pins = D.querySelectorAll('.showcase-track .offline-ind:not(.offline-ind--none)').length;
    const clouds = Array.from(D.querySelectorAll('.showcase-track .offline-ind')).filter(n => (n?.textContent || '').trim() === '☁').length;
    const ui = Store.getUI();

    s.innerHTML = `
      <span>📋 ${cnt ?? all.length} · ⭐ ${favs} · 🔒 ${pins} · ☁ ${clouds}${this._editMode && D.querySelectorAll('.sc-checked').length ? `<span style="color:#ff9800"> · ✓ ${D.querySelectorAll('.sc-checked').length}</span>` : ''}</span>
      <span style="display:flex;gap:12px;align-items:center">
        <span id="sc-tg-hidden" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${ui.showHidden ? '👁' : '🙈'}</span>
        <span id="sc-tg-numbers" style="cursor:pointer;font-size:18px;min-width:42px;display:inline-flex;align-items:center;justify-content:center" title="Нумерация">${ui.showNumbers ? '1,2,3' : ''}</span>
        <span id="sc-tg-view" style="cursor:pointer;font-size:18px" title="Вид">${ui.viewMode === 'flat' ? '⊞' : '⊟'}</span>
        <span id="sc-tg-placement" style="cursor:pointer;font-size:14px" title="Скрытые в конце">${ui.hiddenPlacement === 'end' ? '↓скр' : '≡скр'}</span>
      </span>`;
  }

  /* ── Highlight current track ── */
  _hiTrack(uid) {
    D.querySelectorAll('.showcase-track.current').forEach(e => e.classList.remove('current'));
    if (uid) D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(uid)}"]`).forEach(e => e.classList.add('current'));
  }

  /* ── Public API (used by AlbumsManager, app.js, PlayerUI) ── */
  playContext(uid = null) { return this._playCtx(uid); }
  handleSharedPlaylist(b64) { return this._handleSharedPlaylist(b64); }
  openColorPicker(el, aKey, pId) { return this.opnCol(null, aKey, pId); }
}

/* ─── Global export ─── */
W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

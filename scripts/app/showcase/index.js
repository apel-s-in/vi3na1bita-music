/**
 * scripts/app/showcase/index.js
 * Showcase «Витрина Разбита» — compact stable rebuild v3.1
 */

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils, ls = localStorage;
const NS = 'sc3:', PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const $ = id => D.getElementById(id), esc = s => U.escapeHtml(String(s ?? ''));
const jGet = (k, d = null) => { try { const v = ls.getItem(NS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const jSet = (k, v) => { try { ls.setItem(NS + k, JSON.stringify(v)); } catch {} };
const uid2track = u => W.TrackRegistry?.getTrackByUid?.(u) || null;
const albumTitle = k => W.TrackRegistry?.getAlbumTitle?.(k) || k || '';
const deep = v => JSON.parse(JSON.stringify(v));
const isDef = id => id === '__default__';
const uidEsc = u => CSS.escape(String(u || ''));
const randShuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

function getAlbumReleaseOrderMap() {
  const map = new Map();
  const idx = W.albumsIndex || [];
  [...idx].reverse().forEach((a, i) => {
    const k = String(a?.key || '');
    if (k && !k.startsWith('__')) map.set(k, i);
  });
  return map;
}
function getCatalogOrder() {
  const idx = W.albumsIndex || [], out = [];
  [...idx].reverse().forEach(a => {
    if (String(a.key || '').startsWith('__')) return;
    (W.TrackRegistry?.getTracksForAlbum?.(a.key) || []).forEach(t => t?.uid && out.push(t.uid));
  });
  return out;
}
function normalizeOrder(order, fallbackOrder) {
  const fb = Array.isArray(fallbackOrder) ? fallbackOrder.filter(uid2track) : [];
  const seen = new Set(), out = [];
  (Array.isArray(order) ? order : []).forEach(u => {
    const uid = String(u || '').trim();
    if (uid && uid2track(uid) && !seen.has(uid)) { seen.add(uid); out.push(uid); }
  });
  fb.forEach(u => { if (!seen.has(u)) { seen.add(u); out.push(u); } });
  return out;
}
function normalizeHidden(hidden, order) {
  const allowed = new Set(Array.isArray(order) ? order : []);
  const out = [];
  (Array.isArray(hidden) ? hidden : []).forEach(u => {
    const uid = String(u || '').trim();
    if (uid && allowed.has(uid) && uid2track(uid) && !out.includes(uid)) out.push(uid);
  });
  return out;
}
function normalizeCtxState(ctx, { isDefault = false, fallbackOrder = getCatalogOrder() } = {}) {
  const base = ctx && typeof ctx === 'object' ? deep(ctx) : {};
  const order = normalizeOrder(base.order, fallbackOrder);
  const hidden = normalizeHidden(base.hidden, order);
  return {
    ...base,
    order,
    hidden,
    sortMode: String(base.sortMode || 'user'),
    hiddenPlacement: String(base.hiddenPlacement || 'inline'),
    ...(isDefault ? {} : { creationSnapshot: base.creationSnapshot && typeof base.creationSnapshot === 'object' ? {
      order: normalizeOrder(base.creationSnapshot.order, order),
      hidden: normalizeHidden(base.creationSnapshot.hidden, normalizeOrder(base.creationSnapshot.order, order))
    } : { order: [...order], hidden: [...hidden] } })
  };
}
function stateSig({ order = [], hidden = [] } = {}) {
  return JSON.stringify({ order: [...order], hidden: [...hidden] });
}
function buildTrackObj(uid, coverFallback) {
  const t = uid2track(uid);
  if (!t) return null;
  let cover = coverFallback || 'img/logo.png';
  const icon = W.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(i => i.key === t.sourceAlbum)?.icon;
  if (icon) {
    cover = icon;
    if (U.isMobile?.() && /\/icon_album\/[^/]+\.png$/i.test(cover)) {
      const m = cover.match(/\/icon_album\/([^/]+)\.png$/i);
      if (m) cover = `img/icon_album/mobile/${m[1]}@1x.jpg`;
    }
  }
  return { ...t, album: 'Витрина Разбита', cover };
}

const Store = {
  getDefault() { return jGet('default', null); },
  setDefault(v) { jSet('default', normalizeCtxState(v, { isDefault: true })); },
  getPlaylists() {
    return (jGet('playlists', []) || [])
      .filter(p => p && typeof p === 'object' && p.id)
      .map(p => normalizeCtxState(p, { isDefault: false, fallbackOrder: Array.isArray(p.order) ? p.order : getCatalogOrder() }));
  },
  setPlaylists(v) { jSet('playlists', (Array.isArray(v) ? v : []).map(p => normalizeCtxState(p, { isDefault: false, fallbackOrder: Array.isArray(p?.order) ? p.order : getCatalogOrder() }))); },
  getPlaylist(id) { return this.getPlaylists().find(p => p.id === id) || null; },
  savePlaylist(pl) {
    const norm = normalizeCtxState(pl, { isDefault: false, fallbackOrder: Array.isArray(pl?.order) ? pl.order : getCatalogOrder() });
    const arr = this.getPlaylists(), i = arr.findIndex(x => x.id === norm.id);
    if (i >= 0) arr[i] = norm; else arr.push(norm);
    this.setPlaylists(arr);
  },
  deletePlaylist(id) { this.setPlaylists(this.getPlaylists().filter(p => p.id !== id)); },
  getActiveId() { return jGet('activeId', '__default__'); },
  setActiveId(id) { jSet('activeId', id); },
  getUI() { return jGet('ui', { viewMode: 'flat', showNumbers: false, showHidden: false, hiddenPlacement: 'inline' }); },
  setUI(v) { jSet('ui', v); },
  getAlbumColors() { return jGet('albumColors', {}); },
  setAlbumColors(v) { jSet('albumColors', v); },
  makeDefaultBaseline() { return normalizeCtxState({ order: getCatalogOrder(), hidden: [], sortMode: 'user', hiddenPlacement: 'inline' }, { isDefault: true }); },
  getOrCreateDefault() {
    const ctx = normalizeCtxState(this.getDefault(), { isDefault: true, fallbackOrder: getCatalogOrder() });
    this.setDefault(ctx.order.length ? ctx : this.makeDefaultBaseline());
    return this.getDefault() ? normalizeCtxState(this.getDefault(), { isDefault: true, fallbackOrder: getCatalogOrder() }) : this.makeDefaultBaseline();
  }
};

class Draft {
  constructor(id) {
    this.contextId = id;
    this.isDefault = isDef(id);
    const src = this.isDefault ? Store.getOrCreateDefault() : Store.getPlaylist(id);
    this.baseline = normalizeCtxState(src, { isDefault: this.isDefault, fallbackOrder: this.isDefault ? getCatalogOrder() : (src?.creationSnapshot?.order || src?.order || getCatalogOrder()) });
    this.order = [...(this.baseline?.order || [])];
    this.hidden = new Set(this.baseline?.hidden || []);
    this.checked = new Set(this.isDefault ? this.order.filter(u => !this.hidden.has(u)) : this.order);
  }
  markDirty() {}
  isDirty() {
    const cur = {
      order: [...this.order].filter(uid2track),
      hidden: [...this.hidden].filter(uid2track)
    };
    if (!this.isDefault) cur.order = cur.order.filter(u => this.checked.has(u));
    if (!this.isDefault) cur.hidden = cur.hidden.filter(u => this.checked.has(u));
    return stateSig(cur) !== stateSig(this.baseline);
  }
  toggleHidden(uid) {
    if (this.hidden.has(uid)) { this.hidden.delete(uid); this.checked.add(uid); }
    else { this.hidden.add(uid); this.checked.delete(uid); }
    this.markDirty();
  }
  toggleChecked(uid) {
    if (this.checked.has(uid)) { this.checked.delete(uid); if (this.isDefault) this.hidden.add(uid); }
    else { this.checked.add(uid); if (this.isDefault) this.hidden.delete(uid); }
    this.markDirty();
  }
  setOrder(arr) { this.order = [...arr]; this.markDirty(); }
  applyReset() {
    const b = this.isDefault ? Store.makeDefaultBaseline() : normalizeCtxState(this.baseline, { isDefault: false, fallbackOrder: this.baseline?.creationSnapshot?.order || this.baseline?.order || getCatalogOrder() });
    this.order = [...(b.order || [])];
    this.hidden = new Set(b.hidden || []);
    this.checked = new Set(this.isDefault ? this.order.filter(u => !this.hidden.has(u)) : this.order);
  }
  getEditList() {
    if (!this.isDefault) return [...this.order];
    const cat = getCatalogOrder(), set = new Set(cat), out = this.order.filter(u => set.has(u)), ex = new Set(out);
    cat.forEach(u => !ex.has(u) && out.push(u));
    return out;
  }
}

class ShowcaseManager {
  constructor() {
    this._draft = null;
    this._editMode = false;
    this._searchQ = '';
    this._searchResults = [];
    this._searchChecked = new Set();
    this._renderTok = 0;
    this._menu = null;
    this._scrollMem = new Map();
  }

  async initialize() {
    await W.TrackRegistry?.ensurePopulated?.();
    Store.getOrCreateDefault();
    W.playerCore?.onFavoritesChanged?.(({ uid }) => {
      if (W.AlbumsManager?.getCurrentAlbum?.() !== '__showcase__') return;
      D.querySelectorAll(`.showcase-track[data-uid="${uidEsc(uid)}"] .like-star`).forEach(el => el.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png');
      this._updStatus();
    });
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum?.() === '__showcase__' && W.OfflineIndicators?.refreshAllIndicators?.());
  }

  _ctxId() { return Store.getActiveId(); }
  _ctx() { const id = this._ctxId(); return isDef(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id); }
  _ctxName(id = this._ctxId()) { return isDef(id) ? 'Все треки' : (Store.getPlaylist(id)?.name || 'Плейлист'); }

  _cleanupUi() {
    try { $('sc-search-sticky')?.remove(); } catch {}
    try { this._menu?.remove(); } catch {}
    this._menu = null;
  }
  _saveScroll(id) {
    const el = $('track-list'); if (!el || !id) return;
    const v = el.scrollTop || 0; this._scrollMem.set(id, v); jSet(`scroll_${id}`, v);
  }
  _restoreScroll(id) {
    const el = $('track-list'); if (!el || !id) return;
    const v = this._scrollMem.has(id) ? this._scrollMem.get(id) : Number(jGet(`scroll_${id}`, 0) || 0);
    el.scrollTop = Math.max(0, Number(v) || 0);
  }
  _markLastPlayed(uid, id = this._ctxId()) { jSet(isDef(id) ? 'lastUid_default' : `lastUid_${id}`, uid); }

  _hasDefaultChanges() {
    const a = Store.getOrCreateDefault(), b = Store.makeDefaultBaseline();
    return JSON.stringify(a.order || []) !== JSON.stringify(b.order || []) || JSON.stringify(a.hidden || []) !== JSON.stringify(b.hidden || []);
  }
  _isHiddenInCtx(uid, id = this._ctxId()) {
    const ctx = isDef(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id);
    return !!ctx?.hidden?.includes(uid);
  }
  _toggleHiddenInCtx(uid, id = this._ctxId()) {
    const ctx = isDef(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id);
    if (!ctx) return;
    const hs = new Set(ctx.hidden || []);
    if (hs.has(uid)) hs.delete(uid); else hs.add(uid);
    ctx.hidden = [...hs];
    isDef(id) ? Store.setDefault(ctx) : Store.savePlaylist(ctx);
    this.renderTab();
  }

  getActiveListTracks() {
    const ctx = this._ctx(), hidden = new Set(ctx?.hidden || []);
    return (ctx?.order || []).filter(u => !hidden.has(u) && uid2track(u)).map(u => buildTrackObj(u)).filter(Boolean);
  }

  async _sortedViewOrder(ctx) {
    let order = [...(ctx?.order || [])].filter(uid2track), sm = ctx?.sortMode || 'user';
    if (sm === 'user') return order;
    const tracks = order.map(uid2track).filter(Boolean);
    if (sm === 'plays-desc' || sm === 'plays-asc' || sm === 'last-played') {
      try {
        const { metaDB } = await import('../../analytics/meta-db.js');
        const stats = await metaDB.getAllStats();
        const map = new Map(stats.filter(s => s.uid !== 'global').map(s => [s.uid, s]));
        const f = {
          'plays-desc': (a, b) => (map.get(b.uid)?.globalFullListenCount || 0) - (map.get(a.uid)?.globalFullListenCount || 0),
          'plays-asc': (a, b) => (map.get(a.uid)?.globalFullListenCount || 0) - (map.get(b.uid)?.globalFullListenCount || 0),
          'last-played': (a, b) => (map.get(b.uid)?.lastPlayedAt || 0) - (map.get(a.uid)?.lastPlayedAt || 0)
        }[sm];
        tracks.sort(f);
      } catch {}
    } else {
      const relMap = getAlbumReleaseOrderMap();
      const relOrd = (k) => relMap.get(String(k || '')) ?? 9999;
      const f = {
        'name-asc': (a, b) => a.title.localeCompare(b.title),
        'name-desc': (a, b) => b.title.localeCompare(a.title),
        'album-asc': (a, b) => relOrd(b.sourceAlbum) - relOrd(a.sourceAlbum) || a.title.localeCompare(b.title),
        'album-desc': (a, b) => relOrd(a.sourceAlbum) - relOrd(b.sourceAlbum) || a.title.localeCompare(b.title),
        'favorites-first': (a, b) => (W.playerCore?.isFavorite?.(b.uid) ? 1 : 0) - (W.playerCore?.isFavorite?.(a.uid) ? 1 : 0)
      }[sm];
      f && tracks.sort(f);
    }
    return tracks.map(t => t.uid);
  }

  async _getDisplayData() {
    const ctx = this._ctx(), ui = Store.getUI(), hidden = new Set(ctx?.hidden || []);
    if (this._editMode) return { type: 'edit', uids: this._draft?.getEditList?.() || [] };
    if (this._searchQ) {
      await ensureLyricsIndexLoaded();
      const res = searchUidsByQuery({ query: this._searchQ }) || [];
      this._searchResults = res.filter(uid2track);
      return { type: 'search', results: this._searchResults, ctxOrder: ctx?.order || [], ctxHidden: hidden };
    }
    this._searchResults = [];
    let order = await this._sortedViewOrder(ctx);
    if (ui.hiddenPlacement === 'end') order = [...order.filter(u => !hidden.has(u)), ...order.filter(u => hidden.has(u))];
    if (!ui.showHidden) order = order.filter(u => !hidden.has(u));
    return { type: 'normal', uids: order, hidden };
  }

  _headerHtml(ctx, ui, id) {
    const sm = ctx?.sortMode || 'user', showReset = isDef(id) && this._hasDefaultChanges(), canResetEdit = !!this._draft?.isDirty?.();
    return `
      <div class="showcase-header-controls">
        ${this._editMode ? `
          <div class="sc-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ
            <div class="sc-edit-actions">
              <button class="showcase-btn sc-btn-save" style="background:#4caf50;color:#fff;">💾 Сохранить</button>
              <button class="showcase-btn sc-btn-create" style="background:#4daaff;color:#fff;">✨ Создать</button>
              <button class="showcase-btn sc-btn-reset ${canResetEdit ? '' : 'sc-btn-disabled'}" style="border-color:#ff9800;" ${canResetEdit ? '' : 'disabled'}>↺ Сброс</button>
              <button class="showcase-btn sc-btn-exit" style="border-color:#ff6b6b;">✕ Выйти</button>
            </div>
          </div>` : ''}
        <div class="showcase-search-wrap">
          <input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему каталогу..." value="${esc(this._searchQ)}">
          <button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this._searchQ ? '' : 'none'}">✕</button>
        </div>
        ${!this._editMode ? `
          <div class="showcase-btns-row">
            <button class="showcase-btn sc-btn-edit">✏️ Редактировать</button>
            ${showReset ? `<button class="showcase-btn sc-btn-master-reset" style="flex:.5">↺ Сброс</button>` : ''}
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

  async renderTab() {
    const list = $('track-list'); if (!list) return;
    const prev = list.dataset.scCtxId; if (prev) this._saveScroll(prev);
    const tok = ++this._renderTok, id = this._ctxId(), ctx = this._ctx(), ui = Store.getUI();
    this._cleanupUi();
    list.dataset.scCtxId = id;
    list.innerHTML = this._headerHtml(ctx, ui, id);
    this._bindRoot(list);
    this._renderPlaylists();
    await this._renderBody(tok);
    if (!this._editMode) this._hiTrack(jGet(isDef(id) ? 'lastUid_default' : `lastUid_${id}`, ''));
    requestAnimationFrame(() => this._restoreScroll(id));
  }

  async _renderBody(tok) {
    const c = $('sc-tracks-container'); if (!c) return;
    const data = await this._getDisplayData();
    if (tok !== this._renderTok) return;
    if (data.type === 'edit') return this._renderEdit(c, data.uids);
    if (data.type === 'search') return this._renderSearch(c, data);
    return this._renderNormal(c, data);
  }

  _trackRow(t, i, { isHidden = false, showNumbers = false, color = 'transparent', search = false, checked = false, badge = '' } = {}) {
    return `<div class="showcase-track ${isHidden ? 'inactive' : ''} ${search ? 'sc-search-result' : ''}" data-uid="${t.uid}" style="border-left:3px solid ${color}">
      <div class="tnum" ${showNumbers ? '' : 'style="display:none"'}>${i + 1}.</div>
      <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
      <div class="track-title">
        <div>${esc(t.title)}</div>
        <div class="showcase-track-meta">${esc(albumTitle(t.sourceAlbum))}${badge ? ` ${badge}` : ''}</div>
      </div>
      ${search ? `<input type="checkbox" class="sc-search-chk" data-uid="${t.uid}" ${checked ? 'checked' : ''}>` : `<span class="offline-ind" data-uid="${t.uid}">🔒</span><img src="${W.playerCore?.isFavorite?.(t.uid) ? 'img/star.png' : 'img/star2.png'}" class="like-star" data-uid="${t.uid}" data-album="${t.sourceAlbum}">`}
      <button class="showcase-track-menu-btn" data-uid="${t.uid}">···</button>
    </div>`;
  }

  _renderNormal(c, { uids, hidden }) {
    const ui = Store.getUI(), cols = Store.getAlbumColors();
    let h = '', grp = null;
    uids.forEach((u, i) => {
      const t = buildTrackObj(u); if (!t) return;
      if (ui.viewMode === 'grouped' && grp !== t.sourceAlbum) { grp = t.sourceAlbum; h += `<div class="showcase-group-header">── ${esc(albumTitle(t.sourceAlbum))} ──</div>`; }
      h += this._trackRow(t, i, { isHidden: hidden?.has(u), showNumbers: ui.showNumbers, color: cols[t.sourceAlbum] || 'transparent' });
    });
    c.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
    W.OfflineIndicators?.injectOfflineIndicators?.(c);
    this._hiTrack(W.playerCore?.getCurrentTrackUid?.());
    this._updStatus(uids.length, false);
  }

  _renderSearch(c, { results, ctxOrder, ctxHidden }) {
    const ctxSet = new Set(ctxOrder || []);
    let h = `<div class="sc-search-info">Найдено: ${results.length} треков</div>`;
    results.forEach((u, i) => {
      const t = buildTrackObj(u); if (!t) return;
      const inCtx = ctxSet.has(u), hid = ctxHidden?.has(u);
      const badge = inCtx ? (hid ? '<span class="sc-badge sc-badge-hidden">скрыт</span>' : '<span class="sc-badge sc-badge-active">уже есть</span>') : '<span class="sc-badge sc-badge-missing">добавить?</span>';
      h += this._trackRow(t, i, { search: true, checked: this._searchChecked.has(u), badge });
    });
    c.innerHTML = h || '<div class="fav-empty">Ничего не найдено</div>';
    this._renderSearchSticky();
    this._updStatus(results.length, true);
  }

  _renderSearchSticky() {
    $('sc-search-sticky')?.remove();
    if (!this._searchChecked.size) return;
    const bar = D.createElement('div');
    bar.id = 'sc-search-sticky';
    bar.className = 'showcase-sticky-bar';
    bar.innerHTML = `<span>Выбрано: ${this._searchChecked.size}</span>
      <button class="showcase-btn sc-search-add">➕ Добавить</button>
      <button class="showcase-btn sc-search-create" style="background:#4daaff;color:#fff;">✨ Создать</button>
      <button class="showcase-btn" id="sc-search-clear-query">🧹 Очистить поиск</button>
      <button class="showcase-btn" id="sc-search-clear-selection">✕ Снять</button>`;
    D.body.appendChild(bar);
  }

  _renderEdit(c, uids) {
    let h = '';
    uids.forEach(u => {
      const t = buildTrackObj(u); if (!t) return;
      const isH = this._draft.hidden.has(u), isC = this._draft.checked.has(u), meta = `${esc(albumTitle(t.sourceAlbum))}${!isC && !this._draft.isDefault ? ' · будет удалён' : (isH && isC && !this._draft.isDefault ? ' · скрыт' : '')}`;
      h += `<div class="showcase-track sc-edit-row ${isH ? 'inactive' : ''} ${isC ? 'sc-checked' : ''} ${!isC && !this._draft.isDefault ? 'sc-will-remove' : ''}" data-uid="${u}" draggable="true">
        <button class="sc-arrow-up">▲</button>
        <div class="showcase-drag-handle">⠿</div>
        <input type="checkbox" class="sc-chk" ${isC ? 'checked' : ''}>
        <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
        <div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${meta}</div></div>
        <button class="sc-eye-btn" title="Показать/Скрыть">${isH ? '🙈' : '👁'}</button>
        <button class="sc-arrow-down">▼</button>
      </div>`;
    });
    c.innerHTML = h || '<div class="fav-empty">Нет треков</div>';
    this._bindDrag(c);
    this._updStatus(uids.filter(u => !this._draft.hidden.has(u)).length, false);
  }

  _renderPlaylists() {
    const act = $('sc-playlists-actions'), lst = $('sc-playlists'); if (!act || !lst) return;
    const id = this._ctxId(), pls = Store.getPlaylists();
    act.innerHTML = `<button class="sc-pl-action ${isDef(id) ? 'active' : ''}" id="sc-pl-all">Все треки</button><button class="sc-pl-action" id="sc-pl-pst" title="Вставить ссылку">📋</button>`;
    lst.innerHTML = !pls.length ? '<div class="sc-pl-empty">Плейлистов пока нет</div>' : pls.map(p => `
      <div class="sc-pl-row ${id === p.id ? 'active' : ''}" data-pid="${p.id}" ${p.color ? `style="--pl-color:${p.color};"` : ''}>
        <div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span></div>
        <div class="sc-pl-right">
          <button class="sc-pl-btn" data-act="rename" data-pid="${p.id}" title="Переименовать">✏️</button>
          <button class="sc-pl-btn" data-act="shr" data-pid="${p.id}" title="Поделиться">🔗</button>
          <button class="sc-pl-btn" data-act="col" data-pid="${p.id}" title="Цвет">🎨</button>
          <button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}" title="Удалить">✖</button>
        </div>
      </div>`).join('');
  }

  _statusState(cnt, isSearch = false) {
    const ctx = this._ctx(), allOrder = (ctx?.order || []).filter(uid2track), hidden = new Set(ctx?.hidden || []);
    const all = allOrder.length, hid = allOrder.filter(u => hidden.has(u)).length, active = all - hid, checked = this._editMode ? (this._draft?.checked?.size || 0) : this._searchChecked.size;
    return { all, active, hidden: hid, found: Number(cnt || 0), checked, isSearch };
  }
  _updStatus(cnt, isSearch = false) {
    const s = $('sc-status'); if (!s) return;
    const ui = Store.getUI(), st = this._statusState(cnt, isSearch);
    s.innerHTML = `
      <span>📋 ${isSearch ? `${st.found} найдено` : `${st.all} всего · ${st.active} активных · ${st.hidden} скрытых`}${st.checked ? `<span style="color:#ff9800"> · ✓ ${st.checked}</span>` : ''}</span>
      <span style="display:flex;gap:12px;align-items:center">
        <span id="sc-tg-hidden" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${ui.showHidden ? '👁' : '🙈'}</span>
        <span id="sc-tg-numbers" style="cursor:pointer;font-size:18px;min-width:42px;display:inline-flex;align-items:center;justify-content:center;opacity:${ui.showNumbers ? '1' : '.72'}" title="Нумерация">1,2,3</span>
        <span id="sc-tg-view" style="cursor:pointer;font-size:18px" title="Вид">${ui.viewMode === 'flat' ? '⊞' : '⊟'}</span>
        <span id="sc-tg-placement" style="cursor:pointer;font-size:14px" title="Скрытые в конце">${ui.hiddenPlacement === 'end' ? '↓скр' : '≡скр'}</span>
      </span>`;
  }

  _hiTrack(uid) {
    D.querySelectorAll('.showcase-track.current').forEach(el => el.classList.remove('current'));
    if (!uid) return;
    D.querySelectorAll(`.showcase-track[data-uid="${uidEsc(uid)}"]`).forEach(el => el.classList.add('current'));
  }

  _bindRoot(root) {
    if (root._scClick) root.removeEventListener('click', root._scClick);
    root._scClick = e => this._onClick(e);
    root.addEventListener('click', root._scClick);

    const inp = $('sc-search'), clr = $('sc-search-clear');
    if (inp) {
      if (inp._scInput) inp.removeEventListener('input', inp._scInput);
      inp._scInput = U.func.debounceFrame(async () => {
        this._searchQ = inp.value.trim();
        this._searchChecked.clear();
        if (clr) clr.style.display = this._searchQ ? '' : 'none';
        this._cleanupUi();
        await this._renderBody(++this._renderTok);
      });
      inp.addEventListener('input', inp._scInput);
      inp.addEventListener('keydown', e => e.key === 'Enter' && inp.blur());
    }
    if (clr) {
      if (clr._scClear) clr.removeEventListener('click', clr._scClear);
      clr._scClear = () => {
        if (inp) inp.value = '';
        this._searchQ = '';
        this._searchChecked.clear();
        this._cleanupUi();
        clr.style.display = 'none';
        this._renderBody(++this._renderTok);
      };
      clr.addEventListener('click', clr._scClear);
    }
  }

  async _onClick(e) {
    const t = e.target, btn = t.closest('button,[data-act],[data-pid],#sc-tg-hidden,#sc-tg-numbers,#sc-tg-view,#sc-tg-placement,.sc-search-chk,.showcase-track,.sc-pl-row,.like-star,.offline-ind');
    if (!btn) return;

    if (btn.id === 'sc-pl-all') return this._switchCtx('__default__');
    if (btn.id === 'sc-pl-pst') {
      return navigator.clipboard.readText().then(v => this._handleSharedPlaylist(new URLSearchParams(v.split('?')[1] || v).get('playlist') || v)).catch(() => W.NotificationSystem?.error('Ошибка буфера'));
    }

    const act = btn.dataset?.act, pid = btn.dataset?.pid;
    if (act && pid) {
      if (act === 'rename') return this._renamePl(pid);
      if (act === 'shr') return this._sharePl(pid);
      if (act === 'col') return this.opnCol(null, null, pid);
      if (act === 'del') return W.Modals?.confirm({ title: 'Удалить плейлист?', confirmText: 'Да', onConfirm: () => { Store.deletePlaylist(pid); this._ctxId() === pid ? this._switchCtx('__default__') : this.renderTab(); } });
    }
    const rowPl = t.closest('.sc-pl-row'); if (rowPl?.dataset.pid && !act) return this._switchCtx(rowPl.dataset.pid);

    if (btn.classList?.contains('sc-btn-edit')) return this._enterEdit();
    if (btn.classList?.contains('sc-btn-save')) return this._saveEdit();
    if (btn.classList?.contains('sc-btn-create')) return this._createFromEdit();
    if (btn.classList?.contains('sc-btn-reset')) return this._resetEdit();
    if (btn.classList?.contains('sc-btn-exit')) return this._exitEdit();
    if (btn.classList?.contains('sc-btn-master-reset')) return this._masterReset();
    if (btn.classList?.contains('sc-btn-playall')) return this._playCtx();
    if (btn.classList?.contains('sc-btn-shuffle')) return this._playCtxShuffle();
    if (btn.classList?.contains('sc-btn-sort')) return this._openSort();

    if (btn.id === 'sc-tg-hidden') { const ui = Store.getUI(); ui.showHidden = !ui.showHidden; Store.setUI(ui); return this._renderBody(++this._renderTok); }
    if (btn.id === 'sc-tg-numbers') { const ui = Store.getUI(); ui.showNumbers = !ui.showNumbers; Store.setUI(ui); return this._renderBody(++this._renderTok); }
    if (btn.id === 'sc-tg-view') { const ui = Store.getUI(); ui.viewMode = ui.viewMode === 'flat' ? 'grouped' : 'flat'; Store.setUI(ui); return this._renderBody(++this._renderTok); }
    if (btn.id === 'sc-tg-placement') { const ui = Store.getUI(); ui.hiddenPlacement = ui.hiddenPlacement === 'inline' ? 'end' : 'inline'; Store.setUI(ui); return this._renderBody(++this._renderTok); }

    if (btn.classList?.contains('sc-search-add')) return this._addSearchCheckedToCtx();
    if (btn.classList?.contains('sc-search-create')) return this._createFromSearchChecked();
    if (btn.id === 'sc-search-clear-selection') { this._searchChecked.clear(); this._renderSearchSticky(); return this._updStatus(this._searchResults.length, true); }
    if (btn.id === 'sc-search-clear-query') {
      const inp = $('sc-search'); if (inp) inp.value = '';
      this._searchQ = ''; this._searchChecked.clear(); this._cleanupUi();
      return this._renderBody(++this._renderTok);
    }

    if (this._editMode) return this._handleEditClick(e);
    if (t.closest('.like-star')) return;
    if (t.closest('.offline-ind')) return;

    const row = t.closest('.showcase-track'), uid = row?.dataset.uid;
    if (!uid) return;

    if (this._searchQ) {
      if (t.classList?.contains('sc-search-chk')) {
        t.checked ? this._searchChecked.add(uid) : this._searchChecked.delete(uid);
        this._renderSearchSticky();
        return this._updStatus(this._searchResults.length, true);
      }
      return this._openMenu(uid, true);
    }
    if (t.closest('.showcase-track-menu-btn')) return this._openMenu(uid, false);
    return this._playCtx(uid);
  }

  _handleEditClick(e) {
    const row = e.target.closest('.sc-edit-row'), uid = row?.dataset.uid; if (!uid || !this._draft) return;
    if (e.target.classList.contains('sc-chk')) this._draft.toggleChecked(uid);
    else if (e.target.closest('.sc-eye-btn')) this._draft.toggleHidden(uid);
    else if (e.target.closest('.sc-arrow-up')) return this._moveEdit(uid, -1);
    else if (e.target.closest('.sc-arrow-down')) return this._moveEdit(uid, 1);
    else return;
    this._renderEdit($('sc-tracks-container'), this._draft.getEditList());
  }

  _switchCtx(id) {
    if (this._editMode) return W.NotificationSystem?.warning('Выйдите из режима редактирования');
    this._cleanupUi();
    this._searchChecked.clear();
    Store.setActiveId(id);
    this.renderTab();
  }

  _enterEdit() {
    const id = this._ctxId(), ctx = this._ctx();
    if (!ctx) return;
    this._draft = new Draft(id);
    this._editMode = true;
    this.renderTab();
  }
  _leaveEdit(clean = true) {
    if (clean) this._draft = null;
    this._editMode = false;
    this.renderTab();
  }
  _saveEdit() {
    if (!this._draft) return;
    const id = this._ctxId();
    if (isDef(id)) {
      const ctx = Store.getOrCreateDefault();
      ctx.order = this._draft.order.filter(uid2track);
      ctx.hidden = [...this._draft.hidden].filter(uid2track);
      Store.setDefault(ctx);
    } else {
      const pl = Store.getPlaylist(id); if (!pl) return;
      pl.order = this._draft.order.filter(u => this._draft.checked.has(u) && uid2track(u));
      pl.hidden = [...this._draft.hidden].filter(u => this._draft.checked.has(u) && uid2track(u));
      Store.savePlaylist(pl);
    }
    this._leaveEdit();
    W.NotificationSystem?.success('Сохранено');
  }
  _createFromEdit() {
    if (!this._draft) return;
    const uids = this._draft.order.filter(u => this._draft.checked.has(u) && !this._draft.hidden.has(u) && uid2track(u));
    if (!uids.length) return W.NotificationSystem?.warning('Отметьте треки чекбоксами');
    this._askPlaylistName(name => {
      const id = Date.now().toString(36), snap = { order: [...uids], hidden: [] };
      Store.savePlaylist({ id, name, order: [...uids], hidden: [], sortMode: 'user', color: '', creationSnapshot: deep(snap), createdAt: Date.now() });
      this._draft = null; this._editMode = false; Store.setActiveId(id); this.renderTab();
      W.NotificationSystem?.success(`Плейлист «${name}» создан`);
    });
  }
  _resetEdit() {
    if (!this._draft?.isDirty?.()) return;
    const msg = this._draft.isDefault ? 'Список вернётся к заводскому: все треки, порядок по альбомам. Продолжить?' : 'Плейлист вернётся к состоянию при создании. Продолжить?';
    W.Modals?.confirm({ title: 'Сброс', textHtml: msg, confirmText: 'Сбросить', cancelText: 'Отмена', onConfirm: () => { this._draft.applyReset(); this._renderEdit($('sc-tracks-container'), this._draft.getEditList()); } });
  }
  _exitEdit() {
    if (!this._draft?.isDirty?.()) return this._leaveEdit();
    W.Modals?.confirm({ title: 'Выйти без сохранения?', textHtml: 'Изменения не будут сохранены.', confirmText: 'Выйти', cancelText: 'Отмена', onConfirm: () => this._leaveEdit() });
  }
  _masterReset() {
    W.Modals?.confirm({
      title: 'Сбросить «Все треки»?',
      textHtml: 'Порядок вернётся к заводскому, все скрытые треки станут видимыми.',
      confirmText: 'Сбросить', cancelText: 'Отмена',
      onConfirm: () => { Store.setDefault(Store.makeDefaultBaseline()); this.renderTab(); }
    });
  }

  _moveEdit(uid, dir) {
    const arr = this._draft.order, i = arr.indexOf(uid), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this._draft.markDirty();
    this._renderEdit($('sc-tracks-container'), this._draft.getEditList());
  }
  _saveEditOrderFromDom() {
    const uids = [...D.querySelectorAll('.sc-edit-row')].map(el => el.dataset.uid).filter(Boolean);
    this._draft?.setOrder(uids);
  }
  _bindDrag(c) {
    if (c._scDrag) return;
    c._scDrag = 1;
    c.addEventListener('dragstart', e => {
      const row = e.target.closest('.sc-edit-row'); if (!row) return;
      e.dataTransfer.setData('text/plain', row.dataset.uid);
      row.classList.add('is-dragging');
    });
    c.addEventListener('dragover', e => { e.preventDefault(); e.target.closest('.sc-edit-row')?.classList.add('drag-over'); });
    c.addEventListener('dragleave', e => e.target.closest('.sc-edit-row')?.classList.remove('drag-over'));
    c.addEventListener('drop', e => {
      e.preventDefault();
      const to = e.target.closest('.sc-edit-row'), uid = e.dataTransfer.getData('text/plain');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      const from = uid ? c.querySelector(`.sc-edit-row[data-uid="${uidEsc(uid)}"]`) : null;
      if (to && from && to !== from) { to.before(from); this._saveEditOrderFromDom(); }
    });
    c.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging')));
  }

  _playCtx(uid = null) {
    const id = this._ctxId(), key = isDef(id) ? '__showcase__' : `__showcase__:${id}`, trks = this.getActiveListTracks();
    if (!trks.length) return;
    const idx = uid ? Math.max(0, trks.findIndex(t => t.uid === uid)) : 0;
    W.AlbumsManager?.setPlayingAlbum?.(key);
    W.playerCore?.setPlaylist?.(trks, idx, null, { preservePosition: false });
    W.playerCore?.play?.(idx);
    W.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
    this._hiTrack(trks[idx]?.uid);
    trks[idx]?.uid && this._markLastPlayed(trks[idx].uid, id);
  }
  _playCtxShuffle() {
    const id = this._ctxId(), key = isDef(id) ? '__showcase__' : `__showcase__:${id}`, trks = randShuffle([...this.getActiveListTracks()]);
    if (!trks.length) return;
    W.AlbumsManager?.setPlayingAlbum?.(key);
    W.playerCore?.setPlaylist?.(trks, 0, null, { preservePosition: false });
    W.playerCore?.play?.(0);
    W.PlayerUI?.ensurePlayerBlock?.(0, { userInitiated: true });
    this._hiTrack(trks[0]?.uid);
    trks[0]?.uid && this._markLastPlayed(trks[0].uid, id);
  }

  _openSort() {
    const id = this._ctxId(), ctx = this._ctx(), sm = ctx?.sortMode || 'user';
    const opts = [['user','👤 Мой порядок'],['name-asc','А→Я'],['name-desc','Я→А'],['album-desc','Альбомы ↓'],['album-asc','Альбомы ↑'],['plays-desc','Топ прослушиваний'],['plays-asc','Меньше всего'],['last-played','Недавние'],['favorites-first','Сначала ⭐']];
    const m = W.Modals?.open({ title: 'Сортировка', bodyHtml: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${opts.map(([v, l]) => `<button class="showcase-btn ${sm === v ? 'active' : ''}" data-val="${v}" style="${v === 'user' ? 'grid-column:1/-1' : ''}">${l}</button>`).join('')}</div>` });
    if (!m) return;
    m.onclick = e => {
      const b = e.target.closest('[data-val]'); if (!b) return;
      const val = b.dataset.val, target = isDef(id) ? Store.getOrCreateDefault() : Store.getPlaylist(id);
      if (!target) return;
      target.sortMode = val;
      isDef(id) ? Store.setDefault(target) : Store.savePlaylist(target);
      m.remove(); this.renderTab();
    };
  }

  _openMenu(uid, fromSearch = false) {
    this._cleanupUi();
    const t = uid2track(uid); if (!t) return;
    const id = this._ctxId(), inPl = !isDef(id) && (Store.getPlaylist(id)?.order || []).includes(uid);
    const bg = D.createElement('div');
    bg.className = 'sc-bottom-sheet-bg';
    bg.innerHTML = `<div class="sc-bottom-sheet">
      <button class="sc-sheet-close">×</button>
      <div class="sc-sheet-title">${esc(t.title)}</div>
      <div class="sc-sheet-sub">${esc(albumTitle(t.sourceAlbum))}</div>
      ${fromSearch ? `<button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><hr style="border-color:rgba(255,255,255,.08);margin:8px 0">` : ''}
      <button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>
      ${inPl ? `<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из плейлиста</button>` : ''}
      <button class="sc-sheet-btn" id="bm-eye">${this._isHiddenInCtx(uid, id) ? `👁 Показать в «${this._ctxName(id)}»` : `🙈 Скрыть в «${this._ctxName(id)}»`}</button>
      <button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite?.(uid) ? '❌ Убрать из Избранного' : '⭐ В Избранное'}</button>
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
    const close = () => { bg.classList.remove('active'); setTimeout(() => bg.remove(), 200); this._menu = null; };
    bg.querySelector('.sc-sheet-close').onclick = close;
    bg.onclick = e => {
      const bid = e.target.id;
      if (e.target === bg || bid === 'bm-cx') return close();
      if (!bid) return;
      close();
      if (bid === 'bm-play') return this._playCtx(uid);
      if (bid === 'bm-pl') return setTimeout(() => this._addToPlaylistModal([uid]), 180);
      if (bid === 'bm-rm') {
        const pl = Store.getPlaylist(id); if (!pl) return;
        pl.order = (pl.order || []).filter(x => x !== uid);
        pl.hidden = (pl.hidden || []).filter(x => x !== uid);
        Store.savePlaylist(pl);
        return this.renderTab();
      }
      if (bid === 'bm-eye') return this._toggleHiddenInCtx(uid, id);
      if (bid === 'bm-fv') return W.playerCore?.toggleFavorite?.(uid, { albumKey: t.sourceAlbum });
      if (bid === 'bm-of') return W.OfflineManager?.togglePinned?.(uid);
      if (bid === 'bm-dl') {
        const a = D.createElement('a');
        U.download.applyDownloadLink(a, buildTrackObj(uid));
        a.href && a.click();
        return;
      }
      if (bid === 'bm-st') return setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(uid), 150);
      if (bid === 'bm-sh') return setTimeout(() => import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', buildTrackObj(uid))), 150);
      if (bid === 'bm-cl') return setTimeout(() => this.opnCol(uid), 150);
    };
  }

  _addToPlaylistModal(uids) {
    const pls = Store.getPlaylists();
    if (!pls.length) return W.NotificationSystem?.warning('Сначала создайте плейлист');
    const m = W.Modals?.open({ title: 'Добавить в плейлист', bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px">${pls.map(p => `<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>` });
    if (!m) return;
    m.onclick = e => {
      const b = e.target.closest('[data-pid]'); if (!b) return;
      const pl = Store.getPlaylist(b.dataset.pid); if (!pl) return;
      const set = new Set(pl.order || []); let added = 0;
      uids.forEach(u => { if (uid2track(u) && !set.has(u)) { pl.order.push(u); set.add(u); added++; } });
      Store.savePlaylist(pl);
      W.NotificationSystem?.success(`Добавлено: ${added}`);
      m.remove();
    };
  }

  _addSearchCheckedToCtx() {
    const id = this._ctxId(), uids = [...this._searchChecked].filter(uid2track);
    if (!uids.length) return;
    const ctx = this._ctx(); if (!ctx) return;
    const orderSet = new Set(ctx.order || []), hidden = new Set(ctx.hidden || []);
    uids.forEach(u => { if (!orderSet.has(u)) { ctx.order.push(u); orderSet.add(u); } hidden.delete(u); });
    ctx.hidden = [...hidden];
    isDef(id) ? Store.setDefault(ctx) : Store.savePlaylist(ctx);
    this._searchQ = ''; this._searchChecked.clear(); this._cleanupUi(); this.renderTab();
    W.NotificationSystem?.success(`Добавлено ${uids.length} треков`);
  }

  _createFromSearchChecked() {
    const uids = [...this._searchChecked].filter(uid2track);
    if (!uids.length) return;
    this._askPlaylistName(name => {
      const id = Date.now().toString(36), snap = { order: [...uids], hidden: [] };
      Store.savePlaylist({ id, name, order: [...uids], hidden: [], sortMode: 'user', color: '', creationSnapshot: deep(snap), createdAt: Date.now() });
      this._searchQ = ''; this._searchChecked.clear(); this._cleanupUi(); Store.setActiveId(id); this.renderTab();
      W.NotificationSystem?.success(`Плейлист «${name}» создан`);
    });
  }

  opnCol(uid = null, albumKey = null, playlistId = null) {
    if (uid && !albumKey) albumKey = uid2track(uid)?.sourceAlbum;
    const cur = playlistId ? (Store.getPlaylist(playlistId)?.color || '') : (Store.getAlbumColors()?.[albumKey] || '');
    const m = W.Modals?.open({
      title: playlistId ? 'Цвет плейлиста' : 'Цвет альбома',
      bodyHtml: `<div class="showcase-color-picker">${PALETTE.map(c => `<div class="showcase-color-dot" style="background:${c};${cur === (c === 'transparent' ? '' : c) ? 'border-color:#fff;' : ''}" data-col="${c}"></div>`).join('')}</div>
      <button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>`
    });
    if (!m) return;
    m.onclick = e => {
      const b = e.target.closest('[data-col]'); if (!b) return;
      const col = b.dataset.col === 'transparent' ? '' : b.dataset.col;
      if (playlistId) {
        const pl = Store.getPlaylist(playlistId); if (!pl) return;
        pl.color = col; Store.savePlaylist(pl); this._renderPlaylists();
      } else if (albumKey) {
        const map = Store.getAlbumColors(); map[albumKey] = col; Store.setAlbumColors(map);
        this._renderBody(++this._renderTok);
      }
      m.remove();
    };
  }

  _sharePl(id) {
    const pl = Store.getPlaylist(id); if (!pl) return;
    const data = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, n: pl.name, u: pl.order || [] }))));
    const url = `${W.location.origin}${W.location.pathname}?playlist=${data}`;
    if (navigator.share) navigator.share({ title: pl.name, url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => W.NotificationSystem?.success('Ссылка скопирована!'));
  }

  _handleSharedPlaylist(b64) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(String(b64).trim()))));
      if (!data?.n || !Array.isArray(data?.u)) throw new Error('bad');
      const uids = data.u.filter(uid2track), miss = data.u.length - uids.length;
      W.Modals?.confirm({
        title: '🎵 Вам прислан плейлист',
        textHtml: `<b>${esc(data.n)}</b><br><br>Доступно треков: ${uids.length} из ${data.u.length}.${miss > 0 ? '<br><span style="color:#ff9800">Часть треков недоступна.</span>' : ''}`,
        confirmText: 'Добавить', cancelText: 'Отмена',
        onConfirm: () => {
          const id = Date.now().toString(36), snap = { order: [...uids], hidden: [] };
          Store.savePlaylist(normalizeCtxState({ id, name: `${data.n} (Присланный)`, order: [...uids], hidden: [], sortMode: 'user', color: '', creationSnapshot: deep(snap), createdAt: Date.now() }, { isDefault: false, fallbackOrder: uids }));
          W.NotificationSystem?.success('Плейлист добавлен');
          this.renderTab();
        }
      });
    } catch { W.NotificationSystem?.error('Ошибка чтения ссылки'); }
  }

  _renamePl(id) {
    const pl = Store.getPlaylist(id); if (!pl) return;
    const m = W.Modals?.open({ title: 'Переименовать', bodyHtml: `<input type="text" id="rnm-inp" value="${esc(pl.name)}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="rnm-save">Сохранить</button>` });
    if (!m) return;
    setTimeout(() => m.querySelector('#rnm-inp')?.select(), 50);
    m.querySelector('#rnm-save').onclick = () => {
      const v = m.querySelector('#rnm-inp')?.value.trim();
      if (!v) return;
      pl.name = v; Store.savePlaylist(pl); this._renderPlaylists(); m.remove();
    };
  }

  _askPlaylistName(cb) {
    const n = Store.getPlaylists().length + 1;
    const m = W.Modals?.open({ title: 'Новый плейлист', bodyHtml: `<input type="text" id="pl-name-inp" value="Мой плейлист ${n}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="pl-name-save">Создать</button>` });
    if (!m) return;
    setTimeout(() => m.querySelector('#pl-name-inp')?.select(), 50);
    m.querySelector('#pl-name-save').onclick = () => {
      const v = m.querySelector('#pl-name-inp')?.value.trim();
      if (!v) return;
      m.remove(); cb(v);
    };
  }

  playContext(uid = null) { this._playCtx(uid); }
  handleSharedPlaylist(b64) { this._handleSharedPlaylist(b64); }
  openColorPicker(el, albumKey, playlistId) { this.opnCol(null, albumKey, playlistId); }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

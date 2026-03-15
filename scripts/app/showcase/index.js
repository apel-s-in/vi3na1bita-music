/**
 * scripts/app/showcase/index.js
 * Showcase «Витрина Разбита» — stable compact rebuild v4.0
 * 100% Spec-Compliant. Optimized DOM, State Separation.
 */
import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';
import { renderFavoriteStar, setFavoriteStarState } from '../../ui/icon-utils.js';
import { openShowcaseSheet } from './sheet.js';
import { renderShowcasePlaylists, renameShowcasePlaylist, shareShowcasePlaylist, createShowcasePlaylist } from './playlists.js';
import { renderShowcaseHeader, renderShowcaseNormal, renderShowcaseSearch, renderShowcaseEdit, renderShowcaseStatus, renderShowcaseSelectionBar, renderShowcaseSortModal } from './render.js';
import { handleShowcaseEditClick, bindShowcaseDrag, saveShowcaseEdit, resetShowcaseEdit, exitShowcaseEdit } from './edit.js';
import { createShowcaseStore } from './store.js';
import { buildShowcaseSearchDisplay, addSearchResultsToContext, handleSharedShowcasePlaylist } from './search.js';

const W = window, D = document, U = W.Utils;
const ALL = '__default__', SHOW = '__showcase__';
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const $ = id => D.getElementById(id), esc = s => U.escapeHtml(String(s ?? ''));
const trk = u => W.TrackRegistry?.getTrackByUid?.(u);
const albT = k => W.TrackRegistry?.getAlbumTitle?.(k) || k || '';
const isDef = id => id === ALL;
const uidEsc = u => CSS.escape(String(u || ''));
const randShuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const getCat = () => (W.albumsIndex || []).filter(a => !String(a?.key || '').startsWith('__')).flatMap(a => (W.TrackRegistry?.getTracksForAlbum?.(a.key) || []).map(t => t?.uid).filter(Boolean));
const { Store, Draft, mkPl, normCtx, jGet, jSet } = createShowcaseStore({ trk, getCat, ls: localStorage });

const bldTrk = uid => {
  const t = trk(uid);
  if (!t) return null;
  let cover = W.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(i => i.key === t.sourceAlbum)?.icon || 'img/logo.png';
  if (U.isMobile?.() && /\/icon_album\/[^/]+\.png$/i.test(cover)) {
    const m = cover.match(/\/icon_album\/([^/]+)\.png$/i);
    if (m?.[1]) cover = `img/icon_album/mobile/${m[1]}@1x.jpg`;
  }
  return { ...t, album: 'Витрина Разбита', cover };
};

const mkPl = ({ id, name, order, hidden = [], color = '', sortMode = 'user', hiddenPlacement = 'inline', createdAt = Date.now() }) => {
  const s = normSnap({ order, hidden }, order || getCat());
  return normCtx({ id, name, order: s.order, hidden: s.hidden, color, sortMode, hiddenPlacement, createdAt, creationSnapshot: deep(s) }, false, s.order);
};

const Store = {
  pl: () => (jGet('playlists', []) || []).filter(p => p?.id).map(p => normCtx(p, false, p.order || getCat())),
  setPl: v => jSet('playlists', (Array.isArray(v) ? v : []).map(p => normCtx(p, false, p?.order || getCat()))),
  get: id => Store.pl().find(p => p.id === id) || null,
  save: p => {
    const arr = Store.pl(), i = arr.findIndex(x => x.id === p.id), next = normCtx(p, false, p.order || getCat());
    i >= 0 ? arr.splice(i, 1, next) : arr.push(next);
    Store.setPl(arr);
  },
  del: id => Store.setPl(Store.pl().filter(p => p.id !== id)),
  act: () => jGet('activeId', ALL),
  setAct: id => jSet('activeId', id),
  ui: () => jGet('ui', { viewMode: 'flat', showNumbers: true, showHidden: false, hiddenPlacement: 'inline' }),
  setUi: v => jSet('ui', v),
  cols: () => jGet('albumColors', {}),
  setCols: v => jSet('albumColors', v),
  def: () => {
    const d = normCtx({ sortMode: 'album-desc', ...(jGet('default') || {}) }, true, getCat());
    jSet('default', d);
    return d;
  },
  setDef: v => jSet('default', normCtx(v, true))
};

class Draft {
  constructor(id) {
    this.id = id;
    this.isDef = isDef(id);
    const src = this.isDef ? Store.def() : Store.get(id);
    const base = this.isDef ? normCtx(src, true, getCat()) : normCtx(src?.creationSnapshot || src || { order: [], hidden: [] }, false, src?.creationSnapshot?.order || src?.order || getCat());
    this.base = { ord: [...(base.order || [])], hid: [...(base.hidden || [])] };
    this.ord = [...(src?.order || this.base.ord)];
    this.hid = new Set(src?.hidden || this.base.hid);
    this.chk = new Set(); // Q1: Checkboxes empty initially
  }
  getList() {
    if (!this.isDef) return [...this.ord].filter(trk);
    const seen = new Set(), out = [];
    this.ord.forEach(u => trk(u) && !seen.has(u) && (seen.add(u), out.push(u)));
    getCat().forEach(u => trk(u) && !seen.has(u) && (seen.add(u), out.push(u)));
    return out;
  }
  toggleChecked(uid) { this.chk.has(uid) ? this.chk.delete(uid) : this.chk.add(uid); }
  toggleHidden(uid) { this.hid.has(uid) ? this.hid.delete(uid) : this.hid.add(uid); }
  setAllChecked(on) { this.chk = new Set(on ? this.getList() : []); }
  move(uid, dir) {
    const a = this.ord, i = a.indexOf(uid), j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    this.ord = [...a];
  }
  setOrd(a) { this.ord = [...a].filter(Boolean); }
  reset() {
    const b = this.isDef ? normCtx({ order: getCat(), hidden: [], sortMode: 'user', hiddenPlacement: 'inline' }, true) : { order: [...this.base.ord], hidden: [...this.base.hid] };
    this.ord = [...(b.order || b.ord)];
    this.hid = new Set(b.hidden || b.hid);
    this.chk = new Set();
  }
  isDirty() { return sig(this.ord.filter(trk), [...this.hid].filter(trk)) !== sig(this.base.ord, this.base.hid); }
}

class ShowcaseManager {
  constructor() {
    this._edit = false;
    this._drf = null;
    this._q = '';
    this._res = [];
    this._sel = new Set();
    this._menu = null;
    this._tok = 0;
    this._scr = new Map();
  }

  _getSelectedSet() {
    return this._edit ? (this._drf?.chk || new Set()) : this._sel;
  }

  _getSelectedUids() {
    return [...this._getSelectedSet()].filter(trk);
  }

  _setSelectedAll(on) {
    if (this._edit) {
      this._drf?.setAllChecked(!!on);
    } else {
      this._sel = new Set(on ? this._res.filter(trk) : []);
    }
  }

  _clearSelected() {
    if (this._edit) {
      this._drf?.setAllChecked(false);
    } else {
      this._sel.clear();
    }
  }

  _toggleSelected(uid) {
    if (!uid) return;
    if (this._edit) {
      this._drf?.toggleChecked(uid);
    } else {
      this._sel.has(uid) ? this._sel.delete(uid) : this._sel.add(uid);
    }
  }

  async initialize() {
    await W.TrackRegistry?.ensurePopulated?.();
    Store.def();
    W.playerCore?.onFavoritesChanged?.(({ uid }) => {
      if (W.AlbumsManager?.getCurrentAlbum?.() !== SHOW) return;
      D.querySelectorAll(`.showcase-track[data-uid="${uidEsc(uid)}"] .like-star`).forEach(el => setFavoriteStarState(el, W.playerCore.isFavorite(uid)));
    });
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum?.() === SHOW && W.OfflineIndicators?.refreshAllIndicators?.());
  }

  _ctxId() { return Store.act(); }
  _ctx() { return isDef(this._ctxId()) ? Store.def() : Store.get(this._ctxId()); }
  _ctxName(id = this._ctxId()) { return isDef(id) ? 'Все треки' : (Store.get(id)?.name || 'Плейлист'); }
  _saveScroll(id) { const el = $('track-list'); if (el && id) { const y = el.scrollTop || 0; this._scr.set(id, y); jSet(`scroll_${id}`, y); } }
  _restoreScroll(id) { const el = $('track-list'); if (el && id) el.scrollTop = Math.max(0, Number(this._scr.get(id) ?? jGet(`scroll_${id}`, 0)) || 0); }
  _markLast(uid, id = this._ctxId()) { jSet(isDef(id) ? 'lastUid_default' : `lastUid_${id}`, uid); }
  _cleanupUi() {
    try {
      const bar = $('sc-selection-bar');
      if (bar && bar._scClick) bar.removeEventListener('click', bar._scClick);
      bar?.remove();
      this._menu?.remove();
    } catch {}
    this._menu = null;
  }
  _hi(uid) { D.querySelectorAll('.showcase-track.current').forEach(x => x.classList.remove('current')); if (uid) D.querySelectorAll(`.showcase-track[data-uid="${uidEsc(uid)}"]`).forEach(x => x.classList.add('current')); }
  _ctxHiddenSet(id = this._ctxId()) { return new Set((isDef(id) ? Store.def() : Store.get(id))?.hidden || []); }
  _isHidden(uid, id = this._ctxId()) { return this._ctxHiddenSet(id).has(uid); }
  
  _toggleHiddenPersist(uid, id = this._ctxId()) {
    const c = isDef(id) ? Store.def() : Store.get(id);
    if (!c) return;
    const h = new Set(c.hidden || []);
    h.has(uid) ? h.delete(uid) : h.add(uid);
    c.hidden = [...h];
    isDef(id) ? Store.setDef(c) : Store.save(c);
    this.renderTab();
  }
  
  _baseResetChanged() {
    const a = Store.def(), b = normCtx({ order: getCat(), hidden: [], sortMode: 'user', hiddenPlacement: 'inline' }, true);
    return sig(a.order, a.hidden) !== sig(b.order, b.hidden);
  }

  getActiveListTracks() {
    const c = this._ctx(), hid = new Set(c?.hidden || []);
    // Для плейбека всегда отдаем только АКТИВНЫЕ треки (глазик включен)
    return (c?.order || []).filter(u => trk(u) && !hid.has(u)).map(bldTrk).filter(Boolean);
  }

  _sortedOrderSync(ctx) {
    const ord = [...(ctx?.order || [])].filter(trk), sm = ctx?.sortMode || 'user';
    if (sm === 'user') return ord;
    const arr = ord.map(trk).filter(Boolean);
    const rank = new Map((W.albumsIndex || []).reverse().map((a, i) => [a.key, i])), r = k => rank.get(k) ?? 9999;
    const cmp = {
      'name-asc': (a, b) => a.title.localeCompare(b.title),
      'name-desc': (a, b) => b.title.localeCompare(a.title),
      'album-asc': (a, b) => r(b.sourceAlbum) - r(a.sourceAlbum) || a.title.localeCompare(b.title),
      'album-desc': (a, b) => r(a.sourceAlbum) - r(b.sourceAlbum) || a.title.localeCompare(b.title),
      'favorites-first': (a, b) => (W.playerCore?.isFavorite?.(b.uid) ? 1 : 0) - (W.playerCore?.isFavorite?.(a.uid) ? 1 : 0)
    };
    cmp[sm] && arr.sort(cmp[sm]);
    return arr.map(x => x.uid);
  }

  async _sortedOrderAsync(ctx) {
    const ord = [...(ctx?.order || [])].filter(trk), sm = ctx?.sortMode || 'user';
    if (!['plays-desc', 'plays-asc', 'last-played'].includes(sm)) return this._sortedOrderSync(ctx);
    const arr = ord.map(trk).filter(Boolean);
    try {
      const { metaDB } = await import('../../analytics/meta-db.js');
      const st = new Map((await metaDB.getAllStats()).map(s => [s.uid, s]));
      const g = (u, k) => st.get(u)?.[k] || 0;
      arr.sort((a, b) => sm === 'plays-desc' ? g(b.uid, 'globalFullListenCount') - g(a.uid, 'globalFullListenCount') : sm === 'plays-asc' ? g(a.uid, 'globalFullListenCount') - g(b.uid, 'globalFullListenCount') : g(b.uid, 'lastPlayedAt') - g(a.uid, 'lastPlayedAt'));
    } catch {}
    return arr.map(x => x.uid);
  }

  async _disp() {
    const c = this._ctx(), ui = Store.ui(), hid = new Set(c?.hidden || []);
    if (this._edit) return { type: 'edit', uids: this._drf?.getList() || [] };
    if (this._q) {
      const d = await buildShowcaseSearchDisplay({
        query: this._q,
        ensureLyricsIndexLoaded,
        searchUidsByQuery,
        trk,
        ctx: c
      });
      this._res = d.res || [];
      return d;
    }
    this._res = [];
    let ord = this._sortedOrderSync(c);
    if (['plays-desc', 'plays-asc', 'last-played'].includes(c?.sortMode || 'user')) ord = await this._sortedOrderAsync(c);
    if (ui.hiddenPlacement === 'end') ord = [...ord.filter(u => !hid.has(u)), ...ord.filter(u => hid.has(u))];
    if (!ui.showHidden) ord = ord.filter(u => !hid.has(u));
    return { type: 'normal', uids: ord, hid };
  }

  _header(c, ui, id) {
    return renderShowcaseHeader({
      edit: this._edit,
      query: this._q,
      sortMode: c?.sortMode || 'user',
      resetAble: isDef(id) && this._baseResetChanged(),
      dirty: !!this._drf?.isDirty(),
      esc
    });
  }

  async renderTab() {
    const root = $('track-list');
    if (!root) return;
    if (root.dataset.scCtxId) this._saveScroll(root.dataset.scCtxId);
    const tok = ++this._tok, id = this._ctxId(), c = this._ctx(), ui = Store.ui();
    this._cleanupUi();
    root.dataset.scCtxId = id;
    root.innerHTML = this._header(c, ui, id);
    this._bindRoot(root);
    this._renderPlaylists();
    await this._renderBody(tok);
    if (!this._edit) this._hi(jGet(isDef(id) ? 'lastUid_default' : `lastUid_${id}`, ''));
    requestAnimationFrame(() => this._restoreScroll(id));
  }

  async _renderBody(tok) {
    const box = $('sc-tracks-container');
    if (!box) return;
    const d = await this._disp();
    if (tok !== this._tok) return;
    if (d.type === 'edit') return this._renderEdit(box, d.uids);
    if (d.type === 'search') return this._renderSearch(box, d);
    return this._renderNormal(box, d);
  }

  _renderNormal(box, { uids, hid }) {
    renderShowcaseNormal({
      box,
      uids,
      hiddenSet: hid,
      ui: Store.ui(),
      colors: Store.cols(),
      buildTrack: bldTrk,
      hi: () => this._hi(W.playerCore?.getCurrentTrackUid?.()),
      setStatus: (n, s) => this._status(n, s),
      esc,
      albumTitle: albT,
      renderFavoriteStar,
      isFavorite: uid => W.playerCore?.isFavorite?.(uid),
      injectOfflineIndicators: W.OfflineIndicators?.injectOfflineIndicators
    });
  }

  _renderSearch(box, { res, cOrd, cHid }) {
    renderShowcaseSearch({
      box,
      res,
      ctxOrder: cOrd,
      ctxHidden: cHid,
      selected: this._sel,
      buildTrack: bldTrk,
      setSelectionBar: () => this._selectionBar(),
      setStatus: (n, s) => this._status(n, s),
      esc,
      albumTitle: albT,
      renderFavoriteStar,
      isFavorite: uid => W.playerCore?.isFavorite?.(uid)
    });
  }

  _renderEdit(box, uids) {
    renderShowcaseEdit({
      box,
      uids,
      draft: this._drf,
      buildTrack: bldTrk,
      esc,
      albumTitle: albT,
      setSelectionBar: () => this._selectionBar(),
      setStatus: (n, s) => this._status(n, s),
      bindDrag: (node) => this._bindDrag(node)
    });
  }

  _renderPlaylists() {
    renderShowcasePlaylists({
      actionsRoot: $('sc-playlists-actions'),
      listRoot: $('sc-playlists'),
      activeId: this._ctxId(),
      playlists: Store.pl(),
      isDefaultId: isDef,
      esc
    });
  }

  _status(cnt, srh = false) {
    renderShowcaseStatus({
      root: $('sc-status'),
      count: cnt,
      isSearch: srh,
      ctx: this._ctx(),
      ui: Store.ui(),
      trackExists: trk,
      checkedCount: this._edit ? (this._drf?.chk?.size || 0) : this._sel.size
    });
  }

  _selectionBar() {
    renderShowcaseSelectionBar({
      selectedCount: this._getSelectedSet().size,
      edit: this._edit,
      onClick: (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.classList.contains('sc-search-add')) return this._searchAdd();
        if (b.classList.contains('sc-unified-create')) return this._createPl(this._edit ? this._mkFromEdit() : this._getSelectedUids(), !!this._edit);
        if (b.classList.contains('sc-unified-share')) return this._shareList(this._edit ? this._mkFromEdit() : this._getSelectedUids());
        if (b.classList.contains('sc-unified-all')) {
          this._setSelectedAll(true);
          return this._edit ? this._renderEdit($('sc-tracks-container'), this._drf.getList()) : this._renderBody(++this._tok);
        }
        if (b.classList.contains('sc-unified-none')) {
          this._clearSelected();
          return this._edit ? this._renderEdit($('sc-tracks-container'), this._drf.getList()) : this._renderBody(++this._tok);
        }
      }
    });
  }

  _bindRoot(root) {
    if (root._scClick) root.removeEventListener('click', root._scClick);
    root.addEventListener('click', root._scClick = e => this._onClick(e));
    const inp = $('sc-search'), clr = $('sc-search-clear');
    if (inp) {
      if (inp._scInput) inp.removeEventListener('input', inp._scInput);
      inp.addEventListener('input', inp._scInput = U.func.debounceFrame(async () => {
        this._q = inp.value.trim();
        this._sel.clear();
        if (clr) clr.style.display = this._q ? '' : 'none';
        this._cleanupUi();
        await this._renderBody(++this._tok);
      }));
      inp.addEventListener('keydown', e => e.key === 'Enter' && inp.blur());
    }
    if (clr) {
      if (clr._scClear) clr.removeEventListener('click', clr._scClear);
      clr.addEventListener('click', clr._scClear = () => {
        if (inp) inp.value = '';
        this._q = '';
        this._sel.clear();
        this._cleanupUi();
        clr.style.display = 'none';
        this._renderBody(++this._tok);
      });
    }
  }

  async _onClick(e) {
    const t = e.target;
    const btn = t.closest('button,[data-act],[data-pid],#sc-tg-hidden,#sc-tg-numbers,#sc-tg-view,#sc-tg-placement,.sc-search-chk,.showcase-track,.sc-pl-row,.like-star,.offline-ind');
    if (!btn) return;

    const uiMut = () => { const ui = Store.ui(); return { ui, save: () => { Store.setUi(ui); this._renderBody(++this._tok); } }; };

    const one = {
      'sc-pl-all': () => this._switchCtx(ALL),
      'sc-pl-pst': () => navigator.clipboard.readText().then(v => this._handleShr(new URLSearchParams(v.split('?')[1] || v).get('playlist') || v)).catch(() => W.NotificationSystem?.error('Ошибка буфера')),
      'sc-tg-hidden': () => { const x = uiMut(); x.ui.showHidden = !x.ui.showHidden; x.save(); },
      'sc-tg-numbers': () => { const x = uiMut(); x.ui.showNumbers = !x.ui.showNumbers; x.save(); },
      'sc-tg-view': () => { const x = uiMut(); x.ui.viewMode = x.ui.viewMode === 'flat' ? 'grouped' : 'flat'; x.save(); },
      'sc-tg-placement': () => { const x = uiMut(); x.ui.hiddenPlacement = x.ui.hiddenPlacement === 'inline' ? 'end' : 'inline'; x.save(); }
    };

    if (one[btn.id]) return one[btn.id]();
    if (btn.classList?.contains('sc-btn-edit')) return this._enterEdit();
    if (btn.classList?.contains('sc-btn-save')) return this._saveEdit();
    if (btn.classList?.contains('sc-btn-create')) return this._createPl(this._mkFromEdit(), true);
    if (btn.classList?.contains('sc-btn-reset')) return this._resetEdit();
    if (btn.classList?.contains('sc-btn-exit')) return this._exitEdit();
    if (btn.classList?.contains('sc-btn-playall')) return this._playCtx();
    if (btn.classList?.contains('sc-btn-shuffle')) return this._playCtx(null, true);
    if (btn.classList?.contains('sc-btn-sort')) return this._openSort();
    if (btn.classList?.contains('sc-btn-master-reset')) return W.Modals?.confirm({ title: 'Сбросить «Все треки»?', textHtml: 'Порядок вернётся к заводскому, все скрытые треки станут видимыми.', confirmText: 'Сбросить', cancelText: 'Отмена', onConfirm: () => { Store.setDef(normCtx({ order: getCat(), hidden: [], sortMode: 'album-desc', hiddenPlacement: 'inline' }, true)); this.renderTab(); } });

    const act = btn.dataset?.act, pid = btn.dataset?.pid;
    if (act && pid) {
      if (act === 'rename') return this._renamePl(pid);
      if (act === 'shr') return this._sharePl(pid);
      if (act === 'col') return this.openColorPicker(null, null, pid);
      if (act === 'del') return W.Modals?.confirm({ title: 'Удалить плейлист?', confirmText: 'Да', onConfirm: () => { Store.del(pid); this._ctxId() === pid ? this._switchCtx(ALL) : this.renderTab(); } });
    }

    const plRow = t.closest('.sc-pl-row');
    if (plRow?.dataset.pid && !act) return this._switchCtx(plRow.dataset.pid);

    if (this._edit) return this._onEditClick(e);

    const row = t.closest('.showcase-track'), uid = row?.dataset.uid, isHidden = row?.dataset.hidden === '1';
    if ((t.closest('.like-star') || t.closest('.offline-ind')) && uid) return this._openMenu(uid, !!this._q);
    if (!uid) return;

    if (this._q) {
      if (t.classList?.contains('sc-search-chk')) {
        t.checked ? this._sel.add(uid) : this._sel.delete(uid);
        row.classList.toggle('selected', t.checked);
        this._selectionBar();
        this._status(this._res.length, true);
        return;
      }
      return this._openMenu(uid, true);
    }

    if (t.closest('.showcase-track-menu-btn')) return this._openMenu(uid, false);
    if (isHidden) return this._openMenu(uid, false); // Тап по скрытому = Меню (Не воспроизводим)
    if (W.playerCore?.getCurrentTrackUid?.() === uid && W.Utils?.isShowcaseContext?.(W.AlbumsManager?.getPlayingAlbum?.())) return this._openMenu(uid, false);
    return this._playCtx(uid);
  }

  _onEditClick(e) {
    return handleShowcaseEditClick({
      event: e,
      draft: this._drf,
      toggleSelected: uid => this._toggleSelected(uid),
      renderEdit: (uids) => this._renderEdit($('sc-tracks-container'), uids),
      getList: () => this._drf.getList(),
      getStatusCount: () => {
        this._selectionBar();
        this._status(this._drf.getList().length, false);
      }
    });
  }

  _switchCtx(id) {
    if (this._edit) return W.NotificationSystem?.warning('Сначала выйдите из режима редактирования');
    this._cleanupUi();
    this._sel.clear();
    Store.setAct(id);
    this.renderTab();
  }

  _enterEdit() {
    if (!this._ctx()) return;
    this._drf = new Draft(this._ctxId()); // Игнорирует сортировку, берет manual order
    this._edit = true;
    this.renderTab();
  }

  _leaveEdit() {
    this._drf = null;
    this._edit = false;
    this.renderTab();
  }

  _saveEdit() {
    saveShowcaseEdit({
      draft: this._drf,
      ctxId: this._ctxId(),
      isDefaultId: isDef,
      store: Store,
      trackExists: trk,
      leaveEdit: () => this._leaveEdit(),
      notify: W.NotificationSystem
    });
  }

  _mkFromEdit() { return this._drf?.ord.filter(u => this._drf.chk.has(u) && trk(u)) || []; }

  _resetEdit() {
    resetShowcaseEdit({
      draft: this._drf,
      modals: W.Modals,
      isDefault: !!this._drf?.isDef,
      renderEdit: (uids) => this._renderEdit($('sc-tracks-container'), uids)
    });
  }

  _exitEdit() {
    exitShowcaseEdit({
      draft: this._drf,
      modals: W.Modals,
      leaveEdit: () => this._leaveEdit()
    });
  }

  _bindDrag(box) {
    bindShowcaseDrag({
      box,
      documentRef: D,
      uidEsc,
      draft: this._drf
    });
  }

  _playCtx(uid = null, shuf = false, listOverride = null, keyOverride = null) {
    const id = this._ctxId(), key = keyOverride || (isDef(id) ? SHOW : `${SHOW}:${id}`);
    const list0 = listOverride || this.getActiveListTracks(); // Берем только активные
    if (!list0.length) return;
    
    const list = shuf ? randShuffle([...list0]) : list0;
    const idx = uid && !shuf ? Math.max(0, list.findIndex(t => t.uid === uid)) : 0;
    
    W.AlbumsManager?.setPlayingAlbum?.(key);
    if (!W.playerCore?.playExactFromPlaylist?.(list, list[idx]?.uid, { dir: 1 })) return;
    W.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
    this._hi(list[idx]?.uid);
    if (list[idx]?.uid) this._markLast(list[idx].uid, id);
  }

  _openSort() {
    const id = this._ctxId(), c = this._ctx(), sm = c?.sortMode || 'user';
    const opts = [['user','👤 Мой порядок'],['name-asc','А→Я'],['name-desc','Я→А'],['album-desc','Альбомы ↓ (Новые)'],['album-asc','Альбомы ↑ (Старые)'],['plays-desc','Топ прослушиваний'],['plays-asc','Меньше всего'],['last-played','Недавние'],['favorites-first','Сначала ⭐']];
    renderShowcaseSortModal({
      modalApi: W.Modals,
      currentSort: sm,
      options: opts,
      onPick: (val, modal) => {
        const t = isDef(id) ? Store.def() : Store.get(id);
        if (!t) return;
        t.sortMode = val;
        isDef(id) ? Store.setDef(t) : Store.save(t);
        modal?.remove?.();
        this.renderTab();
      }
    });
  }

  _openMenu(uid, fromSearch = false) {
    this._cleanupUi();
    const t = trk(uid), id = this._ctxId(), inPl = !isDef(id) && (Store.get(id)?.order || []).includes(uid);
    if (!t) return;

    const sh = openShowcaseSheet({
      title: esc(t.title),
      subtitle: esc(albT(t.sourceAlbum)),
      fromSearch,
      inPlaylist: inPl,
      hiddenLabel: this._isHidden(uid, id) ? `👁 Сделать активным в «${this._ctxName(id)}»` : `🙈 Скрыть в «${this._ctxName(id)}»`,
      favoriteLabel: W.playerCore?.isFavorite?.(uid) ? '❌ Убрать из Избранного' : '⭐ В Избранное',
      onAction: (a) => {
        this._menu = null;

        if (a === 'bm-play') {
          if (!fromSearch) return this._playCtx(uid);
          const one = bldTrk(uid);
          if (!one) return;
          return this._playCtx(uid, false, [one], `${SHOW}:search:${this._ctxId()}`);
        }

        if (a === 'bm-pl') {
          return setTimeout(() => {
            const pls = Store.pl();
            if (!pls.length) return W.NotificationSystem?.warning('Сначала создайте плейлист');
            const m = W.Modals?.open({ title: 'Добавить в плейлист', bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px">${pls.map(p => `<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>` });
            if (!m) return;
            m.onclick = ev => {
              const b = ev.target.closest('[data-pid]');
              if (!b) return;
              const p = Store.get(b.dataset.pid);
              if (!p) return;
              const s = new Set(p.order || []);
              if (!s.has(uid)) {
                p.order.push(uid);
                Store.save(p);
                W.NotificationSystem?.success('Добавлено');
              }
              m.remove();
            };
          }, 120);
        }

        if (a === 'bm-rm') {
          const p = Store.get(id);
          if (!p) return;
          p.order = p.order.filter(x => x !== uid);
          p.hidden = (p.hidden || []).filter(x => x !== uid);
          Store.save(p);
          return this.renderTab();
        }

        if (a === 'bm-eye') return this._toggleHiddenPersist(uid, id);
        if (a === 'bm-fv') return W.playerCore?.toggleFavorite?.(uid, { albumKey: t.sourceAlbum });
        if (a === 'bm-of') return W.OfflineManager?.togglePinned?.(uid);

        if (a === 'bm-dl') {
          const link = D.createElement('a');
          U.download.applyDownloadLink(link, bldTrk(uid));
          if (link.href) link.click();
          return;
        }

        if (a === 'bm-st') return setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(uid), 120);
        if (a === 'bm-sh') return setTimeout(() => import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', bldTrk(uid))), 120);
        if (a === 'bm-cl') return setTimeout(() => this.openColorPicker(null, t.sourceAlbum), 120);
      }
    });

    this._menu = sh?.el || null;
  }

  _renamePl(id) {
    renameShowcasePlaylist({
      id,
      store: Store,
      promptName: W.Utils?.profileModals?.promptName,
      onDone: () => this._renderPlaylists()
    });
  }

  _sharePl(id) {
    shareShowcasePlaylist({
      id,
      store: Store,
      origin: W.location.origin,
      pathname: W.location.pathname,
      notify: W.NotificationSystem
    });
  }

  _shareList(uids) {
    const list = (uids || []).filter(trk).map(bldTrk).filter(Boolean);
    if (!list.length) return;
    import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', list[0], { playlist: list }));
  }

  _createPl(uids, fromEdit = false, name = '') {
    return createShowcasePlaylist({
      uids,
      fromEdit,
      name,
      draft: this._drf,
      store: Store,
      mkPl,
      trk,
      setActive: id => Store.setAct(id),
      clearUi: () => {
        if (fromEdit) this._leaveEdit();
        this._q = '';
        this._sel.clear();
        this._cleanupUi();
      },
      renderTab: () => this.renderTab(),
      notify: W.NotificationSystem,
      promptName: W.Utils?.profileModals?.promptName
    });
  }

  _searchAdd() {
    return addSearchResultsToContext({
      selected: this._sel,
      trk,
      ctx: this._ctx(),
      saveCtx: (c) => isDef(this._ctxId()) ? Store.setDef(c) : Store.save(c),
      isDefault: isDef(this._ctxId()),
      store: Store,
      clearSearch: () => {
        this._q = '';
        this._sel.clear();
        this._cleanupUi();
      },
      rerender: () => this.renderTab(),
      notify: W.NotificationSystem
    });
  }

  _handleShr(b64) {
    return handleSharedShowcasePlaylist({
      raw: b64,
      trk,
      modals: W.Modals,
      esc,
      createPlaylist: (uids, fromEdit, name) => this._createPl(uids, fromEdit, name),
      notify: W.NotificationSystem
    });
  }

  openColorPicker(el, albumKey, playlistId) {
    let aKey = albumKey, cur = '';
    if (playlistId) cur = Store.get(playlistId)?.color || '';
    else {
      if (!aKey && el) aKey = trk(el)?.sourceAlbum;
      cur = Store.cols()?.[aKey] || '';
    }
    W.Utils?.profileModals?.palettePicker?.({
      title: playlistId ? 'Цвет плейлиста' : 'Цвет альбома',
      items: PALETTE,
      value: cur,
      resetText: 'Сбросить цвет',
      onPick: (v, m) => {
        if (playlistId) {
          const p = Store.get(playlistId);
          if (p) { p.color = v; Store.save(p); this._renderPlaylists(); }
        } else if (aKey) {
          const c = Store.cols();
          c[aKey] = v;
          Store.setCols(c);
          this._renderBody(++this._tok);
        }
        m?.remove?.();
      }
    });
  }

  playContext(uid = null) { this._playCtx(uid); }
  handleSharedPlaylist(b64) { this._handleShr(b64); }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

/**
 * scripts/app/showcase/index.js
 * Showcase «Витрина Разбита» — stable compact rebuild
 */
import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils, ls = localStorage;
const NS = 'sc3:', ALL = '__default__', SHOW = '__showcase__';
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const $ = id => D.getElementById(id), esc = s => U.escapeHtml(String(s ?? ''));
const trk = u => W.TrackRegistry?.getTrackByUid?.(u);
const albT = k => W.TrackRegistry?.getAlbumTitle?.(k) || k || '';
const isDef = id => id === ALL;
const uidEsc = u => CSS.escape(String(u || ''));
const deep = v => JSON.parse(JSON.stringify(v));
const jGet = (k, d = null) => { try { const v = ls.getItem(NS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const jSet = (k, v) => { try { ls.setItem(NS + k, JSON.stringify(v)); } catch {} };
const randShuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const getCat = () => (W.albumsIndex || []).filter(a => !String(a?.key || '').startsWith('__')).flatMap(a => (W.TrackRegistry?.getTracksForAlbum?.(a.key) || []).map(t => t?.uid).filter(Boolean));

const normSnap = (c, fbOrd = getCat()) => {
  c = (c && typeof c === 'object') ? deep(c) : {};
  const order = [], hidden = [], seen = new Set();
  (c.order || []).forEach(u => trk(u) && !seen.has(u) && (seen.add(u), order.push(u)));
  fbOrd.forEach(u => trk(u) && !seen.has(u) && (seen.add(u), order.push(u)));
  (c.hidden || []).forEach(u => trk(u) && seen.has(u) && !hidden.includes(u) && hidden.push(u));
  return { order, hidden };
};

const normCtx = (c, def = false, fbOrd = getCat()) => {
  c = (c && typeof c === 'object') ? deep(c) : {};
  const { order, hidden } = normSnap(c, fbOrd);
  const x = { ...c, order, hidden, sortMode: c.sortMode || 'user', hiddenPlacement: c.hiddenPlacement || 'inline' };
  if (!def) x.creationSnapshot = c.creationSnapshot ? normSnap(c.creationSnapshot, c.creationSnapshot.order || order) : { order: [...order], hidden: [...hidden] };
  return x;
};

const sig = (o = [], h = [], c = []) => JSON.stringify({ o: [...o], h: [...h], c: [...c] });

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
  ui: () => jGet('ui', { viewMode: 'flat', showNumbers: false, showHidden: false, hiddenPlacement: 'inline' }),
  setUi: v => jSet('ui', v),
  cols: () => jGet('albumColors', {}),
  setCols: v => jSet('albumColors', v),
  def: () => {
    const d = normCtx(jGet('default'), true, getCat());
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
    this.base = { ord: [...(base.order || [])], hid: [...(base.hidden || [])], chk: [] };
    this.ord = [...(src?.order || this.base.ord)];
    this.hid = new Set(src?.hidden || this.base.hid);
    this.chk = new Set();
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
  isDirty() { return sig(this.ord.filter(trk), [...this.hid].filter(trk), [...this.chk].filter(trk)) !== sig(this.base.ord, this.base.hid, this.base.chk); }
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

  async initialize() {
    await W.TrackRegistry?.ensurePopulated?.();
    Store.def();
    W.playerCore?.onFavoritesChanged?.(({ uid }) => {
      if (W.AlbumsManager?.getCurrentAlbum?.() !== SHOW) return;
      D.querySelectorAll(`.showcase-track[data-uid="${uidEsc(uid)}"] .like-star`).forEach(el => el.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png');
    });
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum?.() === SHOW && W.OfflineIndicators?.refreshAllIndicators?.());
  }

  _ctxId() { return Store.act(); }
  _ctx() { return isDef(this._ctxId()) ? Store.def() : Store.get(this._ctxId()); }
  _ctxName(id = this._ctxId()) { return isDef(id) ? 'Все треки' : (Store.get(id)?.name || 'Плейлист'); }
  _saveScroll(id) { const el = $('track-list'); if (el && id) { const y = el.scrollTop || 0; this._scr.set(id, y); jSet(`scroll_${id}`, y); } }
  _restoreScroll(id) { const el = $('track-list'); if (el && id) el.scrollTop = Math.max(0, Number(this._scr.get(id) ?? jGet(`scroll_${id}`, 0)) || 0); }
  _markLast(uid, id = this._ctxId()) { jSet(isDef(id) ? 'lastUid_default' : `lastUid_${id}`, uid); }
  _cleanupUi() { try { $('sc-selection-bar')?.remove(); this._menu?.remove(); } catch {} this._menu = null; }
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
    return (c?.order || []).filter(u => trk(u) && !hid.has(u)).map(bldTrk).filter(Boolean);
  }

  async _sortedOrder(ctx) {
    let ord = [...(ctx?.order || [])].filter(trk), sm = ctx?.sortMode || 'user';
    if (sm === 'user') return ord;
    const arr = ord.map(trk).filter(Boolean);
    if (['plays-desc', 'plays-asc', 'last-played'].includes(sm)) {
      try {
        const { metaDB } = await import('../../analytics/meta-db.js');
        const st = new Map((await metaDB.getAllStats()).map(s => [s.uid, s]));
        const g = (u, k) => st.get(u)?.[k] || 0;
        arr.sort((a, b) => sm === 'plays-desc' ? g(b.uid, 'globalFullListenCount') - g(a.uid, 'globalFullListenCount') : sm === 'plays-asc' ? g(a.uid, 'globalFullListenCount') - g(b.uid, 'globalFullListenCount') : g(b.uid, 'lastPlayedAt') - g(a.uid, 'lastPlayedAt'));
      } catch {}
    } else {
      const rank = new Map((W.albumsIndex || []).reverse().map((a, i) => [a.key, i])), r = k => rank.get(k) ?? 9999;
      const cmp = {
        'name-asc': (a, b) => a.title.localeCompare(b.title),
        'name-desc': (a, b) => b.title.localeCompare(a.title),
        'album-asc': (a, b) => r(b.sourceAlbum) - r(a.sourceAlbum) || a.title.localeCompare(b.title),
        'album-desc': (a, b) => r(a.sourceAlbum) - r(b.sourceAlbum) || a.title.localeCompare(b.title),
        'favorites-first': (a, b) => (W.playerCore?.isFavorite?.(b.uid) ? 1 : 0) - (W.playerCore?.isFavorite?.(a.uid) ? 1 : 0)
      };
      cmp[sm] && arr.sort(cmp[sm]);
    }
    return arr.map(x => x.uid);
  }

  async _disp() {
    const c = this._ctx(), ui = Store.ui(), hid = new Set(c?.hidden || []);
    if (this._edit) return { type: 'edit', uids: this._drf?.getList() || [] };
    if (this._q) {
      await ensureLyricsIndexLoaded();
      this._res = (searchUidsByQuery({ query: this._q }) || []).filter(trk);
      return { type: 'search', res: this._res, cOrd: c?.order || [], cHid: hid };
    }
    this._res = [];
    let ord = await this._sortedOrder(c);
    if (ui.hiddenPlacement === 'end') ord = [...ord.filter(u => !hid.has(u)), ...ord.filter(u => hid.has(u))];
    if (!ui.showHidden) ord = ord.filter(u => !hid.has(u));
    return { type: 'normal', uids: ord, hid };
  }

  _header(c, ui, id) {
    const sm = c?.sortMode || 'user', resetAble = isDef(id) && this._baseResetChanged(), dirty = !!this._drf?.isDirty();
    return `<div class="showcase-header-controls">
      ${this._edit ? `<div class="sc-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<div class="sc-edit-actions"><button class="showcase-btn sc-btn-save" style="background:#4caf50;color:#fff;">💾 Сохранить</button><button class="showcase-btn sc-btn-create" style="background:#4daaff;color:#fff;">✨ Создать</button><button class="showcase-btn sc-btn-reset ${dirty ? '' : 'sc-btn-disabled'}" style="border-color:#ff9800;" ${dirty ? '' : 'disabled'}>↺ Сброс</button><button class="showcase-btn sc-btn-exit" style="border-color:#ff6b6b;">✕ Выйти</button></div></div>` : ''}
      <div class="showcase-search-wrap"><input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему каталогу..." value="${esc(this._q)}"><button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this._q ? '' : 'none'}">✕</button></div>
      ${!this._edit ? `<div class="showcase-btns-row"><button class="showcase-btn sc-btn-edit">✏️ Редактировать</button>${resetAble ? `<button class="showcase-btn sc-btn-master-reset" style="flex:.5">↺ Сброс</button>` : ''}<button class="showcase-btn sc-btn-sort">↕️ ${sm !== 'user' ? '●' : ''} Сортировка</button></div><div class="showcase-btns-row"><button class="showcase-btn sc-btn-playall">▶ Играть всё</button><button class="showcase-btn sc-btn-shuffle">🔀 Перемешать</button></div>` : ''}
      <div class="showcase-playlists-actions" id="sc-playlists-actions"></div>
      <div class="showcase-playlists-list" id="sc-playlists"></div>
      <div class="showcase-status-bar" id="sc-status"></div>
    </div><div id="sc-tracks-container"></div>`;
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

  _row(t, i, o = {}) {
    const cls = ['showcase-track', o.isH ? 'inactive' : '', o.srh ? 'sc-search-result' : '', o.chk ? 'selected' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-uid="${t.uid}" data-hidden="${o.isH ? '1' : '0'}" style="border-left:3px solid ${o.col || 'transparent'}">
      <div class="tnum" ${o.sN ? '' : 'style="display:none"'}>${i + 1}.</div>
      <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
      <div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${esc(albT(t.sourceAlbum))}${o.bdg ? ` ${o.bdg}` : ''}</div></div>
      ${o.srh ? `<input type="checkbox" class="sc-search-chk" data-uid="${t.uid}" ${o.chk ? 'checked' : ''}>` : `<span class="offline-ind" data-uid="${t.uid}">🔒</span><img src="${W.playerCore?.isFavorite?.(t.uid) ? 'img/star.png' : 'img/star2.png'}" class="like-star" data-uid="${t.uid}" data-album="${t.sourceAlbum}">`}
      <button class="showcase-track-menu-btn" data-uid="${t.uid}">···</button>
    </div>`;
  }

  _renderNormal(box, { uids, hid }) {
    const ui = Store.ui(), cols = Store.cols();
    let h = '', g = null;
    uids.forEach((u, i) => {
      const t = bldTrk(u);
      if (!t) return;
      if (ui.viewMode === 'grouped' && g !== t.sourceAlbum) {
        g = t.sourceAlbum;
        h += `<div class="showcase-group-header">── ${esc(albT(t.sourceAlbum))} ──</div>`;
      }
      h += this._row(t, i, { isH: hid?.has(u), sN: ui.showNumbers, col: cols[t.sourceAlbum] || 'transparent' });
    });
    box.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
    W.OfflineIndicators?.injectOfflineIndicators?.(box);
    this._hi(W.playerCore?.getCurrentTrackUid?.());
    this._status(uids.length, false);
  }

  _renderSearch(box, { res, cOrd, cHid }) {
    const set = new Set(cOrd || []);
    let h = `<div class="sc-search-info">Найдено: ${res.length} треков</div>`;
    res.forEach((u, i) => {
      const t = bldTrk(u);
      if (!t) return;
      const inCtx = set.has(u), isH = !!cHid?.has(u);
      const bdg = inCtx ? (isH ? '<span class="sc-badge sc-badge-hidden">скрыт</span>' : '<span class="sc-badge sc-badge-active">уже есть</span>') : '<span class="sc-badge sc-badge-missing">добавить?</span>';
      h += this._row(t, i, { srh: true, chk: this._sel.has(u), bdg, isH });
    });
    box.innerHTML = h || '<div class="fav-empty">Ничего не найдено</div>';
    this._selectionBar();
    this._status(res.length, true);
  }

  _renderEdit(box, uids) {
    box.innerHTML = uids.map(u => {
      const t = bldTrk(u);
      if (!t) return '';
      const isH = this._drf.hid.has(u), chk = this._drf.chk.has(u), mt = `${esc(albT(t.sourceAlbum))}${isH ? ' · скрыт' : ''}`;
      return `<div class="showcase-track sc-edit-row ${isH ? 'inactive' : ''} ${chk ? 'selected' : ''}" data-uid="${u}" data-hidden="${isH ? '1' : '0'}" draggable="true">
        <button class="sc-arrow-up">▲</button>
        <div class="showcase-drag-handle">⠿</div>
        <input type="checkbox" class="sc-chk" ${chk ? 'checked' : ''}>
        <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
        <div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${mt}</div></div>
        <button class="sc-eye-btn" title="Показать/Скрыть">${isH ? '🙈' : '👁'}</button>
        <button class="sc-arrow-down">▼</button>
      </div>`;
    }).join('') || '<div class="fav-empty">Нет треков</div>';
    this._bindDrag(box);
    this._selectionBar();
    this._status(uids.length, false);
  }

  _renderPlaylists() {
    const a = $('sc-playlists-actions'), l = $('sc-playlists');
    if (!a || !l) return;
    const id = this._ctxId(), pls = Store.pl();
    a.innerHTML = `<button class="sc-pl-action ${isDef(id) ? 'active' : ''}" id="sc-pl-all">Все треки</button><button class="sc-pl-action" id="sc-pl-pst" title="Вставить ссылку">📋</button>`;
    l.innerHTML = !pls.length ? '<div class="sc-pl-empty">Плейлистов пока нет</div>' : pls.map(p => `<div class="sc-pl-row ${id === p.id ? 'active' : ''}" data-pid="${p.id}" ${p.color ? `style="--pl-color:${p.color};"` : ''}><div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span></div><div class="sc-pl-right"><button class="sc-pl-btn" data-act="rename" data-pid="${p.id}" title="Переименовать">✏️</button><button class="sc-pl-btn" data-act="shr" data-pid="${p.id}" title="Поделиться">🔗</button><button class="sc-pl-btn" data-act="col" data-pid="${p.id}" title="Цвет">🎨</button><button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}" title="Удалить">✖</button></div></div>`).join('');
  }

  _status(cnt, srh = false) {
    const s = $('sc-status');
    if (!s) return;
    const c = this._ctx(), ui = Store.ui(), ord = (c?.order || []).filter(trk), hid = new Set(c?.hidden || []);
    const total = ord.length, hidden = ord.filter(u => hid.has(u)).length, checked = this._edit ? (this._drf?.chk?.size || 0) : this._sel.size;
    s.innerHTML = `<span>📋 ${srh ? `${cnt} найдено` : `${total} всего · ${total - hidden} активных · ${hidden} скрытых`}${checked ? `<span style="color:#ff9800"> · ✓ ${checked}</span>` : ''}</span><span style="display:flex;gap:12px;align-items:center"><span id="sc-tg-hidden" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${ui.showHidden ? '👁' : '🙈'}</span><span id="sc-tg-numbers" style="cursor:pointer;font-size:18px;min-width:42px;display:inline-flex;align-items:center;justify-content:center;opacity:${ui.showNumbers ? '1' : '.72'}" title="Нумерация">1,2,3</span><span id="sc-tg-view" style="cursor:pointer;font-size:18px" title="Вид">${ui.viewMode === 'flat' ? '⊞' : '⊟'}</span><span id="sc-tg-placement" style="cursor:pointer;font-size:14px" title="Скрытые в конце">${ui.hiddenPlacement === 'end' ? '↓скр' : '≡скр'}</span></span>`;
  }

  _selectionBar() {
    $('sc-selection-bar')?.remove();
    const n = this._edit ? (this._drf?.chk?.size || 0) : this._sel.size;
    if (!n) return;
    const bar = D.createElement('div');
    bar.id = 'sc-selection-bar';
    bar.className = 'showcase-sticky-bar';
    bar.innerHTML = `<span>Выбрано: ${n}</span>${this._edit ? `<button class="showcase-btn sc-edit-create" style="background:#4daaff;color:#fff;">✨ Создать</button><button class="showcase-btn sc-edit-share">📸 Карточка</button><button class="showcase-btn sc-edit-all">✓ Всё</button><button class="showcase-btn sc-edit-none">✕ Снять</button>` : `<button class="showcase-btn sc-search-add">➕ Добавить</button><button class="showcase-btn sc-search-create" style="background:#4daaff;color:#fff;">✨ Создать</button><button class="showcase-btn sc-search-share">📸 Карточка</button><button class="showcase-btn sc-search-check-all">✓ Всё</button><button class="showcase-btn" id="sc-search-clear-query">🧹 Очистить поиск</button><button class="showcase-btn" id="sc-search-clear-selection">✕ Снять</button>`}`;
    D.body.appendChild(bar);
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
      'sc-tg-placement': () => { const x = uiMut(); x.ui.hiddenPlacement = x.ui.hiddenPlacement === 'inline' ? 'end' : 'inline'; x.save(); },
      'sc-search-clear-selection': () => { this._sel.clear(); this._selectionBar(); this._status(this._res.length, true); },
      'sc-search-clear-query': () => { const i = $('sc-search'); if (i) i.value = ''; this._q = ''; this._sel.clear(); this._cleanupUi(); this._renderBody(++this._tok); },
      'sc-edit-all': () => { this._drf?.setAllChecked(true); this._renderEdit($('sc-tracks-container'), this._drf.getList()); },
      'sc-edit-none': () => { this._drf?.setAllChecked(false); this._renderEdit($('sc-tracks-container'), this._drf.getList()); },
      'sc-edit-create': () => this._createPl(this._mkFromEdit(), true),
      'sc-edit-share': () => this._shareList(this._mkFromEdit()),
      'sc-search-add': () => this._searchAdd(),
      'sc-search-create': () => this._createPl([...this._sel].filter(trk)),
      'sc-search-check-all': () => { this._res.forEach(u => this._sel.add(u)); this._renderBody(++this._tok); },
      'sc-search-share': () => this._shareList([...this._sel].filter(trk))
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
    if (btn.classList?.contains('sc-btn-master-reset')) return W.Modals?.confirm({ title: 'Сбросить «Все треки»?', textHtml: 'Порядок вернётся к заводскому, все скрытые треки станут видимыми.', confirmText: 'Сбросить', cancelText: 'Отмена', onConfirm: () => { Store.setDef(normCtx({ order: getCat(), hidden: [], sortMode: 'user', hiddenPlacement: 'inline' }, true)); this.renderTab(); } });

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
    if (t.closest('.like-star') || t.closest('.offline-ind')) return;

    const row = t.closest('.showcase-track'), uid = row?.dataset.uid, isHidden = row?.dataset.hidden === '1';
    if (!uid) return;

    if (this._q) {
      if (t.classList?.contains('sc-search-chk')) {
        t.checked ? this._sel.add(uid) : this._sel.delete(uid);
        return this._renderBody(++this._tok);
      }
      return this._openMenu(uid, true);
    }

    if (t.closest('.showcase-track-menu-btn')) return this._openMenu(uid, false);
    if (isHidden) return this._openMenu(uid, false);
    return this._playCtx(uid);
  }

  _onEditClick(e) {
    const row = e.target.closest('.sc-edit-row'), uid = row?.dataset.uid;
    if (!uid || !this._drf) return;
    if (e.target.classList.contains('sc-chk')) this._drf.toggleChecked(uid);
    else if (e.target.closest('.sc-eye-btn')) this._drf.toggleHidden(uid);
    else if (e.target.closest('.sc-arrow-up')) this._drf.move(uid, -1);
    else if (e.target.closest('.sc-arrow-down')) this._drf.move(uid, 1);
    else return;
    this._renderEdit($('sc-tracks-container'), this._drf.getList());
  }

  _switchCtx(id) {
    if (this._edit) return W.NotificationSystem?.warning('Выйдите из режима редактирования');
    this._cleanupUi();
    this._sel.clear();
    Store.setAct(id);
    this.renderTab();
  }

  _enterEdit() {
    if (!this._ctx()) return;
    this._drf = new Draft(this._ctxId());
    this._edit = true;
    this.renderTab();
  }

  _leaveEdit() {
    this._drf = null;
    this._edit = false;
    this.renderTab();
  }

  _saveEdit() {
    if (!this._drf) return;
    const id = this._ctxId(), ord = this._drf.ord.filter(trk), hid = [...this._drf.hid].filter(trk);
    if (isDef(id)) {
      const c = Store.def();
      c.order = ord;
      c.hidden = hid.filter(u => ord.includes(u));
      Store.setDef(c);
    } else {
      const c = Store.get(id);
      if (!c) return;
      c.order = ord;
      c.hidden = hid.filter(u => ord.includes(u));
      Store.save(c);
    }
    this._leaveEdit();
    W.NotificationSystem?.success('Сохранено');
  }

  _mkFromEdit() { return this._drf?.ord.filter(u => this._drf.chk.has(u) && trk(u)) || []; }

  _resetEdit() {
    if (!this._drf?.isDirty()) return;
    W.Modals?.confirm({
      title: 'Сброс',
      textHtml: this._drf.isDef ? 'Список вернётся к заводскому: все треки, порядок по альбомам. Продолжить?' : 'Плейлист вернётся к состоянию при создании. Продолжить?',
      confirmText: 'Сбросить',
      cancelText: 'Отмена',
      onConfirm: () => {
        this._drf.reset();
        this._renderEdit($('sc-tracks-container'), this._drf.getList());
      }
    });
  }

  _exitEdit() {
    if (!this._drf?.isDirty()) return this._leaveEdit();
    W.Modals?.confirm({ title: 'Выйти без сохранения?', textHtml: 'Изменения не будут сохранены.', confirmText: 'Выйти', cancelText: 'Отмена', onConfirm: () => this._leaveEdit() });
  }

  _bindDrag(box) {
    if (box._scDrag) return;
    box._scDrag = 1;
    box.addEventListener('dragstart', e => {
      const r = e.target.closest('.sc-edit-row');
      if (!r) return;
      e.dataTransfer.setData('text/plain', r.dataset.uid);
      r.classList.add('is-dragging');
    });
    box.addEventListener('dragover', e => { e.preventDefault(); e.target.closest('.sc-edit-row')?.classList.add('drag-over'); });
    box.addEventListener('dragleave', e => e.target.closest('.sc-edit-row')?.classList.remove('drag-over'));
    box.addEventListener('drop', e => {
      e.preventDefault();
      const to = e.target.closest('.sc-edit-row'), uid = e.dataTransfer.getData('text/plain');
      D.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
      const from = uid ? box.querySelector(`.sc-edit-row[data-uid="${uidEsc(uid)}"]`) : null;
      if (!to || !from || to === from) return;
      to.before(from);
      this._drf?.setOrd([...D.querySelectorAll('.sc-edit-row')].map(x => x.dataset.uid).filter(Boolean));
    });
    box.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(x => x.classList.remove('is-dragging')));
  }

  _playCtx(uid = null, shuf = false, listOverride = null, keyOverride = null) {
    const id = this._ctxId(), key = keyOverride || (isDef(id) ? SHOW : `${SHOW}:${id}`), list0 = listOverride || this.getActiveListTracks();
    if (!list0.length) return;
    const list = shuf ? randShuffle([...list0]) : list0;
    const idx = uid && !shuf ? Math.max(0, list.findIndex(t => t.uid === uid)) : 0;
    W.AlbumsManager?.setPlayingAlbum?.(key);
    W.playerCore?.setPlaylist?.(list, idx, null, { preservePosition: false });
    W.playerCore?.play?.(idx);
    W.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
    this._hi(list[idx]?.uid);
    if (list[idx]?.uid) this._markLast(list[idx].uid, id);
  }

  _openSort() {
    const id = this._ctxId(), c = this._ctx(), sm = c?.sortMode || 'user';
    const opts = [['user','👤 Мой порядок'],['name-asc','А→Я'],['name-desc','Я→А'],['album-desc','Альбомы ↓'],['album-asc','Альбомы ↑'],['plays-desc','Топ прослушиваний'],['plays-asc','Меньше всего'],['last-played','Недавние'],['favorites-first','Сначала ⭐']];
    const m = W.Modals?.open({ title: 'Сортировка', bodyHtml: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${opts.map(([v, l]) => `<button class="showcase-btn ${sm === v ? 'active' : ''}" data-val="${v}" style="${v === 'user' ? 'grid-column:1/-1' : ''}">${l}</button>`).join('')}</div>` });
    if (!m) return;
    m.onclick = e => {
      const b = e.target.closest('[data-val]');
      if (!b) return;
      const t = isDef(id) ? Store.def() : Store.get(id);
      if (!t) return;
      t.sortMode = b.dataset.val;
      isDef(id) ? Store.setDef(t) : Store.save(t);
      m.remove();
      this.renderTab();
    };
  }

  _openMenu(uid, fromSearch = false) {
    this._cleanupUi();
    const t = trk(uid), id = this._ctxId(), inPl = !isDef(id) && (Store.get(id)?.order || []).includes(uid);
    if (!t) return;
    const bg = D.createElement('div');
    bg.className = 'sc-bottom-sheet-bg';
    bg.innerHTML = `<div class="sc-bottom-sheet"><button class="sc-sheet-close">×</button><div class="sc-sheet-title">${esc(t.title)}</div><div class="sc-sheet-sub">${esc(albT(t.sourceAlbum))}</div>
      ${fromSearch ? `<button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><hr style="border-color:rgba(255,255,255,.08);margin:8px 0">` : ''}
      <button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>
      ${inPl ? `<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из плейлиста</button>` : ''}
      <button class="sc-sheet-btn" id="bm-eye">${this._isHidden(uid, id) ? `👁 Показать в «${this._ctxName(id)}»` : `🙈 Скрыть в «${this._ctxName(id)}»`}</button>
      <button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite?.(uid) ? '❌ Убрать из Избранного' : '⭐ В Избранное'}</button>
      <button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Офлайн</button>
      <button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3</button>
      <button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button>
      <button class="sc-sheet-btn" id="bm-sh">📸 Поделиться (Карточка)</button>
      <button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button>
      <button class="sc-sheet-btn" id="bm-cx" style="color:#888;justify-content:center">Отмена</button></div>`;
    D.body.appendChild(this._menu = bg);
    requestAnimationFrame(() => bg.classList.add('active'));
    const close = () => {
      bg.classList.remove('active');
      setTimeout(() => bg.remove(), 200);
      this._menu = null;
    };
    bg.querySelector('.sc-sheet-close').onclick = close;
    bg.onclick = e => {
      const a = e.target.id;
      if (e.target === bg || a === 'bm-cx') return close();
      if (!a) return;
      close();

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
    };
  }

  _promptName({ title, value, btnText, onSubmit }) {
    const m = W.Modals?.open({ title, bodyHtml: `<input type="text" id="sc-name-inp" value="${esc(value)}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="sc-name-save">${btnText}</button>` });
    if (!m) return;
    setTimeout(() => m.querySelector('#sc-name-inp')?.select(), 50);
    m.querySelector('#sc-name-save').onclick = () => {
      const v = m.querySelector('#sc-name-inp')?.value.trim();
      if (!v) return;
      m.remove();
      onSubmit(v);
    };
  }

  _renamePl(id) {
    const p = Store.get(id);
    if (!p) return;
    this._promptName({
      title: 'Переименовать',
      value: p.name,
      btnText: 'Сохранить',
      onSubmit: v => {
        p.name = v;
        Store.save(p);
        this._renderPlaylists();
      }
    });
  }

  _sharePl(id) {
    const p = Store.get(id);
    if (!p) return;
    const u = `${W.location.origin}${W.location.pathname}?playlist=${btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, n: p.name, u: p.order || [] }))))}`;
    navigator.share ? navigator.share({ title: p.name, url: u }).catch(() => {}) : navigator.clipboard.writeText(u).then(() => W.NotificationSystem?.success('Ссылка скопирована!'));
  }

  _shareList(uids) {
    const list = (uids || []).filter(trk).map(bldTrk).filter(Boolean);
    if (!list.length) return;
    import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', list[0], { playlist: list }));
  }

  _createPl(uids, fromEdit = false, name = '') {
    const use = (uids || []).filter(trk);
    if (!use.length) return W.NotificationSystem?.warning('Отметьте треки чекбоксами');
    const done = n => {
      const id = Date.now().toString(36);
      Store.save(mkPl({ id, name: n, order: [...use], hidden: [...use].filter(u => this._ctxHiddenSet().has(u)) }));
      if (fromEdit) this._leaveEdit();
      this._q = '';
      this._sel.clear();
      this._cleanupUi();
      Store.setAct(id);
      this.renderTab();
      W.NotificationSystem?.success(`Плейлист «${n}» создан`);
    };
    return name ? done(name) : this._promptName({ title: 'Новый плейлист', value: `Мой плейлист ${Store.pl().length + 1}`, btnText: 'Создать', onSubmit: done });
  }

  _searchAdd() {
    const u = [...this._sel].filter(trk);
    if (!u.length) return;
    const c = this._ctx();
    if (!c) return;
    const s = new Set(c.order || []);
    u.forEach(x => { if (!s.has(x)) { c.order.push(x); s.add(x); } });
    isDef(this._ctxId()) ? Store.setDef(c) : Store.save(c);
    this._q = '';
    this._sel.clear();
    this._cleanupUi();
    this.renderTab();
    W.NotificationSystem?.success(`Добавлено ${u.length} треков`);
  }

  _handleShr(b64) {
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(String(b64).trim()))));
      if (!d?.n || !Array.isArray(d?.u)) throw 1;
      const u = d.u.filter(trk), miss = d.u.length - u.length;
      W.Modals?.confirm({
        title: '🎵 Вам прислан плейлист',
        textHtml: `<b>${esc(d.n)}</b><br><br>Доступно треков: ${u.length} из ${d.u.length}.${miss > 0 ? '<br><span style="color:#ff9800">Часть треков недоступна.</span>' : ''}`,
        confirmText: 'Добавить',
        cancelText: 'Отмена',
        onConfirm: () => this._createPl(u, false, `${d.n} (Присланный)`)
      });
    } catch {
      W.NotificationSystem?.error('Ошибка чтения ссылки');
    }
  }

  openColorPicker(el, albumKey, playlistId) {
    let aKey = albumKey, cur = '';
    if (playlistId) cur = Store.get(playlistId)?.color || '';
    else {
      if (!aKey && el) aKey = trk(el)?.sourceAlbum;
      cur = Store.cols()?.[aKey] || '';
    }
    const m = W.Modals?.open({ title: playlistId ? 'Цвет плейлиста' : 'Цвет альбома', bodyHtml: `<div class="showcase-color-picker">${PALETTE.map(x => `<div class="showcase-color-dot" style="background:${x};${cur === (x === 'transparent' ? '' : x) ? 'border-color:#fff;' : ''}" data-col="${x}"></div>`).join('')}</div><button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>` });
    if (!m) return;
    m.onclick = e => {
      const b = e.target.closest('[data-col]');
      if (!b) return;
      const v = b.dataset.col === 'transparent' ? '' : b.dataset.col;
      if (playlistId) {
        const p = Store.get(playlistId);
        if (p) { p.color = v; Store.save(p); this._renderPlaylists(); }
      } else if (aKey) {
        const c = Store.cols();
        c[aKey] = v;
        Store.setCols(c);
        this._renderBody(++this._tok);
      }
      m.remove();
    };
  }

  playContext(uid = null) { this._playCtx(uid); }
  handleSharedPlaylist(b64) { this._handleShr(b64); }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

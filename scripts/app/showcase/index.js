/**
 * scripts/app/showcase/index.js
 * Showcase «Витрина Разбита» — полная реализация по спецификации v3.0
 */
import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils;
const NS = 'sc3:', SHOW = '__showcase__';
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const $ = id => D.getElementById(id);
const esc = s => U?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
const trk = u => W.TrackRegistry?.getTrackByUid?.(u);
const albT = k => W.TrackRegistry?.getAlbumTitle?.(k) || k || '';
const deep = v => JSON.parse(JSON.stringify(v));
const randShuffle = a => { const b = [...a]; for (let i = b.length-1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; };

// ─── Каталог (immutable) ───────────────────────────────────────────────
const getCatalog = () =>
  (W.albumsIndex || [])
    .filter(a => !String(a?.key||'').startsWith('__'))
    .flatMap(a => (W.TrackRegistry?.getTracksForAlbum?.(a.key)||[]).map(t => t?.uid).filter(Boolean));

// ─── LocalStorage helpers ──────────────────────────────────────────────
const jGet = (k, d=null) => { try { const v = localStorage.getItem(NS+k); return v ? JSON.parse(v) : d; } catch { return d; } };
const jSet = (k, v) => { try { localStorage.setItem(NS+k, JSON.stringify(v)); } catch {} };

// ─── Нормализация данных ───────────────────────────────────────────────
const normOrder = (order, fallback) => {
  const cat = new Set(getCatalog());
  const seen = new Set();
  const out = [];
  (order||[]).forEach(u => { if (cat.has(u) && !seen.has(u)) { seen.add(u); out.push(u); } });
  (fallback||getCatalog()).forEach(u => { if (cat.has(u) && !seen.has(u)) { seen.add(u); out.push(u); } });
  return out;
};
const normHidden = (hidden, order) => {
  const s = new Set(order);
  return (hidden||[]).filter(u => s.has(u));
};

// ─── Baseline (заводской порядок) ─────────────────────────────────────
const getBaseline = () => getCatalog(); // альбомы в порядке albumsIndex (новые→старые), треки по порядку

// ─── Store ────────────────────────────────────────────────────────────
const Store = {
  // Default context
  getDef() {
    const d = jGet('default', {});
    const order = normOrder(d.order, getBaseline());
    const hidden = normHidden(d.hidden, order);
    return { order, hidden, sortMode: d.sortMode||'user', hiddenPlacement: d.hiddenPlacement||'inline' };
  },
  setDef(v) { jSet('default', { order: v.order||[], hidden: v.hidden||[], sortMode: v.sortMode||'user', hiddenPlacement: v.hiddenPlacement||'inline' }); },

  // User playlists
  getPls() { return (jGet('playlists',[])||[]).filter(p => p?.id); },
  setPls(v) { jSet('playlists', v); },
  getPl(id) { return this.getPls().find(p => p.id===id)||null; },
  savePl(p) {
    const arr = this.getPls(), i = arr.findIndex(x => x.id===p.id);
    i>=0 ? arr.splice(i,1,p) : arr.push(p);
    this.setPls(arr);
  },
  delPl(id) { this.setPls(this.getPls().filter(p => p.id!==id)); },

  // Active context id
  getActId() { return jGet('activeId','__default__'); },
  setActId(id) { jSet('activeId', id); },

  // UI state (глобальное для всей вкладки)
  getUI() { return jGet('ui', { viewMode:'flat', showNumbers:false, showHidden:false }); },
  setUI(v) { jSet('ui', v); },

  // Album colors
  getCols() { return jGet('albumColors', {}); },
  setCols(v) { jSet('albumColors', v); },

  // Scroll positions
  getScroll(id) { return jGet('scroll_'+id, 0); },
  setScroll(id, y) { jSet('scroll_'+id, y); },

  // Sort per context
  getSort(id) { return jGet('sort_'+id, 'user'); },
  setSort(id, v) { jSet('sort_'+id, v); },

  // Hidden placement per context
  getPlacement(id) { return jGet('placement_'+id, 'inline'); },
  setPlacement(id, v) { jSet('placement_'+id, v); },
};

// ─── Draft (черновик редактирования) ──────────────────────────────────
class Draft {
  constructor(ctxId) {
    this.ctxId = ctxId;
    this.isDef = ctxId === '__default__';
    const src = this.isDef ? Store.getDef() : Store.getPl(ctxId);
    // baseline для reset
    if (this.isDef) {
      this.baseline = { order: getBaseline(), hidden: [] };
    } else {
      const snap = src?.creationSnapshot;
      this.baseline = snap
        ? { order: [...(snap.order||[])], hidden: [...(snap.hidden||[])] }
        : { order: [...(src?.order||[])], hidden: [...(src?.hidden||[])] };
    }
    // рабочий черновик
    if (this.isDef) {
      this.order = normOrder(src.order, getBaseline());
      this.hidden = new Set(src.hidden||[]);
    } else {
      this.order = [...(src?.order||[])].filter(u => trk(u));
      this.hidden = new Set((src?.hidden||[]).filter(u => trk(u)));
    }
    this.checked = new Set(); // checkbox
    this._origSig = this._sig();
  }

  _sig() { return JSON.stringify({ o: this.order, h: [...this.hidden].sort() }); }
  isDirty() { return this._sig() !== this._origSig; }

  getList() {
    if (this.isDef) return normOrder(this.order, getBaseline());
    return this.order.filter(u => trk(u));
  }

  toggleCheck(uid) { this.checked.has(uid) ? this.checked.delete(uid) : this.checked.add(uid); }
  checkAll(on) { this.checked = on ? new Set(this.getList()) : new Set(); }

  toggleHidden(uid) {
    if (this.hidden.has(uid)) {
      this.hidden.delete(uid);
      // в дефолте: если снимаем hidden — автоматически checked
      if (this.isDef) this.checked.add(uid);
    } else {
      this.hidden.add(uid);
      // в дефолте: если hidden — автоматически unchecked
      if (this.isDef) this.checked.delete(uid);
    }
  }

  move(uid, dir) {
    const i = this.order.indexOf(uid), j = i+dir;
    if (i<0||j<0||j>=this.order.length) return;
    [this.order[i],this.order[j]] = [this.order[j],this.order[i]];
  }

  setOrder(arr) { this.order = [...arr].filter(Boolean); }

  resetToBaseline() {
    this.order = [...this.baseline.order];
    this.hidden = new Set(this.baseline.hidden);
    this.checked = new Set();
  }
}

// ─── Вспомогательные функции ──────────────────────────────────────────
const bldTrk = uid => {
  const t = trk(uid); if (!t) return null;
  let cover = W.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(i=>i.key===t.sourceAlbum)?.icon||'img/logo.png';
  if (U?.isMobile?.() && /\/icon_album\/[^/]+\.png$/i.test(cover)) {
    const m = cover.match(/\/icon_album\/([^/]+)\.png$/i);
    if (m?.[1]) cover = `img/icon_album/mobile/${m[1]}@1x.jpg`;
  }
  return { ...t, album:'Витрина Разбита', cover };
};

const isShowcaseCtx = k => {
  if (!k) return false;
  return k === SHOW || k === '__default__' || String(k).startsWith(SHOW+':');
};

// ─── Главный класс ────────────────────────────────────────────────────
class ShowcaseManager {
  constructor() {
    this._edit = false;
    this._draft = null;
    this._q = '';
    this._searchRes = [];
    this._searchSel = new Set();
    this._menu = null;
    this._tok = 0;
    this._scrollMap = new Map();
  }

  // ── Init ──────────────────────────────────────────────────────────
  async initialize() {
    await W.TrackRegistry?.ensurePopulated?.();
    // Инициализируем дефолтный контекст если первый раз
    const d = Store.getDef();
    if (!d.order.length) Store.setDef({ order: getBaseline(), hidden: [], sortMode:'user', hiddenPlacement:'inline' });

    W.playerCore?.onFavoritesChanged?.(({ uid }) => {
      if (W.AlbumsManager?.getCurrentAlbum?.() !== SHOW) return;
      D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(uid)}"] .like-star`)
        .forEach(el => el.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png');
    });
    W.addEventListener('offline:stateChanged', () => {
      if (W.AlbumsManager?.getCurrentAlbum?.() === SHOW) W.OfflineIndicators?.refreshAllIndicators?.();
    });
  }

  // ── Контекст ──────────────────────────────────────────────────────
  _ctxId() { return Store.getActId(); }
  _isDef(id) { return (id||this._ctxId()) === '__default__'; }
  _ctxName(id) { return this._isDef(id) ? 'Все треки' : (Store.getPl(id||this._ctxId())?.name||'Плейлист'); }

  _getPlaybackList(id) {
    const ctxId = id || this._ctxId();
    const isDef = this._isDef(ctxId);
    let order, hidden;
    if (isDef) {
      const d = Store.getDef();
      order = d.order;
      hidden = new Set(d.hidden||[]);
    } else {
      const p = Store.getPl(ctxId);
      order = p?.order||[];
      hidden = new Set(p?.hidden||[]);
    }
    return order.filter(u => trk(u) && !hidden.has(u)).map(bldTrk).filter(Boolean);
  }

  getActiveListTracks() { return this._getPlaybackList(); }

  _saveScroll(id) {
    const el = $('track-list');
    if (el && id) { this._scrollMap.set(id, el.scrollTop||0); Store.setScroll(id, el.scrollTop||0); }
  }
  _restoreScroll(id) {
    const el = $('track-list');
    if (el && id) el.scrollTop = this._scrollMap.get(id) ?? Store.getScroll(id) ?? 0;
  }

  // ── Сортировка ────────────────────────────────────────────────────
  async _sortOrder(order, ctxId) {
    const sm = Store.getSort(ctxId);
    if (sm === 'user') return [...order];
    const items = order.map(trk).filter(Boolean);
    if (['plays-desc','plays-asc','last-played'].includes(sm)) {
      try {
        const { metaDB } = await import('../../analytics/meta-db.js');
        const st = new Map((await metaDB.getAllStats()).map(s=>[s.uid,s]));
        const g = (u,k) => st.get(u)?.[k]||0;
        items.sort((a,b) => sm==='plays-desc' ? g(b.uid,'globalFullListenCount')-g(a.uid,'globalFullListenCount')
          : sm==='plays-asc' ? g(a.uid,'globalFullListenCount')-g(b.uid,'globalFullListenCount')
          : g(b.uid,'lastPlayedAt')-g(a.uid,'lastPlayedAt'));
      } catch {}
    } else {
      const rank = new Map((W.albumsIndex||[]).reverse().map((a,i)=>[a.key,i]));
      const r = k => rank.get(k)??9999;
      const cmps = {
        'name-asc': (a,b) => a.title.localeCompare(b.title),
        'name-desc': (a,b) => b.title.localeCompare(a.title),
        'album-asc': (a,b) => r(b.sourceAlbum)-r(a.sourceAlbum)||a.title.localeCompare(b.title),
        'album-desc': (a,b) => r(a.sourceAlbum)-r(b.sourceAlbum)||a.title.localeCompare(b.title),
        'favorites-first': (a,b) => (W.playerCore?.isFavorite?.(b.uid)?1:0)-(W.playerCore?.isFavorite?.(a.uid)?1:0),
      };
      cmps[sm] && items.sort(cmps[sm]);
    }
    return items.map(x=>x.uid);
  }

  // ── Рендер ────────────────────────────────────────────────────────
  async renderTab() {
    const root = $('track-list'); if (!root) return;
    const prevId = root.dataset.scCtxId;
    if (prevId) this._saveScroll(prevId);

    const tok = ++this._tok;
    const ctxId = this._ctxId();
    root.dataset.scCtxId = ctxId;
    this._cleanupUI();

    root.innerHTML = this._renderHeader();
    this._bindRoot(root);
    this._renderPlaylists();
    await this._renderBody(tok);
    if (!this._edit) {
      const lastUid = jGet(this._isDef(ctxId)?'lastUid_default':`lastUid_${ctxId}`, '');
      this._hi(lastUid);
    }
    requestAnimationFrame(() => this._restoreScroll(ctxId));
  }

  _renderHeader() {
    const ctxId = this._ctxId();
    const ui = Store.getUI();
    const sm = Store.getSort(ctxId);
    const isDef = this._isDef(ctxId);
    const sortDot = sm !== 'user' ? '●' : '';
    const defChanged = isDef && this._isDefChanged();

    return `<div class="showcase-header-controls">
      ${this._edit ? `<div class="sc-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ: ${esc(this._ctxName())}
        <div class="sc-edit-actions">
          <button class="showcase-btn sc-btn-save" style="background:#4caf50;color:#fff">💾 Сохранить</button>
          <button class="showcase-btn sc-btn-create" style="background:#4daaff;color:#fff">✨ Создать</button>
          <button class="showcase-btn sc-btn-reset${this._draft?.isDirty()?'':' sc-btn-disabled'}" style="border-color:#ff9800" ${this._draft?.isDirty()?'':'disabled'}>↺ Сброс</button>
          <button class="showcase-btn sc-btn-exit" style="border-color:#ff6b6b">✕ Выйти</button>
        </div>
      </div>` : ''}
      <div class="showcase-search-wrap">
        <input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему каталогу..." value="${esc(this._q)}">
        <button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this._q?'':'none'}">✕</button>
      </div>
      ${!this._edit ? `<div class="showcase-btns-row">
        <button class="showcase-btn sc-btn-edit">✏️ Редактировать</button>
        ${isDef && defChanged ? `<button class="showcase-btn sc-btn-master-reset" style="flex:.5">↺</button>` : ''}
        <button class="showcase-btn sc-btn-sort">↕️${sortDot} Сорт.</button>
      </div>
      <div class="showcase-btns-row">
        <button class="showcase-btn sc-btn-playall">▶ Играть всё</button>
        <button class="showcase-btn sc-btn-shuffle">🔀 Перемешать</button>
      </div>` : ''}
      <div id="sc-playlists-actions" class="showcase-playlists-actions"></div>
      <div id="sc-playlists" class="showcase-playlists-list"></div>
      <div id="sc-status" class="showcase-status-bar"></div>
    </div><div id="sc-tracks-container"></div>`;
  }

  _isDefChanged() {
    const d = Store.getDef();
    const base = getBaseline();
    if (d.hidden?.length) return true;
    if (d.order.length !== base.length) return true;
    return d.order.some((u,i) => u !== base[i]);
  }

  async _renderBody(tok) {
    const box = $('sc-tracks-container'); if (!box) return;
    if (tok !== this._tok) return;

    if (this._edit) { this._renderEdit(box); return; }
    if (this._q) { await this._renderSearch(box, tok); return; }
    await this._renderNormal(box, tok);
  }

  async _renderNormal(box, tok) {
    const ctxId = this._ctxId();
    const isDef = this._isDef(ctxId);
    const ui = Store.getUI();
    const cols = Store.getCols();
    const placement = Store.getPlacement(ctxId);

    let order, hidden;
    if (isDef) {
      const d = Store.getDef();
      order = d.order;
      hidden = new Set(d.hidden||[]);
    } else {
      const p = Store.getPl(ctxId);
      order = p?.order||[];
      hidden = new Set(p?.hidden||[]);
    }

    let sorted = await this._sortOrder(order, ctxId);
    if (tok !== this._tok) return;

    // Размещение скрытых
    if (ui.showHidden && placement === 'end') {
      sorted = [...sorted.filter(u=>!hidden.has(u)), ...sorted.filter(u=>hidden.has(u))];
    } else if (!ui.showHidden) {
      sorted = sorted.filter(u=>!hidden.has(u));
    }

    // Счётчики
    const totalAll = order.length;
    const totalActive = order.filter(u=>!hidden.has(u)).length;
    const totalHidden = order.filter(u=>hidden.has(u)).length;
    this._updateStatus(totalAll, totalActive, totalHidden, false);

    let html = '', group = null;
    sorted.forEach((u,i) => {
      const t = bldTrk(u); if (!t) return;
      const isH = hidden.has(u);
      if (ui.viewMode === 'grouped' && group !== t.sourceAlbum) {
        group = t.sourceAlbum;
        html += `<div class="showcase-group-header">── ${esc(albT(t.sourceAlbum))} ──</div>`;
      }
      html += this._row(t, i, { isH, sN: ui.showNumbers, col: cols[t.sourceAlbum]||'transparent', normalMode: true });
    });
    box.innerHTML = html || '<div class="fav-empty">Треки не найдены</div>';
    W.OfflineIndicators?.injectOfflineIndicators?.(box);
    this._hi(W.playerCore?.getCurrentTrackUid?.());
  }

  async _renderSearch(box, tok) {
    await ensureLyricsIndexLoaded();
    if (tok !== this._tok) return;

    const allUids = W.TrackRegistry?.getAllUids?.() || [];
    this._searchRes = (searchUidsByQuery({ query: this._q }) || []).filter(u => W.TrackRegistry?.getTrackByUid?.(u));

    const ctxId = this._ctxId();
    const isDef = this._isDef(ctxId);
    let ctxSet, hiddenSet;
    if (isDef) {
      const d = Store.getDef();
      ctxSet = new Set(d.order);
      hiddenSet = new Set(d.hidden||[]);
    } else {
      const p = Store.getPl(ctxId);
      ctxSet = new Set(p?.order||[]);
      hiddenSet = new Set(p?.hidden||[]);
    }

    let html = `<div class="sc-search-info">Найдено: ${this._searchRes.length}</div>`;
    this._searchRes.forEach((u,i) => {
      const t = bldTrk(u); if (!t) return;
      const inCtx = ctxSet.has(u);
      const isH = hiddenSet.has(u);
      let bdg = '';
      if (inCtx && !isH) bdg = `<span class="sc-badge sc-badge-active">✓ есть</span>`;
      else if (inCtx && isH) bdg = `<span class="sc-badge sc-badge-hidden">скрыт</span>`;
      else bdg = `<span class="sc-badge sc-badge-missing">+ добавить?</span>`;

      const chk = this._searchSel.has(u);
      html += `<div class="showcase-track sc-search-result${chk?' selected':''}" data-uid="${esc(u)}">
        <input type="checkbox" class="sc-search-chk" data-uid="${esc(u)}" ${chk?'checked':''}>
        <img src="${esc(t.cover)}" class="showcase-track-thumb" loading="lazy">
        <div class="track-title"><div>${esc(t.title)}</div>
          <div class="showcase-track-meta">${esc(albT(t.sourceAlbum))} ${bdg}</div>
        </div>
        <button class="showcase-track-menu-btn" data-uid="${esc(u)}">···</button>
      </div>`;
    });
    box.innerHTML = html || '<div class="fav-empty">Ничего не найдено</div>';
    this._updateStatus(this._searchRes.length, this._searchRes.length, 0, true);
    this._renderSelectionBar();
  }

  _renderEdit(box) {
    const list = this._draft?.getList() || [];
    const isDef = this._draft?.isDef;

    box.innerHTML = list.map(u => {
      const t = bldTrk(u); if (!t) return '';
      const isH = this._draft.hidden.has(u);
      const chk = this._draft.checked.has(u);
      const meta = `${esc(albT(t.sourceAlbum))}${isH ? ' · скрыт 🙈' : ''}`;
      return `<div class="showcase-track sc-edit-row${isH?' inactive':''} ${chk?' selected':''}" data-uid="${esc(u)}" draggable="true">
        <button class="sc-arrow-up" title="Вверх">▲</button>
        <div class="showcase-drag-handle">⠿</div>
        <input type="checkbox" class="sc-chk" ${chk?'checked':''}>
        <img src="${esc(t.cover)}" class="showcase-track-thumb" loading="lazy">
        <div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${meta}</div></div>
        <button class="sc-eye-btn" title="${isH?'Показать':'Скрыть'}">${isH?'🙈':'👁'}</button>
        <button class="sc-arrow-down" title="Вниз">▼</button>
      </div>`;
    }).join('') || '<div class="fav-empty">Нет треков</div>';

    this._bindDrag(box);
    const chkCnt = this._draft.checked.size;
    this._updateStatus(list.length, list.filter(u=>!this._draft.hidden.has(u)).length,
      list.filter(u=>this._draft.hidden.has(u)).length, false, chkCnt);
    this._renderSelectionBar();
  }

  _row(t, i, { isH=false, sN=false, col='transparent', normalMode=false }) {
    const fav = W.playerCore?.isFavorite?.(t.uid);
    const cls = ['showcase-track', isH?'inactive':''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-uid="${esc(t.uid)}" data-hidden="${isH?'1':'0'}" style="border-left:3px solid ${col}">
      <div class="tnum"${sN?'':' style="display:none"'}>${i+1}.</div>
      <img src="${esc(t.cover)}" class="showcase-track-thumb" loading="lazy">
      <div class="track-title">
        <div>${esc(t.title)}</div>
        <div class="showcase-track-meta">${esc(albT(t.sourceAlbum))}</div>
      </div>
      <span class="offline-ind" data-uid="${esc(t.uid)}">🔒</span>
      <img src="${fav?'img/star.png':'img/star2.png'}" class="like-star like-star--indicator" alt="★" data-uid="${esc(t.uid)}">
      <button class="showcase-track-menu-btn" data-uid="${esc(t.uid)}">···</button>
    </div>`;
  }

  _renderPlaylists() {
    const a = $('sc-playlists-actions'), l = $('sc-playlists');
    if (!a||!l) return;
    const ctxId = this._ctxId();
    const pls = Store.getPls();
    a.innerHTML = `<button class="sc-pl-action${this._isDef(ctxId)?' active':''}" id="sc-pl-all">Все треки</button>
      <button class="sc-pl-action" id="sc-pl-new">＋ Плейлист</button>`;
    l.innerHTML = !pls.length ? '' : pls.map(p => `
      <div class="sc-pl-chip${ctxId===p.id?' active':''}" data-plid="${esc(p.id)}">
        <span class="sc-pl-chip-name">${esc(p.name)}</span>
        <span class="sc-pl-chip-cnt">${(p.order||[]).length}</span>
        <button class="sc-pl-chip-menu" data-plid="${esc(p.id)}">···</button>
      </div>`).join('');
  }

  _renderSelectionBar() {
    const box = $('sc-selection-bar');
    const cnt = this._edit
      ? (this._draft?.checked?.size || 0)
      : this._searchSel.size;
    if (!cnt) { if (box) box.remove(); return; }
    if (!box) {
      const el = D.createElement('div');
      el.id = 'sc-selection-bar';
      el.className = 'sc-selection-bar';
      $('track-list')?.prepend(el);
    }
    const bar = $('sc-selection-bar');
    if (!bar) return;
    bar.innerHTML = `<span>Отмечено: <b>${cnt}</b></span>
      <button class="sc-sel-btn" id="sc-sel-add">＋ В плейлист</button>
      <button class="sc-sel-btn" id="sc-sel-create">✨ Создать</button>
      <button class="sc-sel-btn" id="sc-sel-share">🔗 Поделиться</button>
      <button class="sc-sel-btn" id="sc-sel-all">☑ Все</button>
      <button class="sc-sel-btn" id="sc-sel-none">☐ Снять</button>`;
  }

  _updateStatus(total, active, hidden, isSearch=false, checked=0) {
    const el = $('sc-status'); if (!el) return;
    const parts = [];
    if (isSearch) { parts.push(`Найдено: ${total}`); }
    else {
      parts.push(`Треков: ${active}`);
      if (hidden) parts.push(`скрыто: ${hidden}`);
      if (checked) parts.push(`отмечено: ${checked}`);
    }
    el.textContent = parts.join(' · ');
  }

  // ── Подсветка текущего трека ──────────────────────────────────────
  _hi(uid) {
    D.querySelectorAll('.showcase-track.playing').forEach(el => el.classList.remove('playing'));
    if (!uid) return;
    const el = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"]`);
    el?.classList.add('playing');
    el?.scrollIntoView?.({ block:'nearest', behavior:'smooth' });
  }

  // ── Drag & Drop в режиме edit ─────────────────────────────────────
  _bindDrag(box) {
    let src = null;
    box.addEventListener('dragstart', e => {
      const row = e.target.closest('.sc-edit-row');
      if (!row) return;
      src = row.dataset.uid;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    box.addEventListener('dragover', e => {
      e.preventDefault();
      const row = e.target.closest('.sc-edit-row');
      if (!row||!src||row.dataset.uid===src) return;
      box.querySelectorAll('.drag-over').forEach(r=>r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    box.addEventListener('drop', e => {
      e.preventDefault();
      const tgt = e.target.closest('.sc-edit-row');
      if (!tgt||!src||tgt.dataset.uid===src) return;
      const list = this._draft.getList();
      const fi = list.indexOf(src), ti = list.indexOf(tgt.dataset.uid);
      if (fi<0||ti<0) return;
      list.splice(fi,1); list.splice(ti,0,src);
      this._draft.setOrder(list);
      this._editRedraw();
    });
    box.addEventListener('dragend', () => {
      box.querySelectorAll('.dragging,.drag-over').forEach(r=>r.classList.remove('dragging','drag-over'));
      src = null;
    });
  }

  // ── Частичный перерисов edit без полного renderTab ────────────────
  _editRedraw() {
    const box = $('sc-tracks-container'); if (!box) return;
    this._renderEdit(box);
    this._bindDrag(box);
    // обновить кнопку сброса
    const rb = D.querySelector('.sc-btn-reset');
    if (rb) { rb.disabled = !this._draft?.isDirty(); rb.classList.toggle('sc-btn-disabled', !this._draft?.isDirty()); }
  }

  // ── Очистка ───────────────────────────────────────────────────────
  _cleanupUI() {
    this._closeMenu();
    $('sc-selection-bar')?.remove();
  }

  // ── Event binding (делегирование на root) ─────────────────────────
  _bindRoot(root) {
    root._scHandler && root.removeEventListener('click', root._scHandler);
    root._scHandler = e => this._onClick(e);
    root.addEventListener('click', root._scHandler);

    // search input
    root._scInput && root._scInputEl?.removeEventListener('input', root._scInput);
    const inp = $('sc-search');
    if (inp) {
      root._scInputEl = inp;
      root._scInput = U.debounce ? U.debounce(v => this._onSearch(v), 280) : v => this._onSearch(v);
      inp.addEventListener('input', e => root._scInput(e.target.value));
      inp.addEventListener('keydown', e => { if (e.key==='Escape') { this._q=''; this._searchSel.clear(); this.renderTab(); } });
    }
  }

  _onClick(e) {
    const t = e.target;

    // ── Закрыть меню при клике вне ──
    if (this._menu && !t.closest('#sc-ctx-menu') && !t.closest('.showcase-track-menu-btn') && !t.closest('.sc-pl-chip-menu')) {
      this._closeMenu(); return;
    }

    // ── Поиск: очистить ──
    if (t.id==='sc-search-clear') { this._q=''; this._searchSel.clear(); this.renderTab(); return; }

    // ── Плейлисты ──
    if (t.id==='sc-pl-all') { this._switchCtx('__default__'); return; }
    if (t.id==='sc-pl-new') { this._promptCreatePlaylist([]); return; }
    const chip = t.closest('.sc-pl-chip');
    if (chip && !t.closest('.sc-pl-chip-menu')) { this._switchCtx(chip.dataset.plid); return; }
    if (t.closest('.sc-pl-chip-menu')) { this._showPlaylistMenu(t.closest('.sc-pl-chip-menu').dataset.plid, t); return; }

    // ── Edit banner btns ──
    if (t.closest('.sc-btn-save')) { this._doSave(); return; }
    if (t.closest('.sc-btn-create')) { this._doCreateFromDraft(); return; }
    if (t.closest('.sc-btn-reset')) { if (!t.disabled) this._doReset(); return; }
    if (t.closest('.sc-btn-exit')) { this._doExit(); return; }

    // ── Normal mode btns ──
    if (t.closest('.sc-btn-edit')) { this._enterEdit(); return; }
    if (t.closest('.sc-btn-sort')) { this._showSortMenu(t); return; }
    if (t.closest('.sc-btn-playall')) { this._playAll(false); return; }
    if (t.closest('.sc-btn-shuffle')) { this._playAll(true); return; }
    if (t.closest('.sc-btn-master-reset')) { this._masterReset(); return; }

    // ── Selection bar ──
    if (t.id==='sc-sel-add') { this._selAddToPlaylist(); return; }
    if (t.id==='sc-sel-create') { this._selCreate(); return; }
    if (t.id==='sc-sel-share') { this._selShare(); return; }
    if (t.id==='sc-sel-all') { this._selAll(true); return; }
    if (t.id==='sc-sel-none') { this._selAll(false); return; }

    // ── Track row ──
    const row = t.closest('.showcase-track');
    if (!row) return;
    const uid = row.dataset.uid;

    // меню-кнопка
    if (t.closest('.showcase-track-menu-btn')) { this._showTrackMenu(uid, t); return; }

    // чекбокс (edit mode)
    if (t.matches('.sc-chk') && this._edit) { this._toggleEditCheck(uid, t.checked); return; }

    // чекбокс (search mode)
    if (t.matches('.sc-search-chk') && this._q) { this._toggleSearchCheck(uid, t.checked); return; }

    // кнопки edit row
    if (t.closest('.sc-arrow-up')) { this._draft?.move(uid,-1); this._editRedraw(); return; }
    if (t.closest('.sc-arrow-down')) { this._draft?.move(uid,1); this._editRedraw(); return; }
    if (t.closest('.sc-eye-btn')) { this._draft?.toggleHidden(uid); this._editRedraw(); return; }

    // tap по треку
    if (this._edit) return; // в edit mode — клик по треку игнорируем
    if (this._q) { this._showTrackMenu(uid, row); return; } // в поиске — только меню
    if (row.dataset.hidden==='1') { this._showTrackMenu(uid, row); return; } // скрытый — только меню
    this._playTrack(uid);
  }

  // ── Переключение контекста ────────────────────────────────────────
  _switchCtx(id) {
    if (this._edit) { this._doExit(true, () => this._switchCtx(id)); return; }
    this._saveScroll(this._ctxId());
    Store.setActId(id);
    this._q = '';
    this._searchSel.clear();
    this.renderTab();
  }

  // ── Вход в edit mode ──────────────────────────────────────────────
  _enterEdit() {
    this._edit = true;
    this._draft = new Draft(this._ctxId());
    this.renderTab();
  }

  // ── Выход из edit ─────────────────────────────────────────────────
  _doExit(skipDirtyCheck=false, cb=null) {
    const exit = () => {
      this._edit = false; this._draft = null;
      this.renderTab();
      cb?.();
    };
    if (!skipDirtyCheck && this._draft?.isDirty()) {
      this._confirm('Есть несохранённые изменения. Выйти без сохранения?', exit);
    } else { exit(); }
  }

  // ── Сохранить ─────────────────────────────────────────────────────
  _doSave() {
    const draft = this._draft; if (!draft) return;
    if (draft.isDef) {
      Store.setDef({ order: draft.order, hidden: [...draft.hidden], sortMode: Store.getSort('__default__'), hiddenPlacement: Store.getPlacement('__default__') });
    } else {
      const p = Store.getPl(draft.ctxId);
      Store.savePl({ ...p, order: draft.order, hidden: [...draft.hidden] });
    }
    this._edit = false; this._draft = null;
    this.renderTab();
    this._toast('Сохранено ✓');
  }

  // ── Создать плейлист из draft ─────────────────────────────────────
  _doCreateFromDraft() {
    const checked = [...(this._draft?.checked || [])];
    if (!checked.length) { this._toast('Отметьте треки галочками'); return; }
    this._promptCreatePlaylist(checked);
  }

  // ── Сброс ─────────────────────────────────────────────────────────
  _doReset() {
    if (!this._draft?.isDirty()) return;
    this._confirm('Сбросить все изменения до исходного состояния?', () => {
      this._draft.resetToBaseline();
      this._editRedraw();
    });
  }

  // ── Master reset (только дефолт) ──────────────────────────────────
  _masterReset() {
    this._confirm('Сбросить порядок и восстановить все треки?', () => {
      Store.setDef({ order: getBaseline(), hidden: [], sortMode:'user', hiddenPlacement:'inline' });
      this.renderTab();
      this._toast('Сброс выполнен');
    });
  }

  // ── Поиск ────────────────────────────────────────────────────────
  async _onSearch(q) {
    const clr = $('sc-search-clear');
    if (clr) clr.style.display = q ? '' : 'none';
    this._q = q.trim();
    this._searchSel.clear();
    await this.renderTab();
  }

  // ── Чекбоксы edit ────────────────────────────────────────────────
  _toggleEditCheck(uid, on) {
    if (on) this._draft.checked.add(uid); else this._draft.checked.delete(uid);
    // подсветить строку
    D.querySelector(`.sc-edit-row[data-uid="${CSS.escape(uid)}"]`)
      ?.classList.toggle('selected', on);
    const chkCnt = this._draft.checked.size;
    const list = this._draft.getList();
    this._updateStatus(list.length, list.filter(u=>!this._draft.hidden.has(u)).length,
      list.filter(u=>this._draft.hidden.has(u)).length, false, chkCnt);
    this._renderSelectionBar();
  }

  // ── Чекбоксы search ──────────────────────────────────────────────
  _toggleSearchCheck(uid, on) {
    if (on) this._searchSel.add(uid); else this._searchSel.delete(uid);
    D.querySelector(`.sc-search-result[data-uid="${CSS.escape(uid)}"]`)
      ?.classList.toggle('selected', on);
    this._updateStatus(this._searchRes.length, this._searchRes.length, 0, true);
    this._renderSelectionBar();
  }

  _selAll(on) {
    if (this._edit) {
      this._draft?.checkAll(on);
      this._editRedraw();
    } else if (this._q) {
      if (on) this._searchRes.forEach(u=>this._searchSel.add(u)); else this._searchSel.clear();
      // обновить чекбоксы в DOM
      D.querySelectorAll('.sc-search-chk').forEach(cb => {
        cb.checked = on;
        cb.closest('.sc-search-result')?.classList.toggle('selected', on);
      });
      this._updateStatus(this._searchRes.length, this._searchRes.length, 0, true);
      this._renderSelectionBar();
    }
  }

  // ── Добавить отмеченные в плейлист ───────────────────────────────
  _selAddToPlaylist() {
    const uids = this._getChecked();
    if (!uids.length) return;
    const pls = Store.getPls();
    if (!pls.length) { this._promptCreatePlaylist(uids); return; }
    this._showAddToPlaylistMenu(uids);
  }

  _selCreate() {
    const uids = this._getChecked();
    if (!uids.length) { this._toast('Отметьте треки'); return; }
    this._promptCreatePlaylist(uids);
  }

  _selShare() {
    const uids = this._getChecked();
    if (!uids.length) return;
    this._shareCard(uids);
  }

  _getChecked() {
    if (this._edit) return [...(this._draft?.checked || [])];
    if (this._q) return [...this._searchSel];
    return [];
  }

  // ── Воспроизведение ───────────────────────────────────────────────
  _playTrack(uid) {
    const list = this._getPlaybackList();
    const idx = list.findIndex(t=>t.uid===uid);
    if (idx<0) return;
    const ctxId = this._ctxId();
    jSet(this._isDef(ctxId)?'lastUid_default':`lastUid_${ctxId}`, uid);
    W.AlbumsManager?.loadAlbum?.(SHOW);
    W.AlbumsManager?.setPlayingAlbum?.(SHOW);
    W.playerCore?.setPlaylist?.(list, idx, null, { preservePosition: false });
    W.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
    W.playerCore?.play?.(idx);
    this._hi(uid);
  }

  _playAll(shuffle) {
    let list = this._getPlaybackList();
    if (!list.length) return;
    if (shuffle) list = randShuffle(list);
    W.AlbumsManager?.setPlayingAlbum?.(SHOW);
    W.playerCore?.setPlaylist?.(list, 0, null, { preservePosition: false });
    W.PlayerUI?.ensurePlayerBlock?.(0, { userInitiated: true });
    W.playerCore?.play?.(0);
    this._hi(list[0].uid);
  }

  _getPlaybackList(id) {
    const ctxId = id || this._ctxId();
    const isDef = this._isDef(ctxId);
    let order, hidden;
    if (isDef) { const d=Store.getDef(); order=d.order; hidden=new Set(d.hidden||[]); }
    else { const p=Store.getPl(ctxId); order=p?.order||[]; hidden=new Set(p?.hidden||[]); }
    return order.filter(u=>trk(u)&&!hidden.has(u)).map(bldTrk).filter(Boolean);
  }

  // ── Создание плейлиста ────────────────────────────────────────────
  _promptCreatePlaylist(uids=[]) {
    const defName = uids.length===1 ? (trk(uids[0])?.title||'') : `Плейлист ${Store.getPls().length+1}`;
    this._prompt('Название плейлиста:', defName, name => {
      if (!name?.trim()) return;
      const id = SHOW+':'+Date.now();
      const ctxId = this._ctxId();
      const isDef = this._isDef(ctxId);
      // snapshot текущего источника
      let snap;
      if (isDef) { const d=Store.getDef(); snap={order:[...d.order],hidden:[...d.hidden||[]]}; }
      else { const p=Store.getPl(ctxId)||{}; snap={order:[...(p.order||[])],hidden:[...(p.hidden||[])]}; }
      const pl = { id, name:name.trim(), order:uids.length?uids:snap.order, hidden:[], creationSnapshot:snap, created:Date.now() };
      Store.savePl(pl);
      this._switchCtx(id);
      this._toast(`Плейлист «${name.trim()}» создан`);
    });
  }

  // ── Меню трека ────────────────────────────────────────────────────
  _showTrackMenu(uid, anchor) {
    const t = trk(uid); if (!t) return;
    const ctxId = this._ctxId();
    const isDef = this._isDef(ctxId);
    let order, hidden;
    if (isDef) { const d=Store.getDef(); order=new Set(d.order); hidden=new Set(d.hidden||[]); }
    else { const p=Store.getPl(ctxId)||{}; order=new Set(p.order||[]); hidden=new Set(p.hidden||[]); }

    const inCtx = order.has(uid);
    const isH = hidden.has(uid);
    const isFav = W.playerCore?.isFavorite?.(uid);

    const items = [];

    // В normal mode для скрытого трека — первый пункт не воспроизводить
    if (!isH || this._edit || this._q) {
      items.push({ label:'▶ Воспроизвести', action:'play' });
    }
    items.push({ label: isFav?'★ Убрать из избранного':'☆ В избранное', action:'fav' });
    if (inCtx) {
      items.push({ label: isH?'👁 Показать трек':'🙈 Скрыть трек', action:'toggle-hidden' });
    }
    if (!inCtx) {
      items.push({ label:'＋ Добавить в текущий', action:'add-ctx' });
    }
    if (inCtx && !isDef) {
      items.push({ label:'✕ Удалить из плейлиста', action:'remove-ctx' });
    }
    items.push({ label:'＋ Добавить в плейлист…', action:'add-pl' });
    items.push({ label:'🔗 Поделиться карточкой', action:'share' });
    if (W.LyricsManager?.hasLyrics?.(uid)) {
      items.push({ label:'🎤 Текст песни', action:'lyrics' });
    }

    this._showMenu(items, anchor, (action) => {
      if (action==='play') { this._playTrack(uid); }
      else if (action==='fav') { W.playerCore?.toggleFavorite?.(uid); }
      else if (action==='toggle-hidden') { this._toggleHiddenInCtx(uid); }
      else if (action==='add-ctx') { this._addToCtx(uid); }
      else if (action==='remove-ctx') { this._removeFromCtx(uid); }
      else if (action==='add-pl') { this._showAddToPlaylistMenu([uid]); }
      else if (action==='share') { this._shareCard([uid]); }
      else if (action==='lyrics') { W.LyricsManager?.open?.(uid); }
    });
  }

  _toggleHiddenInCtx(uid) {
    const ctxId = this._ctxId();
    const isDef = this._isDef(ctxId);
    if (isDef) {
      const d = Store.getDef();
      const h = new Set(d.hidden||[]);
      h.has(uid) ? h.delete(uid) : h.add(uid);
      Store.setDef({...d, hidden:[...h]});
    } else {
      const p = Store.getPl(ctxId);
      if (!p) return;
      const h = new Set(p.hidden||[]);
      h.has(uid) ? h.delete(uid) : h.add(uid);
      Store.savePl({...p, hidden:[...h]});
    }
    this.renderTab();
  }

  _addToCtx(uid) {
    const ctxId = this._ctxId();
    const isDef = this._isDef(ctxId);
    if (isDef) {
      const d = Store.getDef();
      if (!d.order.includes(uid)) { d.order.push(uid); Store.setDef(d); }
    } else {
      const p = Store.getPl(ctxId);
      if (!p) return;
      if (!p.order.includes(uid)) { p.order.push(uid); Store.savePl(p); }
    }
    this.renderTab();
    this._toast('Добавлено');
  }

  _removeFromCtx(uid) {
    const ctxId = this._ctxId();
    const p = Store.getPl(ctxId);
    if (!p) return;
    Store.savePl({...p, order: p.order.filter(u=>u!==uid), hidden:(p.hidden||[]).filter(u=>u!==uid)});
    this.renderTab();
    this._toast('Удалено из плейлиста');
  }

  // ── Меню плейлиста ────────────────────────────────────────────────
  _showPlaylistMenu(plid, anchor) {
    const p = Store.getPl(plid); if (!p) return;
    const items = [
      { label:'▶ Играть всё', action:'play' },
      { label:'🔀 Перемешать', action:'shuffle' },
      { label:'✏️ Переименовать', action:'rename' },
      { label:'📋 Экспорт ссылки', action:'export' },
      { label:'🗑 Удалить', action:'delete' },
    ];
    this._showMenu(items, anchor, action => {
      if (action==='play') { this._playAll_ctx(plid, false); }
      else if (action==='shuffle') { this._playAll_ctx(plid, true); }
      else if (action==='rename') { this._renamePl(plid); }
      else if (action==='export') { this._exportPl(plid); }
      else if (action==='delete') { this._deletePl(plid); }
    });
  }

  _playAll_ctx(ctxId, shuffle) {
    let list = this._getPlaybackList(ctxId);
    if (!list.length) { this._toast('Нет активных треков'); return; }
    if (shuffle) list = randShuffle(list);
    W.AlbumsManager?.setPlayingAlbum?.(SHOW);
    W.playerCore?.setPlaylist?.(list, 0, null, { preservePosition: false });
    W.PlayerUI?.ensurePlayerBlock?.(0, { userInitiated: true });
    W.playerCore?.play?.(0);
  }

  _renamePl(plid) {
    const p = Store.getPl(plid); if (!p) return;
    this._prompt('Новое название:', p.name, name => {
      if (!name?.trim()) return;
      Store.savePl({...p, name:name.trim()});
      this.renderTab();
    });
  }

  _exportPl(plid) {
    const p = Store.getPl(plid); if (!p) return;
    const data = btoa(encodeURIComponent(JSON.stringify({n:p.name,o:p.order,h:p.hidden||[]})));
    const url = `${location.origin}${location.pathname}?sc-pl=${data}`;
    navigator.clipboard?.writeText(url).then(()=>this._toast('Ссылка скопирована'));
  }

  _deletePl(plid) {
    const p = Store.getPl(plid);
    this._confirm(`Удалить плейлист «${p?.name||''}»?`, () => {
      Store.delPl(plid);
      if (this._ctxId()===plid) Store.setActId('__default__');
      this.renderTab();
    });
  }

  // ── Добавить в существующий плейлист ─────────────────────────────
  _showAddToPlaylistMenu(uids) {
    const pls = Store.getPls();
    if (!pls.length) { this._promptCreatePlaylist(uids); return; }
    const items = [
      { label:'✨ Новый плейлист…', action:'__new__' },
      ...pls.map(p=>({ label:`${p.name} (${(p.order||[]).length})`, action:p.id }))
    ];
    // позиционируем у кнопки selection bar
    const anchor = $('sc-sel-add') || D.body;
    this._showMenu(items, anchor, id => {
      if (id==='__new__') { this._promptCreatePlaylist(uids); return; }
      const p = Store.getPl(id); if (!p) return;
      let added = 0;
      uids.forEach(u => { if (!p.order.includes(u)) { p.order.push(u); added++; } });
      Store.savePl(p);
      this.renderTab();
      this._toast(`Добавлено: ${added} трек(ов)`);
    });
  }

  // ── Share card ────────────────────────────────────────────────────
  _shareCard(uids) {
    if (!uids.length) return;
    if (W.ShareCardManager?.open) { W.ShareCardManager.open(uids); return; }
    // Fallback: генерируем простое сообщение
    const names = uids.map(u=>trk(u)?.title||u).join('\n');
    const text = `🎵 Треки:\n${names}`;
    if (navigator.share) { navigator.share({ title:'Витрина Разбита', text }).catch(()=>{}); }
    else { navigator.clipboard?.writeText(text).then(()=>this._toast('Скопировано')); }
  }

  // ── Меню сортировки ───────────────────────────────────────────────
  _showSortMenu(anchor) {
    const ctxId = this._ctxId();
    const cur = Store.getSort(ctxId);
    const ui = Store.getUI();
    const pl = Store.getPlacement(ctxId);
    const modes = [
      ['user','По порядку пользователя'],
      ['name-asc','По названию A→Z'],
      ['name-desc','По названию Z→A'],
      ['album-asc','По альбому (новые→старые)'],
      ['album-desc','По альбому (старые→новые)'],
      ['plays-desc','По прослушиваниям ↓'],
      ['plays-asc','По прослушиваниям ↑'],
      ['last-played','По дате прослушивания'],
      ['favorites-first','Любимые сначала'],
    ];
    const items = [
      ...modes.map(([v,l]) => ({ label:(cur===v?'● ':' ')+l, action:'sort:'+v })),
      { label:'──────────────', action:null },
      { label:(ui.viewMode==='grouped'?'● ':' ')+'Группировать по альбомам', action:'view:grouped' },
      { label:(ui.viewMode==='flat'?'● ':' ')+'Плоский список', action:'view:flat' },
      { label:'──────────────', action:null },
      { label:(ui.showNumbers?'● ':' ')+'Показывать номера', action:'toggle:numbers' },
      { label:(ui.showHidden?'● ':' ')+'Показывать скрытые', action:'toggle:hidden' },
      { label:'──────────────', action:null },
      { label:(pl==='inline'?'● ':' ')+'Скрытые на месте', action:'placement:inline' },
      { label:(pl==='end'?'● ':' ')+'Скрытые в конце', action:'placement:end' },
    ];
    this._showMenu(items, anchor, action => {
      if (!action) return;
      if (action.startsWith('sort:')) {
        Store.setSort(ctxId, action.slice(5));
        this.renderTab();
      } else if (action.startsWith('view:')) {
        const u = Store.getUI();
        u.viewMode = action.slice(5);
        Store.setUI(u);
        this.renderTab();
      } else if (action==='toggle:numbers') {
        const u = Store.getUI();
        u.showNumbers = !u.showNumbers;
        Store.setUI(u);
        this.renderTab();
      } else if (action==='toggle:hidden') {
        const u = Store.getUI();
        u.showHidden = !u.showHidden;
        Store.setUI(u);
        this.renderTab();
      } else if (action.startsWith('placement:')) {
        Store.setPlacement(ctxId, action.slice(10));
        this.renderTab();
      }
    });
  }

  // ── Контекстное меню (универсальное) ─────────────────────────────
  _showMenu(items, anchor, cb) {
    this._closeMenu();
    const menu = D.createElement('div');
    menu.id = 'sc-ctx-menu';
    menu.className = 'sc-ctx-menu';
    items.forEach(({ label, action }) => {
      if (!action) {
        const sep = D.createElement('div');
        sep.className = 'sc-ctx-sep';
        sep.textContent = '';
        menu.appendChild(sep);
        return;
      }
      const btn = D.createElement('button');
      btn.className = 'sc-ctx-item';
      btn.textContent = label;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._closeMenu();
        cb(action);
      });
      menu.appendChild(btn);
    });

    // Закрыть по ✕
    const cls = D.createElement('button');
    cls.className = 'sc-ctx-close';
    cls.textContent = '✕';
    cls.addEventListener('click', e => { e.stopPropagation(); this._closeMenu(); });
    menu.appendChild(cls);

    D.body.appendChild(menu);
    this._menu = menu;

    // Позиционирование
    requestAnimationFrame(() => {
      const ar = anchor?.getBoundingClientRect?.() || { bottom: 100, left: 100, right: 100, top: 100 };
      const mh = menu.offsetHeight, mw = menu.offsetWidth;
      const vh = W.innerHeight, vw = W.innerWidth;
      let top = ar.bottom + 4;
      let left = ar.left;
      if (top + mh > vh - 8) top = Math.max(8, ar.top - mh - 4);
      if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8);
      menu.style.top = top + 'px';
      menu.style.left = left + 'px';
      menu.style.opacity = '1';
    });
  }

  _closeMenu() {
    if (this._menu) { this._menu.remove(); this._menu = null; }
  }

  // ── Цвета альбомов ────────────────────────────────────────────────
  _showColorPicker(albumKey, anchor) {
    const cols = Store.getCols();
    const cur = cols[albumKey] || 'transparent';
    const items = PALETTE.map(c => ({
      label: (cur===c?'● ':'  ') + (c==='transparent'?'Нет цвета':c),
      action: 'color:'+c
    }));
    this._showMenu(items, anchor, action => {
      if (!action.startsWith('color:')) return;
      const c = action.slice(6);
      const upd = Store.getCols();
      if (c==='transparent') delete upd[albumKey]; else upd[albumKey]=c;
      Store.setCols(upd);
      this.renderTab();
    });
  }

  // ── Импорт плейлиста по ссылке ────────────────────────────────────
  _importFromUrl(raw) {
    try {
      const data = JSON.parse(decodeURIComponent(atob(raw)));
      if (!data?.n || !Array.isArray(data?.o)) throw new Error('bad');
      const id = SHOW+':'+Date.now();
      const order = (data.o||[]).filter(u => trk(u));
      const hidden = (data.h||[]).filter(u => order.includes(u));
      Store.savePl({ id, name:data.n, order, hidden, created:Date.now() });
      this._switchCtx(id);
      this._toast(`Импортирован: «${data.n}»`);
    } catch {
      this._toast('Ошибка импорта ссылки');
    }
  }

  // ── URL-параметры ─────────────────────────────────────────────────
  _checkUrlParams() {
    const sp = new URLSearchParams(location.search);
    const scPl = sp.get('sc-pl');
    if (scPl) {
      const url = new URL(location.href);
      url.searchParams.delete('sc-pl');
      history.replaceState(null,'', url);
      this._importFromUrl(scPl);
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────
  _toast(msg, dur=2200) {
    let el = $('sc-toast');
    if (!el) {
      el = D.createElement('div');
      el.id = 'sc-toast';
      el.className = 'sc-toast';
      D.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('visible'), dur);
  }

  // ── Confirm dialog ────────────────────────────────────────────────
  _confirm(msg, cb) {
    if (W.ModalManager?.confirm) { W.ModalManager.confirm(msg, cb); return; }
    if (confirm(msg)) cb();
  }

  // ── Prompt dialog ─────────────────────────────────────────────────
  _prompt(msg, def, cb) {
    if (W.ModalManager?.prompt) { W.ModalManager.prompt(msg, def, cb); return; }
    const v = prompt(msg, def||'');
    if (v !== null) cb(v);
  }

  // ── Публичные методы для внешних модулей ─────────────────────────
  onTrackChanged(uid) {
    if (W.AlbumsManager?.getCurrentAlbum?.() !== SHOW) return;
    const ctxId = this._ctxId();
    jSet(this._isDef(ctxId)?'lastUid_default':`lastUid_${ctxId}`, uid);
    this._hi(uid);
  }

  onTabActivated() {
    this._checkUrlParams();
    this.renderTab();
  }

  isShowcaseContext(key) { return isShowcaseCtx(key); }

  getContextName(key) { return this._ctxName(key); }

  getTrackList(ctxId) { return this._getPlaybackList(ctxId); }
}

// ─── Singleton ────────────────────────────────────────────────────────
const showcase = new ShowcaseManager();

// ─── CSS ──────────────────────────────────────────────────────────────
const injectCSS = () => {
  if ($('sc-styles')) return;
  const s = D.createElement('style');
  s.id = 'sc-styles';
  s.textContent = `
/* ── Layout ── */
.showcase-header-controls { padding: 8px 8px 0; }
.showcase-btns-row { display:flex; gap:6px; margin:4px 0; }
.showcase-btn { flex:1; padding:7px 6px; border-radius:8px; border:1px solid #444;
  background:#1e1e1e; color:#fff; font-size:13px; cursor:pointer; transition:background .15s; }
.showcase-btn:active { background:#333; }
.sc-btn-disabled { opacity:.4; cursor:not-allowed; }

/* ── Edit banner ── */
.sc-edit-banner { background:#1a2a1a; border:1px solid #4caf50; border-radius:8px;
  padding:8px 10px; margin-bottom:6px; font-size:13px; color:#a5d6a7; }
.sc-edit-actions { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }

/* ── Search ── */
.showcase-search-wrap { position:relative; margin:4px 0; }
.showcase-search { width:100%; box-sizing:border-box; padding:8px 32px 8px 10px;
  border-radius:8px; border:1px solid #444; background:#1a1a1a; color:#fff; font-size:14px; }
.showcase-search:focus { border-color:#4daaff; outline:none; }
.showcase-search-clear { position:absolute; right:8px; top:50%; transform:translateY(-50%);
  background:none; border:none; color:#888; font-size:16px; cursor:pointer; padding:0 4px; }

/* ── Playlists ── */
.showcase-playlists-actions { display:flex; gap:6px; margin:6px 0 2px; flex-wrap:wrap; }
.sc-pl-action { padding:5px 10px; border-radius:16px; border:1px solid #444;
  background:#1e1e1e; color:#ccc; font-size:12px; cursor:pointer; }
.sc-pl-action.active { border-color:#4daaff; color:#4daaff; }
.showcase-playlists-list { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:4px; }
.sc-pl-chip { display:flex; align-items:center; gap:4px; padding:4px 8px;
  border-radius:16px; border:1px solid #444; background:#1e1e1e; cursor:pointer; }
.sc-pl-chip.active { border-color:#4daaff; background:#0d2233; }
.sc-pl-chip-name { font-size:12px; color:#ddd; max-width:100px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sc-pl-chip-cnt { font-size:10px; color:#888; }
.sc-pl-chip-menu { background:none; border:none; color:#888; cursor:pointer;
  padding:0 2px; font-size:14px; }

/* ── Status bar ── */
.showcase-status-bar { font-size:11px; color:#666; padding:2px 0 4px;
  border-bottom:1px solid #2a2a2a; margin-bottom:2px; }

/* ── Track row ── */
.showcase-track { display:flex; align-items:center; gap:8px; padding:7px 8px;
  border-bottom:1px solid #1e1e1e; cursor:pointer; transition:background .12s; position:relative; }
.showcase-track:active { background:#1a1a1a; }
.showcase-track.playing { background:#0d2a1a; border-left-color:#4caf50 !important; }
.showcase-track.inactive { opacity:.5; }
.showcase-track.selected { background:#0a2a0a !important; }
.showcase-track-thumb { width:38px; height:38px; border-radius:6px;
  object-fit:cover; flex-shrink:0; }
.track-title { flex:1; min-width:0; }
.track-title > div:first-child { font-size:14px; color:#eee;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.showcase-track-meta { font-size:11px; color:#777; margin-top:1px; }
.showcase-track-menu-btn { background:none; border:none; color:#666; font-size:20px;
  cursor:pointer; padding:0 4px; flex-shrink:0; }
.like-star--indicator { width:18px; height:18px; opacity:.7; flex-shrink:0; pointer-events:none; }
.tnum { font-size:11px; color:#555; min-width:22px; text-align:right; flex-shrink:0; }

/* ── Edit row ── */
.sc-edit-row { cursor:default; }
.sc-edit-row.dragging { opacity:.4; }
.sc-edit-row.drag-over { border-top:2px solid #4daaff; }
.showcase-drag-handle { color:#555; font-size:18px; cursor:grab; flex-shrink:0; }
.sc-arrow-up, .sc-arrow-down { background:none; border:none; color:#666;
  font-size:13px; cursor:pointer; padding:0 2px; flex-shrink:0; }
.sc-eye-btn { background:none; border:none; font-size:16px; cursor:pointer;
  flex-shrink:0; padding:0 4px; }
.sc-chk, .sc-search-chk { width:18px; height:18px; accent-color:#4caf50;
  cursor:pointer; flex-shrink:0; }

/* ── Search results ── */
.sc-search-info { font-size:12px; color:#666; padding:4px 8px; }
.sc-badge { font-size:10px; padding:1px 5px; border-radius:8px; margin-left:4px; }
.sc-badge-active { background:#1a3a1a; color:#4caf50; }
.sc-badge-hidden { background:#2a2a1a; color:#fdd835; }
.sc-badge-missing { background:#1a1a3a; color:#4daaff; }

/* ── Selection bar ── */
.sc-selection-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  padding:6px 8px; background:#0d2a0d; border-bottom:1px solid #4caf50;
  position:sticky; top:0; z-index:10; }
.sc-sel-btn { padding:4px 10px; border-radius:12px; border:1px solid #4caf50;
  background:transparent; color:#4caf50; font-size:12px; cursor:pointer; }
.sc-sel-btn:active { background:#0a3a0a; }

/* ── Grouped header ── */
.showcase-group-header { font-size:11px; color:#555; padding:8px 8px 2px;
  letter-spacing:.5px; text-transform:uppercase; }

/* ── Context menu ── */
.sc-ctx-menu { position:fixed; z-index:9999; background:#1e1e1e; border:1px solid #333;
  border-radius:10px; min-width:200px; max-width:280px; box-shadow:0 4px 20px rgba(0,0,0,.6);
  opacity:0; transition:opacity .12s; overflow:hidden; }
.sc-ctx-item { display:block; width:100%; padding:11px 14px; background:none;
  border:none; color:#ddd; font-size:14px; text-align:left; cursor:pointer;
  border-bottom:1px solid #2a2a2a; }
.sc-ctx-item:last-of-type { border-bottom:none; }
.sc-ctx-item:active { background:#2a2a2a; }
.sc-ctx-sep { height:1px; background:#333; margin:2px 0; pointer-events:none; }
.sc-ctx-close { display:block; width:100%; padding:9px; background:#111;
  border:none; border-top:1px solid #333; color:#888; font-size:13px; cursor:pointer; }

/* ── Toast ── */
.sc-toast { position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(10px);
  background:#333; color:#fff; padding:8px 18px; border-radius:20px; font-size:13px;
  opacity:0; pointer-events:none; transition:opacity .2s, transform .2s; z-index:99999; }
.sc-toast.visible { opacity:1; transform:translateX(-50%) translateY(0); }

/* ── Empty ── */
.fav-empty { color:#555; text-align:center; padding:40px 20px; font-size:14px; }
  `;
  D.head.appendChild(s);
};

// ─── Экспорт и инициализация ──────────────────────────────────────────
injectCSS();

W.ShowcaseManager = showcase;

// Хук на смену трека (событие из PlayerCore — player:trackChanged)
W.addEventListener?.('player:trackChanged', e => {
  showcase.onTrackChanged(e?.detail?.uid || W.playerCore?.getCurrentTrackUid?.());
});

// Хук на активацию вкладки
W.addEventListener?.('tab:activated', e => {
  if (e?.detail?.tab === 'showcase') showcase.onTabActivated();
});

// Хук для AlbumsManager: перехватываем loadAlbum для showcase-контекста
if (W.AlbumsManager) {
  const orig = W.AlbumsManager.loadAlbum?.bind?.(W.AlbumsManager);
  if (orig) {
    W.AlbumsManager.loadAlbum = function(key, ...rest) {
      if (isShowcaseCtx(key)) { showcase.onTabActivated(); return Promise.resolve(); }
      return orig(key, ...rest);
    };
  }
}

export default showcase;
export { ShowcaseManager, Store, Draft };

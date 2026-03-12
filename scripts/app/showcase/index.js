/**
 * scripts/app/showcase/index.js
 * Showcase «Витрина Разбита» — Ultra-Compact Rebuild v3.2
 */
import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils, ls = localStorage;
const NS = 'sc3:', PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const $ = id => D.getElementById(id), esc = s => U.escapeHtml(String(s ?? ''));
const jGet = (k, d = null) => { try { const v = ls.getItem(NS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const jSet = (k, v) => { try { ls.setItem(NS + k, JSON.stringify(v)); } catch {} };
const trk = u => W.TrackRegistry?.getTrackByUid?.(u);
const albT = k => W.TrackRegistry?.getAlbumTitle?.(k) || k || '';
const isDef = id => id === '__default__';
const deep = v => JSON.parse(JSON.stringify(v));
const uidEsc = u => CSS.escape(String(u || ''));
const randShuffle = a => { for(let i=a.length-1; i>0; i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };

const getCat = () => (W.albumsIndex || []).filter(a => !String(a?.key || '').startsWith('__')).flatMap(a => (W.TrackRegistry?.getTracksForAlbum?.(a.key) || []).map(t => t?.uid).filter(Boolean));

const normSnap = (c, fbOrd = getCat()) => {
  c = (c && typeof c === 'object') ? deep(c) : {};
  const ord = [], hid = [], oS = new Set();
  (c.order || []).forEach(u => trk(u) && !oS.has(u) && (oS.add(u), ord.push(u)));
  fbOrd.forEach(u => trk(u) && !oS.has(u) && (oS.add(u), ord.push(u)));
  (c.hidden || []).forEach(u => trk(u) && oS.has(u) && !hid.includes(u) && hid.push(u));
  return { order: ord, hidden: hid };
};
const normCtx = (c, isDef, fbOrd = getCat()) => {
  c = (c && typeof c === 'object') ? deep(c) : {};
  const { order, hidden } = normSnap(c, fbOrd);
  const res = { ...c, order, hidden, sortMode: c.sortMode || 'user', hiddenPlacement: c.hiddenPlacement || 'inline' };
  if (!isDef) res.creationSnapshot = c.creationSnapshot ? normSnap(c.creationSnapshot, c.creationSnapshot.order || order) : { order: [...order], hidden: [...hidden] };
  return res;
};

const stateSig = ({ order=[], hidden=[], checked=null }) => JSON.stringify({ order:[...order], hidden:[...hidden], ...(checked ? {checked:[...checked]} : {}) });
const bldTrk = u => {
  const t = trk(u); if(!t) return null;
  let c = W.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(i => i.key === t.sourceAlbum)?.icon || 'img/logo.png';
  if (U.isMobile?.() && /\/icon_album\/[^/]+\.png$/i.test(c)) {
    const m = c.match(/\/icon_album\/([^/]+)\.png$/i);
    if (m?.[1]) c = `img/icon_album/mobile/${m[1]}@1x.jpg`;
  }
  return { ...t, album: 'Витрина Разбита', cover: c };
};

const mkPl = ({ id, name, order, hidden = [], color = '', sortMode = 'user', createdAt = Date.now(), hiddenPlacement = 'inline' }) => {
  const s = normSnap({ order, hidden }, order || getCat());
  return normCtx({ id, name, order: s.order, hidden: s.hidden, color, sortMode, hiddenPlacement, createdAt, creationSnapshot: deep(s) }, false, s.order);
};
const Store = {
  pl: () => (jGet('playlists', []) || []).filter(p => p?.id).map(p => normCtx(p, false, p.order || getCat())),
  setPl: v => jSet('playlists', (Array.isArray(v) ? v : []).map(p => normCtx(p, false, p?.order || getCat()))),
  get: id => Store.pl().find(p => p.id === id),
  save: p => { const a = Store.pl(), i = a.findIndex(x => x.id === p.id); ~i ? a[i] = normCtx(p, false, p.order || getCat()) : a.push(normCtx(p, false, p.order || getCat())); Store.setPl(a); },
  del: id => Store.setPl(Store.pl().filter(p => p.id !== id)),
  act: () => jGet('activeId', '__default__'), setAct: id => jSet('activeId', id),
  ui: () => jGet('ui', { viewMode:'flat', showNumbers:false, showHidden:false, hiddenPlacement:'inline' }), setUi: v => jSet('ui', v),
  cols: () => jGet('albumColors', {}), setCols: v => jSet('albumColors', v),
  def: () => {
    const d = normCtx(jGet('default'), true, getCat());
    jSet('default', d);
    return d;
  },
  setDef: v => jSet('default', normCtx(v, true))
};

class Draft {
  constructor(id) {
    this.isDef = isDef(id); const src = this.isDef ? Store.def() : Store.get(id);
    const b = this.isDef ? normCtx(src, true, getCat()) : normCtx(src?.creationSnapshot || {order:src?.order||[], hidden:src?.hidden||[]}, false, src?.creationSnapshot?.order || src?.order || getCat());
    this.b = { ord: [...(b?.order||[])], hid: [...(b?.hidden||[])], chk: this.isDef ? [...(b?.order||[]).filter(u=>!(b?.hidden||[]).includes(u))] : [...(b?.order||[])] };
    this.ord = [...(src?.order || this.b.ord)]; this.hid = new Set(src?.hidden || this.b.hid); this.chk = new Set(this.isDef ? this.ord.filter(u=>!this.hid.has(u)) : this.ord);
  }
  isDirty() {
    const o = this.ord.filter(trk), h = [...this.hid].filter(trk);
    const cOrd = this.isDef ? o : o.filter(u=>this.chk.has(u)), cHid = this.isDef ? h : h.filter(u=>this.chk.has(u)), cChk = this.isDef ? o.filter(u=>!this.hid.has(u)) : cOrd;
    return stateSig({order:cOrd, hidden:cHid, checked:cChk}) !== stateSig({order:this.b.ord, hidden:this.b.hid, checked:this.b.chk});
  }
  tgHid(u) { this.hid.has(u) ? (this.hid.delete(u), this.chk.add(u)) : (this.hid.add(u), this.chk.delete(u)); }
  tgChk(u) { this.chk.has(u) ? (this.chk.delete(u), this.isDef && this.hid.add(u)) : (this.chk.add(u), this.isDef && this.hid.delete(u)); }
  setOrd(a) { this.ord = [...a]; }
  reset() { const b = this.isDef ? normCtx({order:getCat(),hidden:[],sortMode:'user',hiddenPlacement:'inline'},true) : {order:[...this.b.ord],hidden:[...this.b.hid]}; this.ord=[...(b.order||b.ord)]; this.hid=new Set(b.hidden||b.hid); this.chk=new Set(this.isDef ? this.ord.filter(u=>!this.hid.has(u)) : this.ord); }
  getEdit() { if(!this.isDef) return [...this.ord]; const c=getCat(), s=new Set(c), o=this.ord.filter(u=>s.has(u)), e=new Set(o); c.forEach(u=>!e.has(u)&&o.push(u)); return o; }
}

class ShowcaseManager {
  constructor() { this._drf=null; this._edit=false; this._sQ=''; this._sRes=[]; this._sChk=new Set(); this._rTok=0; this._menu=null; this._scr=new Map(); }
  async initialize() {
    await W.TrackRegistry?.ensurePopulated?.(); Store.def();
    W.playerCore?.onFavoritesChanged?.(({uid}) => { if(W.AlbumsManager?.getCurrentAlbum?.()==='__showcase__') { D.querySelectorAll(`.showcase-track[data-uid="${uidEsc(uid)}"] .like-star`).forEach(e=>e.src=W.playerCore.isFavorite(uid)?'img/star.png':'img/star2.png'); this._updStatus(); } });
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum?.() === '__showcase__' && W.OfflineIndicators?.refreshAllIndicators?.());
  }

  _ctxId() { return Store.act(); }
  _ctx() { const id = this._ctxId(); return isDef(id) ? Store.def() : Store.get(id); }
  _ctxName(id=this._ctxId()) { return isDef(id) ? 'Все треки' : (Store.get(id)?.name || 'Плейлист'); }
  _cleanupUi() { try{$('sc-search-sticky')?.remove();this._menu?.remove();}catch{} this._menu=null; }
  _saveScroll(id) { const el = $('track-list'); if (el && id) { this._scr.set(id, el.scrollTop || 0); jSet(`scroll_${id}`, el.scrollTop || 0); } }
  _restoreScroll(id) { const el = $('track-list'); if (el && id) el.scrollTop = Math.max(0, Number(this._scr.get(id) ?? jGet(`scroll_${id}`, 0)) || 0); }
  _markLastPlayed(uid, id=this._ctxId()) { jSet(isDef(id) ? 'lastUid_default' : `lastUid_${id}`, uid); }
  _hasDefChg() { const a=Store.def(), b=normCtx({order:getCat(), hidden:[], sortMode:'user', hiddenPlacement:'inline'}, true); return JSON.stringify(a.order)!==JSON.stringify(b.order) || JSON.stringify(a.hidden)!==JSON.stringify(b.hidden); }
  _isHid(u, id=this._ctxId()) { return !!(isDef(id) ? Store.def() : Store.get(id))?.hidden?.includes(u); }
  _tgHid(u, id=this._ctxId()) { const c = isDef(id) ? Store.def() : Store.get(id); if(!c)return; const h=new Set(c.hidden||[]); h.has(u)?h.delete(u):h.add(u); c.hidden=[...h]; isDef(id)?Store.setDef(c):Store.save(c); this.renderTab(); }
  getActiveListTracks() { const c = this._ctx(), h = new Set(c?.hidden || []); return (c?.order || []).filter(u => !h.has(u) && trk(u)).map(bldTrk).filter(Boolean); }

  async _sortedOrder(ctx) {
    let ord = [...(ctx?.order || [])].filter(trk), sm = ctx?.sortMode || 'user';
    if (sm === 'user') return ord; const ts = ord.map(trk).filter(Boolean);
    if (['plays-desc', 'plays-asc', 'last-played'].includes(sm)) {
      try { const m = new Map((await (await import('../../analytics/meta-db.js')).metaDB.getAllStats()).map(s => [s.uid, s])); const gS = (u, k) => m.get(u)?.[k] || 0;
      ts.sort((a,b) => sm==='plays-desc'?gS(b.uid,'globalFullListenCount')-gS(a.uid,'globalFullListenCount') : sm==='plays-asc'?gS(a.uid,'globalFullListenCount')-gS(b.uid,'globalFullListenCount') : gS(b.uid,'lastPlayedAt')-gS(a.uid,'lastPlayedAt')); } catch {}
    } else {
      const rM = new Map((W.albumsIndex||[]).reverse().map((a,i)=>[a.key,i])), rO = k => rM.get(k) ?? 9999;
      const f = {'name-asc':(a,b)=>a.title.localeCompare(b.title), 'name-desc':(a,b)=>b.title.localeCompare(a.title), 'album-asc':(a,b)=>rO(b.sourceAlbum)-rO(a.sourceAlbum)||a.title.localeCompare(b.title), 'album-desc':(a,b)=>rO(a.sourceAlbum)-rO(b.sourceAlbum)||a.title.localeCompare(b.title), 'favorites-first':(a,b)=>(W.playerCore?.isFavorite?.(b.uid)?1:0)-(W.playerCore?.isFavorite?.(a.uid)?1:0)};
      f[sm] && ts.sort(f[sm]);
    } return ts.map(t=>t.uid);
  }

  async _getDisp() {
    const c = this._ctx(), ui = Store.ui(), hid = new Set(c?.hidden || []);
    if (this._edit) return { t: 'edit', uids: this._drf?.getEdit() || [] };
    if (this._sQ) { await ensureLyricsIndexLoaded(); this._sRes = (searchUidsByQuery({ query: this._sQ }) || []).filter(trk); return { t: 'search', res: this._sRes, cOrd: c?.order || [], cHid: hid }; }
    this._sRes = []; let ord = await this._sortedOrder(c);
    if (ui.hiddenPlacement === 'end') ord = [...ord.filter(u => !hid.has(u)), ...ord.filter(u => hid.has(u))];
    if (!ui.showHidden) ord = ord.filter(u => !hid.has(u));
    return { t: 'normal', uids: ord, hid };
  }

  _headerHtml(c, ui, id) {
    const sm = c?.sortMode || 'user', sr = isDef(id) && this._hasDefChg(), cr = !!this._drf?.isDirty();
    return `<div class="showcase-header-controls">
      ${this._edit ? `<div class="sc-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<div class="sc-edit-actions"><button class="showcase-btn sc-btn-save" style="background:#4caf50;color:#fff;">💾 Сохранить</button><button class="showcase-btn sc-btn-create" style="background:#4daaff;color:#fff;">✨ Создать</button><button class="showcase-btn sc-btn-reset ${cr?'':'sc-btn-disabled'}" style="border-color:#ff9800;" ${cr?'':'disabled'}>↺ Сброс</button><button class="showcase-btn sc-btn-exit" style="border-color:#ff6b6b;">✕ Выйти</button></div></div>` : ''}
      <div class="showcase-search-wrap"><input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему каталогу..." value="${esc(this._sQ)}"><button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this._sQ?'':'none'}">✕</button></div>
      ${!this._edit ? `<div class="showcase-btns-row"><button class="showcase-btn sc-btn-edit">✏️ Редактировать</button>${sr ? `<button class="showcase-btn sc-btn-master-reset" style="flex:.5">↺ Сброс</button>` : ''}<button class="showcase-btn sc-btn-sort">↕️ ${sm!=='user'?'●':''} Сортировка</button></div><div class="showcase-btns-row"><button class="showcase-btn sc-btn-playall">▶ Играть всё</button><button class="showcase-btn sc-btn-shuffle">🔀 Перемешать</button></div>` : ''}
      <div class="showcase-playlists-actions" id="sc-playlists-actions"></div><div class="showcase-playlists-list" id="sc-playlists"></div><div class="showcase-status-bar" id="sc-status"></div>
    </div><div id="sc-tracks-container"></div>`;
  }

  async renderTab() {
    const l = $('track-list'); if(!l)return; const p = l.dataset.scCtxId; if(p) this._saveScroll(p);
    const t = ++this._rTok, id = this._ctxId(), c = this._ctx(), ui = Store.ui();
    this._cleanupUi(); l.dataset.scCtxId = id; l.innerHTML = this._headerHtml(c, ui, id);
    this._bindRoot(l); this._renderPlaylists(); await this._renderBody(t);
    if(!this._edit) this._hiTrack(jGet(isDef(id)?'lastUid_default':`lastUid_${id}`,''));
    requestAnimationFrame(() => this._restoreScroll(id));
  }

  async _renderBody(t) {
    const c = $('sc-tracks-container'); if(!c)return; const d = await this._getDisp(); if(t !== this._rTok) return;
    if(d.t === 'edit') return this._renderEdit(c, d.uids); if(d.t === 'search') return this._renderSearch(c, d); return this._renderNormal(c, d);
  }

  _trackRow(t, i, { isH=false, sN=false, col='transparent', srh=false, chk=false, bdg='' }={}) {
    return `<div class="showcase-track ${isH ? 'inactive' : ''} ${srh ? 'sc-search-result' : ''}" data-uid="${t.uid}" style="border-left:3px solid ${col}"><div class="tnum" ${sN ? '' : 'style="display:none"'}>${i + 1}.</div><img src="${t.cover}" class="showcase-track-thumb" loading="lazy"><div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${esc(albT(t.sourceAlbum))}${bdg ? ` ${bdg}` : ''}</div></div>${srh ? `<input type="checkbox" class="sc-search-chk" data-uid="${t.uid}" ${chk ? 'checked' : ''}>` : `<span class="offline-ind" data-uid="${t.uid}">🔒</span><img src="${W.playerCore?.isFavorite?.(t.uid) ? 'img/star.png' : 'img/star2.png'}" class="like-star" data-uid="${t.uid}" data-album="${t.sourceAlbum}">`}<button class="showcase-track-menu-btn" data-uid="${t.uid}">···</button></div>`;
  }

  _renderNormal(c, { uids, hid }) {
    const ui = Store.ui(), cols = Store.cols(); let h='', g=null;
    uids.forEach((u,i) => { const t=bldTrk(u); if(!t)return; if(ui.viewMode==='grouped' && g!==t.sourceAlbum) { g=t.sourceAlbum; h+=`<div class="showcase-group-header">── ${esc(albT(t.sourceAlbum))} ──</div>`; } h+=this._trackRow(t,i,{isH:hid?.has(u), sN:ui.showNumbers, col:cols[t.sourceAlbum]||'transparent'}); });
    c.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>'; W.OfflineIndicators?.injectOfflineIndicators?.(c); this._hiTrack(W.playerCore?.getCurrentTrackUid?.()); this._updStatus(uids.length, false);
  }

  _renderSearch(c, { res, cOrd, cHid }) {
    const oS = new Set(cOrd||[]); let h = `<div class="sc-search-info">Найдено: ${res.length} треков</div>`;
    res.forEach((u,i) => { const t=bldTrk(u); if(!t)return; const bdg = oS.has(u) ? (cHid?.has(u) ? '<span class="sc-badge sc-badge-hidden">скрыт</span>' : '<span class="sc-badge sc-badge-active">уже есть</span>') : '<span class="sc-badge sc-badge-missing">добавить?</span>'; h+=this._trackRow(t,i,{srh:true, chk:this._sChk.has(u), bdg}); });
    c.innerHTML = h || '<div class="fav-empty">Ничего не найдено</div>'; this._renderSrhStk(); this._updStatus(res.length, true);
  }

  _renderSrhStk() {
    $('sc-search-sticky')?.remove(); if(!this._sChk.size) return;
    const b=D.createElement('div'); b.id='sc-search-sticky'; b.className='showcase-sticky-bar';
    b.innerHTML=`<span>Выбрано: ${this._sChk.size}</span><button class="showcase-btn sc-search-add">➕ Добавить</button><button class="showcase-btn sc-search-create" style="background:#4daaff;color:#fff;">✨ Создать</button><button class="showcase-btn" id="sc-search-clear-query">🧹 Очистить поиск</button><button class="showcase-btn" id="sc-search-clear-selection">✕ Снять</button>`; D.body.appendChild(b);
  }

  _renderEdit(c, uids) {
    c.innerHTML = uids.map(u => {
      const t = bldTrk(u); if(!t) return ''; const isH = this._drf.hid.has(u), isC = this._drf.chk.has(u), rm = !isC && !this._drf.isDef, mt = `${esc(albT(t.sourceAlbum))}${rm ? ' · будет удалён' : (isH && isC && !this._drf.isDef ? ' · скрыт' : '')}`;
      return `<div class="showcase-track sc-edit-row ${isH ? 'inactive' : ''} ${isC ? 'sc-checked' : ''} ${rm ? 'sc-will-remove' : ''}" data-uid="${u}" draggable="true"><button class="sc-arrow-up">▲</button><div class="showcase-drag-handle">⠿</div><input type="checkbox" class="sc-chk" ${isC ? 'checked' : ''}><img src="${t.cover}" class="showcase-track-thumb" loading="lazy"><div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${mt}</div></div><button class="sc-eye-btn" title="Показать/Скрыть">${isH ? '🙈' : '👁'}</button><button class="sc-arrow-down">▼</button></div>`;
    }).join('') || '<div class="fav-empty">Нет треков</div>';
    this._bindDrag(c); this._updStatus(uids.filter(u => !this._drf.hid.has(u)).length, false);
  }

  _renderPlaylists() {
    const a=$('sc-playlists-actions'), l=$('sc-playlists'); if(!a||!l) return; const id=this._ctxId(), p=Store.pl();
    a.innerHTML=`<button class="sc-pl-action ${isDef(id)?'active':''}" id="sc-pl-all">Все треки</button><button class="sc-pl-action" id="sc-pl-pst" title="Вставить ссылку">📋</button>`;
    l.innerHTML=!p.length ? '<div class="sc-pl-empty">Плейлистов пока нет</div>' : p.map(x=>`<div class="sc-pl-row ${id===x.id?'active':''}" data-pid="${x.id}" ${x.color?`style="--pl-color:${x.color};"`:''}><div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(x.name)}">${esc(x.name)}</span></div><div class="sc-pl-right"><button class="sc-pl-btn" data-act="rename" data-pid="${x.id}" title="Переименовать">✏️</button><button class="sc-pl-btn" data-act="shr" data-pid="${x.id}" title="Поделиться">🔗</button><button class="sc-pl-btn" data-act="col" data-pid="${x.id}" title="Цвет">🎨</button><button class="sc-pl-btn danger" data-act="del" data-pid="${x.id}" title="Удалить">✖</button></div></div>`).join('');
  }

  _updStatus(cnt, isSrh = false) {
    const s = $('sc-status'); if(!s)return; const c = this._ctx(), ui = Store.ui(), ord = (c?.order || []).filter(trk), hid = new Set(c?.hidden || []);
    const a = ord.length, h = ord.filter(u => hid.has(u)).length, chk = this._edit ? (this._drf?.chk?.size || 0) : this._sChk.size;
    s.innerHTML = `<span>📋 ${isSrh ? `${cnt} найдено` : `${a} всего · ${a - h} активных · ${h} скрытых`}${chk ? `<span style="color:#ff9800"> · ✓ ${chk}</span>` : ''}</span><span style="display:flex;gap:12px;align-items:center"><span id="sc-tg-hidden" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${ui.showHidden ? '👁' : '🙈'}</span><span id="sc-tg-numbers" style="cursor:pointer;font-size:18px;min-width:42px;display:inline-flex;align-items:center;justify-content:center;opacity:${ui.showNumbers ? '1' : '.72'}" title="Нумерация">1,2,3</span><span id="sc-tg-view" style="cursor:pointer;font-size:18px" title="Вид">${ui.viewMode === 'flat' ? '⊞' : '⊟'}</span><span id="sc-tg-placement" style="cursor:pointer;font-size:14px" title="Скрытые в конце">${ui.hiddenPlacement === 'end' ? '↓скр' : '≡скр'}</span></span>`;
  }

  _hiTrack(uid) { D.querySelectorAll('.showcase-track.current').forEach(el => el.classList.remove('current')); if (uid) D.querySelectorAll(`.showcase-track[data-uid="${uidEsc(uid)}"]`).forEach(el => el.classList.add('current')); }

  _bindRoot(r) {
    if (r._scClick) r.removeEventListener('click', r._scClick); r.addEventListener('click', r._scClick = e => this._onClick(e));
    const i = $('sc-search'), c = $('sc-search-clear');
    if (i) {
      if(i._scInput) i.removeEventListener('input', i._scInput);
      i.addEventListener('input', i._scInput = U.func.debounceFrame(async () => { this._sQ = i.value.trim(); this._sChk.clear(); if (c) c.style.display = this._sQ ? '' : 'none'; this._cleanupUi(); await this._renderBody(++this._rTok); }));
      i.addEventListener('keydown', e => e.key === 'Enter' && i.blur());
    }
    if (c) {
      if(c._scClear) c.removeEventListener('click', c._scClear);
      c.addEventListener('click', c._scClear = () => { if (i) i.value = ''; this._sQ = ''; this._sChk.clear(); this._cleanupUi(); c.style.display = 'none'; this._renderBody(++this._rTok); });
    }
  }

  async _onClick(e) {
    const t = e.target, btn = t.closest('button,[data-act],[data-pid],#sc-tg-hidden,#sc-tg-numbers,#sc-tg-view,#sc-tg-placement,.sc-search-chk,.showcase-track,.sc-pl-row,.like-star,.offline-ind'); if (!btn) return;
    const cUi = () => { const ui = Store.ui(); return { ui, save: () => { Store.setUi(ui); this._renderBody(++this._rTok); } }; };
    const acts = {
      'sc-pl-all': () => this._swCtx('__default__'),
      'sc-pl-pst': () => navigator.clipboard.readText().then(v => this._handleShr(new URLSearchParams(v.split('?')[1] || v).get('playlist') || v)).catch(() => W.NotificationSystem?.error('Ошибка буфера')),
      'sc-tg-hidden': () => { const x=cUi(); x.ui.showHidden = !x.ui.showHidden; x.save(); },
      'sc-tg-numbers': () => { const x=cUi(); x.ui.showNumbers = !x.ui.showNumbers; x.save(); },
      'sc-tg-view': () => { const x=cUi(); x.ui.viewMode = x.ui.viewMode==='flat'?'grouped':'flat'; x.save(); },
      'sc-tg-placement': () => { const x=cUi(); x.ui.hiddenPlacement = x.ui.hiddenPlacement==='inline'?'end':'inline'; x.save(); },
      'sc-search-clear-selection': () => { this._sChk.clear(); this._renderSrhStk(); this._updStatus(this._sRes.length, true); },
      'sc-search-clear-query': () => { const i=$('sc-search'); if(i) i.value=''; this._sQ=''; this._sChk.clear(); this._cleanupUi(); this._renderBody(++this._rTok); }
    };
    if (acts[btn.id]) return acts[btn.id]();

    const act = btn.dataset?.act, pid = btn.dataset?.pid;
    if (act && pid) {
      if (act === 'rename') return this._rnmPl(pid); if (act === 'shr') return this._shrPl(pid); if (act === 'col') return this.opnCol(null, null, pid);
      if (act === 'del') return W.Modals?.confirm({ title:'Удалить плейлист?', confirmText:'Да', onConfirm: () => { Store.del(pid); this._ctxId()===pid ? this._swCtx('__default__') : this.renderTab(); } });
    }
    const rPl = t.closest('.sc-pl-row'); if (rPl?.dataset.pid && !act) return this._swCtx(rPl.dataset.pid);

      const clActs = {
        'sc-btn-edit': () => this._editM(true), 'sc-btn-save': () => this._saveEdit(), 'sc-btn-create': () => this._crtEdit(), 'sc-btn-reset': () => this._rstEdit(), 'sc-btn-exit': () => this._exitEdit(),
        'sc-btn-master-reset': () => W.Modals?.confirm({ title:'Сбросить «Все треки»?', textHtml:'Порядок вернётся к заводскому, все скрытые треки станут видимыми.', confirmText:'Сбросить', cancelText:'Отмена', onConfirm:() => { Store.setDef(normCtx({order:getCat(), hidden:[], sortMode:'user', hiddenPlacement:'inline'}, true)); this.renderTab(); } }),
        'sc-btn-playall': () => this._playCtx(), 'sc-btn-shuffle': () => this._playCtx(null, true), 'sc-btn-sort': () => this._opnSort(),
        'sc-search-add': () => { const u=[...this._sChk].filter(trk); if(!u.length)return; const c=this._ctx(); if(!c)return; const oS=new Set(c.order||[]), hS=new Set(c.hidden||[]); u.forEach(x=>{ if(!oS.has(x)){ c.order.push(x); oS.add(x); } hS.delete(x); }); c.hidden=[...hS]; isDef(this._ctxId()) ? Store.setDef(c) : Store.save(c); this._sQ=''; this._sChk.clear(); this._cleanupUi(); this.renderTab(); W.NotificationSystem?.success(`Добавлено ${u.length} треков`); },
        'sc-search-create': () => { const u=[...this._sChk].filter(trk); if(!u.length)return; this._askPl(n=>{ const id=Date.now().toString(36); Store.save(mkPl({ id, name:n, order:[...u] })); this._sQ=''; this._sChk.clear(); this._cleanupUi(); Store.setAct(id); this.renderTab(); W.NotificationSystem?.success(`Плейлист «${n}» создан`); }); }
      };
      for (const k in clActs) if (btn.classList?.contains(k)) return clActs[k]();

    if (this._edit) return this._hEditClick(e);
    if (t.closest('.like-star') || t.closest('.offline-ind')) return;
    const uid = t.closest('.showcase-track')?.dataset.uid; if (!uid) return;
    if (this._sQ) { if (t.classList?.contains('sc-search-chk')) { t.checked ? this._sChk.add(uid) : this._sChk.delete(uid); this._renderSrhStk(); return this._updStatus(this._sRes.length, true); } return this._openMenu(uid, true); }
    if (t.closest('.showcase-track-menu-btn')) return this._openMenu(uid, false);
    return this._playCtx(uid);
  }

  _hEditClick(e) {
    const r = e.target.closest('.sc-edit-row'), u = r?.dataset.uid; if (!u || !this._drf) return;
    if (e.target.classList.contains('sc-chk')) this._drf.tgChk(u);
    else if (e.target.closest('.sc-eye-btn')) this._drf.tgHid(u);
    else if (e.target.closest('.sc-arrow-up')) { const a=this._drf.ord, i=a.indexOf(u); if(i>0) { [a[i],a[i-1]]=[a[i-1],a[i]]; this._drf.ord=[...a]; } }
    else if (e.target.closest('.sc-arrow-down')) { const a=this._drf.ord, i=a.indexOf(u); if(i<a.length-1 && i>=0) { [a[i],a[i+1]]=[a[i+1],a[i]]; this._drf.ord=[...a]; } }
    else return;
    this._renderEdit($('sc-tracks-container'), this._drf.getEdit());
  }

  _swCtx(id) { if (this._edit) return W.NotificationSystem?.warning('Выйдите из режима редактирования'); this._cleanupUi(); this._sChk.clear(); Store.setAct(id); this.renderTab(); }
  _editM(mode) { if (mode) { const c=this._ctx(); if(!c)return; this._drf=new Draft(this._ctxId()); this._edit=true; } else { this._drf=null; this._edit=false; } this.renderTab(); }
  _saveEdit() { if (!this._drf) return; const id = this._ctxId(), ord = this._drf.ord.filter(trk), hid = [...this._drf.hid].filter(trk); if (isDef(id)) { const c = Store.def(); c.order = ord; c.hidden = ord.filter(u => !this._drf.chk.has(u) || this._drf.hid.has(u)); Store.setDef(c); } else { const c = Store.get(id); if(!c) return; c.order = ord.filter(u=>this._drf.chk.has(u)); c.hidden = hid.filter(u=>this._drf.chk.has(u)); Store.save(c); } this._editM(false); W.NotificationSystem?.success('Сохранено'); }
  _crtEdit() { if (!this._drf) return; const u = this._drf.ord.filter(x => this._drf.chk.has(x) && !this._drf.hid.has(x) && trk(x)); if (!u.length) return W.NotificationSystem?.warning('Отметьте треки чекбоксами'); this._askPl(n => { const id=Date.now().toString(36); Store.save(mkPl({ id, name:n, order:[...u] })); this._editM(false); Store.setAct(id); this.renderTab(); W.NotificationSystem?.success(`Плейлист «${n}» создан`); }); }
  _rstEdit() { if(this._drf?.isDirty()) W.Modals?.confirm({ title:'Сброс', textHtml:this._drf.isDef ? 'Список вернётся к заводскому: все треки, порядок по альбомам. Продолжить?' : 'Плейлист вернётся к состоянию при создании. Продолжить?', confirmText:'Сбросить', cancelText:'Отмена', onConfirm:()=>{ this._drf.reset(); this._renderEdit($('sc-tracks-container'), this._drf.getEdit()); } }); }
  _exitEdit() { this._drf?.isDirty() ? W.Modals?.confirm({ title:'Выйти без сохранения?', textHtml:'Изменения не будут сохранены.', confirmText:'Выйти', cancelText:'Отмена', onConfirm:()=>this._editM(false) }) : this._editM(false); }

  _bindDrag(c) {
    if (c._scDrag) return; c._scDrag = 1;
    c.addEventListener('dragstart', e => { const r = e.target.closest('.sc-edit-row'); r && (e.dataTransfer.setData('text/plain', r.dataset.uid), r.classList.add('is-dragging')); });
    c.addEventListener('dragover', e => { e.preventDefault(); e.target.closest('.sc-edit-row')?.classList.add('drag-over'); });
    c.addEventListener('dragleave', e => e.target.closest('.sc-edit-row')?.classList.remove('drag-over'));
    c.addEventListener('drop', e => { e.preventDefault(); const to = e.target.closest('.sc-edit-row'), uid = e.dataTransfer.getData('text/plain'); D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); const from = uid ? c.querySelector(`.sc-edit-row[data-uid="${uidEsc(uid)}"]`) : null; if (to && from && to !== from) { to.before(from); this._drf?.setOrd([...D.querySelectorAll('.sc-edit-row')].map(el => el.dataset.uid).filter(Boolean)); } });
    c.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging')));
  }

  _playCtx(uid = null, shuf = false, listOverride = null, keyOverride = null) {
    const id = this._ctxId(), key = keyOverride || (isDef(id) ? '__showcase__' : `__showcase__:${id}`), trks = listOverride || this.getActiveListTracks(); if (!trks.length) return;
    const list = shuf ? randShuffle([...trks]) : trks, idx = uid && !shuf ? Math.max(0, list.findIndex(t => t.uid === uid)) : 0;
    W.AlbumsManager?.setPlayingAlbum?.(key); W.playerCore?.setPlaylist?.(list, idx, null, { preservePosition: false }); W.playerCore?.play?.(idx); W.PlayerUI?.ensurePlayerBlock?.(idx, { userInitiated: true });
    this._hiTrack(list[idx]?.uid); list[idx]?.uid && this._markLastPlayed(list[idx].uid, id);
  }

  _opnSort() {
    const id=this._ctxId(), c=this._ctx(), sm=c?.sortMode||'user', o = [['user','👤 Мой порядок'],['name-asc','А→Я'],['name-desc','Я→А'],['album-desc','Альбомы ↓'],['album-asc','Альбомы ↑'],['plays-desc','Топ прослушиваний'],['plays-asc','Меньше всего'],['last-played','Недавние'],['favorites-first','Сначала ⭐']];
    const m = W.Modals?.open({ title:'Сортировка', bodyHtml:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${o.map(([v,l])=>`<button class="showcase-btn ${sm===v?'active':''}" data-val="${v}" style="${v==='user'?'grid-column:1/-1':''}">${l}</button>`).join('')}</div>` });
    if(!m)return; m.onclick = e => { const b=e.target.closest('[data-val]'); if(!b)return; const t=isDef(id)?Store.def():Store.get(id); if(t){ t.sortMode=b.dataset.val; isDef(id)?Store.setDef(t):Store.save(t); m.remove(); this.renderTab(); } };
  }

  _openMenu(uid, fromSrh = false) {
    this._cleanupUi(); const t = trk(uid), id = this._ctxId(), inPl = !isDef(id) && (Store.get(id)?.order || []).includes(uid); if (!t) return;
    const bg = D.createElement('div'); bg.className = 'sc-bottom-sheet-bg';
    bg.innerHTML = `<div class="sc-bottom-sheet"><button class="sc-sheet-close">×</button><div class="sc-sheet-title">${esc(t.title)}</div><div class="sc-sheet-sub">${esc(albT(t.sourceAlbum))}</div>
      ${fromSrh ? `<button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><hr style="border-color:rgba(255,255,255,.08);margin:8px 0">` : ''}
      <button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>
      ${inPl ? `<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из плейлиста</button>` : ''}
      <button class="sc-sheet-btn" id="bm-eye">${this._isHid(uid, id) ? `👁 Показать в «${this._ctxName(id)}»` : `🙈 Скрыть в «${this._ctxName(id)}»`}</button>
      <button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite?.(uid) ? '❌ Убрать из Избранного' : '⭐ В Избранное'}</button>
      <button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Офлайн</button>
      <button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3</button>
      <button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button>
      <button class="sc-sheet-btn" id="bm-sh">📸 Поделиться (Карточка)</button>
      <button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button>
      <button class="sc-sheet-btn" id="bm-cx" style="color:#888;justify-content:center">Отмена</button></div>`;
    D.body.appendChild(this._menu = bg); requestAnimationFrame(() => bg.classList.add('active'));
    const close = () => { bg.classList.remove('active'); setTimeout(() => bg.remove(), 200); this._menu = null; };
    bg.querySelector('.sc-sheet-close').onclick = close;
    bg.onclick = e => {
      const b = e.target.id; if (e.target === bg || b === 'bm-cx') return close(); if (!b) return; close();
      const acts = {
        'bm-play': () => {
          if (!fromSrh) return this._playCtx(uid);
          const t = bldTrk(uid); if (!t) return;
          this._playCtx(uid, false, [t], `__showcase__:search:${this._ctxId()}`);
        },
        'bm-pl': () => setTimeout(() => { const pls=Store.pl(); if(!pls.length)return W.NotificationSystem?.warning('Сначала создайте плейлист'); const m=W.Modals?.open({title:'Добавить в плейлист',bodyHtml:`<div style="display:flex;flex-direction:column;gap:10px">${pls.map(p=>`<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>`}); if(!m)return; m.onclick=e=>{ const b=e.target.closest('[data-pid]'); if(!b)return; const p=Store.get(b.dataset.pid); if(!p)return; const s=new Set(p.order||[]); if(!s.has(uid)){p.order.push(uid); Store.save(p); W.NotificationSystem?.success('Добавлено');} m.remove(); }; }, 180),
        'bm-rm': () => { const p = Store.get(id); if (p) { p.order = p.order.filter(x=>x!==uid); p.hidden = (p.hidden||[]).filter(x=>x!==uid); Store.save(p); this.renderTab(); } },
        'bm-eye': () => this._tgHid(uid, id),
        'bm-fv': () => W.playerCore?.toggleFavorite?.(uid, { albumKey: t.sourceAlbum }),
        'bm-of': () => W.OfflineManager?.togglePinned?.(uid),
        'bm-dl': () => { const a = D.createElement('a'); U.download.applyDownloadLink(a, bldTrk(uid)); a.href && a.click(); },
        'bm-st': () => setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(uid), 150),
        'bm-sh': () => setTimeout(() => import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', bldTrk(uid))), 150),
        'bm-cl': () => setTimeout(() => this.opnCol(uid), 150)
      }; acts[b]?.();
    };
  }

  _askPl(cb) {
    const m = W.Modals?.open({ title:'Новый плейлист', bodyHtml:`<input type="text" id="pl-name-inp" value="Мой плейлист ${Store.pl().length + 1}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="pl-name-save">Создать</button>` });
    if(!m)return; setTimeout(()=>m.querySelector('#pl-name-inp')?.select(),50);
    m.querySelector('#pl-name-save').onclick = () => { const v=m.querySelector('#pl-name-inp')?.value.trim(); v&&(m.remove(),cb(v)); };
  }

  _rnmPl(id) {
    const p = Store.get(id); if(!p)return;
    const m = W.Modals?.open({ title:'Переименовать', bodyHtml:`<input type="text" id="rnm-inp" value="${esc(p.name)}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="rnm-save">Сохранить</button>` });
    if(!m)return; setTimeout(()=>m.querySelector('#rnm-inp')?.select(),50);
    m.querySelector('#rnm-save').onclick = () => { const v=m.querySelector('#rnm-inp')?.value.trim(); if(v){ p.name=v; Store.save(p); this._renderPlaylists(); m.remove(); } };
  }

  _shrPl(id) {
    const p = Store.get(id); if(!p)return; const u = `${W.location.origin}${W.location.pathname}?playlist=${btoa(unescape(encodeURIComponent(JSON.stringify({v:1,n:p.name,u:p.order||[]}))))}`;
    navigator.share ? navigator.share({title:p.name, url:u}).catch(()=>{}) : navigator.clipboard.writeText(u).then(()=>W.NotificationSystem?.success('Ссылка скопирована!'));
  }

  _handleShr(b64) {
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(String(b64).trim())))); if (!d?.n || !Array.isArray(d?.u)) throw 1;
      const u = d.u.filter(trk), m = d.u.length - u.length;
      W.Modals?.confirm({ title:'🎵 Вам прислан плейлист', textHtml:`<b>${esc(d.n)}</b><br><br>Доступно треков: ${u.length} из ${d.u.length}.${m>0?'<br><span style="color:#ff9800">Часть треков недоступна.</span>':''}`, confirmText:'Добавить', cancelText:'Отмена', onConfirm:()=>{ const id=Date.now().toString(36); Store.save(mkPl({ id, name:`${d.n} (Присланный)`, order:[...u] })); W.NotificationSystem?.success('Плейлист добавлен'); this.renderTab(); } });
    } catch { W.NotificationSystem?.error('Ошибка чтения ссылки'); }
  }

  opnCol(uid=null, aK=null, pId=null) {
    if(uid && !aK) aK = trk(uid)?.sourceAlbum; const c = pId ? (Store.get(pId)?.color||'') : (Store.cols()?.[aK]||'');
    const m = W.Modals?.open({ title:pId?'Цвет плейлиста':'Цвет альбома', bodyHtml:`<div class="showcase-color-picker">${PALETTE.map(x=>`<div class="showcase-color-dot" style="background:${x};${c===(x==='transparent'?'':x)?'border-color:#fff;':''}" data-col="${x}"></div>`).join('')}</div><button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>` });
    if(!m)return; m.onclick = e => { const b=e.target.closest('[data-col]'); if(!b)return; const v=b.dataset.col==='transparent'?'':b.dataset.col; if(pId) { const p=Store.get(pId); if(p){p.color=v; Store.save(p); this._renderPlaylists();} } else if(aK) { const o=Store.cols(); o[aK]=v; Store.setCols(o); this._renderBody(++this._rTok); } m.remove(); };
  }

  playContext(uid = null) { this._playCtx(uid); }
  handleSharedPlaylist(b64) { this._handleShr(b64); }
  openColorPicker(el, aK, pId) { this.opnCol(null, aK, pId); }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

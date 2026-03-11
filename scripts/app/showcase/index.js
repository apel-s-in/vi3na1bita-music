/**
 * scripts/app/showcase/index.js
 * "Витрина Разбита" (Showcase) — Мастер Вкладка.
 * ПОЛНАЯ РЕАЛИЗАЦИЯ (ТЗ v2.0): Оптимизировано, мгновенный отклик, DND, кэширование.
 */

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils, LS = 'showcase:';
const ls = localStorage;
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const esc = s => U.escapeHtml(String(s || ''));
const $ = id => D.getElementById(id);

const Store = {
  get: (k, d) => U.lsGetJson(LS + k, d),
  set: (k, v) => U.lsSet(LS + k, JSON.stringify(v)),
  get pId() { return this.get('activePlaylistId', null); },
  set pId(id) { this.set('activePlaylistId', id); },
  get pls() { return this.get('playlists', []); },
  set pls(p) { this.set('playlists', p); },
  get aCol() { return this.get('albumColors', {}); },
  get pCol() { return this.get('playlistColors', {}); },
  init() {
    let m = this.get('masterOrder', []);
    if (!m.length) {
      [...(W.albumsIndex || [])].reverse().forEach(a => {
        if (!a.key.startsWith('__')) W.TrackRegistry?.getAllUids()?.forEach(u => {
          if (W.TrackRegistry.getTrackByUid(u)?.sourceAlbum === a.key && !m.includes(u)) m.push(u);
        });
      });
      this.set('masterOrder', m); this.set('userOrder', [...m]);
    }
  }
};

class ShowcaseManager {
  constructor() {
    this.editMode = false; this.searchQuery = '';
    this.viewMode = Store.get('viewMode', 'flat'); this.sortMode = Store.get('sortMode', 'user');
    this.selectedUids = new Set(); this._ic = {}; this._stat = new Map();
  }

  async initialize() {
    (W.APP_CONFIG?.ICON_ALBUMS_ORDER || []).forEach(i => this._ic[i.key] = i.icon);
    await W.TrackRegistry?.ensurePopulated?.();
    Store.init();
    W.playerCore?.on({ onTrackChange: t => { if (t?.uid && U.isShowcaseContext(W.AlbumsManager?.getPlayingAlbum())) { Store.set('lastTrackUid', t.uid); Store.set('lastPlayingContext', W.AlbumsManager.getPlayingAlbum()); } } });
    W.playerCore?.onFavoritesChanged(({ uid }) => {
      const img = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"] .like-star`);
      if (img) img.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png';
      this.updStatus();
    });
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum() === '__showcase__' && (W.OfflineIndicators?.refreshAllIndicators(), this.updStatus()));
  }

  async getActiveListTracks() {
    const pId = Store.pId;
    let uids = pId ? (Store.pls.find(p => p.id === pId)?.uids || []) : Store.get('userOrder', []);

    if (this.sortMode === 'shuffle' && !this.editMode) {
      let sh = Store.get('shuffledOrder', null);
      if (!sh || sh.length !== uids.length) { sh = [...uids].sort(() => Math.random() - 0.5); Store.set('shuffledOrder', sh); }
      uids = sh;
    } else if (this.sortMode !== 'user' && !this.editMode) {
      const tr = uids.map(u => W.TrackRegistry.getTrackByUid(u)).filter(Boolean);
      if (this.sortMode.startsWith('plays') || this.sortMode === 'last-played') {
        const db = (await import('../../analytics/meta-db.js')).metaDB;
        const stats = await db.getAllStats();
        const map = new Map(stats.filter(s => s.uid !== 'global').map(s => [s.uid, s]));
        tr.forEach(t => {
          const st = map.get(t.uid);
          this._stat.set(t.uid, {
            plays: st?.globalFullListenCount || 0,
            lastAt: st?.lastPlayedAt || 0
          });
        });
      }
      const S = this._stat;
      const sorters = {
        'name-asc': (a, b) => a.title.localeCompare(b.title), 'name-desc': (a, b) => b.title.localeCompare(a.title),
        'album-desc': (a, b) => b.sourceAlbum.localeCompare(a.sourceAlbum), 'album-asc': (a, b) => a.sourceAlbum.localeCompare(b.sourceAlbum),
        'favorites-first': (a, b) => (W.playerCore?.isFavorite(b.uid)?1:0) - (W.playerCore?.isFavorite(a.uid)?1:0),
        'plays-desc': (a, b) => (S.get(b.uid)?.plays||0) - (S.get(a.uid)?.plays||0), 'plays-asc': (a, b) => (S.get(a.uid)?.plays||0) - (S.get(b.uid)?.plays||0),
        'last-played': (a, b) => (S.get(b.uid)?.lastAt||0) - (S.get(a.uid)?.lastAt||0)
      };
      tr.sort(sorters[this.sortMode]);
      uids = tr.map(t => t.uid);
    }

    const hid = pId ? (Store.pls.find(p => p.id === pId)?.hiddenUids || []) : Store.get('hiddenUids', []);
    if (!this.editMode && localStorage.getItem('showcase:showHidden:v1') !== '1') uids = uids.filter(u => !hid.includes(u));

    if (this.searchQuery && !this.editMode) { await ensureLyricsIndexLoaded(); uids = searchUidsByQuery({ uids, query: this.searchQuery }); }

    return uids.map(u => {
      const t = W.TrackRegistry.getTrackByUid(u);
      if (!t) return null;

      // Showcase: одна обложка на альбом, синхронно (без await), чтобы не падал init.
      // Берём иконку альбома, а если нет — logo.
      // (Если хочешь именно gallery first cover — сделаем отдельный async прогрев позже, без await в map.)
      let cv = this._ic[t.sourceAlbum] || 'img/logo.png';

      // Корректный mobile путь (у тебя реально есть img/icon_album/mobile/<name>@1x.jpg)
      if (U.isMobile() && /\/icon_album\/[^/]+\.png$/i.test(cv)) {
        const m = cv.match(/\/icon_album\/([^/]+)\.png$/i);
        if (m) cv = `img/icon_album/mobile/${m[1]}@1x.jpg`;
      }

      return { ...t, album: 'Витрина Разбита', cover: cv };
    }).filter(Boolean);
  }

  async renderTab() {
    const list = $('track-list'); if (!list) return;

    if (this.editMode && !this._snap) this._snap = { isPl: !!Store.pId, ord: Store.pId ? [...Store.pls.find(p => p.id === Store.pId).uids] : [...Store.get('userOrder', [])], hid: Store.pId ? [...Store.pls.find(p => p.id === Store.pId).hiddenUids] : [...Store.get('hiddenUids', [])] };
    else if (!this.editMode) this._snap = null;

    const showRes = !this.editMode && !Store.pId && JSON.stringify(Store.get('userOrder', [])) !== JSON.stringify(Store.get('masterOrder', []));

    list.innerHTML = `
      <div class="showcase-header-controls">
        ${this.editMode ? `<div class="showcase-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<div style="display:flex;gap:8px;margin-top:10px;"><button class="showcase-btn" id="sc-save" style="background:#fff; color:#000;">💾 Сохранить</button><button class="showcase-btn" id="sc-reset-edit" style="background:transparent; border-color:#ff9800;">↺ Сброс</button><button class="showcase-btn showcase-btn--danger" id="sc-cancel">✕ Выйти</button></div></div>` : ''}
        <div class="showcase-search-wrap"><input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск трека или текста..." value="${esc(this.searchQuery)}"><button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this.searchQuery?'':'none'}">✕</button></div>
        <div class="showcase-btns-row">
          ${!this.editMode ? `<button class="showcase-btn" id="sc-edit">✏️ Редактировать</button>` : ''}
          ${showRes ? `<button class="showcase-btn" id="sc-master-reset" style="flex:0.5">↺ Сброс</button>` : ''}
          <button class="showcase-btn" id="sc-sort">↕️ Сортировка ${this.sortMode !== 'user' ? '●' : ''}</button>
        </div>
        ${!this.editMode ? `<div class="showcase-btns-row"><button class="showcase-btn" id="sc-playall">▶ Играть всё</button><button class="showcase-btn" id="sc-shuffle">🔀 Перемешать</button></div>` : ''}
        <div class="showcase-playlists-actions" id="sc-playlists-actions"></div><div class="showcase-playlists-list" id="sc-playlists"></div><div class="showcase-status-bar" id="sc-status"></div>
      </div><div id="sc-tracks-container"></div>`;

    this.bindCtrl(list); this.renderPls(); await this.renderList();
    if (!this.editMode) { const lu = Store.get('lastTrackUid'); if (lu && Store.get('lastPlayingContext') === (Store.pId ? `__showcase__:${Store.pId}` : '__showcase__')) this.hiTrack(lu); }
  }

  bindCtrl(root) {
    const inp = $('sc-search'), clr = $('sc-search-clear');
    const applyQ = U.func.debounceFrame(async () => { this.searchQuery = (inp?.value || '').trim(); await this.renderList(); if (clr) clr.style.display = this.searchQuery ? '' : 'none'; });

    if (inp) {
      inp.addEventListener('input', applyQ);
      inp.addEventListener('keydown', e => e.key === 'Enter' && inp.blur());
      inp.addEventListener('blur', () => window.scrollTo({ top: window.scrollY, behavior: 'instant' }));
    }
    if (clr) clr.addEventListener('click', e => { e.preventDefault(); if (inp) { inp.value = ''; inp.blur(); } this.searchQuery = ''; this.renderList(); clr.style.display = 'none'; });

    const acts = {
      'sc-edit': () => { if (this.sortMode !== 'user') return W.NotificationSystem.warning('Сбросьте сортировку'); this.editMode = true; this.selectedUids.clear(); this.renderTab(); },
      'sc-save': () => { this.editMode = false; this.selectedUids.clear(); this.renderTab(); W.NotificationSystem.success('Сохранено'); },
      'sc-cancel': () => { this.rstSnap(); this.editMode = false; this.selectedUids.clear(); this.renderTab(); },
      'sc-reset-edit': () => { this.rstSnap(); this.selectedUids.clear(); this.renderList(); W.NotificationSystem.info('Сброшено'); },
      'sc-master-reset': () => W.Modals.confirm({ title: 'Сбросить порядок?', textHtml: 'Мастер-список вернется к дефолту.', confirmText: 'Сбросить', onConfirm: () => { Store.set('userOrder', Store.get('masterOrder')); Store.set('hiddenUids', []); this.sortMode = 'user'; Store.set('sortMode', 'user'); this.renderTab(); } }),
      'sc-playall': () => this.playCtx(),
      'sc-shuffle': () => { this.sortMode = 'shuffle'; Store.set('sortMode', 'shuffle'); Store.set('shuffledOrder', null); this.playCtx(); this.renderTab(); },
      'sc-sort': () => this.openSort(),
      'sc-tg-e': () => { ls.setItem('showcase:showHidden:v1', ls.getItem('showcase:showHidden:v1') === '1' ? '0' : '1'); this.renderList(); },
      'sc-tg-n': () => { ls.setItem('showcase:showNumbers:v1', ls.getItem('showcase:showNumbers:v1') === '1' ? '0' : '1'); this.renderList(); },
      'sc-tg-v': () => { this.viewMode = this.viewMode === 'flat' ? 'grouped' : 'flat'; Store.set('viewMode', this.viewMode); this.renderList(); }
    };

    let lpTm = null, isLp = false;
    root.addEventListener('touchstart', e => {
      const h = e.target.closest('.showcase-drag-handle'); if (h && this.editMode) return e.preventDefault(), this.strtDrg(e, h.closest('.showcase-track'));
      const t = e.target.closest('.showcase-track');
      if (t && this.editMode && !e.target.closest('button')) {
        isLp = false; lpTm = setTimeout(() => { isLp = true; this.togSel(t.dataset.uid); navigator.vibrate?.(50); }, 500);
      }
    }, { passive: false });
    root.addEventListener('touchmove', () => clearTimeout(lpTm), { passive: true });
    root.addEventListener('touchend', () => clearTimeout(lpTm));

    root.addEventListener('click', e => {
      if (acts[e.target.id]) return acts[e.target.id]();
      if (isLp) return;
      const t = e.target.closest('.showcase-track'), u = t?.dataset.uid;
      if (!t) return;

      if (this.editMode) {
        if (e.target.closest('.showcase-hide-btn')) return this.togHid(u);
        if (e.target.closest('.sc-arrow-up')) return this.swp(u, -1);
        if (e.target.closest('.sc-arrow-down')) return this.swp(u, 1);
        if (this.selectedUids.size > 0 || e.target.closest('.showcase-checkbox')) return this.togSel(u);
        return this.opnMenu(u);
      }
      if (e.target.closest('.showcase-track-menu-btn')) return this.opnMenu(u);
      if (e.target.closest('.like-star') || e.target.closest('.offline-ind')) return;
      this.playCtx(u);
    });

    root.addEventListener('dragstart', e => { if (!this.editMode) return; const t = e.target.closest('.showcase-track'); if (t) { e.dataTransfer.setData('text/plain', t.dataset.uid); t.classList.add('is-dragging'); }});
    root.addEventListener('dragover', e => { if (!this.editMode) return; e.preventDefault(); const t = e.target.closest('.showcase-track'); if (t) t.classList.add('drag-over');});
    root.addEventListener('dragleave', e => e.target.closest('.showcase-track')?.classList.remove('drag-over'));
    root.addEventListener('drop', e => {
      if (!this.editMode) return; e.preventDefault();
      const t = e.target.closest('.showcase-track'), s = e.dataTransfer.getData('text/plain');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (t && s && s !== t.dataset.uid) { t.before(D.querySelector(`.showcase-track[data-uid="${s}"]`)); this.svOrd(); }
    });
    root.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging')));
  }

  rstSnap() {
    if (!this._snap) return;
    const { isPl, ord, hid } = this._snap;
    if (isPl) { const p = Store.pls; const trg = p.find(x => x.id === Store.pId); if (trg) { trg.uids = ord; trg.hiddenUids = hid; Store.pls = p; } }
    else { Store.set('userOrder', ord); Store.set('hiddenUids', hid); }
  }

  async playCtx(uid = null) {
    const id = Store.pId, k = id ? `__showcase__:${id}` : '__showcase__';
    const trks = await this.getActiveListTracks();
    if (!trks.length) return;
    let idx = uid ? Math.max(0, trks.findIndex(t => t.uid === uid)) : 0;
    W.AlbumsManager.setPlayingAlbum(k);
    W.playerCore.setPlaylist(trks, idx, null, { preservePosition: false });
    W.playerCore.play(idx);
    W.PlayerUI.ensurePlayerBlock(idx, { userInitiated: true });
    this.hiTrack(trks[idx].uid);
  }

  renderPls() {
    const act = $('sc-playlists-actions'), lst = $('sc-playlists'), id = Store.pId, pls = Store.pls, col = Store.pCol;
    if (!act || !lst) return;
    act.innerHTML = `<button class="sc-pl-action ${!id ? 'active' : ''}" id="sc-pl-all">Все треки</button><button class="sc-pl-action" id="sc-pl-nw">+ Новый</button><button class="sc-pl-action" id="sc-pl-pst" title="Вставить">📋</button>`;
    act.onclick = e => {
      const i = e.target.id;
      if (i === 'sc-pl-all') { Store.pId = null; this.renderTab(); }
      else if (i === 'sc-pl-nw') this.mkPl();
      else if (i === 'sc-pl-pst') navigator.clipboard.readText().then(t => this.hndlShPl(new URLSearchParams(t.split('?')[1] || t).get('playlist') || t)).catch(()=>W.NotificationSystem.error('Ошибка буфера'));
    };
    if (!pls.length) return lst.innerHTML = `<div class="sc-pl-empty">Плейлистов пока нет</div>`;
    lst.innerHTML = pls.map(p => `<div class="sc-pl-row ${id === p.id ? 'active' : ''}" data-pid="${p.id}" ${col[p.id] ? `style="--pl-color:${col[p.id]};"` : ''}><div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span></div><div class="sc-pl-right"><button class="sc-pl-btn" data-act="shr" data-pid="${p.id}">🔗</button><button class="sc-pl-btn" data-act="ed" data-pid="${p.id}">🔨</button><button class="sc-pl-btn" data-act="col" data-pid="${p.id}">🎨</button><button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}">✖</button></div></div>`).join('');
    lst.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act, pid = e.target.closest('[data-pid]')?.dataset.pid;
      if (a && pid) {
        if (a === 'ed') { Store.pId = pid; this.editMode = true; this.renderTab(); }
        else if (a === 'shr') this.shrPl(pid);
        else if (a === 'del') W.Modals.confirm({ title: 'Удалить?', confirmText: 'Да', onConfirm: () => { Store.pls = Store.pls.filter(p => p.id !== pid); if (Store.pId === pid) Store.pId = null; this.renderTab(); }});
        else if (a === 'col') this.opnCol(null, null, pid);
      } else if (e.target.closest('.sc-pl-row')?.dataset.pid) { Store.pId = e.target.closest('.sc-pl-row').dataset.pid; this.renderTab(); }
    };
  }

  async renderList() {
    const c = $('sc-tracks-container'); if (!c) return;
    const trks = await this.getActiveListTracks(), cols = Store.aCol, hidL = Store.pId ? (Store.pls.find(p=>p.id===Store.pId)?.hiddenUids||[]) : Store.get('hiddenUids', []);
    this.updStatus(trks.length);
    let h = '', grp = null, sN = localStorage.getItem('showcase:showNumbers:v1') === '1';
    trks.forEach((t, i) => {
      if (this.viewMode === 'grouped' && grp !== t.sourceAlbum) {
        grp = t.sourceAlbum;
        const albumTitle = W.TrackRegistry.getAlbumTitle(t.sourceAlbum) || 'Альбом';
        h += `<div class="showcase-group-header">── ${esc(albumTitle)} ──</div>`;
      }
      const cl = cols[t.sourceAlbum] || 'transparent', isH = hidL.includes(t.uid), isS = this.selectedUids.has(t.uid);
      h += `<div class="showcase-track ${isH?'inactive':''} ${isS?'selected':''}" data-uid="${t.uid}" style="border-left: 3px solid ${cl}" ${this.editMode?'draggable="true"':''}>${this.editMode?`<button class="sc-arrow-up" data-dir="-1">▲</button>`:`<div class="tnum"${sN?'':' style="display:none"'}>${i+1}.</div>`}${this.editMode?`<div class="showcase-drag-handle">⠿</div><div class="showcase-checkbox"></div>`:''}<img src="${t.cover}" class="showcase-track-thumb" loading="lazy"><div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div></div><span class="offline-ind" data-uid="${t.uid}">🔒</span>${this.editMode?`<button class="showcase-hide-btn">${isH?'👁‍🗨':'👁'}</button>`:''}<img src="${W.playerCore?.isFavorite(t.uid)?'img/star.png':'img/star2.png'}" class="like-star" data-uid="${t.uid}" data-album="${t.sourceAlbum}">${!this.editMode?`<button class="showcase-track-menu-btn">···</button>`:`<button class="sc-arrow-down" data-dir="1">▼</button>`}</div>`;
    });
    if (this.editMode && Store.pId) h += `<div style="padding:20px;text-align:center;"><button class="showcase-btn" id="sc-add-t">➕ Добавить треки</button></div>`;
    c.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
    $('sc-add-t')?.addEventListener('click', () => this.addTrks());
    W.OfflineIndicators?.injectOfflineIndicators?.(c); this.hiTrack(W.playerCore?.getCurrentTrackUid()); this.rndrMPnl();
  }

  updStatus(cnt) {
    const s = $('sc-status'); if (!s) return;
    const dom = D.querySelectorAll('.showcase-track'), f = D.querySelectorAll('.showcase-track .like-star[src*="star.png"]').length, o = D.querySelectorAll('.showcase-track .offline-ind:not(.offline-ind--none)').length, c = Array.from(D.querySelectorAll('.showcase-track .offline-ind')).filter(n => (n?.textContent||'').trim() === '☁').length;
    s.innerHTML = `<span>📋 ${cnt??dom.length} · ⭐ ${f} · 🔒 ${o} · ☁ ${c}${this.editMode&&this.selectedUids.size?`<span style="color:#ff9800"> · ✓ ${this.selectedUids.size}</span>`:''}</span><span style="display:flex;gap:12px;align-items:center"><span id="sc-tg-e" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${localStorage.getItem('showcase:showHidden:v1')==='1'?'👁':'🙈'}</span><span id="sc-tg-n" style="cursor:pointer;font-size:18px" title="Нумерация">${localStorage.getItem('showcase:showNumbers:v1')==='1'?'1,2,3':''}</span><span id="sc-tg-v" style="cursor:pointer;font-size:18px" title="Сменить вид">${this.viewMode==='flat'?'⊞':'⊟'}</span></span>`;
  }

  swp(u, d) { const el = D.querySelector(`.showcase-track[data-uid="${u}"]`), sb = d === -1 ? el?.previousElementSibling : el?.nextElementSibling; if (el && sb?.classList.contains('showcase-track')) { d === -1 ? sb.before(el) : sb.after(el); this.svOrd(); } }
  svOrd() { const u = Array.from(D.querySelectorAll('.showcase-track')).map(e => e.dataset.uid); if (Store.pId) { const p = Store.pls; p.find(x=>x.id===Store.pId).uids = u; Store.pls = p; } else Store.set('userOrder', u); }
  strtDrg(e, n) {
    if(!n)return; const t=e.touches[0], c=n.cloneNode(true), r=n.getBoundingClientRect(), os=t.clientY-r.top;
    c.style.cssText=`position:fixed;left:${r.left}px;width:${r.width}px;z-index:10000;opacity:0.9;background:#252d39;box-shadow:0 10px 30px rgba(0,0,0,0.8);pointer-events:none`; D.body.appendChild(c); n.style.opacity=0.3;
    const m = e2 => { e2.preventDefault(); const y=e2.touches[0].clientY; c.style.top=(y-os)+'px'; D.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); const o = D.elementFromPoint(W.innerWidth/2, y)?.closest('.showcase-track'); if(o && o!==n) o.classList.add('drag-over'); };
    const d = e2 => { D.removeEventListener('touchmove',m); D.removeEventListener('touchend',d); c.remove(); n.style.opacity=''; const y=e2.changedTouches[0].clientY, tg=D.elementFromPoint(W.innerWidth/2,y)?.closest('.showcase-track'); D.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); if(tg && tg!==n) { tg.before(n); this.svOrd(); } };
    D.addEventListener('touchmove',m,{passive:false}); D.addEventListener('touchend',d);
  }

  togHid(u, sk = false) {
    const el = D.querySelector(`.showcase-track[data-uid="${u}"]`); if (el) { el.classList.toggle('inactive'); const b = el.querySelector('.showcase-hide-btn'); if(b) b.textContent = el.classList.contains('inactive') ? '👁‍🗨' : '👁'; }
    let h = Store.pId ? Store.pls.find(p=>p.id===Store.pId).hiddenUids : Store.get('hiddenUids', []);
    h.includes(u) ? h = h.filter(x=>x!==u) : h.push(u);
    if (Store.pId) { const p = Store.pls; p.find(x=>x.id===Store.pId).hiddenUids = h; Store.pls = p; } else Store.set('hiddenUids', h);
  }

  togSel(u) {
    const el = D.querySelector(`.showcase-track[data-uid="${u}"]`);
    if (this.selectedUids.has(u)) { this.selectedUids.delete(u); el?.classList.remove('selected'); } else { this.selectedUids.add(u); el?.classList.add('selected'); }
    this.rndrMPnl(); this.updStatus();
  }

  rndrMPnl() {
    let p = $('sc-multi-panel'); if (!this.editMode || !this.selectedUids.size) return p?.remove();
    if (!p) { p = D.createElement('div'); p.id = 'sc-multi-panel'; p.className = 'showcase-multi-panel animate-in'; D.body.appendChild(p); }
    p.innerHTML = `<span style="color:#fff;font-weight:bold;font-size:14px;white-space:nowrap">${this.selectedUids.size} выбр.</span><button class="showcase-btn" id="sc-m-hd">👁 Скрыть</button><button class="showcase-btn" id="sc-m-cl">🎨 Цвет</button><button class="showcase-btn" id="sc-m-pl">➕ В плейлист</button><button class="showcase-btn showcase-btn--danger" id="sc-m-cr">✖</button>`;
    p.onclick = e => { const id=e.target.id; if(id==='sc-m-cr'){this.selectedUids.clear(); D.querySelectorAll('.showcase-track.selected').forEach(el=>el.classList.remove('selected')); this.rndrMPnl(); this.updStatus();}else if(id==='sc-m-hd'){[...this.selectedUids].forEach(u=>this.togHid(u,true)); $('sc-m-cr').click();}else if(id==='sc-m-cl') this.opnCol([...this.selectedUids][0]);else if(id==='sc-m-pl') this.opnAddPl([...this.selectedUids]); };
  }

  mkPl() {
    const m = W.Modals.open({ title: 'Новый плейлист', bodyHtml: `<input type="text" id="pl-inp" value="Мой плейлист ${Store.pls.length+1}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><div style="display:flex;gap:10px"><button class="showcase-btn" id="pl-btn">Создать</button></div>` });
    setTimeout(() => m.querySelector('#pl-inp')?.focus(), 100);
    m.querySelector('#pl-btn').onclick = () => { const n = m.querySelector('#pl-inp').value.trim(); if(n) { const p = Store.pls, id = Date.now().toString(36); p.push({id, name:n, uids:[], hiddenUids:[], createdAt:Date.now()}); Store.pls = p; Store.pId = id; m.remove(); this.renderTab(); } };
  }

  shrPl(id) {
    const p = Store.pls.find(x=>x.id===id); if(!p)return; const url = `${W.location.origin}${W.location.pathname}?playlist=${btoa(unescape(encodeURIComponent(JSON.stringify({v:1,n:p.name,u:p.uids}))))}`;
    navigator.share ? navigator.share({title:p.name, url}).catch(()=>{}) : (navigator.clipboard.writeText(url), W.NotificationSystem.success('Ссылка на плейлист скопирована!'));
  }

  hndlShPl(b64) {
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(b64)))); if(!j.n || !Array.isArray(j.u)) throw 1;
      const u = j.u.filter(x=>W.TrackRegistry.getTrackByUid(x));
      W.Modals.confirm({ title: '🎵 Вам прислан плейлист', textHtml: `<b>${esc(j.n)}</b><br><br>Доступно треков: ${u.length} из ${j.u.length}.${u.length<j.u.length?'<br><span style="color:#ff9800">Часть треков недоступна.</span>':''}`, confirmText: 'Добавить', onConfirm: () => { const p=Store.pls; p.push({id:Date.now().toString(36), name:j.n+' (Присланный)', uids:u, hiddenUids:[], createdAt:Date.now()}); Store.pls=p; W.NotificationSystem.success('Плейлист успешно добавлен'); if(!Store.pId) this.renderPls(); }});
    } catch { W.NotificationSystem.error('Ошибка чтения ссылки плейлиста'); }
  }

  openSort() {
    const sm = this.sortMode, m = W.Modals.open({ title: 'Сортировка списка', bodyHtml: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button class="showcase-btn ${sm==='user'?'active':''}" style="grid-column:1/-1" data-val="user">● Пользовательский (Ручной)</button><button class="showcase-btn ${sm==='album-desc'?'active':''}" data-val="album-desc">Альбомы (Новые)</button><button class="showcase-btn ${sm==='album-asc'?'active':''}" data-val="album-asc">Альбомы (Старые)</button><button class="showcase-btn ${sm==='name-asc'?'active':''}" data-val="name-asc">А → Я</button><button class="showcase-btn ${sm==='name-desc'?'active':''}" data-val="name-desc">Я → А</button><button class="showcase-btn ${sm==='plays-desc'?'active':''}" data-val="plays-desc">Топ прослушиваний</button><button class="showcase-btn ${sm==='plays-asc'?'active':''}" data-val="plays-asc">Меньше всего</button><button class="showcase-btn ${sm==='last-played'?'active':''}" data-val="last-played">Недавние</button><button class="showcase-btn ${sm==='favorites-first'?'active':''}" data-val="favorites-first">Сначала ⭐</button><button class="showcase-btn ${sm==='shuffle'?'active':''}" style="grid-column:1/-1" data-val="shuffle">🔀 Случайный порядок</button><button class="showcase-btn showcase-btn--danger" style="grid-column:1/-1" data-val="user">Сбросить сортировку</button></div>` });
    m.onclick = e => { const b = e.target.closest('[data-val]'); if(b) { this.sortMode = b.dataset.val; Store.set('sortMode', this.sortMode); if(this.sortMode==='shuffle') Store.set('shuffledOrder', null); this.renderTab(); m.remove(); } };
  }

  opnMenu(u) {
    if(this._menu) this._menu.remove(); const t = W.TrackRegistry.getTrackByUid(u); if(!t) return;
    const bg = D.createElement('div'); bg.className = 'sc-bottom-sheet-bg';
    bg.innerHTML = `<div class="sc-bottom-sheet"><div class="sc-sheet-title">${esc(t.title)}</div><div class="sc-sheet-sub">${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div><button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>${Store.pId?`<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из текущего плейлиста</button>`:''}<button class="sc-sheet-btn" id="bm-hd">👁 Скрыть / Показать трек</button><button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite(u)?'❌ Убрать из Избранного':'⭐ В Избранное'}</button><button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Убрать из офлайн</button><button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3 файл</button><button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button><button class="sc-sheet-btn" id="bm-sh">📸 Поделиться треком (Карточка)</button><button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button><button class="sc-sheet-btn" style="color:#888;justify-content:center;margin-top:10px" id="bm-cx">Отмена</button></div>`;
    D.body.appendChild(bg); this._menu = bg; requestAnimationFrame(() => bg.classList.add('active'));
    const cls = () => { bg.classList.remove('active'); setTimeout(()=>bg.remove(), 200); this._menu=null; };
    bg.onclick = e => {
      const id = e.target.id; if(e.target===bg || id==='bm-cx') return cls(); if(!id) return; cls();
      if(id==='bm-pl') setTimeout(()=>this.opnAddPl([u]),250); else if(id==='bm-rm') { const p=Store.pls, tr=p.find(x=>x.id===Store.pId); if(tr) { tr.uids=tr.uids.filter(x=>x!==u); Store.pls=p; this.renderList(); } } else if(id==='bm-hd') this.togHid(u); else if(id==='bm-fv') W.playerCore?.toggleFavorite(u,{albumKey:t.sourceAlbum}); else if(id==='bm-of') W.OfflineManager?.togglePinned?.(u); else if(id==='bm-dl') { const a=D.createElement('a'); U.download.applyDownloadLink(a,t); if(a.href) a.click(); } else if(id==='bm-st') setTimeout(()=>W.StatisticsModal?.openStatisticsModal?.(u),250); else if(id==='bm-sh') setTimeout(()=>import('../../analytics/share-generator.js').then(m=>m.ShareGenerator.generateAndShare('track',t)),250); else if(id==='bm-cl') setTimeout(()=>this.opnCol(u),250);
    };
  }

  opnAddPl(uids) {
    const pls = Store.pls; if(!pls.length) return W.NotificationSystem.warning('Сначала создайте новый плейлист');
    const m = W.Modals.open({ title: 'Выберите плейлист', bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px;">${pls.map(p=>`<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>` });
    m.onclick = e => { const b=e.target.closest('[data-pid]'); if(b) { const t=pls.find(x=>x.id===b.dataset.pid); uids.forEach(u=>{if(!t.uids.includes(u)) t.uids.push(u);}); Store.pls=pls; W.NotificationSystem.success(`Добавлено треков: ${uids.length}`); m.remove(); $('sc-m-cr')?.click(); } };
  }

  addTrks() {
    const a = Store.get('userOrder',[]).map(u=>W.TrackRegistry.getTrackByUid(u)).filter(Boolean), c = Store.pls.find(p=>p.id===Store.pId)?.uids||[];
    const m = W.Modals.open({ title: 'Треки из Витрины', bodyHtml: `<div style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:15px;">${a.map(t=>`<label style="display:flex;align-items:center;gap:10px;padding:6px;background:rgba(255,255,255,.05);border-radius:6px;"><input type="checkbox" value="${t.uid}" class="pl-add-chk" ${c.includes(t.uid)?'checked disabled':''}>${esc(t.title)} <span style="opacity:.5;font-size:11px">${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</span></label>`).join('')}</div><button class="showcase-btn" id="pl-ac">Добавить выбранные</button>` });
    m.querySelector('#pl-ac').onclick = () => { const ch = Array.from(m.querySelectorAll('.pl-add-chk:checked:not(:disabled)')).map(i=>i.value); if(ch.length) { const p=Store.pls; p.find(x=>x.id===Store.pId).uids.push(...ch); Store.pls=p; this.renderList(); W.NotificationSystem.success(`Добавлено: ${ch.length}`); } m.remove(); };
  }

  opnCol(u, aKey = null, pId = null) {
    if (u && !aKey) aKey = W.TrackRegistry.getTrackByUid(u)?.sourceAlbum;
    const cur = pId ? Store.pCol[pId] : Store.aCol[aKey], m = W.Modals.open({ title: pId ? 'Цвет плейлиста' : 'Цвет альбома', bodyHtml: `<div class="showcase-color-picker">${PALETTE.map(c=>`<div class="showcase-color-dot" style="background:${c};${cur===c?'border-color:#fff':''}" data-col="${c}"></div>`).join('')}</div><button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>` });
    m.onclick = e => { const el = e.target.closest('[data-col]'); if(el) { const c = el.dataset.col==='transparent'?'':el.dataset.col; if(pId) { const p = Store.pCol; p[pId]=c; Store.pCol=p; this.renderPls(); } else { const a = Store.aCol; a[aKey]=c; Store.aCol=a; W.AlbumsManager?.getCurrentAlbum() === '__showcase__' && this.renderList(); } m.remove(); } };
  }

  hiTrack(u) { D.querySelectorAll('.showcase-track.current').forEach(e=>e.classList.remove('current')); if(u) D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(u)}"]`).forEach(e=>e.classList.add('current')); }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

//=================================================
// FILE: /scripts/app/showcase/lyrics-search.js
/**
 * scripts/app/showcase/lyrics-search.js
 * Offline fast search (title/album/lyrics) based on prebuilt index file.
 *
 * Index is expected at: ./data/lyrics-index-v1.json
 * Format v1:
 * {
 *   v: 1,
 *   buildTs: number,
 *   meta: { [uid]: { t: string, a: string, k: string, n?: number } },
 *   idx:  { [token]: string[] }
 * }
 */

const W = window;

const INDEX_URL = './data/lyrics-index-v1.json';

let _loaded = false;
let _pending = null;

let _meta = {};
let _idx = {};
let _buildTs = 0;

const normStr = (s) => String(s || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (q) => {
  const s = normStr(q);
  if (!s) return [];
  return s.split(' ').filter(w => w.length >= 2);
};

async function fetchJsonCacheFirst(url) {
  // Cache-first: работает офлайн при наличии SW precache.
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function ensureLyricsIndexLoaded() {
  if (_loaded) return true;
  if (_pending) return _pending;

  _pending = (async () => {
    try {
      const j = await fetchJsonCacheFirst(INDEX_URL);
      if (!j || j.v !== 1 || typeof j !== 'object') throw new Error('Bad index format');

      _meta = j.meta && typeof j.meta === 'object' ? j.meta : {};
      _idx = j.idx && typeof j.idx === 'object' ? j.idx : {};
      _buildTs = Number(j.buildTs) || 0;

      _loaded = true;
      return true;
    } catch (e) {
      // Индекс не обязателен для запуска UI: просто считаем, что lyrics-поиск недоступен.
      _meta = {};
      _idx = {};
      _buildTs = 0;
      _loaded = false;
      return false;
    } finally {
      _pending = null;
    }
  })();

  return _pending;
}

export function getLyricsIndexState() {
  return { loaded: _loaded, buildTs: _buildTs, metaCount: Object.keys(_meta).length };
}

function getTrackText(uid) {
  const t = W.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return { title: '', album: '' };

  const title = String(t.title || '');
  const album = String(W.TrackRegistry?.getAlbumTitle?.(t.sourceAlbum) || t.album || '');
  return { title, album };
}

export function searchUidsByQuery({ uids, query }) {
  const q = String(query || '').trim();
  if (!q) return uids;

  const qNorm = normStr(q);
  const toks = tokenize(qNorm);

  // База кандидатов: если индекс загружен — из idx, иначе просто "все uids" (поиском по title/album).
  let candidates = null;

  if (_loaded && toks.length) {
    const set = new Set();
    toks.forEach(tok => {
      const list = _idx[tok];
      if (Array.isArray(list)) list.forEach(uid => set.add(uid));
    });
    candidates = [...set];
  } else {
    candidates = [...uids];
  }

  // Ограничиваем кандидатов текущим списком (мастер/плейлист) — важно для Showcase.
  const allowed = new Set(uids);
  candidates = candidates.filter(uid => allowed.has(uid));

  // Скоринг: title > album > lyrics.
  const scored = candidates.map(uid => {
    const { title, album } = getTrackText(uid);
    const tN = normStr(title);
    const aN = normStr(album);

    let score = 0;

    // Фраза целиком
    if (tN.includes(qNorm)) score += 120;
    if (aN.includes(qNorm)) score += 70;

    // Токены
    toks.forEach(tok => {
      if (tN.includes(tok)) score += 40;
      else if (aN.includes(tok)) score += 20;
      else if (_loaded && Array.isArray(_idx[tok]) && _idx[tok].includes(uid)) score += 8;
    });

    return { uid, score };
  });

  scored.sort((x, y) => y.score - x.score);

  // Если кто-то набрал 0 — всё равно оставляем, но ниже (это полезно для коротких запросов).
  return scored.map(x => x.uid);
}

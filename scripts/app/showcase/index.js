/**
 * scripts/app/showcase/index.js
 * "Витрина Разбита" (Showcase) — Мастер Вкладка.
 * ОПТИМИЗИРОВАНО (v4.0): Архитектура Draft-состояний, глобальный поиск, устранение утечек событий.
 */

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils, LS = 'showcase:';
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const esc = s => U.escapeHtml(String(s || ''));
const $ = id => D.getElementById(id);
const ls = localStorage;

const Store = {
  get: (k, d) => U.lsGetJson(LS + k, d),
  set: (k, v) => U.lsSet(LS + k, JSON.stringify(v)),
  get pId() { return this.get('activePlaylistId', null); },
  set pId(id) { this.set('activePlaylistId', id); },
  get pls() { return this.get('playlists', []); },
  set pls(p) { this.set('playlists', p); },
  get aCol() { return this.get('albumColors', {}); },
  set aCol(v) { this.set('albumColors', v); },
  get pCol() { return this.get('playlistColors', {}); },
  set pCol(v) { this.set('playlistColors', v); },
  sync() {
    let m = this.get('masterOrder', []);
    let uo = this.get('userOrder', []);
    const allUids = W.TrackRegistry?.getAllUids() || [];
    let chg = false;
    const mSet = new Set(m);
    [...(W.albumsIndex || [])].reverse().forEach(a => {
      if (a.key.startsWith('__')) return;
      allUids.forEach(u => {
        const t = W.TrackRegistry.getTrackByUid(u);
        if (t && t.sourceAlbum === a.key && !mSet.has(u)) {
          m.push(u); uo.push(u); mSet.add(u); chg = true;
        }
      });
    });
    if (chg || !m.length) { this.set('masterOrder', m); this.set('userOrder', uo); }
  }
};

class ShowcaseManager {
  constructor() {
    this.st = {
      edit: false, drf: null, q: '', qSel: new Set(),
      sort: Store.get('sort', 'user'), view: Store.get('view', 'flat'),
      sNum: ls.getItem(LS+'sNum') !== '0', sHid: ls.getItem(LS+'sHid') === '1',
      hMode: ls.getItem(LS+'hMode') || 'place'
    };
    this._ic = {}; this._stat = new Map(); this._bound = false;
  }

  async initialize() {
    (W.APP_CONFIG?.ICON_ALBUMS_ORDER || []).forEach(i => this._ic[i.key] = i.icon);
    await W.TrackRegistry?.ensurePopulated?.();
    Store.sync();
    W.playerCore?.on({ onTrackChange: t => { if (t?.uid && U.isShowcaseContext(W.AlbumsManager?.getPlayingAlbum())) { Store.set('lastTrackUid', t.uid); Store.set('lastPlayingContext', W.AlbumsManager.getPlayingAlbum()); } } });
    W.playerCore?.onFavoritesChanged(({ uid }) => {
      const img = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"] .like-star`);
      if (img) img.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png';
      this.updStatus();
    });
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum() === '__showcase__' && (W.OfflineIndicators?.refreshAllIndicators(), this.updStatus()));
  }

  initDraft(creationSnap = null) {
    if (Store.pId) {
      const p = creationSnap || Store.pls.find(x => x.id === Store.pId);
      this.st.drf = { uids: [...p.uids], chk: new Set(p.uids), hid: new Set(p.hiddenUids), dirty: false };
    } else {
      const bUids = creationSnap ? [...creationSnap] : [...Store.get('userOrder', [])];
      const bHid = creationSnap ? [] : Store.get('hiddenUids', []);
      this.st.drf = { uids: bUids, chk: new Set(bUids.filter(u => !bHid.includes(u))), hid: new Set(bHid), dirty: false };
    }
  }

  async getSortedUids(uids) {
    if (this.st.sort === 'user') return uids;
    const tr = uids.map(u => W.TrackRegistry.getTrackByUid(u)).filter(Boolean);
    if (this.st.sort.startsWith('plays') || this.st.sort === 'last-played') {
      const db = (await import('../../analytics/meta-db.js')).metaDB;
      const stats = await db.getAllStats();
      const map = new Map(stats.filter(s => s.uid !== 'global').map(s => [s.uid, s]));
      tr.forEach(t => { const st = map.get(t.uid); this._stat.set(t.uid, { plays: st?.globalFullListenCount || 0, lastAt: st?.lastPlayedAt || 0 }); });
    }
    const S = this._stat;
    const sorters = {
      'name-asc': (a, b) => a.title.localeCompare(b.title), 'name-desc': (a, b) => b.title.localeCompare(a.title),
      'album-desc': (a, b) => b.sourceAlbum.localeCompare(a.sourceAlbum), 'album-asc': (a, b) => a.sourceAlbum.localeCompare(b.sourceAlbum),
      'favorites-first': (a, b) => (W.playerCore?.isFavorite(b.uid)?1:0) - (W.playerCore?.isFavorite(a.uid)?1:0),
      'plays-desc': (a, b) => (S.get(b.uid)?.plays||0) - (S.get(a.uid)?.plays||0), 'plays-asc': (a, b) => (S.get(a.uid)?.plays||0) - (S.get(b.uid)?.plays||0),
      'last-played': (a, b) => (S.get(b.uid)?.lastAt||0) - (S.get(a.uid)?.lastAt||0)
    };
    if (sorters[this.st.sort]) tr.sort(sorters[this.st.sort]);
    return tr.map(t => t.uid);
  }

  async playCtx(startUid = null, isShuffle = false) {
    let uids = Store.pId ? (Store.pls.find(p => p.id === Store.pId)?.uids || []) : Store.get('userOrder', []);
    let hid = Store.pId ? (Store.pls.find(p => p.id === Store.pId)?.hiddenUids || []) : Store.get('hiddenUids', []);
    let active = uids.filter(u => !hid.includes(u));
    if (!active.length) return W.NotificationSystem.warning('Нет активных треков для воспроизведения');

    let playOrder = await this.getSortedUids(active);
    if (isShuffle) {
      playOrder.sort(() => Math.random() - 0.5);
      if (startUid) { playOrder = playOrder.filter(u => u !== startUid); playOrder.unshift(startUid); }
    }

    let trks = playOrder.map(u => {
      const t = W.TrackRegistry.getTrackByUid(u);
      let cv = this._ic[t.sourceAlbum] || 'img/logo.png';
      if (U.isMobile() && /\/icon_album\/[^/]+\.png$/i.test(cv)) cv = cv.replace('.png', '@1x.jpg').replace('icon_album/', 'icon_album/mobile/');
      return { ...t, album: 'Витрина Разбита', cover: cv };
    });

    const k = Store.pId ? `__showcase__:${Store.pId}` : '__showcase__';
    let idx = startUid ? Math.max(0, trks.findIndex(t => t.uid === startUid)) : 0;

    W.AlbumsManager.setPlayingAlbum(k);
    W.playerCore.setPlaylist(trks, idx, null, { preservePosition: false, preserveShuffleMode: true });
    
    if (isShuffle && !W.playerCore.isShuffle()) W.playerCore.toggleShuffle();
    if (!isShuffle && W.playerCore.isShuffle()) W.playerCore.toggleShuffle();

    W.playerCore.play(idx);
    W.PlayerUI.ensurePlayerBlock(idx, { userInitiated: true });
    this.hiTrack(trks[idx].uid);
  }

  async renderTab() {
    const list = $('track-list'); if (!list) return;
    if (this.st.edit && !this.st.drf) this.initDraft();
    else if (!this.st.edit) this.st.drf = null;

    const showRes = !this.st.edit && !Store.pId && JSON.stringify(Store.get('userOrder', [])) !== JSON.stringify(Store.get('masterOrder', []));

    list.innerHTML = `
      <div class="showcase-header-controls">
        ${this.st.edit ? `<div class="showcase-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<div style="display:flex;gap:8px;margin-top:10px;"><button class="showcase-btn" id="sc-save" style="background:#fff; color:#000;">💾 Сохранить</button><button class="showcase-btn" id="sc-create" style="background:var(--secondary-color); color:#fff;">🌟 Создать</button><button class="showcase-btn" id="sc-reset-edit" style="background:transparent; border-color:#ff9800; ${(!Store.pId)?'':'display:none'}">↺ Сброс</button><button class="showcase-btn showcase-btn--danger" id="sc-cancel">✕ Выйти</button></div></div>` : ''}
        <div class="showcase-search-wrap"><input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему приложению..." value="${esc(this.st.q)}"><button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this.st.q?'':'none'}">✕</button></div>
        <div class="showcase-btns-row">
          ${!this.st.edit ? `<button class="showcase-btn" id="sc-edit">✏️ Редактировать</button>` : ''}
          ${showRes ? `<button class="showcase-btn" id="sc-master-reset" style="flex:0.5">↺ Сброс</button>` : ''}
          <button class="showcase-btn" id="sc-sort">↕️ Сортировка ${this.st.sort !== 'user' ? '●' : ''}</button>
        </div>
        ${!this.st.edit ? `<div class="showcase-btns-row"><button class="showcase-btn" id="sc-playall">▶ Играть всё</button><button class="showcase-btn" id="sc-shuffle">🔀 Перемешать</button></div>` : ''}
        <div class="showcase-playlists-actions" id="sc-playlists-actions"></div><div class="showcase-playlists-list" id="sc-playlists"></div><div class="showcase-status-bar" id="sc-status"></div>
      </div><div id="sc-tracks-container"></div>`;

    this.bindCtrl(list); this.renderPls(); await this.renderList();
    if (!this.st.edit) { const lu = Store.get('lastTrackUid'); if (lu && Store.get('lastPlayingContext') === (Store.pId ? `__showcase__:${Store.pId}` : '__showcase__')) this.hiTrack(lu); }
  }

  bindCtrl(root) {
    if (root._scBound) return;
    root._scBound = true;

    const applyQ = U.func.debounceFrame(async () => {
      const inp = $('sc-search');
      this.st.q = (inp?.value || '').trim(); this.st.qSel.clear();
      await this.renderList();
      const clr = $('sc-search-clear'); if (clr) clr.style.display = this.st.q ? '' : 'none';
    });

    root.addEventListener('input', e => { if(e.target.id === 'sc-search') applyQ(); });
    root.addEventListener('keydown', e => { if(e.target.id === 'sc-search' && e.key === 'Enter') e.target.blur(); });
    root.addEventListener('blur', e => { if(e.target.id === 'sc-search') window.scrollTo({ top: window.scrollY, behavior: 'instant' }); }, true);

    const acts = {
      'sc-search-clear': () => { const i = $('sc-search'); if (i) { i.value = ''; i.blur(); } this.st.q = ''; this.st.qSel.clear(); this.renderList(); const c=$('sc-search-clear'); if(c) c.style.display='none'; },
      'sc-edit': () => { this.st.edit = true; this.renderTab(); },
      'sc-save': () => {
        if (Store.pId) {
          const p = Store.pls, trg = p.find(x => x.id === Store.pId);
          trg.uids = this.st.drf.uids.filter(u => this.st.drf.chk.has(u));
          trg.hiddenUids = [...this.st.drf.hid].filter(u => this.st.drf.chk.has(u));
          Store.pls = p;
        } else {
          Store.set('userOrder', this.st.drf.uids);
          Store.set('hiddenUids', this.st.drf.uids.filter(u => !this.st.drf.chk.has(u)));
        }
        this.st.edit = false; W.NotificationSystem.success('Сохранено'); this.renderTab();
      },
      'sc-create': () => {
        const m = W.Modals.open({ title: 'Новый плейлист', bodyHtml: `<input id="n-pl-name" class="showcase-search" value="Мой плейлист" style="margin-bottom:15px; width:100%;"><button class="showcase-btn active" id="n-pl-btn" style="width:100%">Создать</button>` });
        setTimeout(() => m.querySelector('#n-pl-name')?.focus(), 100);
        m.onclick = e => {
          if (e.target.id === 'n-pl-btn') {
            const n = m.querySelector('#n-pl-name').value.trim() || 'Без имени';
            const uids = this.st.drf.uids.filter(u => this.st.drf.chk.has(u) && !this.st.drf.hid.has(u));
            const id = Date.now().toString(36);
            const p = Store.pls; p.push({ id, name: n, uids, hiddenUids: [], createdAt: Date.now() }); Store.pls = p;
            Store.pId = id; this.st.edit = false; W.NotificationSystem.success('Создан новый плейлист');
            m.remove(); this.renderTab();
          }
        };
      },
      'sc-cancel': () => {
        if (this.st.drf.dirty) {
          W.Modals.confirm({ title: 'Отменить изменения?', textHtml: 'Несохраненные данные будут потеряны.', confirmText: 'Выйти', onConfirm: () => { this.st.edit = false; this.renderTab(); } });
        } else { this.st.edit = false; this.renderTab(); }
      },
      'sc-reset-edit': () => W.Modals.confirm({ title: 'Сброс', textHtml: 'Вернуть к заводскому виду?', onConfirm: () => { this.initDraft(Store.get('masterOrder', [])); this.st.drf.dirty = true; this.renderList(); } }),
      'sc-master-reset': () => W.Modals.confirm({ title: 'Сбросить порядок?', textHtml: 'Список вернется к заводскому виду.', confirmText: 'Сбросить', onConfirm: () => { Store.set('userOrder', Store.get('masterOrder')); Store.set('hiddenUids', []); this.st.sort = 'user'; Store.set('sort', 'user'); this.renderTab(); } }),
      'sc-playall': () => this.playCtx(null, false),
      'sc-shuffle': () => this.playCtx(null, true),
      'sc-sort': () => this.openSort(),
      'sc-tg-e': () => { ls.setItem(LS+'sHid', (this.st.sHid = !this.st.sHid) ? '1' : '0'); this.renderList(); },
      'sc-tg-n': () => { ls.setItem(LS+'sNum', (this.st.sNum = !this.st.sNum) ? '1' : '0'); this.renderList(); },
      'sc-tg-v': () => { Store.set('view', this.st.view = this.st.view === 'flat' ? 'grouped' : 'flat'); this.renderList(); },
      'sc-q-add': () => {
        const arr = [...this.st.qSel];
        if (Store.pId) {
          const p = Store.pls, trg = p.find(x => x.id === Store.pId);
          arr.forEach(u => { if (!trg.uids.includes(u)) trg.uids.push(u); trg.hiddenUids = trg.hiddenUids.filter(x => x !== u); }); Store.pls = p;
        } else {
          const uo = Store.get('userOrder', []), hid = Store.get('hiddenUids', []);
          arr.forEach(u => { if (!uo.includes(u)) uo.push(u); }); Store.set('userOrder', uo); Store.set('hiddenUids', hid.filter(x => !arr.includes(x)));
        }
        W.NotificationSystem.success(`Добавлено: ${arr.length}`); this.st.q = ''; $('sc-search').value = ''; this.st.qSel.clear(); this.renderTab();
      },
      'sc-q-new': () => {
        const arr = [...this.st.qSel];
        const m = W.Modals.open({ title: 'Имя плейлиста', bodyHtml: `<input id="n-pl-name" class="showcase-search" value="Мой плейлист" style="margin-bottom:15px; width:100%;"><button class="showcase-btn active" id="n-pl-btn" style="width:100%">Создать</button>` });
        setTimeout(() => m.querySelector('#n-pl-name')?.focus(), 100);
        m.onclick = e => {
          if (e.target.id === 'n-pl-btn') {
            const n = m.querySelector('#n-pl-name').value.trim() || 'Без имени';
            const id = Date.now().toString(36);
            const p = Store.pls; p.push({ id, name: n, uids: arr, hiddenUids: [], createdAt: Date.now() }); Store.pls = p;
            Store.pId = id; this.st.q = ''; $('sc-search').value = ''; this.st.qSel.clear(); W.NotificationSystem.success('Создан новый плейлист'); m.remove(); this.renderTab();
          }
        };
      },
      'sc-q-clr': () => acts['sc-search-clear']()
    };

    root.addEventListener('touchstart', e => {
      const h = e.target.closest('.showcase-drag-handle'); if (h && this.st.edit) return e.preventDefault(), this.strtDrg(e, h.closest('.showcase-track'));
    }, { passive: false });

    root.addEventListener('click', e => {
      if (acts[e.target.id]) return acts[e.target.id]();
      const t = e.target.closest('.showcase-track'), u = t?.dataset.uid;
      if (!t) return;

      if (e.target.closest('.showcase-checkbox') || (this.st.edit && !e.target.closest('button'))) {
        if (this.st.edit) {
          this.st.drf.chk.has(u) ? this.st.drf.chk.delete(u) : this.st.drf.chk.add(u);
          if (!Store.pId) { this.st.drf.chk.has(u) ? this.st.drf.hid.delete(u) : this.st.drf.hid.add(u); }
          this.st.drf.dirty = true; this.renderList();
        } else if (this.st.q) {
          this.st.qSel.has(u) ? this.st.qSel.delete(u) : this.st.qSel.add(u); this.renderList();
        }
        return;
      }

      if (this.st.edit) {
        if (e.target.closest('.showcase-hide-btn') && Store.pId) {
          this.st.drf.hid.has(u) ? this.st.drf.hid.delete(u) : this.st.drf.hid.add(u);
          this.st.drf.dirty = true; this.renderList();
        }
        if (e.target.closest('.sc-arrow-up')) return this.swp(u, -1);
        if (e.target.closest('.sc-arrow-down')) return this.swp(u, 1);
        return;
      }

      if (e.target.closest('.showcase-track-menu-btn') || e.target.closest('.like-star') || e.target.closest('.offline-ind')) {
        e.preventDefault(); e.stopPropagation(); return this.opnMenu(u);
      }
      if (!this.st.q) this.playCtx(u, false);
    });

    root.addEventListener('dragstart', e => { if (!this.st.edit) return; const t = e.target.closest('.showcase-track'); if (t) { e.dataTransfer.setData('text/plain', t.dataset.uid); t.classList.add('is-dragging'); }});
    root.addEventListener('dragover', e => { if (!this.st.edit) return; e.preventDefault(); const t = e.target.closest('.showcase-track'); if (t) t.classList.add('drag-over');});
    root.addEventListener('dragleave', e => e.target.closest('.showcase-track')?.classList.remove('drag-over'));
    root.addEventListener('drop', e => {
      if (!this.st.edit) return; e.preventDefault();
      const t = e.target.closest('.showcase-track'), s = e.dataTransfer.getData('text/plain');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (t && s && s !== t.dataset.uid) { t.before(D.querySelector(`.showcase-track[data-uid="${s}"]`)); this.svOrd(); }
    });
    root.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging')));
  }

  renderPls() {
    const act = $('sc-playlists-actions'), lst = $('sc-playlists'), id = Store.pId, pls = Store.pls, col = Store.pCol;
    if (!act || !lst) return;
    act.innerHTML = `<button class="sc-pl-action ${!id ? 'active' : ''}" id="sc-pl-all">Все треки</button><button class="sc-pl-action" id="sc-pl-nw">+ Новый</button>`;
    act.onclick = e => {
      if (e.target.id === 'sc-pl-all') { Store.pId = null; this.renderTab(); }
      else if (e.target.id === 'sc-pl-nw') {
        const m = W.Modals.open({ title: 'Новый плейлист', bodyHtml: `<input id="n-pl-name" class="showcase-search" value="Мой плейлист" style="margin-bottom:15px; width:100%;"><button class="showcase-btn active" id="n-pl-btn" style="width:100%">Создать</button>` });
        setTimeout(() => m.querySelector('#n-pl-name')?.focus(), 100);
        m.onclick = ev => {
          if (ev.target.id === 'n-pl-btn') {
            const n = m.querySelector('#n-pl-name').value.trim() || 'Без имени';
            const nid = Date.now().toString(36);
            const p = Store.pls; p.push({ id: nid, name: n, uids: [], hiddenUids: [], createdAt: Date.now() }); Store.pls = p;
            Store.pId = nid; W.NotificationSystem.success('Создан'); m.remove(); this.renderTab();
          }
        };
      }
    };
    if (!pls.length) return lst.innerHTML = `<div class="sc-pl-empty">Плейлистов пока нет</div>`;
    lst.innerHTML = pls.map(p => `<div class="sc-pl-row ${id === p.id ? 'active' : ''}" data-pid="${p.id}" ${col[p.id] ? `style="--pl-color:${col[p.id]};"` : ''}><div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span></div><div class="sc-pl-right"><button class="sc-pl-btn" data-act="ed" data-pid="${p.id}">✏️</button><button class="sc-pl-btn" data-act="col" data-pid="${p.id}">🎨</button><button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}">✖</button></div></div>`).join('');
    lst.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act, pid = e.target.closest('[data-pid]')?.dataset.pid;
      if (a && pid) {
        if (a === 'ed') { Store.pId = pid; this.st.edit = true; this.renderTab(); }
        else if (a === 'del') W.Modals.confirm({ title: 'Удалить?', confirmText: 'Да', onConfirm: () => { Store.pls = Store.pls.filter(p => p.id !== pid); if (Store.pId === pid) Store.pId = null; this.renderTab(); }});
        else if (a === 'col') this.opnCol(null, null, pid);
      } else if (e.target.closest('.sc-pl-row')?.dataset.pid) { Store.pId = e.target.closest('.sc-pl-row').dataset.pid; this.renderTab(); }
    };
  }

  async renderList() {
    const c = $('sc-tracks-container'); if (!c) return;
    let items = [];

    if (this.st.q) {
      await ensureLyricsIndexLoaded();
      const sUids = searchUidsByQuery({ query: this.st.q });
      const curUids = Store.pId ? (Store.pls.find(p=>p.id===Store.pId)?.uids||[]) : Store.get('userOrder', []);
      const curHid = Store.pId ? (Store.pls.find(p=>p.id===Store.pId)?.hiddenUids||[]) : Store.get('hiddenUids', []);
      items = sUids.map(u => ({ u, t: W.TrackRegistry.getTrackByUid(u), isChk: this.st.qSel.has(u), badge: curUids.includes(u) ? (curHid.includes(u) ? 'hidden' : 'active') : 'missing' })).filter(x => x.t);
    } else if (this.st.edit) {
      items = this.st.drf.uids.map(u => ({ u, t: W.TrackRegistry.getTrackByUid(u), isChk: this.st.drf.chk.has(u), isHid: this.st.drf.hid.has(u) })).filter(x => x.t);
    } else {
      let bUids = Store.pId ? (Store.pls.find(p=>p.id===Store.pId)?.uids||[]) : Store.get('userOrder', []);
      const bHid = Store.pId ? (Store.pls.find(p=>p.id===Store.pId)?.hiddenUids||[]) : Store.get('hiddenUids', []);
      if (!this.st.sHid) bUids = bUids.filter(u => !bHid.includes(u));
      bUids = await this.getSortedUids(bUids);
      items = bUids.map(u => ({ u, t: W.TrackRegistry.getTrackByUid(u), isHid: bHid.includes(u) })).filter(x => x.t);
    }

    this.updStatus(items.length);
    let h = '', grp = null, cols = Store.aCol;
    
    items.forEach((it, i) => {
      const t = it.t;
      if (this.st.view === 'grouped' && !this.st.edit && !this.st.q && grp !== t.sourceAlbum) {
        grp = t.sourceAlbum; h += `<div class="showcase-group-header">── ${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum) || 'Альбом')} ──</div>`;
      }
      const cl = cols[t.sourceAlbum] || 'transparent';
      const drg = this.st.edit ? `<div class="showcase-drag-handle">⠿</div>` : '';
      const chk = (this.st.edit || this.st.q) ? `<div class="showcase-checkbox"></div>` : '';
      const eye = (this.st.edit && Store.pId) ? `<button class="showcase-hide-btn">${it.isHid?'👁‍🗨':'👁'}</button>` : '';
      const num = (!this.st.edit && !this.st.q && this.st.sNum) ? `<div class="tnum">${i+1}.</div>` : '';
      const ind = (this.st.edit) ? '' : `<span class="offline-ind" data-uid="${t.uid}">🔒</span><img src="${W.playerCore?.isFavorite(t.uid)?'img/star.png':'img/star2.png'}" class="like-star" data-uid="${t.uid}" data-album="${t.sourceAlbum}">`;
      const arr = this.st.edit ? `<button class="sc-arrow-up" data-dir="-1">▲</button>` : '';
      const arrD = this.st.edit ? `<button class="sc-arrow-down" data-dir="1">▼</button>` : (!this.st.q ? `<button class="showcase-track-menu-btn">···</button>` : `<button class="showcase-track-menu-btn">···</button>`);
      const bStyle = it.badge ? (it.badge==='active'?'sc-badge-active':(it.badge==='hidden'?'sc-badge-hidden':'sc-badge-missing')) : '';
      const bTxt = it.badge ? (it.badge==='active'?'Уже добавлен':(it.badge==='hidden'?'Скрыт':'Не в списке')) : '';

      h += `<div class="showcase-track ${it.isHid?'inactive':''} ${it.isChk?'selected':''}" data-uid="${t.uid}" style="border-left: 3px solid ${cl}" ${this.st.edit?'draggable="true"':''}>${arr}${num}${drg}${chk}<img src="${this._ic[t.sourceAlbum]||'img/logo.png'}" class="showcase-track-thumb" loading="lazy"><div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))} ${it.badge?`<span class="showcase-row-badge ${bStyle}">${bTxt}</span>`:''}</div></div>${ind}${eye}${arrD}</div>`;
    });

    if (this.st.q && this.st.qSel.size > 0) {
      h += `<div class="showcase-sticky-bar"><span>Выбрано: ${this.st.qSel.size}</span><button class="showcase-btn" id="sc-q-add">➕ Добавить</button><button class="showcase-btn" id="sc-q-new">🌟 Создать новый</button><button class="showcase-btn showcase-btn--danger" id="sc-q-clr">✕</button></div>`;
    }

    c.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
    if (!this.st.edit) W.OfflineIndicators?.injectOfflineIndicators?.(c);
    this.hiTrack(W.playerCore?.getCurrentTrackUid());
  }

  updStatus(cnt) {
    const s = $('sc-status'); if (!s) return;
    const dom = D.querySelectorAll('.showcase-track'), f = D.querySelectorAll('.showcase-track .like-star[src*="star.png"]').length, o = D.querySelectorAll('.showcase-track .offline-ind:not(.offline-ind--none)').length;
    s.innerHTML = `<span>📋 ${cnt??dom.length} · ⭐ ${f} · 🔒 ${o}</span><span style="display:flex;gap:12px;align-items:center"><span id="sc-tg-e" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${this.st.sHid?'👁':'🙈'}</span><span id="sc-tg-n" style="cursor:pointer;font-size:18px" title="Нумерация">${this.st.sNum?'1,2,3':'<s>1,2,3</s>'}</span><span id="sc-tg-v" style="cursor:pointer;font-size:18px" title="Сменить вид">${this.st.view==='flat'?'⊞':'⊟'}</span></span>`;
  }

  swp(u, d) { const el = D.querySelector(`.showcase-track[data-uid="${u}"]`), sb = d === -1 ? el?.previousElementSibling : el?.nextElementSibling; if (el && sb?.classList.contains('showcase-track')) { d === -1 ? sb.before(el) : sb.after(el); this.svOrd(); } }
  svOrd() { const u = Array.from(D.querySelectorAll('.showcase-track')).map(e => e.dataset.uid); this.st.drf.uids = u; this.st.drf.dirty = true; }
  strtDrg(e, n) {
    if(!n)return; const t=e.touches[0], c=n.cloneNode(true), r=n.getBoundingClientRect(), os=t.clientY-r.top;
    c.style.cssText=`position:fixed;left:${r.left}px;width:${r.width}px;z-index:10000;opacity:0.9;background:#252d39;box-shadow:0 10px 30px rgba(0,0,0,0.8);pointer-events:none`; D.body.appendChild(c); n.style.opacity=0.3;
    const m = e2 => { e2.preventDefault(); const y=e2.touches[0].clientY; c.style.top=(y-os)+'px'; D.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); const o = D.elementFromPoint(W.innerWidth/2, y)?.closest('.showcase-track'); if(o && o!==n) o.classList.add('drag-over'); };
    const d = e2 => { D.removeEventListener('touchmove',m); D.removeEventListener('touchend',d); c.remove(); n.style.opacity=''; const y=e2.changedTouches[0].clientY, tg=D.elementFromPoint(W.innerWidth/2,y)?.closest('.showcase-track'); D.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); if(tg && tg!==n) { tg.before(n); this.svOrd(); } };
    D.addEventListener('touchmove',m,{passive:false}); D.addEventListener('touchend',d);
  }

  opnCol(u, aKey = null, pId = null) {
    if (u && !aKey) aKey = W.TrackRegistry.getTrackByUid(u)?.sourceAlbum;
    const cur = pId ? Store.pCol[pId] : Store.aCol[aKey], m = W.Modals.open({ title: pId ? 'Цвет плейлиста' : 'Цвет альбома', bodyHtml: `<div class="showcase-color-picker">${PALETTE.map(c=>`<div class="showcase-color-dot" style="background:${c};${cur===c?'border-color:#fff':''}" data-col="${c}"></div>`).join('')}</div><button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>` });
    m.onclick = e => { const el = e.target.closest('[data-col]'); if(el) { const c = el.dataset.col==='transparent'?'':el.dataset.col; if(pId) { const p = Store.pCol; p[pId]=c; Store.pCol=p; this.renderPls(); } else { const a = Store.aCol; a[aKey]=c; Store.aCol=a; W.AlbumsManager?.getCurrentAlbum() === '__showcase__' && this.renderList(); } m.remove(); } };
  }

  opnMenu(u) {
    if(this._menu) this._menu.remove(); const t = W.TrackRegistry.getTrackByUid(u); if(!t) return;
    const bg = D.createElement('div'); bg.className = 'sc-bottom-sheet-bg';
    const topPlay = this.st.q ? `<button class="sc-sheet-btn" id="bm-play" style="color:var(--secondary-color)">▶ Воспроизвести</button>` : '';
    bg.innerHTML = `<div class="sc-bottom-sheet"><div class="sc-sheet-title">${esc(t.title)}</div><div class="sc-sheet-sub">${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div>${topPlay}<button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>${(Store.pId && !this.st.q)?`<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из текущего плейлиста</button>`:''}<button class="sc-sheet-btn" id="bm-hd">👁 Скрыть / Показать трек</button><button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite(u)?'❌ Убрать из Избранного':'⭐ В Избранное'}</button><button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Убрать из офлайн</button><button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3 файл</button><button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button><button class="sc-sheet-btn" id="bm-sh">📸 Поделиться треком (Карточка)</button><button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button><button class="sc-sheet-btn" style="color:#888;justify-content:center;margin-top:10px" id="bm-cx">Отмена</button></div>`;
    D.body.appendChild(bg); this._menu = bg; requestAnimationFrame(() => bg.classList.add('active'));
    const cls = () => { bg.classList.remove('active'); setTimeout(()=>bg.remove(), 200); this._menu=null; };
    bg.onclick = e => {
      const id = e.target.id; if(e.target===bg || id==='bm-cx') return cls(); if(!id) return; cls();
      if(id==='bm-play') { W.AlbumsManager.setPlayingAlbum('__showcase_search__'); let cv = this._ic[t.sourceAlbum] || 'img/logo.png'; if (U.isMobile() && /\/icon_album\/[^/]+\.png$/i.test(cv)) cv = cv.replace('.png', '@1x.jpg').replace('icon_album/', 'icon_album/mobile/'); W.playerCore.setPlaylist([{...t, album: 'Поиск', cover: cv}], 0, null, { preservePosition: false }); W.playerCore.play(0); W.PlayerUI.ensurePlayerBlock(0, { userInitiated: true }); }
      else if(id==='bm-pl') setTimeout(()=> {
         const pls = Store.pls; if(!pls.length) return W.NotificationSystem.warning('Создайте плейлист');
         const m = W.Modals.open({ title: 'Выберите плейлист', bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px;">${pls.map(p=>`<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>` });
         m.onclick = ev => { const b=ev.target.closest('[data-pid]'); if(b) { const trg=pls.find(x=>x.id===b.dataset.pid); if(!trg.uids.includes(u)) trg.uids.push(u); trg.hiddenUids=trg.hiddenUids.filter(x=>x!==u); Store.pls=pls; W.NotificationSystem.success('Добавлено'); m.remove(); } };
      },250);
      else if(id==='bm-rm') { const p=Store.pls, trg=p.find(x=>x.id===Store.pId); if(trg) { trg.uids=trg.uids.filter(x=>x!==u); Store.pls=p; this.renderList(); } }
      else if(id==='bm-hd') {
         if (Store.pId) { const p=Store.pls, trg=p.find(x=>x.id===Store.pId); trg.hiddenUids.includes(u)?trg.hiddenUids=trg.hiddenUids.filter(x=>x!==u):trg.hiddenUids.push(u); Store.pls=p; }
         else { const hid=Store.get('hiddenUids',[]); hid.includes(u)?Store.set('hiddenUids',hid.filter(x=>x!==u)):Store.set('hiddenUids',[...hid,u]); }
         this.renderList();
      }
      else if(id==='bm-fv') W.playerCore?.toggleFavorite(u,{albumKey:t.sourceAlbum});
      else if(id==='bm-of') W.OfflineManager?.togglePinned?.(u);
      else if(id==='bm-dl') { const a=D.createElement('a'); U.download.applyDownloadLink(a,t); if(a.href) a.click(); }
      else if(id==='bm-st') setTimeout(()=>W.StatisticsModal?.openStatisticsModal?.(u),250);
      else if(id==='bm-sh') setTimeout(()=>import('../../analytics/share-generator.js').then(m=>m.ShareGenerator.generateAndShare('track',t)),250);
      else if(id==='bm-cl') setTimeout(()=>this.opnCol(u),250);
    };
  }

  hiTrack(u) { D.querySelectorAll('.showcase-track.current').forEach(e=>e.classList.remove('current')); if(u) D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(u)}"]`).forEach(e=>e.classList.add('current')); }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

/**
 * scripts/app/showcase/index.js
 * "Витрина Разбита" (Showcase) — Мастер Вкладка.
 * ПОЛНАЯ РЕАЛИЗАЦИЯ (ТЗ v2.0): Оптимизировано, мгновенный отклик, DND, кэширование.
 */

const W = window;
const D = document;
const U = W.Utils;
const LS_PREFIX = 'showcase:';

const PALETTE = [
  { id: 'none', hex: 'transparent' }, { id: 'red', hex: '#ef5350' }, { id: 'orange', hex: '#ff9800' },
  { id: 'yellow', hex: '#fdd835' }, { id: 'green', hex: '#4caf50' }, { id: 'cyan', hex: '#00bcd4' },
  { id: 'blue', hex: '#2196f3' }, { id: 'purple', hex: '#9c27b0' }, { id: 'pink', hex: '#e91e63' },
  { id: 'grey', hex: '#9e9e9e' }
];

class ShowcaseStore {
  static get(k, d) { return U.lsGetJson(LS_PREFIX + k, d); }
  static set(k, v) { U.lsSet(LS_PREFIX + k, JSON.stringify(v)); }

  static init() {
    let master = this.get('masterOrder', []);
    if (!master.length) {
      const albums = [...(W.albumsIndex || [])].reverse();
      albums.forEach(a => {
        if (a.key.startsWith('__')) return;
        W.TrackRegistry?.getAllUids()?.forEach(uid => {
          const t = W.TrackRegistry.getTrackByUid(uid);
          if (t?.sourceAlbum === a.key && !master.includes(uid)) master.push(uid);
        });
      });
      this.set('masterOrder', master);
      this.set('userOrder', [...master]);
    }
  }

  static get activePlaylistId() { return this.get('activePlaylistId', null); }
  static set activePlaylistId(id) { this.set('activePlaylistId', id); }
  static get playlists() { return this.get('playlists', []); }
  static set playlists(p) { this.set('playlists', p); }
  static get albumColors() { return this.get('albumColors', {}); }
  static set albumColors(c) { this.set('albumColors', c); }
  static get playlistColors() { return this.get('playlistColors', {}); }
  static set playlistColors(c) { this.set('playlistColors', c); }
}

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

class ShowcaseManager {
  constructor() {
    this.editMode = false;
    this.searchQuery = '';
    this.viewMode = ShowcaseStore.get('viewMode', 'flat');
    this.sortMode = ShowcaseStore.get('sortMode', 'user');
    this.selectedUids = new Set();
    this._albumIconMap = {};
    this._statsCache = new Map();
    this._editSnapshot = null;
    this._activeMenu = null;
  }

  async initialize() {
    // 2.7 Формирование иконок альбомов
    (W.APP_CONFIG?.ICON_ALBUMS_ORDER || []).forEach(it => { this._albumIconMap[it.key] = it.icon; });
    
    await this.preloadAll();
    ShowcaseStore.init();
    
    // 2.8 Восстановление сессии
    W.playerCore?.on({
      onTrackChange: (t) => {
        if (t?.uid && U.isShowcaseContext(W.AlbumsManager?.getPlayingAlbum())) {
          ShowcaseStore.set('lastTrackUid', t.uid);
          ShowcaseStore.set('lastPlayingContext', W.AlbumsManager.getPlayingAlbum());
        }
      }
    });

    // 4.4 Точечное обновление звезд
    W.playerCore?.onFavoritesChanged(({ uid }) => {
      const img = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"] .like-star`);
      if (img) img.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png';
      this.updateStatusBar();
    });

    W.addEventListener('offline:stateChanged', () => {
      if (W.AlbumsManager?.getCurrentAlbum() === '__showcase__') {
        W.OfflineIndicators?.refreshAllIndicators();
        this.updateStatusBar();
      }
    });
  }

  async preloadAll() {
    const albums = W.albumsIndex || [];
    const proms = albums.filter(a => !a.key.startsWith('__')).map(async a => {
      const base = a.base.endsWith('/') ? a.base : `${a.base}/`;
      try {
        const res = await fetch(`${base}config.json`, { cache: 'force-cache' });
        if (res.ok) {
          const data = await res.json();
          data.tracks?.forEach(t => W.TrackRegistry.registerTrack({...t, sourceAlbum: a.key}, {title: data.albumName || a.title}));
        }
      } catch (e) {}
    });
    await Promise.allSettled(proms);
  }

  // ФАЗА 4 & 2.6: Сортировка с кэшированием
  async getActiveListTracks() {
    const pId = ShowcaseStore.activePlaylistId;
    let uids = pId ? (ShowcaseStore.playlists.find(p => p.id === pId)?.uids || []) : ShowcaseStore.get('userOrder', []);
    
    if (this.sortMode === 'shuffle' && !this.editMode) {
      let sh = ShowcaseStore.get('shuffledOrder', null);
      if (!sh || sh.length !== uids.length) {
        sh = [...uids].sort(() => Math.random() - 0.5);
        ShowcaseStore.set('shuffledOrder', sh);
      }
      uids = sh;
    } else if (this.sortMode !== 'user' && !this.editMode) {
      const tracks = uids.map(u => W.TrackRegistry.getTrackByUid(u)).filter(Boolean);
      
      if (this.sortMode.startsWith('plays') || this.sortMode === 'last-played') {
        const { metaDB } = await import('../../analytics/meta-db.js');
        const listensDoc = await metaDB.getStat('globalFullListens') || { details: {} };
        const lastPlayDoc = await metaDB.getStat('lastPlayed') || { details: {} };
        
        tracks.forEach(t => {
           this._statsCache.set(t.uid, {
              plays: listensDoc.details[t.uid] || 0,
              lastAt: lastPlayDoc.details[t.uid] || 0
           });
        });
      }

      tracks.sort((a,b) => {
        if (this.sortMode === 'name-asc') return a.title.localeCompare(b.title);
        if (this.sortMode === 'name-desc') return b.title.localeCompare(a.title);
        if (this.sortMode === 'album-desc') return b.sourceAlbum.localeCompare(a.sourceAlbum);
        if (this.sortMode === 'album-asc') return a.sourceAlbum.localeCompare(b.sourceAlbum);
        if (this.sortMode === 'favorites-first') return (W.playerCore?.isFavorite(b.uid)?1:0) - (W.playerCore?.isFavorite(a.uid)?1:0);
        
        const sa = this._statsCache.get(a.uid) || { plays: 0, lastAt: 0 };
        const sb = this._statsCache.get(b.uid) || { plays: 0, lastAt: 0 };
        if (this.sortMode === 'plays-desc') return sb.plays - sa.plays;
        if (this.sortMode === 'plays-asc') return sa.plays - sb.plays;
        if (this.sortMode === 'last-played') return sb.lastAt - sa.lastAt;
        return 0;
      });
      uids = tracks.map(t => t.uid);
    }

    const hidden = pId ? (ShowcaseStore.playlists.find(p => p.id === pId)?.hiddenUids || []) : ShowcaseStore.get('hiddenUids', []);
    const showHidden = localStorage.getItem('showcase:showHidden:v1') === '1';

    if (!this.editMode && !showHidden) uids = uids.filter(u => !hidden.includes(u));

    // 2.1 Поиск (title/album/lyrics) — быстрый и офлайн через индекс
    if (this.searchQuery && !this.editMode) {
      const q = String(this.searchQuery || '').trim();

      // Подгружаем индекс лениво (но cache-first, так что после install доступно офлайн)
      await ensureLyricsIndexLoaded();

      uids = searchUidsByQuery({ uids, query: q });
    }

    return uids.map(u => {
      const t = W.TrackRegistry.getTrackByUid(u);
      return t ? { ...t, album: 'Витрина Разбита', cover: this.getIcon(t.sourceAlbum) } : null;
    }).filter(Boolean);
  }

  getIcon(key) {
    let icon = this._albumIconMap[key] || 'img/logo.png';
    if (U.isMobile() && icon.includes('.png')) icon = icon.replace('.png', '/mobile/@1x.jpg').replace('icon_album/', 'icon_album/mobile/');
    return icon;
  }

  // ФАЗА 3: Главный рендер
  async renderTab() {
    const list = D.getElementById('track-list');
    if (!list) return;

    // 2.3 Снапшот для отката
    if (this.editMode && !this._editSnapshot) {
      const pId = ShowcaseStore.activePlaylistId;
      this._editSnapshot = {
        isPl: !!pId,
        order: pId ? [...ShowcaseStore.playlists.find(p=>p.id===pId).uids] : [...ShowcaseStore.get('userOrder', [])],
        hidden: pId ? [...ShowcaseStore.playlists.find(p=>p.id===pId).hiddenUids] : [...ShowcaseStore.get('hiddenUids', [])]
      };
    } else if (!this.editMode) {
      this._editSnapshot = null;
    }

    const hasCustomMaster = JSON.stringify(ShowcaseStore.get('userOrder', [])) !== JSON.stringify(ShowcaseStore.get('masterOrder', []));
    const showReset = !this.editMode && !ShowcaseStore.activePlaylistId && hasCustomMaster;

    list.innerHTML = `
      <div class="showcase-header-controls">
        ${this.editMode ? `
          <div class="showcase-edit-banner">
            ✏️ РЕЖИМ РЕДАКТИРОВАНИЯ
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="showcase-btn" id="sc-save" style="background:#fff; color:#000;">💾 Сохранить</button>
              <button class="showcase-btn" id="sc-reset-edit" style="background:transparent; border-color:#ff9800;">↺ Сброс</button>
              <button class="showcase-btn showcase-btn--danger" id="sc-cancel">✕ Выйти</button>
            </div>
          </div>
        ` : ''}
        
        <div class="showcase-search-wrap">
          <input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск трека или текста..." value="${U.escapeHtml(this.searchQuery)}">
          <button type="button" class="showcase-search-clear" id="sc-search-clear" title="Очистить" aria-label="Очистить">✕</button>
        </div>
        
        <div class="showcase-btns-row">
          ${!this.editMode ? `<button class="showcase-btn" id="sc-edit">✏️ Редактировать</button>` : ''}
          ${showReset ? `<button class="showcase-btn" id="sc-master-reset" style="flex:0.5">↺ Сброс</button>` : ''}
          <button class="showcase-btn" id="sc-sort">↕️ Сортировка ${this.sortMode !== 'user' ? '●' : ''}</button>
        </div>

        ${!this.editMode ? `
        <div class="showcase-btns-row">
          <button class="showcase-btn" id="sc-playall">▶ Играть всё</button>
          <button class="showcase-btn" id="sc-shuffle">🔀 Перемешать</button>
        </div>
        ` : ''}

        <div class="showcase-playlists-actions" id="sc-playlists-actions"></div>
        <div class="showcase-playlists-list" id="sc-playlists"></div>
        <div class="showcase-status-bar" id="sc-status"></div>
      </div>
      <div id="sc-tracks-container"></div>
    `;

    this.bindControls(list);
    this.renderPlaylists();
    await this.renderList(); // Await is important now for fuzzy search

    // 2.8 Восстановление подсветки
    if (!this.editMode) {
       const lastU = ShowcaseStore.get('lastTrackUid');
       if (lastU && ShowcaseStore.get('lastPlayingContext') === (ShowcaseStore.activePlaylistId ? `__showcase__:${ShowcaseStore.activePlaylistId}` : '__showcase__')) {
         this.highlightTrackByUid(lastU);
       }
    }
  }

  bindControls(root) {
    const $id = id => root.querySelector('#' + id);
    
    const searchInp = $id('sc-search');
    const clearBtn = $id('sc-search-clear');

    const applySearch = U.func.debounceFrame(async () => {
      this.searchQuery = String(searchInp?.value || '');
      await this.renderList();
      // Кнопка-крестик видна только если есть текст
      if (clearBtn) clearBtn.style.display = this.searchQuery.trim() ? '' : 'none';
    });

    if (searchInp) {
      searchInp.addEventListener('input', () => applySearch());

      // Enter/OK: фикс для "залипшего" приближения/раскладки на мобильных
      searchInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchInp.blur();
        }
      });

      // При выходе из поиска — тоже снимаем фокус и не держим раскладку "в режиме ввода"
      searchInp.addEventListener('blur', () => {
        // Ничего не меняем в запросе, просто даем браузеру восстановить layout
        window.scrollTo({ top: window.scrollY, behavior: 'instant' });
      });
    }

    if (clearBtn) {
      clearBtn.style.display = this.searchQuery.trim() ? '' : 'none';
      clearBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (searchInp) {
          searchInp.value = '';
          searchInp.blur();
        }
        this.searchQuery = '';
        await this.renderList();
        clearBtn.style.display = 'none';
      });
    }

    $id('sc-edit')?.addEventListener('click', () => {
      if (this.sortMode !== 'user') return W.NotificationSystem.warning('Для ручной перестановки сбросьте сортировку');
      this.editMode = true; this.selectedUids.clear(); this.renderTab();
    });

    // 2.3 Кнопки режима редактирования
    $id('sc-save')?.addEventListener('click', () => {
      this.editMode = false; this.selectedUids.clear(); this.renderTab();
      W.NotificationSystem.success('Изменения сохранены');
    });

    $id('sc-cancel')?.addEventListener('click', () => {
      this._restoreSnapshot();
      this.editMode = false; this.selectedUids.clear(); this.renderTab();
    });

    $id('sc-reset-edit')?.addEventListener('click', () => {
      this._restoreSnapshot();
      this.selectedUids.clear(); this.renderList();
      W.NotificationSystem.info('Сброшено до входа в режим');
    });

    // 2.2 Сброс мастер списка
    $id('sc-master-reset')?.addEventListener('click', () => {
      W.Modals.confirm({
        title: 'Сбросить порядок?',
        textHtml: 'Мастер-список вернется к дефолтному состоянию. Плейлисты не пострадают.',
        confirmText: 'Сбросить',
        onConfirm: () => {
          ShowcaseStore.set('userOrder', ShowcaseStore.get('masterOrder'));
          ShowcaseStore.set('hiddenUids', []);
          this.sortMode = 'user'; ShowcaseStore.set('sortMode', 'user');
          this.renderTab();
        }
      });
    });

    $id('sc-playall')?.addEventListener('click', () => this.playContext());
    $id('sc-shuffle')?.addEventListener('click', () => {
      this.sortMode = 'shuffle'; ShowcaseStore.set('sortMode', 'shuffle');
      ShowcaseStore.set('shuffledOrder', null); // Force regen
      this.playContext(); this.renderTab();
    });

    $id('sc-sort')?.addEventListener('click', () => this.openSortModal());

    // Делегирование событий строк списка
    let longPressTimer = null, isLongPress = false;

    root.addEventListener('touchstart', (e) => {
      const handle = e.target.closest('.showcase-drag-handle');
      if (handle && this.editMode) {
         e.preventDefault(); // Stop scroll
         this.startDragMobile(e, handle.closest('.showcase-track'));
         return;
      }
      const t = e.target.closest('.showcase-track');
      if (t && this.editMode && !e.target.closest('button')) {
         isLongPress = false;
         longPressTimer = setTimeout(() => {
            isLongPress = true;
            this.toggleSelection(t.dataset.uid);
            if (window.navigator.vibrate) navigator.vibrate(50);
         }, 500);
      }
    }, {passive: false});

    root.addEventListener('touchmove', () => { if(longPressTimer) clearTimeout(longPressTimer); }, {passive: true});
    root.addEventListener('touchend', () => { if(longPressTimer) clearTimeout(longPressTimer); });

    root.addEventListener('click', (e) => {
      if (isLongPress) return;
      const t = e.target.closest('.showcase-track');
      if (!t) return;
      const uid = t.dataset.uid;

      if (this.editMode) {
        if (e.target.closest('.showcase-hide-btn')) return this.toggleHide(uid);
        if (e.target.closest('.sc-arrow-up')) return this.swapNodes(uid, -1);
        if (e.target.closest('.sc-arrow-down')) return this.swapNodes(uid, 1);
        
        if (this.selectedUids.size > 0 || e.target.closest('.showcase-checkbox')) {
           this.toggleSelection(uid);
           return;
        }
        return this.openTrackMenu(uid); // Открывает меню при клике даже в ред.режиме
      }

      if (e.target.closest('.showcase-track-menu-btn')) return this.openTrackMenu(uid);
      if (e.target.closest('.like-star') || e.target.closest('.offline-ind')) return;
      
      this.playContext(uid);
    });

    // 2.4 Desktop Drag and Drop
    root.addEventListener('dragstart', e => {
      if (!this.editMode) return;
      const t = e.target.closest('.showcase-track');
      if (t) {
        e.dataTransfer.setData('text/plain', t.dataset.uid);
        t.classList.add('is-dragging');
      }
    });
    root.addEventListener('dragover', e => {
      if (!this.editMode) return;
      e.preventDefault();
      const t = e.target.closest('.showcase-track');
      if (t) t.classList.add('drag-over');
    });
    root.addEventListener('dragleave', e => {
      const t = e.target.closest('.showcase-track');
      if (t) t.classList.remove('drag-over');
    });
    root.addEventListener('drop', e => {
      if (!this.editMode) return;
      e.preventDefault();
      const t = e.target.closest('.showcase-track');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (!t) return;
      const srcUid = e.dataTransfer.getData('text/plain');
      const tgtUid = t.dataset.uid;
      if (srcUid && srcUid !== tgtUid) this.moveTrackToNode(srcUid, t);
    });
    root.addEventListener('dragend', () => {
      D.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    });
  }

  _restoreSnapshot() {
    if (!this._editSnapshot) return;
    const { isPl, order, hidden } = this._editSnapshot;
    if (isPl) {
      const pls = ShowcaseStore.playlists;
      const p = pls.find(x => x.id === ShowcaseStore.activePlaylistId);
      if (p) { p.uids = order; p.hiddenUids = hidden; ShowcaseStore.playlists = pls; }
    } else {
      ShowcaseStore.set('userOrder', order);
      ShowcaseStore.set('hiddenUids', hidden);
    }
  }

  // ФАЗА 2: Воспроизведение
  playContext(uid = null) {
    const pId = ShowcaseStore.activePlaylistId;
    const ctxKey = pId ? `__showcase__:${pId}` : '__showcase__';
    const tracks = this.getActiveListTracks(); // Это теперь Promise, но мы знаем что кэш уже готов
    
    // Resolve Promise safely
    Promise.resolve(tracks).then(trks => {
        if (!trks.length) return;
        let idx = 0;
        if (uid) idx = trks.findIndex(t => t.uid === uid);
        if (idx < 0) idx = 0;

        W.AlbumsManager.setPlayingAlbum(ctxKey);
        W.playerCore.setPlaylist(trks, idx, null, { preservePosition: false });
        W.playerCore.play(idx);
        W.PlayerUI.ensurePlayerBlock(idx, { userInitiated: true });
        this.highlightTrackByUid(trks[idx].uid);
    });
  }

  // 3.5 Плейлисты (вертикальный список во всю ширину)
  renderPlaylists() {
    const actions = D.getElementById('sc-playlists-actions');
    const list = D.getElementById('sc-playlists');
    if (!actions || !list) return;

    const pId = ShowcaseStore.activePlaylistId;
    const playlists = ShowcaseStore.playlists || [];
    const colors = ShowcaseStore.playlistColors || {};

    // Верхняя строка: системные действия
    actions.innerHTML = `
      <button class="sc-pl-action ${!pId ? 'active' : ''}" data-action="all">Все треки</button>
      <button class="sc-pl-action" data-action="new">+ Новый</button>
      <button class="sc-pl-action" data-action="paste" title="Вставить плейлист из буфера">📋</button>
    `;

    actions.onclick = (e) => {
      const act = e.target.closest('[data-action]')?.dataset.action;
      if (!act) return;

      if (act === 'all') {
        ShowcaseStore.activePlaylistId = null;
        this.renderTab();
        return;
      }
      if (act === 'new') return this.createNewPlaylist();
      if (act === 'paste') return this.pastePlaylist();
    };

    // Вертикальный список плейлистов
    if (!playlists.length) {
      list.innerHTML = `<div class="sc-pl-empty">Плейлистов пока нет</div>`;
      return;
    }

    list.innerHTML = playlists.map(p => {
      const col = String(colors[p.id] || '').trim();
      const style = col ? `style="--pl-color:${col};"` : '';
      const active = pId === p.id ? 'active' : '';
      return `
        <div class="sc-pl-row ${active}" data-pid="${p.id}" ${style}>
          <div class="sc-pl-left">
            <span class="sc-pl-dot"></span>
            <span class="sc-pl-title" title="${U.escapeHtml(p.name)}">${U.escapeHtml(p.name)}</span>
          </div>
          <div class="sc-pl-right">
            <button class="sc-pl-btn" data-act="share" data-pid="${p.id}" title="Поделиться">🔗</button>
            <button class="sc-pl-btn" data-act="edit" data-pid="${p.id}" title="Редактировать">🔨</button>
            <button class="sc-pl-btn" data-act="color" data-pid="${p.id}" title="Цвет">🎨</button>
            <button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}" title="Удалить">✖</button>
          </div>
        </div>
      `;
    }).join('');

    list.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const pid = e.target.closest('[data-pid]')?.dataset.pid;
      const rowPid = e.target.closest('.sc-pl-row')?.dataset.pid;

      if (act && pid) {
        if (act === 'edit') {
          ShowcaseStore.activePlaylistId = pid;
          this.editMode = true;
          this.renderTab();
          return;
        }
        if (act === 'share') return this.sharePlaylist(pid);
        if (act === 'del') return this.deletePlaylist(pid);
        if (act === 'color') return this.openColorPicker(null, null, pid);
        return;
      }

      if (rowPid) {
        ShowcaseStore.activePlaylistId = rowPid;
        this.renderTab();
      }
    };
  }

  // 4.1 Оптимизированный Рендер Списка
  async renderList() {
    const c = D.getElementById('sc-tracks-container');
    if (!c) return;

    const tracks = await this.getActiveListTracks();
    const colors = ShowcaseStore.albumColors;
    const hiddenList = ShowcaseStore.activePlaylistId 
      ? (ShowcaseStore.playlists.find(p=>p.id===ShowcaseStore.activePlaylistId)?.hiddenUids || []) 
      : ShowcaseStore.get('hiddenUids', []);

    this.updateStatusBar(tracks.length);
    
    D.getElementById('sc-toggle-view')?.addEventListener('click', () => {
      this.viewMode = this.viewMode === 'flat' ? 'grouped' : 'flat';
      ShowcaseStore.set('viewMode', this.viewMode);
      this.renderList(); // View change needs full re-render
    }, { once: true });

    D.getElementById('sc-toggle-eye')?.addEventListener('click', () => {
      const cur = localStorage.getItem('showcase:showHidden:v1') === '1';
      localStorage.setItem('showcase:showHidden:v1', cur ? '0' : '1');
      this.renderList();
    }, { once: true });

    D.getElementById('sc-toggle-nums')?.addEventListener('click', () => {
      const cur = localStorage.getItem('showcase:showNumbers:v1') === '1';
      localStorage.setItem('showcase:showNumbers:v1', cur ? '0' : '1');
      this.renderList();
    }, { once: true });

    let html = '';
    let curGrp = null;

    tracks.forEach((t, i) => {
      if (this.viewMode === 'grouped' && curGrp !== t.sourceAlbum) {
        curGrp = t.sourceAlbum;
        const aTitle = W.TrackRegistry.getAlbumTitle(t.sourceAlbum) || 'Альбом';
        html += `<div class="showcase-group-header">── ${U.escapeHtml(aTitle)} ──</div>`;
      }

      const col = colors[t.sourceAlbum] || 'transparent';
      const isHid = hiddenList.includes(t.uid);
      const showNums = localStorage.getItem('showcase:showNumbers:v1') === '1';
      const isSel = this.selectedUids.has(t.uid);
      
      html += `
        <div class="showcase-track ${isHid ? 'inactive' : ''} ${isSel ? 'selected' : ''}" data-uid="${t.uid}" style="border-left: 3px solid ${col}" ${this.editMode?'draggable="true"':''}>
          ${this.editMode
            ? `<button class="sc-arrow-up" data-dir="-1">▲</button>`
            : `<div class="tnum"${showNums ? '' : ' style="display:none"'}>${i + 1}.</div>`}
          ${this.editMode ? `<div class="showcase-drag-handle">⠿</div><div class="showcase-checkbox"></div>` : ''}
          <img src="${t.cover}" class="showcase-track-thumb" alt="" loading="lazy">
          <div class="track-title">
            <div>${U.escapeHtml(t.title)}</div>
            <div class="showcase-track-meta">${U.escapeHtml(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div>
          </div>
          <span class="offline-ind" data-uid="${t.uid}">🔒</span>
          ${this.editMode ? `<button class="showcase-hide-btn">${isHid ? '👁‍🗨' : '👁'}</button>` : ''}
          <img src="${W.playerCore?.isFavorite(t.uid) ? 'img/star.png' : 'img/star2.png'}" class="like-star" data-uid="${t.uid}" data-album="${t.sourceAlbum}">
          ${!this.editMode ? `<button class="showcase-track-menu-btn">···</button>` : `<button class="sc-arrow-down" data-dir="1">▼</button>`}
        </div>
      `;
    });

    if (this.editMode && ShowcaseStore.activePlaylistId) {
      html += `<div style="padding:20px;text-align:center;"><button class="showcase-btn" id="sc-add-to-pl-btn" style="display:inline-block;">➕ Добавить треки из Витрины</button></div>`;
    }

    c.innerHTML = html || '<div class="fav-empty">Треки не найдены</div>';
    
    c.querySelector('#sc-add-to-pl-btn')?.addEventListener('click', () => this.showAddTracksModal());

    if (W.OfflineIndicators?.injectOfflineIndicators) W.OfflineIndicators.injectOfflineIndicators(c);
    this.highlightTrackByUid(W.playerCore?.getCurrentTrackUid());
    this.renderMultiPanel();
  }

  // 3.2 Full Status Bar
  updateStatusBar(count) {
    const s = D.getElementById('sc-status');
    if (!s) return;
    const trks = D.querySelectorAll('.showcase-track');
    const total = count ?? trks.length;
    let fav = 0, off = 0, clouds = 0;

    // Быстро по DOM (offline-ind обновляется отдельно)
    fav = D.querySelectorAll('.showcase-track .like-star[src*="star.png"]').length;
    off = D.querySelectorAll('.showcase-track .offline-ind:not(.offline-ind--none)').length;
    clouds = Array.from(D.querySelectorAll('.showcase-track .offline-ind'))
      .filter((n) => (n?.textContent || '').trim() === '☁').length;

    const showHidden = localStorage.getItem('showcase:showHidden:v1') === '1';
    const showNums = localStorage.getItem('showcase:showNumbers:v1') === '1';

    s.innerHTML = `
      <span>📋 ${total} · ⭐ ${fav} · 🔒 ${off} · ☁ ${clouds}${this.editMode && this.selectedUids.size ? `<span style="color:#ff9800"> · ✓ ${this.selectedUids.size}</span>` : ''}</span>
      <span style="display:flex; gap:12px; align-items:center;">
        <span style="cursor:pointer; font-size:18px;" id="sc-toggle-eye" title="Показывать скрытые">${showHidden ? '👁' : '🙈'}</span>
        <span style="cursor:pointer; font-size:18px;" id="sc-toggle-nums" title="Нумерация">${showNums ? '1,2,3' : ''}</span>
        <span style="cursor:pointer; font-size:18px;" id="sc-toggle-view" title="Сменить вид">${this.viewMode === 'flat' ? '⊞' : '⊟'}</span>
      </span>
    `;
  }

  // 4.1 Direct DOM Swap for ↑↓
  swapNodes(uid, dir) {
    const el = D.querySelector(`.showcase-track[data-uid="${uid}"]`);
    if (!el) return;
    
    const sibling = dir === -1 ? el.previousElementSibling : el.nextElementSibling;
    if (!sibling || !sibling.classList.contains('showcase-track')) return;

    if (dir === -1) sibling.before(el);
    else sibling.after(el);

    this._saveOrderFromDOM();
  }

  moveTrackToNode(srcUid, tgtNode) {
    const src = D.querySelector(`.showcase-track[data-uid="${srcUid}"]`);
    if (!src || !tgtNode) return;
    tgtNode.before(src);
    this._saveOrderFromDOM();
  }

  _saveOrderFromDOM() {
    const uids = Array.from(D.querySelectorAll('.showcase-track')).map(el => el.dataset.uid);
    const pId = ShowcaseStore.activePlaylistId;
    if (pId) {
      const pls = ShowcaseStore.playlists;
      pls.find(x => x.id === pId).uids = uids;
      ShowcaseStore.playlists = pls;
    } else {
      ShowcaseStore.set('userOrder', uids);
    }
  }

  // Vanilla JS Touch DND
  startDragMobile(e, node) {
    if (!node) return;
    const touch = e.touches[0];
    const clone = node.cloneNode(true);
    const rect = node.getBoundingClientRect();
    const offset = touch.clientY - rect.top;

    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.zIndex = 10000;
    clone.style.opacity = 0.9;
    clone.style.background = '#252d39';
    clone.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8)';
    clone.style.pointerEvents = 'none';
    D.body.appendChild(clone);

    node.style.opacity = 0.3;

    const move = (e2) => {
      e2.preventDefault();
      const y = e2.touches[0].clientY;
      clone.style.top = (y - offset) + 'px';
      
      const overNode = D.elementFromPoint(window.innerWidth/2, y)?.closest('.showcase-track');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (overNode && overNode !== node) overNode.classList.add('drag-over');
    };

    const end = (e2) => {
      D.removeEventListener('touchmove', move);
      D.removeEventListener('touchend', end);
      clone.remove();
      node.style.opacity = '';
      
      const y = e2.changedTouches[0].clientY;
      const tgt = D.elementFromPoint(window.innerWidth/2, y)?.closest('.showcase-track');
      D.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      
      if (tgt && tgt !== node) {
         tgt.before(node);
         this._saveOrderFromDOM();
      }
    };

    D.addEventListener('touchmove', move, {passive: false});
    D.addEventListener('touchend', end);
  }

  // 4.1 Direct DOM Class Toggle
  toggleHide(uid, skipSave = false) {
    const el = D.querySelector(`.showcase-track[data-uid="${uid}"]`);
    if (el) {
      el.classList.toggle('inactive');
      const btn = el.querySelector('.showcase-hide-btn');
      if (btn) btn.textContent = el.classList.contains('inactive') ? '👁‍🗨' : '👁';
    }

    const pId = ShowcaseStore.activePlaylistId;
    let hidden = pId ? ShowcaseStore.playlists.find(p=>p.id===pId).hiddenUids : ShowcaseStore.get('hiddenUids', []);
    
    if (hidden.includes(uid)) hidden = hidden.filter(u => u !== uid);
    else hidden.push(uid);

    if (pId) {
      const pls = ShowcaseStore.playlists;
      pls.find(x => x.id === pId).hiddenUids = hidden;
      ShowcaseStore.playlists = pls;
    } else {
      ShowcaseStore.set('hiddenUids', hidden);
    }
  }

  toggleSelection(uid) {
    const el = D.querySelector(`.showcase-track[data-uid="${uid}"]`);
    if (this.selectedUids.has(uid)) {
      this.selectedUids.delete(uid);
      if (el) el.classList.remove('selected');
    } else {
      this.selectedUids.add(uid);
      if (el) el.classList.add('selected');
    }
    this.renderMultiPanel();
    this.updateStatusBar();
  }

  renderMultiPanel() {
    let p = D.getElementById('sc-multi-panel');
    if (!this.editMode || !this.selectedUids.size) {
      if (p) p.remove();
      return;
    }
    if (!p) {
      p = D.createElement('div');
      p.id = 'sc-multi-panel';
      p.className = 'showcase-multi-panel animate-in';
      D.body.appendChild(p);
    }
    p.innerHTML = `
      <span style="color:#fff;font-weight:bold;font-size:14px;white-space:nowrap">${this.selectedUids.size} выбр.</span>
      <button class="showcase-btn" id="sc-m-hide">👁 Скрыть</button>
      <button class="showcase-btn" id="sc-m-color">🎨 Цвет</button>
      <button class="showcase-btn" id="sc-m-pl">➕ В плейлист</button>
      <button class="showcase-btn showcase-btn--danger" id="sc-m-clear">✖</button>
    `;

    p.querySelector('#sc-m-clear').onclick = () => { 
      this.selectedUids.clear(); 
      D.querySelectorAll('.showcase-track.selected').forEach(el => el.classList.remove('selected'));
      this.renderMultiPanel(); this.updateStatusBar();
    };
    p.querySelector('#sc-m-hide').onclick = () => {
       Array.from(this.selectedUids).forEach(u => this.toggleHide(u, true));
       p.querySelector('#sc-m-clear').click();
    };
    p.querySelector('#sc-m-color').onclick = () => { this.openColorPicker(Array.from(this.selectedUids)[0]); };
    p.querySelector('#sc-m-pl').onclick = () => { this.openAddToPlaylistModal(Array.from(this.selectedUids)); };
  }

  // 3.6 Создание через Modals.open
  createNewPlaylist() {
    const m = W.Modals.open({
      title: 'Новый плейлист',
      bodyHtml: `
        <input type="text" id="pl-name-inp" value="Мой плейлист ${ShowcaseStore.playlists.length + 1}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid #666;margin-bottom:15px">
        <div style="display:flex;gap:10px"><button class="showcase-btn" id="pl-create-btn">Создать</button></div>
      `
    });
    setTimeout(() => m.querySelector('#pl-name-inp')?.focus(), 100);
    m.querySelector('#pl-create-btn').onclick = async () => {
      const name = m.querySelector('#pl-name-inp').value.trim();
      if (!name) return;
      const p = { id: Date.now().toString(36), name, uids: [], hiddenUids: [], createdAt: Date.now() };
      const pls = ShowcaseStore.playlists;
      pls.push(p); ShowcaseStore.playlists = pls;
      ShowcaseStore.activePlaylistId = p.id;
      m.remove();
      this.renderTab();
    };
  }

  deletePlaylist(id) {
    W.Modals.confirm({
      title: 'Удалить плейлист?',
      textHtml: 'Сами треки останутся в Витрине.',
      confirmText: 'Удалить',
      onConfirm: () => {
        ShowcaseStore.playlists = ShowcaseStore.playlists.filter(p => p.id !== id);
        if (ShowcaseStore.activePlaylistId === id) ShowcaseStore.activePlaylistId = null;
        this.renderTab();
      }
    });
  }

  // 3.7 Вставить из буфера
  async pastePlaylist() {
    try {
      const text = await navigator.clipboard.readText();
      const sp = new URLSearchParams(text.split('?')[1] || text);
      const b64 = sp.get('playlist') || text;
      this.handleSharedPlaylist(b64);
    } catch {
      W.NotificationSystem.error('Буфер не содержит корректной ссылки');
    }
  }

  // 2.9 Модалка Шаринга
  sharePlaylist(id) {
    const p = ShowcaseStore.playlists.find(x => x.id === id);
    if (!p) return;
    const payload = { v: 1, n: p.name, u: p.uids };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${W.location.origin}${W.location.pathname}?playlist=${b64}`;
    
    if (navigator.share) navigator.share({ title: `Плейлист: ${p.name}`, url }).catch(()=>{});
    else { navigator.clipboard.writeText(url); W.NotificationSystem.success('Ссылка на плейлист скопирована!'); }
  }

  handleSharedPlaylist(b64) {
    try {
      const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!json.n || !Array.isArray(json.u)) throw Error();
      
      const available = json.u.filter(u => W.TrackRegistry.getTrackByUid(u));
      
      W.Modals.confirm({
        title: '🎵 Вам прислан плейлист',
        textHtml: `<b>${U.escapeHtml(json.n)}</b><br><br>Доступно треков: ${available.length} из ${json.u.length}.<br>${available.length < json.u.length ? '<span style="color:#ff9800">Часть треков недоступна (нужен промокод).</span>' : ''}`,
        confirmText: 'Добавить',
        onConfirm: () => {
          const pls = ShowcaseStore.playlists;
          pls.push({ id: Date.now().toString(36), name: json.n + ' (Присланный)', uids: available, hiddenUids: [], createdAt: Date.now() });
          ShowcaseStore.playlists = pls;
          W.NotificationSystem.success('Плейлист успешно добавлен');
          if (ShowcaseStore.activePlaylistId === null) this.renderPlaylists();
        }
      });
    } catch { W.NotificationSystem.error('Ошибка чтения ссылки плейлиста'); }
  }

  openSortModal() {
    const sm = this.sortMode;
    const m = W.Modals.open({
      title: 'Сортировка списка',
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button class="showcase-btn ${sm === 'user' ? 'active' : ''}" style="grid-column: 1 / -1" data-val="user">● Пользовательский (Ручной)</button>
          <button class="showcase-btn ${sm === 'album-desc' ? 'active' : ''}" data-val="album-desc">Альбомы (Новые)</button>
          <button class="showcase-btn ${sm === 'album-asc' ? 'active' : ''}" data-val="album-asc">Альбомы (Старые)</button>
          <button class="showcase-btn ${sm === 'name-asc' ? 'active' : ''}" data-val="name-asc">А → Я</button>
          <button class="showcase-btn ${sm === 'name-desc' ? 'active' : ''}" data-val="name-desc">Я → А</button>
          <button class="showcase-btn ${sm === 'plays-desc' ? 'active' : ''}" data-val="plays-desc">Топ прослушиваний</button>
          <button class="showcase-btn ${sm === 'plays-asc' ? 'active' : ''}" data-val="plays-asc">Меньше всего</button>
          <button class="showcase-btn ${sm === 'last-played' ? 'active' : ''}" data-val="last-played">Недавние</button>
          <button class="showcase-btn ${sm === 'favorites-first' ? 'active' : ''}" data-val="favorites-first">Сначала ⭐</button>
          <button class="showcase-btn ${sm === 'shuffle' ? 'active' : ''}" style="grid-column: 1 / -1" data-val="shuffle">🔀 Случайный порядок</button>
          <button class="showcase-btn showcase-btn--danger" style="grid-column: 1 / -1" data-val="user">Сбросить сортировку</button>
        </div>
      `
    });
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-val]');
      if (b) {
        this.sortMode = b.dataset.val;
        ShowcaseStore.set('sortMode', this.sortMode);
        if (this.sortMode === 'shuffle') ShowcaseStore.set('shuffledOrder', null); // Reset shuffle
        this.renderTab();
        m.remove();
      }
    });
  }

  // 1.2 Fast Bottom Sheet Menu (100% Spec Coverage)
  openTrackMenu(uid) {
    if (this._activeMenu) this._activeMenu.remove();
    
    const t = W.TrackRegistry.getTrackByUid(uid);
    if (!t) return;
    const isFav = W.playerCore?.isFavorite(uid);
    
    const bg = D.createElement('div');
    bg.className = 'sc-bottom-sheet-bg';
    
    bg.innerHTML = `
      <div class="sc-bottom-sheet">
        <div class="sc-sheet-title">${U.escapeHtml(t.title)}</div>
        <div class="sc-sheet-sub">${U.escapeHtml(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div>
        
        <button class="sc-sheet-btn" id="bs-pl">➕ Добавить в плейлист</button>
        ${ShowcaseStore.activePlaylistId ? `<button class="sc-sheet-btn" id="bs-rm-pl" style="color:#ff6b6b">✖ Удалить из текущего плейлиста</button>` : ''}
        <button class="sc-sheet-btn" id="bs-hide">👁 Скрыть / Показать трек</button>
        <button class="sc-sheet-btn" id="bs-fav">${isFav ? '❌ Убрать из Избранного' : '⭐ В Избранное'}</button>
        <button class="sc-sheet-btn" id="bs-off">🔒 Скачать / Убрать из офлайн</button>
        <button class="sc-sheet-btn" id="bs-dl">⬇️ Сохранить mp3 файл</button>
        <button class="sc-sheet-btn" id="bs-stat">📊 Статистика трека</button>
        <button class="sc-sheet-btn" id="bs-share">📸 Поделиться треком (Карточка)</button>
        <button class="sc-sheet-btn" id="bs-color">🎨 Цвет альбома</button>
        <button class="sc-sheet-btn" style="color:#888; justify-content:center; margin-top:10px" id="bs-cancel">Отмена</button>
      </div>
    `;
    D.body.appendChild(bg);
    this._activeMenu = bg;

    // Animation frame for slide up
    requestAnimationFrame(() => bg.classList.add('active'));

    const close = () => { bg.classList.remove('active'); setTimeout(() => bg.remove(), 200); this._activeMenu = null; };
    
    bg.onclick = (e) => {
      if (e.target === bg || e.target.id === 'bs-cancel') return close();
      const id = e.target.id;
      if (!id) return;
      
      close();
      if (id === 'bs-pl') setTimeout(() => this.openAddToPlaylistModal([uid]), 250);
      if (id === 'bs-rm-pl') {
         const pls = ShowcaseStore.playlists;
         const p = pls.find(x => x.id === ShowcaseStore.activePlaylistId);
         if (p) p.uids = p.uids.filter(u => u !== uid);
         ShowcaseStore.playlists = pls;
         this.renderList();
      }
      if (id === 'bs-hide') this.toggleHide(uid);
      if (id === 'bs-fav') W.playerCore?.toggleFavorite(uid, {albumKey: t.sourceAlbum});
      if (id === 'bs-off') W.OfflineManager?.togglePinned?.(uid);
      if (id === 'bs-dl') {
         const a = D.createElement('a');
         W.Utils.download.applyDownloadLink(a, t);
         if (a.href) a.click();
      }
      if (id === 'bs-stat') setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(uid), 250);
      if (id === 'bs-share') setTimeout(() => import('../../analytics/share-generator.js').then(m => m.ShareGenerator.generateAndShare('track', t)), 250);
      if (id === 'bs-color') setTimeout(() => this.openColorPicker(uid), 250);
    };
  }

  openAddToPlaylistModal(uidsArray) {
      const pls = ShowcaseStore.playlists;
      if (!pls.length) return W.NotificationSystem.warning('Сначала создайте новый плейлист');
      
      let html = `<div style="display:flex;flex-direction:column;gap:10px;">`;
      pls.forEach(p => html += `<button class="showcase-btn" data-pid="${p.id}">${U.escapeHtml(p.name)}</button>`);
      html += `</div>`;
      
      const plModal = W.Modals.open({title: 'Выберите плейлист', bodyHtml: html});
      plModal.addEventListener('click', (e2) => {
        const btn = e2.target.closest('[data-pid]');
        if (btn) {
           const id = btn.dataset.pid;
           const targetPl = pls.find(x => x.id === id);
           uidsArray.forEach(uid => { if (!targetPl.uids.includes(uid)) targetPl.uids.push(uid); });
           ShowcaseStore.playlists = pls;
           W.NotificationSystem.success(`Добавлено треков: ${uidsArray.length}`);
           plModal.remove();
           if (this.editMode) document.getElementById('sc-m-clear')?.click();
        }
      });
  }

  showAddTracksModal() {
    const all = ShowcaseStore.get('userOrder', []).map(u => W.TrackRegistry.getTrackByUid(u)).filter(Boolean);
    const curr = ShowcaseStore.playlists.find(p => p.id === ShowcaseStore.activePlaylistId)?.uids || [];
    
    let html = `<div style="max-height: 50vh; overflow-y:auto; display:flex; flex-direction:column; gap:6px; margin-bottom:15px;">`;
    all.forEach(t => {
      const isThere = curr.includes(t.uid);
      html += `<label style="display:flex; align-items:center; gap:10px; padding:6px; background:rgba(255,255,255,0.05); border-radius:6px;">
        <input type="checkbox" value="${t.uid}" class="pl-add-chk" ${isThere ? 'checked disabled' : ''}>
        ${U.escapeHtml(t.title)} <span style="opacity:0.5; font-size:11px;">${U.escapeHtml(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</span>
      </label>`;
    });
    html += `</div><button class="showcase-btn" id="pl-add-confirm">Добавить выбранные</button>`;

    const m = W.Modals.open({title: 'Треки из Витрины', bodyHtml: html});
    m.querySelector('#pl-add-confirm').onclick = () => {
       const checked = Array.from(m.querySelectorAll('.pl-add-chk:checked:not(:disabled)')).map(inp => inp.value);
       if (checked.length) {
          const pls = ShowcaseStore.playlists;
          const p = pls.find(x => x.id === ShowcaseStore.activePlaylistId);
          p.uids.push(...checked);
          ShowcaseStore.playlists = pls;
          this.renderList();
          W.NotificationSystem.success(`Добавлено: ${checked.length}`);
       }
       m.remove();
    };
  }

  // 3.5 & 3.8 Color Picker
  openColorPicker(uid, albumKeyParam = null, playlistId = null) {
    let aKey = albumKeyParam;
    if (uid && !aKey) {
      const t = W.TrackRegistry.getTrackByUid(uid);
      if (t) aKey = t.sourceAlbum;
    }
    
    const isPl = !!playlistId;
    const title = isPl ? 'Цвет плейлиста' : 'Цвет альбома';
    const current = isPl ? ShowcaseStore.playlistColors[playlistId] : ShowcaseStore.albumColors[aKey];
    
    let html = '<div class="showcase-color-picker">';
    PALETTE.forEach(c => {
      html += `<div class="showcase-color-dot" style="background:${c.hex}; ${current === c.hex ? 'border-color:#fff' : ''}" data-col="${c.hex}"></div>`;
    });
    html += '</div>';
    html += `<button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>`;

    const m = W.Modals.open({ title, bodyHtml: html });
    m.addEventListener('click', (e) => {
      const el = e.target.closest('[data-col]');
      if (el) {
        const col = el.dataset.col;
        const val = col === 'transparent' ? '' : col;
        if (isPl) {
          const pc = ShowcaseStore.playlistColors; pc[playlistId] = val; ShowcaseStore.playlistColors = pc;
          this.renderPlaylists();
        } else {
          const ac = ShowcaseStore.albumColors; ac[aKey] = val; ShowcaseStore.albumColors = ac;
          if (W.AlbumsManager?.getCurrentAlbum() === '__showcase__') this.renderList();
        }
        m.remove();
      }
    });
  }

  highlightTrackByUid(uid) {
    D.querySelectorAll('.showcase-track.current').forEach(el => el.classList.remove('current'));
    if (uid) D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(uid)}"]`).forEach(el => el.classList.add('current'));
  }
}

const instance = new ShowcaseManager();
W.ShowcaseManager = instance;
export default instance;

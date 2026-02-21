/**
 * scripts/app/showcase/index.js
 * "Витрина Разбита" (Showcase) — Мастер Вкладка. 
 * Полная реализация всех фаз ТЗ v2.0
 */

const W = window;
const D = document;
const U = W.Utils;
const LS_PREFIX = 'showcase:';

const PALETTE = [
  { id: 'none', hex: 'transparent' },
  { id: 'red', hex: '#ef5350' },
  { id: 'orange', hex: '#ff9800' },
  { id: 'yellow', hex: '#fdd835' },
  { id: 'green', hex: '#4caf50' },
  { id: 'cyan', hex: '#00bcd4' },
  { id: 'blue', hex: '#2196f3' },
  { id: 'purple', hex: '#9c27b0' },
  { id: 'pink', hex: '#e91e63' },
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
}

class ShowcaseManager {
  constructor() {
    this.editMode = false;
    this.searchQuery = '';
    this.viewMode = ShowcaseStore.get('viewMode', 'flat');
    this.sortMode = ShowcaseStore.get('sortMode', 'user');
    this.selectedUids = new Set();
  }

  async initialize() {
    await this.preloadAll();
    ShowcaseStore.init();
    
    // Синхронизация состояний (Звезды/Замки)
    W.playerCore?.onFavoritesChanged(() => { if (W.AlbumsManager?.getCurrentAlbum() === '__showcase__') this.renderList(); });
    W.addEventListener('offline:stateChanged', () => { if (W.AlbumsManager?.getCurrentAlbum() === '__showcase__') this.renderList(); });
  }

  // ФАЗА 1: Предзагрузка всех треков в фоне
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

  // Фильтрация и сортировка треков активного плейлиста
  getActiveListTracks() {
    const pId = ShowcaseStore.activePlaylistId;
    let uids = pId ? (ShowcaseStore.playlists.find(p => p.id === pId)?.uids || []) : ShowcaseStore.get('userOrder', []);
    
    // Применение сортировки (если не пользовательская и не режим ред.)
    if (this.sortMode !== 'user' && !this.editMode) {
      const tracks = uids.map(u => W.TrackRegistry.getTrackByUid(u)).filter(Boolean);
      if (this.sortMode === 'name-asc') tracks.sort((a,b) => a.title.localeCompare(b.title));
      if (this.sortMode === 'name-desc') tracks.sort((a,b) => b.title.localeCompare(a.title));
      if (this.sortMode === 'album-desc') tracks.sort((a,b) => b.sourceAlbum.localeCompare(a.sourceAlbum));
      if (this.sortMode === 'shuffle') tracks.sort(() => Math.random() - 0.5);
      uids = tracks.map(t => t.uid);
    }

    // Скрытие треков
    const hidden = pId ? (ShowcaseStore.playlists.find(p => p.id === pId)?.hiddenUids || []) : ShowcaseStore.get('hiddenUids', []);
    if (!this.editMode) uids = uids.filter(u => !hidden.includes(u));

    // Поиск
    if (this.searchQuery && !this.editMode) {
      const q = this.searchQuery.toLowerCase();
      uids = uids.filter(u => {
        const t = W.TrackRegistry.getTrackByUid(u);
        return t && (t.title.toLowerCase().includes(q) || t.album?.toLowerCase().includes(q));
      });
    }

    return uids.map(u => {
      const t = W.TrackRegistry.getTrackByUid(u);
      return t ? { ...t, album: 'Витрина Разбита', cover: t.cover || 'img/logo.png' } : null;
    }).filter(Boolean);
  }

  // Основной рендер UI (ФАЗА 3)
  async renderTab() {
    const list = D.getElementById('track-list');
    if (!list) return;

    list.innerHTML = `
      <div class="showcase-header-controls">
        ${this.editMode ? `<div class="showcase-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<br><button class="showcase-btn" id="sc-save" style="margin-top:10px; background:#fff; color:#000;">💾 Сохранить изменения</button></div>` : ''}
        <input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по названию или альбому..." value="${U.escapeHtml(this.searchQuery)}">
        
        <div class="showcase-btns-row">
          ${!this.editMode ? `<button class="showcase-btn" id="sc-edit">✏️ Редактировать</button>` : ''}
          <button class="showcase-btn" id="sc-sort">↕️ Сортировка ${this.sortMode !== 'user' ? '●' : ''}</button>
        </div>

        ${!this.editMode ? `
        <div class="showcase-btns-row">
          <button class="showcase-btn" id="sc-playall">▶ Играть всё</button>
          <button class="showcase-btn" id="sc-shuffle">🔀 Перемешать</button>
        </div>
        ` : ''}

        <div class="showcase-playlists-scroll" id="sc-playlists"></div>
        <div class="showcase-status-bar" id="sc-status"></div>
      </div>
      <div id="sc-tracks-container"></div>
    `;

    this.bindControls(list);
    this.renderPlaylists();
    this.renderList();
  }

  bindControls(root) {
    const $id = id => root.querySelector('#' + id);
    
    $id('sc-search')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderList();
    });

    $id('sc-edit')?.addEventListener('click', () => {
      if (this.sortMode !== 'user') return W.NotificationSystem.warning('Для ручной перестановки сбросьте сортировку');
      this.editMode = true;
      this.selectedUids.clear();
      this.renderTab();
    });

    $id('sc-save')?.addEventListener('click', () => {
      this.editMode = false;
      this.selectedUids.clear();
      this.renderTab();
    });

    $id('sc-playall')?.addEventListener('click', () => this.playContext());
    $id('sc-shuffle')?.addEventListener('click', () => {
      this.sortMode = 'shuffle';
      ShowcaseStore.set('sortMode', 'shuffle');
      this.playContext();
      this.renderTab();
    });

    $id('sc-sort')?.addEventListener('click', () => this.openSortModal());

    // Делегирование событий клика по списку
    root.addEventListener('click', (e) => {
      const t = e.target.closest('.showcase-track');
      if (!t) return;
      const uid = t.dataset.uid;

      if (this.editMode) {
        if (e.target.closest('.showcase-hide-btn')) return this.toggleHide(uid);
        if (e.target.closest('.showcase-arrows')) {
          const dir = parseInt(e.target.dataset.dir);
          return this.moveTrack(uid, dir);
        }
        // Выбор трека (мультивыбор)
        if (this.selectedUids.has(uid)) this.selectedUids.delete(uid);
        else this.selectedUids.add(uid);
        this.renderList();
        return;
      }

      if (e.target.closest('.showcase-track-menu-btn')) return this.openTrackMenu(uid);
      if (e.target.closest('.like-star')) return; // Перехватывается albums.js
      
      this.playContext(uid);
    });
  }

  // ФАЗА 2: Мост воспроизведения
  playContext(uid = null) {
    const pId = ShowcaseStore.activePlaylistId;
    const ctxKey = pId ? `__showcase__:${pId}` : '__showcase__';
    const tracks = this.getActiveListTracks();
    if (!tracks.length) return;
    
    let idx = 0;
    if (uid) idx = tracks.findIndex(t => t.uid === uid);
    if (idx < 0) idx = 0;

    W.AlbumsManager.setPlayingAlbum(ctxKey);
    W.playerCore.setPlaylist(tracks, idx, null, { preservePosition: false });
    W.playerCore.play(idx);
    W.PlayerUI.ensurePlayerBlock(idx, { userInitiated: true });
    this.highlightTrackByUid(tracks[idx].uid);
  }

  // ФАЗА 6: Плейлисты
  renderPlaylists() {
    const c = D.getElementById('sc-playlists');
    if (!c) return;
    const pId = ShowcaseStore.activePlaylistId;
    const lists = ShowcaseStore.playlists;

    let html = `<div class="showcase-playlist-chip ${!pId ? 'active' : ''}" data-pid="">Все треки</div>`;
    lists.forEach(p => {
      html += `<div class="showcase-playlist-chip ${pId === p.id ? 'active' : ''}" data-pid="${p.id}">
        ${U.escapeHtml(p.name)} 
        <span class="p-share" data-pid="${p.id}" title="Поделиться">🔗</span>
        <span class="p-del" data-pid="${p.id}" title="Удалить">✖</span>
      </div>`;
    });
    html += `<div class="showcase-playlist-chip" id="sc-new-pl">+ Новый</div>`;
    
    c.innerHTML = html;

    c.onclick = (e) => {
      const pid = e.target.dataset.pid;
      if (e.target.id === 'sc-new-pl') return this.createNewPlaylist();
      if (e.target.classList.contains('p-share')) return this.sharePlaylist(pid);
      if (e.target.classList.contains('p-del')) return this.deletePlaylist(pid);
      
      if (e.target.closest('.showcase-playlist-chip')) {
        ShowcaseStore.activePlaylistId = pid || null;
        this.renderTab();
      }
    };
  }

  // Рендер строк треков (С учетом Flat / Grouped)
  renderList() {
    const c = D.getElementById('sc-tracks-container');
    const s = D.getElementById('sc-status');
    if (!c) return;

    const tracks = this.getActiveListTracks();
    const colors = ShowcaseStore.albumColors;
    const hiddenList = ShowcaseStore.activePlaylistId 
      ? (ShowcaseStore.playlists.find(p=>p.id===ShowcaseStore.activePlaylistId)?.hiddenUids || []) 
      : ShowcaseStore.get('hiddenUids', []);

    if (s) s.innerHTML = `<span>📋 ${tracks.length} треков ${this.editMode && this.selectedUids.size ? `<span style="color:#ff9800">· ✓ ${this.selectedUids.size}</span>` : ''}</span> <span style="cursor:pointer; font-size:16px;" id="sc-toggle-view" title="Сменить вид">${this.viewMode === 'flat' ? '⊞' : '⊟'}</span>`;
    
    D.getElementById('sc-toggle-view')?.addEventListener('click', () => {
      this.viewMode = this.viewMode === 'flat' ? 'grouped' : 'flat';
      ShowcaseStore.set('viewMode', this.viewMode);
      this.renderList();
    });

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
      const isSel = this.selectedUids.has(t.uid);
      
      html += `
        <div class="track showcase-track ${isHid ? 'inactive' : ''} ${isSel ? 'current' : ''}" data-uid="${t.uid}" style="border-left: 3px solid ${col}">
          ${this.editMode ? `
            <div class="showcase-arrows"><button data-dir="-1">▲</button><button data-dir="1">▼</button></div>
          ` : `<div class="tnum">${i+1}.</div>`}
          <img src="${t.cover || 'img/logo.png'}" class="showcase-track-thumb" alt="">
          <div class="track-title" style="margin-left:4px">
            <div>${U.escapeHtml(t.title)}</div>
            <div class="showcase-track-meta">${U.escapeHtml(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div>
          </div>
          ${this.editMode ? `<button class="showcase-hide-btn">${isHid ? '👁‍🗨' : '👁'}</button>` : ''}
          <span class="offline-ind" data-uid="${t.uid}">🔒</span>
          <img src="${W.playerCore?.isFavorite(t.uid) ? 'img/star.png' : 'img/star2.png'}" class="like-star" data-uid="${t.uid}" data-album="${t.sourceAlbum}">
          ${!this.editMode ? `<button class="showcase-track-menu-btn">···</button>` : ''}
        </div>
      `;
    });

    c.innerHTML = html || '<div class="fav-empty">Треки не найдены</div>';
    if (W.OfflineIndicators?.injectOfflineIndicators) W.OfflineIndicators.injectOfflineIndicators(c);
    this.highlightTrackByUid(W.playerCore?.getCurrentTrackUid());

    this.renderMultiPanel();
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
      <button class="showcase-btn" id="sc-m-clear" style="border-color:#ff6b6b;color:#ff6b6b">✖</button>
    `;

    p.querySelector('#sc-m-clear').onclick = () => { this.selectedUids.clear(); this.renderList(); };
    p.querySelector('#sc-m-hide').onclick = () => {
       const uids = Array.from(this.selectedUids);
       uids.forEach(u => this.toggleHide(u, true));
       this.selectedUids.clear();
       this.renderList();
    };
    p.querySelector('#sc-m-color').onclick = () => {
       this.openColorPicker(Array.from(this.selectedUids)[0]); 
    };
  }

  toggleHide(uid, skipRender) {
    const pId = ShowcaseStore.activePlaylistId;
    if (pId) {
      const pls = ShowcaseStore.playlists;
      const p = pls.find(x => x.id === pId);
      if (p.hiddenUids.includes(uid)) p.hiddenUids = p.hiddenUids.filter(u => u !== uid);
      else p.hiddenUids.push(uid);
      ShowcaseStore.playlists = pls;
    } else {
      let h = ShowcaseStore.get('hiddenUids', []);
      if (h.includes(uid)) h = h.filter(u => u !== uid);
      else h.push(uid);
      ShowcaseStore.set('hiddenUids', h);
    }
    if (!skipRender) this.renderList();
  }

  moveTrack(uid, dir) {
    const pId = ShowcaseStore.activePlaylistId;
    const list = pId ? ShowcaseStore.playlists.find(p => p.id === pId).uids : ShowcaseStore.get('userOrder', []);
    
    const idx = list.indexOf(uid);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return;

    list.splice(idx, 1);
    list.splice(newIdx, 0, uid);

    if (pId) {
      const pls = ShowcaseStore.playlists;
      pls.find(x => x.id === pId).uids = list;
      ShowcaseStore.playlists = pls;
    } else {
      ShowcaseStore.set('userOrder', list);
    }
    this.renderList();
  }

  createNewPlaylist() {
    const name = prompt('Название нового плейлиста:', `Мой плейлист ${ShowcaseStore.playlists.length + 1}`);
    if (!name) return;
    const p = {
      id: Date.now().toString(36),
      name,
      uids: [],
      hiddenUids: [],
      createdAt: Date.now()
    };
    const pls = ShowcaseStore.playlists;
    pls.push(p);
    ShowcaseStore.playlists = pls;
    ShowcaseStore.activePlaylistId = p.id;
    
    if (confirm('Добавить текущие отображаемые треки в этот плейлист?')) {
       p.uids = this.getActiveListTracks().map(t => t.uid);
       ShowcaseStore.playlists = pls;
    }
    this.renderTab();
  }

  deletePlaylist(id) {
    if (!confirm('Вы уверены, что хотите удалить этот плейлист? (Треки останутся в общем списке)')) return;
    ShowcaseStore.playlists = ShowcaseStore.playlists.filter(p => p.id !== id);
    if (ShowcaseStore.activePlaylistId === id) ShowcaseStore.activePlaylistId = null;
    this.renderTab();
  }

  // ФАЗА 8: Шаринг
  sharePlaylist(id) {
    const p = ShowcaseStore.playlists.find(x => x.id === id);
    if (!p) return;
    const payload = { v: 1, n: p.name, u: p.uids };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${W.location.origin}${W.location.pathname}?playlist=${b64}`;
    
    if (navigator.share) {
      navigator.share({ title: `Плейлист: ${p.name}`, url }).catch(()=>{});
    } else {
      navigator.clipboard.writeText(url);
      W.NotificationSystem.success('Ссылка на плейлист скопирована!');
    }
  }

  handleSharedPlaylist(b64) {
    try {
      const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!json.n || !Array.isArray(json.u)) throw Error();
      
      const available = json.u.filter(u => W.TrackRegistry.getTrackByUid(u));
      const text = `Вам прислали плейлист "${U.escapeHtml(json.n)}".\nДоступно треков: ${available.length} из ${json.u.length}.\nДобавить к себе?`;
      
      if (confirm(text)) {
        const pls = ShowcaseStore.playlists;
        pls.push({
          id: Date.now().toString(36),
          name: json.n + ' (Присланный)',
          uids: available,
          hiddenUids: [],
          createdAt: Date.now()
        });
        ShowcaseStore.playlists = pls;
        W.NotificationSystem.success('Плейлист успешно добавлен');
      }
    } catch {
      W.NotificationSystem.error('Ошибка чтения ссылки плейлиста');
    }
  }

  // ФАЗА 4: Сортировка
  openSortModal() {
    const m = W.Modals.open({
      title: 'Сортировка списка',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="showcase-btn ${this.sortMode === 'user' ? 'active' : ''}" data-val="user">● Пользовательский (Ручной)</button>
          <button class="showcase-btn ${this.sortMode === 'album-desc' ? 'active' : ''}" data-val="album-desc">По альбомам (От новых)</button>
          <button class="showcase-btn ${this.sortMode === 'name-asc' ? 'active' : ''}" data-val="name-asc">По названию (А-Я)</button>
          <button class="showcase-btn ${this.sortMode === 'shuffle' ? 'active' : ''}" data-val="shuffle">Случайный порядок</button>
        </div>
      `
    });
    m.onclick = (e) => {
      const b = e.target.closest('[data-val]');
      if (b) {
        this.sortMode = b.dataset.val;
        ShowcaseStore.set('sortMode', this.sortMode);
        this.renderTab();
        m.remove();
      }
    };
  }

  // ФАЗА 7: Цвета
  openColorPicker(uid) {
    const t = W.TrackRegistry.getTrackByUid(uid);
    if (!t) return;
    const aKey = t.sourceAlbum;
    
    let html = '<div class="showcase-color-picker">';
    PALETTE.forEach(c => {
      html += `<div class="showcase-color-dot" style="background:${c.hex}; ${ShowcaseStore.albumColors[aKey] === c.hex ? 'border-color:#fff' : ''}" data-col="${c.hex}"></div>`;
    });
    html += '</div>';
    html += `<button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>`;

    const m = W.Modals.open({ title: 'Цвет альбома', bodyHtml: html });
    m.onclick = (e) => {
      const el = e.target.closest('[data-col]');
      if (el) {
        const col = el.dataset.col;
        const colors = ShowcaseStore.albumColors;
        colors[aKey] = col === 'transparent' ? '' : col;
        ShowcaseStore.albumColors = colors;
        this.renderList();
        m.remove();
      }
    };
  }

  openTrackMenu(uid) {
    const t = W.TrackRegistry.getTrackByUid(uid);
    if (!t) return;
    const isFav = W.playerCore?.isFavorite(uid);
    
    const m = W.Modals.open({
      title: t.title,
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="showcase-btn" id="tm-fav">${isFav ? '❌ Убрать из Избранного' : '⭐ Добавить в Избранное'}</button>
          <button class="showcase-btn" id="tm-color">🎨 Назначить цвет альбома</button>
          <button class="showcase-btn" id="tm-stat">📊 Статистика трека</button>
          <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:4px 0;">
          <button class="showcase-btn" id="tm-addpl">➕ Добавить в другой плейлист</button>
        </div>
      `
    });

    m.querySelector('#tm-fav').onclick = () => { W.playerCore?.toggleFavorite(uid, {albumKey: t.sourceAlbum}); m.remove(); };
    m.querySelector('#tm-color').onclick = () => { m.remove(); this.openColorPicker(uid); };
    m.querySelector('#tm-stat').onclick = () => { m.remove(); W.StatisticsModal?.openStatisticsModal?.(); };
    m.querySelector('#tm-addpl').onclick = () => {
      m.remove();
      const pls = ShowcaseStore.playlists;
      if (!pls.length) return W.NotificationSystem.warning('Сначала создайте новый плейлист');
      
      let html = `<div style="display:flex;flex-direction:column;gap:10px;">`;
      pls.forEach(p => html += `<button class="showcase-btn" data-pid="${p.id}">${U.escapeHtml(p.name)}</button>`);
      html += `</div>`;
      
      const plModal = W.Modals.open({title: 'Выберите плейлист', bodyHtml: html});
      plModal.onclick = (e2) => {
        const btn = e2.target.closest('[data-pid]');
        if (btn) {
           const id = btn.dataset.pid;
           const targetPl = pls.find(x => x.id === id);
           if (!targetPl.uids.includes(uid)) targetPl.uids.push(uid);
           ShowcaseStore.playlists = pls;
           W.NotificationSystem.success('Трек добавлен в плейлист');
           plModal.remove();
        }
      }
    };
  }

  highlightTrackByUid(uid) {
    D.querySelectorAll('.showcase-track.current').forEach(el => el.classList.remove('current'));
    if (uid) D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(uid)}"]`).forEach(el => el.classList.add('current'));
  }
}

const instance = new ShowcaseManager();
W.ShowcaseManager = instance;
export default instance;

/**
 * scripts/app/showcase/index.js
 * "Витрина Разбита" (Showcase) — Мастер Вкладка v3.0 (Архитектура State Machine).
 * ПОЛНАЯ РЕАЛИЗАЦИЯ (ТЗ v2.0): Draft-состояния, глобальный поиск, Zero-Reflow оптимизация.
 */

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window, D = document, U = W.Utils, LS = 'showcase:v2:';
const ls = localStorage;
const PALETTE = ['transparent','#ef5350','#ff9800','#fdd835','#4caf50','#00bcd4','#2196f3','#9c27b0','#e91e63','#9e9e9e'];
const esc = s => U.escapeHtml(String(s || ''));
const $ = (id) => D.getElementById(id);
const $$ = (sel) => D.querySelectorAll(sel);

// --- СЛОЙ 1 & 2: Хранилище и Управление Базовыми Контекстами ---
const Store = {
  get: (k, d) => U.lsGetJson(LS + k, d),
  set: (k, v) => U.lsSet(LS + k, JSON.stringify(v)),
  
  get pId() { return this.get('activePlaylistId', null); },
  set pId(id) { this.set('activePlaylistId', id); },
  
  get pls() { return this.get('playlists', []); },
  set pls(p) { this.set('playlists', p); },
  
  get aCol() { return this.get('albumColors', {}); },
  get pCol() { return this.get('playlistColors', {}); },

  // Сборка Master Order (Неизменяемый каталог)
  init() {
    let m = this.get('masterOrder', []);
    const currentRegUids = W.TrackRegistry?.getAllUids() || [];
    
    // Если список пуст или изменилось количество треков (обновление БД)
    if (!m.length || m.length !== currentRegUids.length) {
      const newMaster = [];
      [...(W.albumsIndex || [])].reverse().forEach(a => {
        if (!a.key.startsWith('__')) {
          currentRegUids.forEach(u => {
            if (W.TrackRegistry.getTrackByUid(u)?.sourceAlbum === a.key && !newMaster.includes(u)) newMaster.push(u);
          });
        }
      });
      // Сохраняем недостающие треки, если они не попали через альбомы
      currentRegUids.forEach(u => { if (!newMaster.includes(u)) newMaster.push(u); });
      
      this.set('masterOrder', newMaster);
      // Если userOrder не был создан, инициализируем его
      if (!this.get('userOrder', []).length) this.set('userOrder', [...newMaster]);
      else {
        // Мягкое вливание новых треков в дефолтный список
        const uo = this.get('userOrder', []);
        const added = newMaster.filter(u => !uo.includes(u));
        if (added.length) this.set('userOrder', [...uo, ...added]);
      }
    }
  },

  getContext() {
    const id = this.pId;
    if (!id) return {
      isDefault: true,
      order: this.get('userOrder', []),
      hidden: this.get('hiddenUids', [])
    };
    const p = this.pls.find(x => x.id === id);
    return p ? { isDefault: false, order: p.uids, hidden: p.hiddenUids || [], name: p.name } : null;
  },

  saveContext(isDefault, order, hidden) {
    if (isDefault) {
      this.set('userOrder', order);
      this.set('hiddenUids', hidden);
    } else {
      const p = this.pls;
      const idx = p.findIndex(x => x.id === this.pId);
      if (idx >= 0) {
        p[idx].uids = order;
        p[idx].hiddenUids = hidden;
        this.pls = p;
      }
    }
  },

  createPlaylist(name, order, hidden = []) {
    const p = this.pls;
    const id = 'pl_' + Date.now().toString(36);
    const snapshot = { order: [...order], hidden: [...hidden] }; // Для сброса к заводским
    p.push({ id, name, uids: order, hiddenUids: hidden, createdAt: Date.now(), snapshot });
    this.pls = p;
    this.pId = id;
  }
};

// --- СЛОЙ 4: Состояние Черновика (Draft State) ---
class DraftState {
  constructor(context) {
    this.isDefault = context.isDefault;
    this.order = [...context.order];
    this.hidden = new Set(context.hidden);
    
    // В дефолтном контексте чекбоксы отражают активность (глазик).
    // В кастомном плейлисте чекбоксы отражают присутствие в списке.
    this.checked = new Set(this.isDefault ? 
      this.order.filter(u => !this.hidden.has(u)) : 
      this.order
    );
    this.isDirty = false;
  }

  toggleCheck(uid) {
    this.isDirty = true;
    if (this.checked.has(uid)) {
      this.checked.delete(uid);
      if (this.isDefault) this.hidden.add(uid); // В дефолте снятие чека = скрытие
    } else {
      this.checked.add(uid);
      if (this.isDefault) this.hidden.delete(uid); // В дефолте чек = открытие
    }
  }

  toggleEye(uid) {
    this.isDirty = true;
    if (this.hidden.has(uid)) {
      this.hidden.delete(uid);
      if (this.isDefault) this.checked.add(uid); // Синхронизация в дефолте
    } else {
      this.hidden.add(uid);
      if (this.isDefault) this.checked.delete(uid);
    }
  }

  move(uid, dir) {
    const idx = this.order.indexOf(uid);
    if (idx < 0) return;
    const nIdx = idx + dir;
    if (nIdx >= 0 && nIdx < this.order.length) {
      this.isDirty = true;
      [this.order[idx], this.order[nIdx]] = [this.order[nIdx], this.order[idx]];
    }
  }

  insertAfter(dragUid, targetUid) {
    const dIdx = this.order.indexOf(dragUid);
    const tIdx = this.order.indexOf(targetUid);
    if (dIdx < 0 || tIdx < 0 || dIdx === tIdx) return;
    this.isDirty = true;
    this.order.splice(dIdx, 1);
    const newTIdx = this.order.indexOf(targetUid);
    this.order.splice(newTIdx + 1, 0, dragUid);
  }
}

// --- ОСНОВНОЙ КОНТРОЛЛЕР ---
class ShowcaseManager {
  constructor() {
    this.editMode = false;
    this.searchQuery = '';
    this.searchSelection = new Set(); // Выбранные треки в поиске
    this.viewMode = Store.get('viewMode', 'flat');
    this.sortMode = Store.get('sortMode', 'user');
    this.draft = null;
    this._ic = {};
    this._statCache = null;
  }

  async initialize() {
    (W.APP_CONFIG?.ICON_ALBUMS_ORDER || []).forEach(i => this._ic[i.key] = i.icon);
    await W.TrackRegistry?.ensurePopulated?.();
    Store.init();
    
    // Синхронизация с плеером
    W.playerCore?.on({ 
      onTrackChange: t => { 
        if (t?.uid && U.isShowcaseContext(W.AlbumsManager?.getPlayingAlbum())) { 
          Store.set('lastTrackUid', t.uid); 
          Store.set('lastPlayingContext', W.AlbumsManager.getPlayingAlbum()); 
          this.hiTrack(t.uid);
        } 
      } 
    });
    
    W.playerCore?.onFavoritesChanged(({ uid }) => {
      if (this.editMode) return;
      const img = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"] .like-star`);
      if (img) img.src = W.playerCore.isFavorite(uid) ? 'img/star.png' : 'img/star2.png';
      this.updStatus();
    });
    
    W.addEventListener('offline:stateChanged', () => W.AlbumsManager?.getCurrentAlbum() === '__showcase__' && (W.OfflineIndicators?.refreshAllIndicators(), this.updStatus()));
  }

  // --- СЛОЙ 3: Вычисление данных для Плеера и Рендера ---
  
  // Возвращает треки для воспроизведения (строго по контексту, скрытые исключены)
  async getPlaybackTracks() {
    const ctx = Store.getContext();
    if (!ctx) return [];
    
    // В playback всегда идет отсортированный массив, если включена сортировка
    let uids = [...ctx.order];
    if (this.sortMode !== 'user') {
       uids = await this._applySorting(uids);
    }
    
    // Исключаем скрытые глазиком
    const hidden = new Set(ctx.hidden);
    uids = uids.filter(u => !hidden.has(u));

    return uids.map(u => this._buildTrackObj(u)).filter(Boolean);
  }

  // Применяет сортировку без мутации оригинала
  async _applySorting(uids) {
    const tr = uids.map(u => W.TrackRegistry.getTrackByUid(u)).filter(Boolean);
    
    if (this.sortMode.startsWith('plays') || this.sortMode === 'last-played') {
      if (!this._statCache) {
        const db = (await import('../../analytics/meta-db.js')).metaDB;
        const stats = await db.getAllStats();
        this._statCache = new Map(stats.filter(s => s.uid !== 'global').map(s => [s.uid, s]));
      }
      tr.forEach(t => {
        const st = this._statCache.get(t.uid);
        t._plays = st?.globalFullListenCount || 0;
        t._lastAt = st?.lastPlayedAt || 0;
      });
    }

    const sorters = {
      'name-asc': (a, b) => a.title.localeCompare(b.title), 
      'name-desc': (a, b) => b.title.localeCompare(a.title),
      'album-desc': (a, b) => b.sourceAlbum.localeCompare(a.sourceAlbum), 
      'album-asc': (a, b) => a.sourceAlbum.localeCompare(b.sourceAlbum),
      'favorites-first': (a, b) => (W.playerCore?.isFavorite(b.uid)?1:0) - (W.playerCore?.isFavorite(a.uid)?1:0),
      'plays-desc': (a, b) => (b._plays||0) - (a._plays||0), 
      'plays-asc': (a, b) => (a._plays||0) - (b._plays||0),
      'last-played': (a, b) => (b._lastAt||0) - (a._lastAt||0)
    };
    
    if (sorters[this.sortMode]) tr.sort(sorters[this.sortMode]);
    return tr.map(t => t.uid);
  }

  _buildTrackObj(u) {
    const t = W.TrackRegistry.getTrackByUid(u);
    if (!t) return null;
    let cv = this._ic[t.sourceAlbum] || 'img/logo.png';
    if (U.isMobile() && /\/icon_album\/[^/]+\.png$/i.test(cv)) {
      const m = cv.match(/\/icon_album\/([^/]+)\.png$/i);
      if (m) cv = `img/icon_album/mobile/${m[1]}@1x.jpg`;
    }
    return { ...t, album: 'Витрина Разбита', cover: cv };
  }

  // --- РЕНДЕР И DOM ---

  async renderTab() {
    const list = $('track-list'); if (!list) return;

    list.innerHTML = `
      <div class="showcase-header-controls">
        ${this.editMode ? `
        <div class="showcase-edit-banner">
          ✏️ РЕЖИМ РЕДАКТИРОВАНИЯ
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button class="showcase-btn" id="sc-save" style="background:#fff; color:#000;">💾 Применить</button>
            <button class="showcase-btn" id="sc-create-new" style="background:var(--secondary-color); color:#fff; border:none;">➕ Создать новый</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            ${!Store.pId ? `<button class="showcase-btn" id="sc-reset-edit" style="background:transparent; border-color:#ff9800; color:#ff9800;">↺ Сброс списка</button>` : ''}
            <button class="showcase-btn showcase-btn--danger" id="sc-cancel">✕ Отмена</button>
          </div>
        </div>` : ''}
        
        <div class="showcase-search-wrap">
          <input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему приложению..." value="${esc(this.searchQuery)}">
          <button type="button" class="showcase-search-clear" id="sc-search-clear" style="display:${this.searchQuery?'':'none'}">✕</button>
        </div>
  
        <div class="showcase-btns-row" style="display:${this.searchQuery ? 'none' : 'flex'}">
          ${!this.editMode ? `<button class="showcase-btn" id="sc-edit">✏️ Редактировать</button>` : ''}
          <button class="showcase-btn" id="sc-sort" ${this.editMode ? 'disabled style="opacity:0.5"' : ''}>↕️ Сортировка ${this.sortMode !== 'user' ? '●' : ''}</button>
        </div>
        
        ${!this.editMode && !this.searchQuery ? `
        <div class="showcase-btns-row">
          <button class="showcase-btn" id="sc-playall">▶ Играть всё</button>
          <button class="showcase-btn" id="sc-shuffle">🔀 Перемешать</button>
        </div>` : ''}
        
        ${!this.searchQuery ? `<div class="showcase-playlists-actions" id="sc-playlists-actions"></div><div class="showcase-playlists-list" id="sc-playlists"></div>` : ''}
        
        <div class="showcase-status-bar" id="sc-status"></div>
      </div>
      
      <div id="sc-search-actions" style="display:none; padding:10px; background:rgba(77,170,255,0.1); border-radius:10px; margin:0 10px 10px; text-align:center;">
         <div style="font-weight:bold; color:var(--secondary-color); margin-bottom:8px;">Выбрано треков: <span id="sc-search-count">0</span></div>
         <div style="display:flex; gap:8px;">
            <button class="showcase-btn" id="sc-search-add">В плейлист</button>
            <button class="showcase-btn" id="sc-search-new">Создать новый</button>
         </div>
      </div>
      
      <div id="sc-tracks-container" style="content-visibility: auto; contain-intrinsic-size: 800px;"></div>
    `;

    this.bindCtrl(list); 
    if (!this.searchQuery) this.renderPls(); 
    await this.renderList();
    
    if (!this.editMode && !this.searchQuery) { 
      const lu = Store.get('lastTrackUid'); 
      if (lu && Store.get('lastPlayingContext') === (Store.pId ? `__showcase__:${Store.pId}` : '__showcase__')) this.hiTrack(lu); 
    }
  }

  bindCtrl(root) {
    const inp = $('sc-search'), clr = $('sc-search-clear');
    
    const applyQ = U.func.debounceFrame(async () => { 
      this.searchQuery = (inp?.value || '').trim(); 
      this.searchSelection.clear(); // Сброс выделения при новом поиске
      
      // Если поиск очищен, выходим из режима редактирования, чтобы избежать конфликтов
      if (!this.searchQuery && this.editMode) {
          this.editMode = false;
          this.draft = null;
      }
      this.renderTab(); 
    });

    if (inp) {
      inp.addEventListener('input', applyQ);
      inp.addEventListener('keydown', e => e.key === 'Enter' && inp.blur());
      inp.addEventListener('blur', () => window.scrollTo({ top: window.scrollY, behavior: 'instant' }));
    }
   
    if (clr) clr.addEventListener('click', e => { 
      e.preventDefault(); 
      if (inp) { inp.value = ''; inp.blur(); } 
      this.searchQuery = ''; 
      this.searchSelection.clear();
      this.renderTab(); 
    });

    const acts = {
      'sc-edit': () => { 
        this.editMode = true; 
        this.draft = new DraftState(Store.getContext());
        this.renderTab(); 
      },
      'sc-save': () => { 
        Store.saveContext(this.draft.isDefault, this.draft.order, Array.from(this.draft.hidden));
        // Для кастомного плейлиста удаляем unchecked. Для дефолтного они просто hidden (уже обработано в DraftState)
        if (!this.draft.isDefault) {
           const finalOrder = this.draft.order.filter(u => this.draft.checked.has(u));
           Store.saveContext(false, finalOrder, Array.from(this.draft.hidden));
        }
        this.editMode = false; this.draft = null; this.renderTab(); W.NotificationSystem.success('Изменения применены'); 
      },
      'sc-create-new': () => {
         const toSave = this.draft.order.filter(u => this.draft.checked.has(u) && !this.draft.hidden.has(u));
         if (!toSave.length) return W.NotificationSystem.warning('Нет активных треков для сохранения');
         const m = W.Modals.open({ title: 'Имя нового плейлиста', bodyHtml: `<input type="text" id="pl-inp" value="Мой плейлист" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="pl-btn">Сохранить</button>` });
         m.querySelector('#pl-btn').onclick = () => {
           const n = m.querySelector('#pl-inp').value.trim();
           if (n) { Store.createPlaylist(n, toSave, []); this.editMode = false; this.draft = null; m.remove(); this.renderTab(); W.NotificationSystem.success('Плейлист создан'); }
         };
      },
      'sc-cancel': () => { 
        if (this.draft.isDirty) {
          W.Modals.confirm({ title: 'Отменить изменения?', textHtml: 'Все несохраненные правки будут потеряны.', confirmText: 'Да, выйти', onConfirm: () => { this.editMode = false; this.draft = null; this.renderTab(); } });
        } else {
          this.editMode = false; this.draft = null; this.renderTab(); 
        }
      },
      'sc-reset-edit': () => { 
        W.Modals.confirm({ title: 'Сбросить дефолтный список?', textHtml: 'Список вернется к заводскому порядку, все скрытые треки станут видимыми.', confirmText: 'Сбросить', onConfirm: () => { 
          Store.set('userOrder', Store.get('masterOrder')); 
          Store.set('hiddenUids', []); 
          this.editMode = false; this.draft = null; this.sortMode = 'user'; Store.set('sortMode', 'user'); this.renderTab(); W.NotificationSystem.info('Список сброшен');
        }});
      },
      'sc-playall': () => this.playCtx(),
      'sc-shuffle': () => { this.playCtx(null, true); },
      'sc-sort': () => this.openSort(),
      'sc-tg-e': () => { ls.setItem('showcase:showHidden:v1', ls.getItem('showcase:showHidden:v1') === '1' ? '0' : '1'); this.renderList(); },
      'sc-tg-n': () => { ls.setItem('showcase:showNumbers:v1', ls.getItem('showcase:showNumbers:v1') === '1' ? '0' : '1'); this.renderList(); },
      'sc-tg-v': () => { this.viewMode = this.viewMode === 'flat' ? 'grouped' : 'flat'; Store.set('viewMode', this.viewMode); this.renderList(); },
      'sc-search-add': () => {
         if (!this.searchSelection.size) return;
         const uids = Array.from(this.searchSelection);
         const ctx = Store.getContext();
         const newOrder = [...ctx.order];
         uids.forEach(u => { if (!newOrder.includes(u)) newOrder.push(u); });
         
         // Убираем из скрытых, если они там были
         const newHidden = ctx.hidden.filter(u => !uids.includes(u));
         Store.saveContext(ctx.isDefault, newOrder, newHidden);
         
         this.searchSelection.clear();
         this.searchQuery = '';
         if(inp) inp.value = '';
         this.renderTab();
         W.NotificationSystem.success(`Добавлено треков: ${uids.length}`);
      },
      'sc-search-new': () => {
         if (!this.searchSelection.size) return;
         const uids = Array.from(this.searchSelection);
         const m = W.Modals.open({ title: 'Новый плейлист', bodyHtml: `<input type="text" id="pl-inp" value="Мой плейлист" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="pl-btn">Создать</button>` });
         m.querySelector('#pl-btn').onclick = () => {
           const n = m.querySelector('#pl-inp').value.trim();
           if (n) { Store.createPlaylist(n, uids, []); this.searchSelection.clear(); this.searchQuery = ''; m.remove(); this.renderTab(); W.NotificationSystem.success('Плейлист создан'); }
         };
      }
    };

    // Оптимизированный Touch Drag and Drop
    let dragY = 0, dragEl = null, ghostEl = null, initY = 0;
    
    root.addEventListener('touchstart', e => {
      if (!this.editMode || e.target.closest('button')) return;
      
      const h = e.target.closest('.showcase-drag-handle'); 
      if (h) {
         e.preventDefault();
         dragEl = h.closest('.showcase-track');
         if (!dragEl) return;
         
         initY = e.touches[0].clientY;
         const rect = dragEl.getBoundingClientRect();
         
         ghostEl = dragEl.cloneNode(true);
         ghostEl.style.cssText = `position:fixed; top:${rect.top}px; left:${rect.left}px; width:${rect.width}px; height:${rect.height}px; z-index:10000; opacity:0.9; background:#252d39; box-shadow:0 10px 30px rgba(0,0,0,0.8); pointer-events:none; transition:none;`;
         D.body.appendChild(ghostEl);
         dragEl.style.opacity = '0.2';
      }
    }, { passive: false });

    root.addEventListener('touchmove', U.func.throttle((e) => {
       if (!ghostEl || !dragEl) return;
       e.preventDefault();
       const y = e.touches[0].clientY;
       const dy = y - initY;
       ghostEl.style.transform = `translateY(${dy}px)`;
       
       // Ищем цель под пальцем (оптимизировано без elementFromPoint)
       const siblings = Array.from(root.querySelectorAll('.showcase-track:not([style*="opacity: 0.2"])'));
       let target = null;
       for (const sib of siblings) {
           const r = sib.getBoundingClientRect();
           if (y > r.top && y < r.bottom) { target = sib; break; }
       }
       
       $$('.drag-over').forEach(el => el.classList.remove('drag-over'));
       if (target && target !== dragEl) {
           target.classList.add('drag-over');
       }
    }, 50), { passive: false });

    root.addEventListener('touchend', e => {
       if (!ghostEl || !dragEl) return;
       const target = D.querySelector('.drag-over');
       $$('.drag-over').forEach(el => el.classList.remove('drag-over'));
       
       if (target) {
           target.before(dragEl); // Визуальное перемещение
           this.draft.insertAfter(dragEl.dataset.uid, target.dataset.uid);
       }
       
       ghostEl.remove();
       dragEl.style.opacity = '';
       ghostEl = null; dragEl = null;
    });

    // Zero-Reflow Click Delegation
    root.addEventListener('click', e => {
      if (acts[e.target.id]) return acts[e.target.id]();
      
      const t = e.target.closest('.showcase-track'), u = t?.dataset.uid;
      if (!t || !u) return;

      if (this.searchQuery) {
         if (e.target.closest('.showcase-checkbox')) {
            this.searchSelection.has(u) ? this.searchSelection.delete(u) : this.searchSelection.add(u);
            t.classList.toggle('selected', this.searchSelection.has(u));
            const bar = $('sc-search-actions');
            if (bar) {
               bar.style.display = this.searchSelection.size ? 'block' : 'none';
               $('sc-search-count').textContent = this.searchSelection.size;
            }
            return;
         }
         return this.opnMenu(u, true); // Search menu
      }

      if (this.editMode) {
        if (e.target.closest('.showcase-hide-btn')) {
           this.draft.toggleEye(u);
           t.classList.toggle('inactive', this.draft.hidden.has(u));
           e.target.textContent = this.draft.hidden.has(u) ? '👁‍🗨' : '👁';
           
           // Синхронизация UI чекбокса для дефолтного контекста
           if (this.draft.isDefault) {
              const chk = t.querySelector('.showcase-checkbox');
              if (chk) t.classList.toggle('selected', this.draft.checked.has(u));
           }
           return this.updStatus();
        }
        if (e.target.closest('.sc-arrow-up')) { this.draft.move(u, -1); return this.renderList(); }
        if (e.target.closest('.sc-arrow-down')) { this.draft.move(u, 1); return this.renderList(); }
        if (e.target.closest('.showcase-checkbox')) {
           this.draft.toggleCheck(u);
           t.classList.toggle('selected', this.draft.checked.has(u));
           
           // Синхронизация UI глазика для дефолтного контекста
           if (this.draft.isDefault) {
              t.classList.toggle('inactive', this.draft.hidden.has(u));
              const eye = t.querySelector('.showcase-hide-btn');
              if (eye) eye.textContent = this.draft.hidden.has(u) ? '👁‍🗨' : '👁';
           }
           return this.updStatus();
        }
        return; // Блокируем меню трека и воспроизведение в режиме редактирования
      }

      if (e.target.closest('.showcase-track-menu-btn')) return this.opnMenu(u);
      if (e.target.closest('.like-star') || e.target.closest('.offline-ind')) return; // Индикаторы не кликабельны в Showcase, но вдруг
      
      this.playCtx(u);
    });
  }

  async playCtx(uid = null, forceShuffle = false) {
    const ctxId = Store.pId;
    const k = ctxId ? `__showcase__:${ctxId}` : '__showcase__';
    const trks = await this.getPlaybackTracks();
    
    if (!trks.length) return W.NotificationSystem.warning('Нет активных треков для воспроизведения');
    
    W.AlbumsManager.setPlayingAlbum(k);
    
    if (forceShuffle) {
        if (!W.playerCore.isShuffle()) W.playerCore.toggleShuffle();
        W.playerCore.setPlaylist(trks, 0, null, { preservePosition: false, preserveShuffleMode: true });
        W.playerCore.play(0);
    } else {
        if (W.playerCore.isShuffle()) W.playerCore.toggleShuffle();
        let idx = uid ? Math.max(0, trks.findIndex(t => t.uid === uid)) : 0;
        W.playerCore.setPlaylist(trks, idx, null, { preservePosition: false, preserveShuffleMode: true });
        W.playerCore.play(idx);
    }
    
    W.PlayerUI.ensurePlayerBlock(W.playerCore.getIndex(), { userInitiated: true });
    this.hiTrack(W.playerCore.getCurrentTrackUid());
  }

  renderPls() {
    const act = $('sc-playlists-actions'), lst = $('sc-playlists'), id = Store.pId, pls = Store.pls, col = Store.pCol;
    if (!act || !lst) return;
    
    act.innerHTML = `<button class="sc-pl-action ${!id ? 'active' : ''}" id="sc-pl-all">Все треки</button>`;
    
    if (!pls.length) {
       lst.innerHTML = `<div class="sc-pl-empty" style="text-align:center">Нет пользовательских плейлистов</div>`;
    } else {
       lst.innerHTML = pls.map(p => `
         <div class="sc-pl-row ${id === p.id ? 'active' : ''}" data-pid="${p.id}" ${col[p.id] ? `style="--pl-color:${col[p.id]};"` : ''}>
           <div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span></div>
           <div class="sc-pl-right">
             <button class="sc-pl-btn" data-act="ren" data-pid="${p.id}">✏️</button>
             <button class="sc-pl-btn" data-act="col" data-pid="${p.id}">🎨</button>
             <button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}">✖</button>
           </div>
         </div>`).join('');
    }

    lst.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act, pid = e.target.closest('[data-pid]')?.dataset.pid;
      if (a && pid) {
        if (a === 'del') W.Modals.confirm({ title: 'Удалить плейлист?', confirmText: 'Да', onConfirm: () => { Store.pls = Store.pls.filter(p => p.id !== pid); if (Store.pId === pid) Store.pId = null; this.renderTab(); }});
        else if (a === 'col') this.opnCol(null, null, pid);
        else if (a === 'ren') {
           const pName = Store.pls.find(x => x.id === pid)?.name || '';
           const m = W.Modals.open({ title: 'Переименовать', bodyHtml: `<input type="text" id="rn-inp" value="${esc(pName)}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid #666;margin-bottom:15px"><button class="showcase-btn" id="rn-btn">Сохранить</button>` });
           m.querySelector('#rn-btn').onclick = () => {
              const nn = m.querySelector('#rn-inp').value.trim();
              if (nn) { const pt = Store.pls; const trg = pt.find(x => x.id === pid); if (trg) { trg.name = nn; Store.pls = pt; this.renderPls(); } m.remove(); }
           };
        }
      } else if (e.target.closest('.sc-pl-row')?.dataset.pid) { 
        Store.pId = e.target.closest('.sc-pl-row').dataset.pid; 
        this.renderTab(); 
      }
    };
  }

  async renderList() {
    const c = $('sc-tracks-container'); if (!c) return;
    const ctx = Store.getContext();
    let uidsToRender = [];
    let isSearch = false;
    let globalSearchResults = [];

    // 1. Определение набора UIDs
    if (this.searchQuery) {
        isSearch = true;
        await ensureLyricsIndexLoaded();
        const allUids = W.TrackRegistry.getAllUids();
        const searchHits = searchUidsByQuery({ uids: allUids, query: this.searchQuery });
        
        // Разбиваем на "В текущем плейлисте" и "В других альбомах"
        uidsToRender = searchHits.filter(u => ctx.order.includes(u));
        globalSearchResults = searchHits.filter(u => !ctx.order.includes(u));
    } else if (this.editMode) {
        // Черновик без визуальной сортировки
        uidsToRender = this.draft.order;
    } else {
        // Обычный вид: Применяем сортировку
        uidsToRender = await this._applySorting([...ctx.order]);
        
        // Фильтр показа скрытых
        if (localStorage.getItem('showcase:showHidden:v1') !== '1') {
            const hidden = new Set(ctx.hidden);
            uidsToRender = uidsToRender.filter(u => !hidden.has(u));
        }
    }

    this.updStatus(uidsToRender.length + (isSearch ? globalSearchResults.length : 0));
    
    let h = '';
    const cols = Store.aCol;
    const sN = localStorage.getItem('showcase:showNumbers:v1') === '1';
    const hiddenSet = this.editMode ? this.draft.hidden : new Set(ctx.hidden);
    const checkedSet = this.editMode ? this.draft.checked : new Set();

    const generateRow = (t, u, i, isGlobalHit = false) => {
      const isH = hiddenSet.has(u);
      const isS = this.editMode ? checkedSet.has(u) : this.searchSelection.has(u);
      const cl = cols[t.sourceAlbum] || 'transparent';
      const aTitle = esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum) || 'Альбом');
      
      let badge = '';
      if (isSearch && !isGlobalHit) {
          badge = `<span style="font-size:10px; padding:2px 6px; background:rgba(77,170,255,0.2); color:var(--secondary-color); border-radius:4px; margin-left:8px;">В списке</span>`;
      }
      
      return `<div class="showcase-track ${isH?'inactive':''} ${isS?'selected':''}" data-uid="${u}" style="border-left: 3px solid ${cl}">
        ${this.editMode ? `<button class="sc-arrow-up" data-dir="-1">▲</button><div class="showcase-drag-handle">⠿</div>` : `<div class="tnum"${sN?'':' style="display:none"'}>${i+1}.</div>`}
        ${(this.editMode || (isSearch && isGlobalHit)) ? `<div class="showcase-checkbox"></div>` : ''}
        <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
        <div class="track-title"><div>${esc(t.title)} ${badge}</div><div class="showcase-track-meta">${aTitle}</div></div>
        ${!this.editMode ? `<span class="offline-ind" data-uid="${u}">🔒</span><img src="${W.playerCore?.isFavorite(u)?'img/star.png':'img/star2.png'}" class="like-star" data-uid="${u}" data-album="${t.sourceAlbum}">` : ''}
        ${this.editMode ? `<button class="showcase-hide-btn">${isH?'👁‍🗨':'👁'}</button><button class="sc-arrow-down" data-dir="1">▼</button>` : `<button class="showcase-track-menu-btn">···</button>`}
      </div>`;
    };

    let grp = null;
    uidsToRender.forEach((u, i) => {
      const t = this._buildTrackObj(u); if (!t) return;
      if (this.viewMode === 'grouped' && !this.editMode && !isSearch && grp !== t.sourceAlbum) {
        grp = t.sourceAlbum; h += `<div class="showcase-group-header">── ${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))} ──</div>`;
      }
      h += generateRow(t, u, i);
    });

    if (isSearch && globalSearchResults.length) {
        h += `<div class="showcase-group-header" style="background:rgba(232,1,0,0.1); color:var(--primary-color);">── В других альбомах ──</div>`;
        globalSearchResults.forEach((u, i) => {
            const t = this._buildTrackObj(u); if (!t) return;
            h += generateRow(t, u, uidsToRender.length + i, true);
        });
    }

    c.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
    
    if (!this.editMode && !isSearch) W.OfflineIndicators?.injectOfflineIndicators?.(c); 
    this.hiTrack(W.playerCore?.getCurrentTrackUid());
  }

  updStatus(cnt) {
    const s = $('sc-status'); if (!s) return;
    let text = `Треков: ${cnt ?? $$('.showcase-track').length}`;
    if (this.editMode) text += ` | Выбрано: ${this.draft.checked.size} | Скрыто: ${this.draft.hidden.size}`;
    
    s.innerHTML = `<span>📋 ${text}</span>
      <span style="display:flex;gap:12px;align-items:center">
        <span id="sc-tg-e" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${localStorage.getItem('showcase:showHidden:v1')==='1'?'👁':'🙈'}</span>
        <span id="sc-tg-n" style="cursor:pointer;font-size:18px" title="Нумерация">${localStorage.getItem('showcase:showNumbers:v1')==='1'?'1,2,3':''}</span>
        <span id="sc-tg-v" style="cursor:pointer;font-size:18px" title="Сменить вид">${this.viewMode==='flat'?'⊞':'⊟'}</span>
      </span>`;
  }

  openSort() {
    const sm = this.sortMode, m = W.Modals.open({ title: 'Сортировка списка (Визуальная)', bodyHtml: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button class="showcase-btn ${sm==='user'?'active':''}" style="grid-column:1/-1" data-val="user">● Пользовательский (Ваш порядок)</button><button class="showcase-btn ${sm==='album-desc'?'active':''}" data-val="album-desc">Альбомы (Новые)</button><button class="showcase-btn ${sm==='album-asc'?'active':''}" data-val="album-asc">Альбомы (Старые)</button><button class="showcase-btn ${sm==='name-asc'?'active':''}" data-val="name-asc">А → Я</button><button class="showcase-btn ${sm==='name-desc'?'active':''}" data-val="name-desc">Я → А</button><button class="showcase-btn ${sm==='plays-desc'?'active':''}" data-val="plays-desc">Топ прослушиваний</button><button class="showcase-btn ${sm==='plays-asc'?'active':''}" data-val="plays-asc">Меньше всего</button><button class="showcase-btn ${sm==='last-played'?'active':''}" data-val="last-played">Недавние</button><button class="showcase-btn ${sm==='favorites-first'?'active':''}" data-val="favorites-first">Сначала ⭐</button></div>` });
    m.onclick = e => { const b = e.target.closest('[data-val]'); if(b) { this.sortMode = b.dataset.val; Store.set('sortMode', this.sortMode); this.renderTab(); m.remove(); } };
  }

  opnMenu(u, fromSearch = false) {
    const t = W.TrackRegistry.getTrackByUid(u); if(!t) return;
    const bg = D.createElement('div'); bg.className = 'sc-bottom-sheet-bg';
    
    let playBtn = '';
    if (fromSearch || this.searchQuery) {
        playBtn = `<button class="sc-sheet-btn" id="bm-play" style="color:var(--secondary-color); font-weight:bold;">▶ Воспроизвести сейчас</button>`;
    }
    
    bg.innerHTML = `<div class="sc-bottom-sheet"><div class="sc-sheet-title">${esc(t.title)}</div><div class="sc-sheet-sub">${esc(W.TrackRegistry.getAlbumTitle(t.sourceAlbum))}</div>
      ${playBtn}
      <button class="sc-sheet-btn" id="bm-hd">👁 Скрыть / Показать в текущем списке</button>
      <button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite(u)?'❌ Убрать из Избранного':'⭐ В Избранное'}</button>
      <button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Убрать из офлайн</button>
      <button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button>
      <button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button>
      <button class="sc-sheet-btn" style="color:#888;justify-content:center;margin-top:10px" id="bm-cx">Отмена</button></div>`;
    
    D.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('active'));
    const cls = () => { bg.classList.remove('active'); setTimeout(()=>bg.remove(), 200); };
    
    bg.onclick = e => {
      const id = e.target.id; if(e.target===bg || id==='bm-cx') return cls(); if(!id) return; cls();
      
      if(id==='bm-play') {
          // Воспроизведение вне контекста (просто запускает этот трек как единственный в очереди)
          W.AlbumsManager.setPlayingAlbum('__search_temp__');
          W.playerCore.setPlaylist([this._buildTrackObj(u)], 0, null, { preservePosition: false });
          W.playerCore.play(0);
          W.PlayerUI.ensurePlayerBlock(0, { userInitiated: true });
      }
      else if(id==='bm-hd') {
          const ctx = Store.getContext();
          let hidden = ctx.hidden;
          hidden.includes(u) ? hidden = hidden.filter(x=>x!==u) : hidden.push(u);
          Store.saveContext(ctx.isDefault, ctx.order, hidden);
          this.renderList();
      }
      else if(id==='bm-fv') W.playerCore?.toggleFavorite(u,{albumKey:t.sourceAlbum});
      else if(id==='bm-of') W.OfflineManager?.togglePinned?.(u);
      else if(id==='bm-st') setTimeout(()=>W.StatisticsModal?.openStatisticsModal?.(u),250);
      else if(id==='bm-cl') setTimeout(()=>this.opnCol(u),250);
    };
  }

  opnCol(u, aKey = null, pId = null) {
    if (u && !aKey) aKey = W.TrackRegistry.getTrackByUid(u)?.sourceAlbum;
    const cur = pId ? Store.pCol[pId] : Store.aCol[aKey];
    const m = W.Modals.open({ title: 'Выбор цвета', bodyHtml: `<div class="showcase-color-picker">${PALETTE.map(c=>`<div class="showcase-color-dot" style="background:${c};${cur===c?'border-color:#fff':''}" data-col="${c}"></div>`).join('')}</div><button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>` });
    m.onclick = e => { 
        const el = e.target.closest('[data-col]'); 
        if(el) { 
            const c = el.dataset.col==='transparent'?'':el.dataset.col; 
            if(pId) { const p = Store.pCol; p[pId]=c; Store.pCol=p; this.renderPls(); } 
            else { const a = Store.aCol; a[aKey]=c; Store.aCol=a; if(!this.editMode) this.renderList(); } 
            m.remove(); 
        } 
    };
  }

  hiTrack(u) { 
    $$('.showcase-track.current').forEach(e=>e.classList.remove('current')); 
    if(u) $$(`.showcase-track[data-uid="${CSS.escape(u)}"]`).forEach(e=>e.classList.add('current')); 
  }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

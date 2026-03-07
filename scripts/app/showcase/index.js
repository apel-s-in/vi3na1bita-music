/**
 * scripts/app/showcase/index.js
 * ShowcaseManager v4.0
 * Полная стабилизация вкладки "Витрина Разбита" по нормативной спецификации.
 * Цели:
 * - один источник истины для Showcase state
 * - отсутствие дублированной логики и повторных listeners
 * - быстрый рендер без гонок
 * - draft-state строго отделён от persisted-state
 * - playback отделён от display
 * - search работает по всему каталогу
 * - скрытые треки никогда не попадают в playback
 */

import { ensureLyricsIndexLoaded, searchUidsByQuery } from './lyrics-search.js';

const W = window;
const D = document;
const U = W.Utils;
const LS_KEY = 'showcase:state:v4';
const SHOWCASE_KEY = '__showcase__';
const PALETTE = ['transparent', '#ef5350', '#ff9800', '#fdd835', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0', '#e91e63', '#9e9e9e'];

const $ = (id) => D.getElementById(id);
const esc = (s) => U?.escapeHtml?.(String(s || '')) || String(s || '');
const now = () => Date.now();
const sUid = (v) => String(v || '').trim() || null;

function uniq(arr) {
  return [...new Set(arr)];
}

function sanitizeUidList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const uid = sUid(item);
    if (!uid || seen.has(uid) || !W.TrackRegistry?.getTrackByUid?.(uid)) return;
    seen.add(uid);
    out.push(uid);
  });
  return out;
}

function safeName(v, fallback) {
  const s = String(v || '').trim();
  return s || fallback;
}

function safeColor(v) {
  return PALETTE.includes(v) ? v : '';
}

function byId(arr, id) {
  return Array.isArray(arr) ? arr.find((item) => item?.id === id) || null : null;
}

class ShowcaseManager {
  constructor() {
    this.state = null;
    this.draft = null;
    this.searchQuery = '';
    this.searchSel = new Set();
    this.controlsBound = false;
    this.renderToken = 0;
    this._icons = {};
    this._statsCache = new Map();
    this._scrollKeyPrefix = 'showcase:scroll:v4:';
    this._menu = null;
    this._boundRoot = null;
    this._longPressTimer = null;
    this._wasLongPress = false;
  }

  async initialize() {
    (W.APP_CONFIG?.ICON_ALBUMS_ORDER || []).forEach((item) => {
      if (item?.key) this._icons[item.key] = item.icon;
    });

    await W.TrackRegistry?.ensurePopulated?.();
    this._loadState();
    this._bindGlobalEvents();
  }

  _bindGlobalEvents() {
    W.playerCore?.on({
      onTrackChange: (track) => {
        if (!track?.uid) return;
        const playingAlbum = String(W.AlbumsManager?.getPlayingAlbum?.() || '');
        if (!U.isShowcaseContext(playingAlbum)) return;
        localStorage.setItem('showcase:lastTrackUid', track.uid);
        localStorage.setItem('showcase:lastPlayingContext', playingAlbum);
        this.highlightCurrentTrack(track.uid);
      }
    });

    W.playerCore?.onFavoritesChanged(() => {
      if (!this.draft && W.AlbumsManager?.getCurrentAlbum?.() === SHOWCASE_KEY) {
        this.renderList().catch(() => {});
      }
    });

    ['offline:stateChanged', 'offline:uiChanged'].forEach((ev) => {
      W.addEventListener(ev, () => {
        if (W.AlbumsManager?.getCurrentAlbum?.() !== SHOWCASE_KEY) return;
        W.OfflineIndicators?.refreshAllIndicators?.();
        this.updateStatus().catch(() => {});
      });
    });
  }

  _loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw && raw.v === 4) {
        this.state = this._sanitizeState(raw);
        return;
      }
    } catch {}
    this._migrateOrCreateFreshState();
  }

  _saveState() {
    localStorage.setItem(LS_KEY, JSON.stringify(this.state));
  }

  _migrateOrCreateFreshState() {
    const baseline = this.getFactoryBaseline();
    let migrated = null;

    try {
      const old = JSON.parse(localStorage.getItem('showcase:state:v3') || 'null');
      if (old) migrated = old;
    } catch {}

    const next = {
      v: 4,
      ctx: { type: 'all', id: null },
      ui: {
        view: migrated?.ui?.view === 'grouped' ? 'grouped' : 'flat',
        num: migrated?.ui?.num !== false,
        hid: !!migrated?.ui?.hid,
        plc: migrated?.ui?.plc === 'end' ? 'end' : 'keep'
      },
      def: {
        ord: sanitizeUidList(migrated?.def?.ord).length ? sanitizeUidList(migrated.def.ord) : [...baseline],
        hid: sanitizeUidList(migrated?.def?.hid),
        sort: this._safeSortMode(migrated?.def?.sort)
      },
      pls: Array.isArray(migrated?.pls) ? migrated.pls.map((pl, idx) => this._sanitizePlaylist(pl, idx + 1)) : [],
      col: this._sanitizeAlbumColors(migrated?.col)
    };

    this.state = this._sanitizeState(next);
    this._saveState();
  }

  _sanitizeAlbumColors(src) {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    Object.entries(src).forEach(([albumKey, color]) => {
      if (!albumKey || !W.TrackRegistry?.getAlbumTitle?.(albumKey)) return;
      out[albumKey] = safeColor(color);
    });
    return out;
  }

  _safeSortMode(mode) {
    const ok = new Set([
      'user',
      'name-asc',
      'name-desc',
      'album-asc',
      'album-desc',
      'favorites-first',
      'plays-desc',
      'plays-asc',
      'last-played'
    ]);
    return ok.has(mode) ? mode : 'user';
  }

  _sanitizePlaylist(pl, n = 1) {
    const uids = sanitizeUidList(pl?.uids);
    const ord = sanitizeUidList(pl?.ord);
    const order = ord.length ? uniq([...ord, ...uids]) : [...uids];
    const hidden = sanitizeUidList(pl?.hid).filter((uid) => order.includes(uid));

    const snapUids = sanitizeUidList(pl?.snap?.uids).length ? sanitizeUidList(pl.snap.uids) : [...uids];
    const snapOrd = sanitizeUidList(pl?.snap?.ord).length ? sanitizeUidList(pl.snap.ord) : [...uids];
    const snapHid = sanitizeUidList(pl?.snap?.hid).filter((uid) => snapOrd.includes(uid));

    return {
      id: sUid(pl?.id) || now().toString(36) + '_' + n,
      name: safeName(pl?.name, `Мой плейлист ${n}`),
      col: safeColor(pl?.col),
      uids: [...uids],
      ord: [...order],
      hid: [...hidden],
      sort: this._safeSortMode(pl?.sort),
      createdAt: Number(pl?.createdAt) || now(),
      snap: {
        uids: [...snapUids],
        ord: [...snapOrd],
        hid: [...snapHid]
      }
    };
  }

  _sanitizeState(src) {
    const baseline = this.getFactoryBaseline();

    const defOrdRaw = sanitizeUidList(src?.def?.ord);
    const defOrd = defOrdRaw.length ? uniq([...defOrdRaw, ...baseline.filter((uid) => !defOrdRaw.includes(uid))]) : [...baseline];
    const defHid = sanitizeUidList(src?.def?.hid).filter((uid) => defOrd.includes(uid));

    const pls = Array.isArray(src?.pls) ? src.pls.map((pl, idx) => this._sanitizePlaylist(pl, idx + 1)) : [];

    const ctxType = src?.ctx?.type === 'playlist' ? 'playlist' : 'all';
    const ctxId = ctxType === 'playlist' && byId(pls, src?.ctx?.id) ? src.ctx.id : null;

    return {
      v: 4,
      ctx: ctxType === 'playlist' && ctxId ? { type: 'playlist', id: ctxId } : { type: 'all', id: null },
      ui: {
        view: src?.ui?.view === 'grouped' ? 'grouped' : 'flat',
        num: src?.ui?.num !== false,
        hid: !!src?.ui?.hid,
        plc: src?.ui?.plc === 'end' ? 'end' : 'keep'
      },
      def: {
        ord: [...defOrd],
        hid: [...defHid],
        sort: this._safeSortMode(src?.def?.sort)
      },
      pls,
      col: this._sanitizeAlbumColors(src?.col)
    };
  }

  getFactoryBaseline() {
    const result = [];
    const albums = [...(W.albumsIndex || [])].filter((a) => !String(a?.key || '').startsWith('__')).reverse();

    albums.forEach((album) => {
      const albumTracks = W.TrackRegistry?.getTracksForAlbum?.(album.key) || [];
      albumTracks.forEach((track) => {
        const uid = sUid(track?.uid);
        if (uid && !result.includes(uid)) result.push(uid);
      });
    });

    return result;
  }

  getCurrentContext() {
    if (this.state.ctx.type === 'playlist') {
      const pl = byId(this.state.pls, this.state.ctx.id);
      if (pl) return { isPlaylist: true, ...pl };
      this.state.ctx = { type: 'all', id: null };
      this._saveState();
    }

    const baseline = this.getFactoryBaseline();
    const saved = this.state.def.ord || [];
    const missing = baseline.filter((uid) => !saved.includes(uid));
    if (missing.length) {
      this.state.def.ord = [...saved, ...missing];
      this._saveState();
    }

    return {
      isPlaylist: false,
      id: null,
      name: 'Все треки',
      ord: [...this.state.def.ord],
      hid: [...this.state.def.hid],
      sort: this.state.def.sort,
      uids: [...baseline]
    };
  }

  getCover(track) {
    if (!track) return 'img/logo.png';
    let icon = this._icons[track.sourceAlbum] || 'img/logo.png';

    if (U.isMobile?.() && /\/icon_album\/[^/]+\.png$/i.test(icon)) {
      const match = icon.match(/\/icon_album\/([^/]+)\.png$/i);
      if (match) icon = `img/icon_album/mobile/${match[1]}@1x.jpg`;
    }

    return icon;
  }

  async _warmStatsCacheIfNeeded(mode, uids) {
    if (!(mode === 'plays-desc' || mode === 'plays-asc' || mode === 'last-played')) return;

    const missing = uids.some((uid) => !this._statsCache.has(uid));
    if (!missing) return;

    const mod = await import('../../analytics/meta-db.js');
    const stats = await mod.metaDB.getAllStats();
    const map = new Map(stats.filter((item) => item.uid !== 'global').map((item) => [item.uid, item]));

    uids.forEach((uid) => {
      const stat = map.get(uid);
      this._statsCache.set(uid, {
        plays: stat?.globalFullListenCount || 0,
        lastAt: stat?.lastPlayedAt || 0
      });
    });
  }

  async getSortedUids(uids, mode) {
    const list = sanitizeUidList(uids);

    if (mode === 'user') return list;
    await this._warmStatsCacheIfNeeded(mode, list);

    const tracks = list
      .map((uid) => W.TrackRegistry?.getTrackByUid?.(uid))
      .filter(Boolean);

    const sorters = {
      'name-asc': (a, b) => String(a.title || '').localeCompare(String(b.title || '')),
      'name-desc': (a, b) => String(b.title || '').localeCompare(String(a.title || '')),
      'album-asc': (a, b) => String(a.sourceAlbum || '').localeCompare(String(b.sourceAlbum || '')),
      'album-desc': (a, b) => String(b.sourceAlbum || '').localeCompare(String(a.sourceAlbum || '')),
      'favorites-first': (a, b) => (W.playerCore?.isFavorite?.(b.uid) ? 1 : 0) - (W.playerCore?.isFavorite?.(a.uid) ? 1 : 0),
      'plays-desc': (a, b) => (this._statsCache.get(b.uid)?.plays || 0) - (this._statsCache.get(a.uid)?.plays || 0),
      'plays-asc': (a, b) => (this._statsCache.get(a.uid)?.plays || 0) - (this._statsCache.get(b.uid)?.plays || 0),
      'last-played': (a, b) => (this._statsCache.get(b.uid)?.lastAt || 0) - (this._statsCache.get(a.uid)?.lastAt || 0)
    };

    const sorter = sorters[mode];
    if (sorter) tracks.sort(sorter);

    return tracks.map((track) => track.uid);
  }

  async getDisplayList() {
    const ctx = this.getCurrentContext();

    if (this.draft) {
      return this.draft.ord
        .map((uid) => ({
          uid,
          status: 'edit',
          track: W.TrackRegistry?.getTrackByUid?.(uid)
        }))
        .filter((item) => item.track);
    }

    if (this.searchQuery) {
      await ensureLyricsIndexLoaded();
      const matched = searchUidsByQuery({ query: this.searchQuery });
      const hiddenSet = new Set(ctx.hid);
      const memberSet = new Set(ctx.isPlaylist ? ctx.uids : ctx.ord);

      return matched.map((uid) => {
        let status = 'missing';
        if (memberSet.has(uid)) status = hiddenSet.has(uid) ? 'hidden' : 'active';
        else if (!ctx.isPlaylist && hiddenSet.has(uid)) status = 'hidden-def';

        return {
          uid,
          status,
          track: W.TrackRegistry?.getTrackByUid?.(uid)
        };
      }).filter((item) => item.track);
    }

    const sorted = await this.getSortedUids(ctx.ord, ctx.sort);
    const hiddenSet = new Set(ctx.hid);

    let rows = [];
    sorted.forEach((uid) => {
      const hidden = hiddenSet.has(uid);
      if (hidden && !this.state.ui.hid) return;
      rows.push({
        uid,
        status: hidden ? 'hidden' : 'active',
        track: W.TrackRegistry?.getTrackByUid?.(uid)
      });
    });

    if (this.state.ui.plc === 'end') {
      rows = [
        ...rows.filter((item) => item.status === 'active'),
        ...rows.filter((item) => item.status !== 'active')
      ];
    }

    return rows.filter((item) => item.track);
  }

  getPlayableUidsSync(ctx = this.getCurrentContext()) {
    return ctx.ord.filter((uid) => !ctx.hid.includes(uid) && !!W.TrackRegistry?.getTrackByUid?.(uid));
  }

  getActiveListTracks() {
    return this.getPlayableUidsSync().map((uid) => {
      const track = W.TrackRegistry?.getTrackByUid?.(uid);
      return track ? { ...track, album: 'Витрина Разбита', cover: this.getCover(track) } : null;
    }).filter(Boolean);
  }

  enterEdit() {
    const ctx = this.getCurrentContext();
    const ord = sanitizeUidList(ctx.ord);
    const hidden = new Set(sanitizeUidList(ctx.hid).filter((uid) => ord.includes(uid)));

    const checked = new Set(
      (ctx.isPlaylist ? sanitizeUidList(ctx.uids) : ord).filter((uid) => !hidden.has(uid) && ord.includes(uid))
    );

    this.draft = {
      isPlaylist: ctx.isPlaylist,
      id: ctx.id || null,
      ord: [...ord],
      chk: checked,
      hid: hidden,
      dirty: false
    };

    this.renderTab().catch(() => {});
  }

  saveEdit() {
    if (!this.draft) return;
    const d = this.draft;

    if (d.isPlaylist) {
      const pl = byId(this.state.pls, d.id);
      if (pl) {
        const kept = d.ord.filter((uid) => d.chk.has(uid) && !!W.TrackRegistry?.getTrackByUid?.(uid));
        pl.uids = [...kept];
        pl.ord = [...kept];
        pl.hid = kept.filter((uid) => d.hid.has(uid));
      }
    } else {
      const ord = d.ord.filter((uid) => !!W.TrackRegistry?.getTrackByUid?.(uid));
      this.state.def.ord = [...ord];
      this.state.def.hid = ord.filter((uid) => !d.chk.has(uid));
    }

    this._saveState();
    this.draft = null;
    W.NotificationSystem?.success?.('Изменения сохранены');
    this.renderTab().catch(() => {});
  }

  createFromEdit(fromSearch = false) {
    const modal = W.Modals?.open?.({
      title: 'Название плейлиста',
      bodyHtml: `
        <input
          id="pl-name"
          value="Мой плейлист ${this.state.pls.length + 1}"
          style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);color:#fff;border:1px solid #666;margin-bottom:15px"
        />
        <button id="pl-ok" class="om-btn om-btn--primary" style="width:100%">Создать</button>
      `
    });

    if (!modal) return;
    setTimeout(() => modal.querySelector('#pl-name')?.focus(), 100);

    modal.onclick = (e) => {
      if (e.target.id !== 'pl-ok') return;

      const name = modal.querySelector('#pl-name')?.value.trim();
      if (!name) return;

      let uids = [];
      if (fromSearch) {
        uids = [...this.searchSel].filter((uid) => !!W.TrackRegistry?.getTrackByUid?.(uid));
      } else if (this.draft) {
        uids = this.draft.ord.filter((uid) => this.draft.chk.has(uid) && !this.draft.hid.has(uid));
      }

      uids = sanitizeUidList(uids);
      if (!uids.length) {
        W.NotificationSystem?.warning?.('Нет активных треков для нового плейлиста');
        return;
      }

      const id = now().toString(36);
      this.state.pls.push({
        id,
        name,
        col: '',
        uids: [...uids],
        ord: [...uids],
        hid: [],
        sort: 'user',
        createdAt: now(),
        snap: {
          uids: [...uids],
          ord: [...uids],
          hid: []
        }
      });

      this.state.ctx = { type: 'playlist', id };
      this.draft = null;
      this.searchSel.clear();
      this.searchQuery = '';
      this._saveState();
      modal.remove();
      W.NotificationSystem?.success?.('Плейлист создан');
      this.renderTab().catch(() => {});
    };
  }

  resetEdit() {
    if (!this.draft) return;

    W.Modals?.confirm?.({
      title: 'Сбросить изменения?',
      textHtml: this.draft.isPlaylist
        ? 'Вернуть к состоянию на момент создания?'
        : 'Вернуть весь каталог в заводское состояние?',
      confirmText: 'Да, сбросить',
      onConfirm: () => {
        if (!this.draft) return;

        if (this.draft.isPlaylist) {
          const pl = byId(this.state.pls, this.draft.id);
          if (pl?.snap) {
            this.draft.ord = [...sanitizeUidList(pl.snap.ord)];
            this.draft.chk = new Set(sanitizeUidList(pl.snap.uids));
            this.draft.hid = new Set(sanitizeUidList(pl.snap.hid));
          }
        } else {
          const baseline = this.getFactoryBaseline();
          this.draft.ord = [...baseline];
          this.draft.chk = new Set(baseline);
          this.draft.hid = new Set();
        }

        this._markDraftDirty();
        this.renderList().catch(() => {});
      }
    });
  }

  exitEdit() {
    if (!this.draft?.dirty) {
      this.draft = null;
      this.renderTab().catch(() => {});
      return;
    }

    W.Modals?.confirm?.({
      title: 'Выйти без сохранения?',
      textHtml: 'Вы внесли изменения. Если выйдете, они не сохранятся.',
      confirmText: 'Да, выйти',
      onConfirm: () => {
        this.draft = null;
        this.renderTab().catch(() => {});
      }
    });
  }

  toggleSelection(uid) {
    const set = this.draft ? this.draft.chk : this.searchSel;
    const row = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"]`);

    if (set.has(uid)) {
      set.delete(uid);
      row?.classList.remove('selected');
    } else {
      set.add(uid);
      row?.classList.add('selected');
    }

    if (this.draft) {
      this._markDraftDirty();

      if (!this.draft.isPlaylist) {
        if (set.has(uid)) this.draft.hid.delete(uid);
        else this.draft.hid.add(uid);

        const eyeBtn = row?.querySelector('.showcase-hide-btn');
        if (eyeBtn) eyeBtn.textContent = set.has(uid) ? '👁' : '👁‍🗨';
        row?.classList.toggle('inactive', !set.has(uid));
      }
    }

    this.renderMultiPanel();
    this.updateStatus().catch(() => {});
  }

  toggleHidden(uid) {
    if (!this.draft) return;
    const row = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"]`);

    if (this.draft.hid.has(uid)) this.draft.hid.delete(uid);
    else this.draft.hid.add(uid);

    if (row) {
      row.classList.toggle('inactive', this.draft.hid.has(uid));
      const eyeBtn = row.querySelector('.showcase-hide-btn');
      if (eyeBtn) eyeBtn.textContent = this.draft.hid.has(uid) ? '👁‍🗨' : '👁';
    }

    if (!this.draft.isPlaylist) {
      if (this.draft.hid.has(uid)) this.draft.chk.delete(uid);
      else this.draft.chk.add(uid);
      row?.classList.toggle('selected', !this.draft.hid.has(uid));
    }

    this._markDraftDirty();
    this.renderMultiPanel();
    this.updateStatus().catch(() => {});
  }

  async playContext(uid = null) {
    const ctx = this.getCurrentContext();
    const hiddenSet = new Set(ctx.hid);

    let playableUids = await this.getSortedUids(ctx.ord, ctx.sort);
    playableUids = playableUids.filter((id) => !hiddenSet.has(id));

    if (!playableUids.length && !this.searchQuery) {
      W.NotificationSystem?.warning?.('Нет активных треков для воспроизведения');
      return;
    }

    if (this.searchQuery && uid && !playableUids.includes(uid)) {
      const track = W.TrackRegistry?.getTrackByUid?.(uid);
      if (!track) return;
      W.AlbumsManager?.setPlayingAlbum?.('__showcase__:search');
      W.playerCore?.setPlaylist?.([{ ...track, album: 'Поиск (Витрина)', cover: this.getCover(track) }], 0, null, { preservePosition: false });
      W.playerCore?.play?.(0);
      W.PlayerUI?.ensurePlayerBlock?.(0, { userInitiated: true });
      return;
    }

    const tracks = playableUids.map((id) => {
      const track = W.TrackRegistry?.getTrackByUid?.(id);
      return { ...track, album: 'Витрина Разбита', cover: this.getCover(track) };
    });

    let startIndex = uid ? Math.max(0, playableUids.indexOf(uid)) : 0;
    W.AlbumsManager?.setPlayingAlbum?.(ctx.isPlaylist ? `__showcase__:${ctx.id}` : SHOWCASE_KEY);
    W.playerCore?.setPlaylist?.(tracks, startIndex, null, { preservePosition: false });
    W.playerCore?.play?.(startIndex);
    W.PlayerUI?.ensurePlayerBlock?.(startIndex, { userInitiated: true });

    if (tracks[startIndex]?.uid) this.highlightCurrentTrack(tracks[startIndex].uid);
  }

  async renderTab() {
    this._saveScrollPosition();

    const list = $('track-list');
    if (!list) return;

    const ctx = this.getCurrentContext();
    const isEdit = !!this.draft;

    list.innerHTML = `
      <div class="showcase-header-controls">
        ${isEdit ? `
          <div class="showcase-edit-banner">
            ✏️ РЕЖИМ РЕДАКТИРОВАНИЯ
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="showcase-btn" id="sc-save" style="background:#fff;color:#000;">💾 Сохранить</button>
              <button class="showcase-btn" id="sc-create">✨ Создать новый</button>
              <button class="showcase-btn" id="sc-reset" style="border-color:#ff9800;color:#ff9800" ${!this.draft?.dirty ? 'disabled' : ''}>↺ Сброс</button>
              <button class="showcase-btn showcase-btn--danger" id="sc-exit">✕ Выйти</button>
            </div>
          </div>
        ` : ''}

        <div class="showcase-search-wrap">
          <input
            type="text"
            class="showcase-search"
            id="sc-search"
            placeholder="🔍 Поиск по всему каталогу..."
            value="${esc(this.searchQuery)}"
          />
          <button
            type="button"
            class="showcase-search-clear"
            id="sc-search-clear"
            style="display:${this.searchQuery ? '' : 'none'}"
          >✕</button>
        </div>

        ${!isEdit ? `
          <div class="showcase-btns-row">
            <button class="showcase-btn" id="sc-edit">✏️ Редактировать</button>
            <button class="showcase-btn" id="sc-sort">↕️ Сортировка ${ctx.sort !== 'user' ? '●' : ''}</button>
          </div>
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
    await this.renderList();
    this._restoreScrollPosition();

    if (!isEdit) {
      const lastUid = localStorage.getItem('showcase:lastTrackUid');
      const lastCtx = localStorage.getItem('showcase:lastPlayingContext');
      const curCtx = ctx.isPlaylist ? `__showcase__:${ctx.id}` : SHOWCASE_KEY;
      if (lastUid && lastCtx === curCtx) this.highlightCurrentTrack(lastUid);
    }
  }

  async renderList() {
    const token = ++this.renderToken;
    const cont = $('sc-tracks-container');
    if (!cont) return;

    const rows = await this.getDisplayList();
    if (token !== this.renderToken) return;

    await this.updateStatus(rows.length);

    const isEdit = !!this.draft;
    const showNumbers = this.state.ui.num;
    let html = '';
    let currentGroup = null;

    rows.forEach(({ uid, status, track }, index) => {
      if (
        this.state.ui.view === 'grouped' &&
        !isEdit &&
        !this.searchQuery &&
        currentGroup !== track.sourceAlbum
      ) {
        currentGroup = track.sourceAlbum;
        html += `<div class="showcase-group-header">── ${esc(W.TrackRegistry?.getAlbumTitle?.(track.sourceAlbum) || 'Альбом')} ──</div>`;
      }

      const color = this.state.col[track.sourceAlbum] || 'transparent';
      const selected = this.searchSel.has(uid) || (isEdit && this.draft?.chk.has(uid));
      const eyeOff = isEdit ? this.draft?.hid.has(uid) : status.includes('hidden');

      let badges = '';
      if (this.searchQuery) {
        if (status === 'active') badges = `<span class="showcase-row-badge sc-badge-active">Уже активен</span>`;
        else if (status === 'hidden') badges = `<span class="showcase-row-badge sc-badge-hidden">Скрыт</span>`;
        else if (status === 'missing' && this.state.ctx.type === 'playlist') badges = `<span class="showcase-row-badge sc-badge-missing">Нет в плейлисте</span>`;
      }

      html += `
        <div
          class="showcase-track ${eyeOff ? 'inactive' : ''} ${selected ? 'selected' : ''}"
          data-uid="${uid}"
          style="border-left:3px solid ${color}"
          ${isEdit ? 'draggable="true"' : ''}
        >
          ${isEdit ? `
            <button class="sc-arrow-up" data-dir="-1">▲</button>
          ` : `
            <div class="tnum" style="display:${showNumbers ? 'block' : 'none'}">${index + 1}.</div>
          `}

          ${isEdit || this.searchQuery ? `
            <div class="showcase-drag-handle">${isEdit ? '⠿' : ''}</div>
            <div class="showcase-checkbox"></div>
          ` : ''}

          <img src="${this.getCover(track)}" class="showcase-track-thumb" loading="lazy" alt="cover">

          <div class="track-title">
            <div>${esc(track.title || 'Без названия')}</div>
            <div class="showcase-track-meta">
              <span>${esc(W.TrackRegistry?.getAlbumTitle?.(track.sourceAlbum) || track.album || 'Альбом')}</span>
              ${badges}
            </div>
          </div>

          ${isEdit ? `
            <button class="showcase-hide-btn" type="button" title="Скрыть / Показать">${eyeOff ? '👁‍🗨' : '👁'}</button>
            <button class="sc-arrow-down" data-dir="1">▼</button>
          ` : `
            <span class="offline-ind" data-uid="${uid}">🔒</span>
            <img src="img/star${W.playerCore?.isFavorite?.(uid) ? '' : '2'}.png" class="like-star" alt="★" aria-hidden="true">
            <button class="showcase-track-menu-btn" type="button">...</button>
          `}
        </div>
      `;
    });

    cont.innerHTML = html || `<div class="fav-empty">Ничего не найдено</div>`;
    W.OfflineIndicators?.refreshAllIndicators?.();
    this.renderMultiPanel();
  }

  async updateStatus(foundCount = null) {
    const el = $('sc-status');
    if (!el) return;

    const ctx = this.getCurrentContext();
    const total = ctx.ord.length;
    const hidden = ctx.hid.length;
    const active = Math.max(0, total - hidden);
    const found = this.searchQuery ? Number(foundCount || 0) : 0;
    const numOn = this.state.ui.num;

    el.innerHTML = `
      <span>📋 ${total} · ✅ ${active} · 🙈 ${hidden}${this.searchQuery ? ` · 🔎 ${found}` : ''}</span>
      <span style="display:flex;gap:12px;align-items:center">
        <span id="sc-tg-e" style="cursor:pointer;font-size:18px" title="Показывать скрытые">${this.state.ui.hid ? '👁' : '🙈'}</span>
        <span id="sc-tg-n" style="cursor:pointer;font-size:16px;font-weight:bold;opacity:${numOn ? '1' : '.72'}" aria-pressed="${numOn ? 'true' : 'false'}" title="Нумерация">1,2,3</span>
        <span id="sc-tg-v" style="cursor:pointer;font-size:18px" title="Сменить вид">${this.state.ui.view === 'flat' ? '⊞' : '⊟'}</span>
      </span>
    `;
  }

  openTrackMenu(uid) {
    this._menu?.remove();

    const track = W.TrackRegistry?.getTrackByUid?.(uid);
    if (!track) return;

    const bg = D.createElement('div');
    bg.className = 'sc-bottom-sheet-bg';

    const ctx = this.getCurrentContext();
    const inPlaylist = ctx.isPlaylist && ctx.uids.includes(uid);

    bg.innerHTML = `
      <div class="sc-bottom-sheet">
        <button class="bigclose" type="button" aria-label="Закрыть" id="bm-cx">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4z"/>
          </svg>
        </button>

        <div class="sc-sheet-title">${esc(track.title)}</div>
        <div class="sc-sheet-sub">${esc(W.TrackRegistry?.getAlbumTitle?.(track.sourceAlbum) || 'Альбом')}</div>

        ${this.searchQuery ? `<button class="sc-sheet-btn" id="bm-play" style="color:var(--secondary-color)">▶ Воспроизвести</button>` : ''}
        <button class="sc-sheet-btn" id="bm-pl">➕ Добавить в другой плейлист</button>
        ${inPlaylist ? `<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из текущего плейлиста</button>` : ''}
        <button class="sc-sheet-btn" id="bm-hd">👁 Скрыть / Показать (в этом списке)</button>
        <button class="sc-sheet-btn" id="bm-fv">${W.playerCore?.isFavorite?.(uid) ? '❌ Убрать из Избранного' : '⭐ В Избранное'}</button>
        <button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Убрать из офлайн</button>
        <button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3 файл</button>
        <button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button>
      </div>
    `;

    D.body.appendChild(bg);
    this._menu = bg;
    requestAnimationFrame(() => bg.classList.add('active'));

    const close = () => {
      bg.classList.remove('active');
      setTimeout(() => bg.remove(), 200);
      this._menu = null;
    };

    bg.onclick = (e) => {
      const id = e.target.closest('[id]')?.id;
      if (e.target === bg || id === 'bm-cx') return close();
      if (!id) return;
      close();

      if (id === 'bm-play') {
        this.playContext(uid);
      } else if (id === 'bm-pl') {
        setTimeout(() => this.openAddToPlaylist([uid]), 150);
      } else if (id === 'bm-rm') {
        const pl = byId(this.state.pls, ctx.id);
        if (pl) {
          pl.uids = pl.uids.filter((item) => item !== uid);
          pl.ord = pl.ord.filter((item) => item !== uid);
          pl.hid = pl.hid.filter((item) => item !== uid);
          this._saveState();
          this.renderList().catch(() => {});
        }
      } else if (id === 'bm-hd') {
        if (ctx.isPlaylist) {
          const pl = byId(this.state.pls, ctx.id);
          if (pl) {
            if (pl.hid.includes(uid)) pl.hid = pl.hid.filter((item) => item !== uid);
            else pl.hid.push(uid);
          }
        } else {
          if (this.state.def.hid.includes(uid)) this.state.def.hid = this.state.def.hid.filter((item) => item !== uid);
          else this.state.def.hid.push(uid);
        }
        this._saveState();
        this.renderList().catch(() => {});
      } else if (id === 'bm-fv') {
        W.playerCore?.toggleFavorite?.(uid, { albumKey: track.sourceAlbum });
      } else if (id === 'bm-of') {
        W.OfflineManager?.togglePinned?.(uid);
      } else if (id === 'bm-dl') {
        const a = D.createElement('a');
        U.download?.applyDownloadLink?.(a, track);
        if (a.href) a.click();
      } else if (id === 'bm-st') {
        setTimeout(() => W.StatisticsModal?.openStatisticsModal?.(uid), 150);
      }
    };
  }

  renderPlaylists() {
    const actions = $('sc-playlists-actions');
    const list = $('sc-playlists');
    const ctx = this.state.ctx;
    const playlists = this.state.pls;

    if (!actions || !list) return;

    actions.innerHTML = `
      <button class="sc-pl-action ${ctx.type === 'all' ? 'active' : ''}" id="sc-pl-all">Все треки</button>
      <button class="sc-pl-action" id="sc-pl-nw">+ Новый</button>
    `;

    actions.onclick = (e) => {
      if (e.target.id === 'sc-pl-all') {
        this.state.ctx = { type: 'all', id: null };
        this._saveState();
        this.renderTab().catch(() => {});
      } else if (e.target.id === 'sc-pl-nw') {
        this.createFromEdit(false);
      }
    };

    if (!playlists.length) {
      list.innerHTML = `<div class="sc-pl-empty">Плейлистов пока нет</div>`;
      return;
    }

    list.innerHTML = playlists.map((pl) => `
      <div class="sc-pl-row ${ctx.type === 'playlist' && ctx.id === pl.id ? 'active' : ''}" data-pid="${pl.id}" ${pl.col ? `style="--pl-color:${pl.col};"` : ''}>
        <div class="sc-pl-left">
          <span class="sc-pl-dot"></span>
          <span class="sc-pl-title" title="${esc(pl.name)}">${esc(pl.name)}</span>
        </div>
        <div class="sc-pl-right">
          <button class="sc-pl-btn" data-act="ren" data-pid="${pl.id}">✏️</button>
          <button class="sc-pl-btn" data-act="col" data-pid="${pl.id}">🎨</button>
          <button class="sc-pl-btn danger" data-act="del" data-pid="${pl.id}">✖</button>
        </div>
      </div>
    `).join('');

    list.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const pid = e.target.closest('[data-pid]')?.dataset.pid;

      if (act && pid) {
        if (act === 'del') {
          W.Modals?.confirm?.({
            title: 'Удалить?',
            confirmText: 'Да',
            onConfirm: () => {
              this.state.pls = this.state.pls.filter((pl) => pl.id !== pid);
              if (this.state.ctx.id === pid) this.state.ctx = { type: 'all', id: null };
              this._saveState();
              this.renderTab().catch(() => {});
            }
          });
        } else if (act === 'col') {
          this.openColorPicker(null, null, pid);
        } else if (act === 'ren') {
          const pl = byId(this.state.pls, pid);
          if (!pl) return;

          const modal = W.Modals?.open?.({
            title: 'Переименовать',
            bodyHtml: `
              <input
                id="pl-ren"
                value="${esc(pl.name)}"
                style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);color:#fff;border:1px solid #666;margin-bottom:15px"
              />
              <button id="pl-rok" class="om-btn om-btn--primary" style="width:100%">Сохранить</button>
            `
          });

          if (!modal) return;
          modal.onclick = (ev) => {
            if (ev.target.id !== 'pl-rok') return;
            const value = D.getElementById('pl-ren')?.value.trim();
            if (!value) return;
            pl.name = value;
            this._saveState();
            this.renderPlaylists();
            modal.remove();
          };
        }
        return;
      }

      const row = e.target.closest('.sc-pl-row');
      if (!row?.dataset.pid) return;
      this.state.ctx = { type: 'playlist', id: row.dataset.pid };
      this._saveState();
      this.renderTab().catch(() => {});
    };
  }

  openAddToPlaylist(uids) {
    const playlists = this.state.pls;
    if (!playlists.length) {
      W.NotificationSystem?.warning?.('Сначала создайте новый плейлист');
      return;
    }

    const modal = W.Modals?.open?.({
      title: 'Выберите плейлист',
      bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px;">${playlists.map((pl) => `<button class="showcase-btn" data-pid="${pl.id}">${esc(pl.name)}</button>`).join('')}</div>`
    });

    if (!modal) return;

    modal.onclick = (e) => {
      const btn = e.target.closest('[data-pid]');
      if (!btn) return;

      const pl = byId(playlists, btn.dataset.pid);
      if (!pl) return;

      uids.forEach((uid) => {
        if (!pl.uids.includes(uid)) {
          pl.uids.push(uid);
          pl.ord.push(uid);
        }
        pl.hid = pl.hid.filter((item) => item !== uid);
      });

      this._saveState();
      W.NotificationSystem?.success?.(`Добавлено треков: ${uids.length}`);
      modal.remove();
    };
  }

  openColorPicker(uid, albumKey = null, playlistId = null) {
    if (uid && !albumKey) albumKey = W.TrackRegistry?.getTrackByUid?.(uid)?.sourceAlbum;

    const current = playlistId
      ? byId(this.state.pls, playlistId)?.col || ''
      : this.state.col[albumKey] || '';

    const modal = W.Modals?.open?.({
      title: playlistId ? 'Цвет плейлиста' : 'Цвет альбома',
      bodyHtml: `
        <div class="showcase-color-picker">
          ${PALETTE.map((color) => `
            <div
              class="showcase-color-dot"
              style="background:${color};${current === color ? 'border-color:#fff;' : ''}"
              data-col="${color}"
            ></div>
          `).join('')}
        </div>
        <button class="showcase-btn" data-col="transparent" style="margin-top:15px;width:100%">Сбросить цвет</button>
      `
    });

    if (!modal) return;

    modal.onclick = (e) => {
      const dot = e.target.closest('[data-col]');
      if (!dot) return;

      const nextColor = dot.dataset.col === 'transparent' ? '' : dot.dataset.col;

      if (playlistId) {
        const pl = byId(this.state.pls, playlistId);
        if (pl) pl.col = nextColor;
        this._saveState();
        this.renderPlaylists();
      } else if (albumKey) {
        this.state.col[albumKey] = nextColor;
        this._saveState();
        if (W.AlbumsManager?.getCurrentAlbum?.() === SHOWCASE_KEY) this.renderList().catch(() => {});
      }

      modal.remove();
    };
  }

  openSort() {
    const ctx = this.getCurrentContext();
    const selected = ctx.sort || 'user';

    const modal = W.Modals?.open?.({
      title: 'Сортировка (Визуальная)',
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button class="showcase-btn ${selected === 'user' ? 'active' : ''}" style="grid-column:1/-1" data-val="user">● Пользовательский (Ручной)</button>
          <button class="showcase-btn ${selected === 'album-desc' ? 'active' : ''}" data-val="album-desc">Альбомы (Новые)</button>
          <button class="showcase-btn ${selected === 'album-asc' ? 'active' : ''}" data-val="album-asc">Альбомы (Старые)</button>
          <button class="showcase-btn ${selected === 'name-asc' ? 'active' : ''}" data-val="name-asc">А → Я</button>
          <button class="showcase-btn ${selected === 'name-desc' ? 'active' : ''}" data-val="name-desc">Я → А</button>
          <button class="showcase-btn ${selected === 'plays-desc' ? 'active' : ''}" data-val="plays-desc">Топ прослушиваний</button>
          <button class="showcase-btn ${selected === 'plays-asc' ? 'active' : ''}" data-val="plays-asc">Меньше всего</button>
          <button class="showcase-btn ${selected === 'last-played' ? 'active' : ''}" data-val="last-played">Недавние</button>
          <button class="showcase-btn ${selected === 'favorites-first' ? 'active' : ''}" data-val="favorites-first">Сначала ⭐</button>
        </div>
      `
    });

    if (!modal) return;

    modal.onclick = (e) => {
      const btn = e.target.closest('[data-val]');
      if (!btn) return;

      const value = this._safeSortMode(btn.dataset.val);

      if (this.state.ctx.type === 'playlist') {
        const pl = byId(this.state.pls, this.state.ctx.id);
        if (pl) pl.sort = value;
      } else {
        this.state.def.sort = value;
      }

      this._saveState();
      modal.remove();
      this.renderTab().catch(() => {});
    };
  }

  handleSharedPlaylist(raw) {
    const source = String(raw || '').trim();
    if (!source) return false;

    try {
      const decoded = JSON.parse(atob(source));
      const name = safeName(decoded?.name, 'Поделились плейлистом');
      const uids = sanitizeUidList(decoded?.uids);
      if (!uids.length) return false;

      const id = now().toString(36);
      this.state.pls.push({
        id,
        name,
        col: '',
        uids: [...uids],
        ord: [...uids],
        hid: [],
        sort: 'user',
        createdAt: now(),
        snap: {
          uids: [...uids],
          ord: [...uids],
          hid: []
        }
      });

      this.state.ctx = { type: 'playlist', id };
      this._saveState();
      this.renderTab().catch(() => {});
      W.NotificationSystem?.success?.('Плейлист импортирован');
      return true;
    } catch {
      W.NotificationSystem?.warning?.('Не удалось открыть shared playlist');
      return false;
    }
  }

  _markDraftDirty() {
    if (!this.draft) return;
    this.draft.dirty = true;
    const btn = $('sc-reset');
    if (btn) btn.disabled = false;
  }

  moveRow(uid, dir) {
    const row = D.querySelector(`.showcase-track[data-uid="${CSS.escape(uid)}"]`);
    const sib = dir === -1 ? row?.previousElementSibling : row?.nextElementSibling;

    if (row && sib?.classList.contains('showcase-track')) {
      if (dir === -1) sib.before(row);
      else sib.after(row);
      this.saveDraftOrderFromDom();
    }
  }

  saveDraftOrderFromDom() {
    if (!this.draft) return;
    this.draft.ord = Array.from(D.querySelectorAll('.showcase-track'))
      .map((node) => node.dataset.uid)
      .filter(Boolean);
    this._markDraftDirty();
  }

  startTouchDrag(e, node) {
    if (!node) return;

    const touch = e.touches[0];
    const clone = node.cloneNode(true);
    const rect = node.getBoundingClientRect();
    const offsetY = touch.clientY - rect.top;

    clone.style.cssText = `
      position:fixed;
      left:${rect.left}px;
      width:${rect.width}px;
      z-index:10000;
      opacity:0.9;
      background:#252d39;
      box-shadow:0 10px 30px rgba(0,0,0,0.8);
      pointer-events:none
    `;

    D.body.appendChild(clone);
    node.style.opacity = '0.3';

    const move = (ev) => {
      ev.preventDefault();
      const y = ev.touches[0].clientY;
      clone.style.top = `${y - offsetY}px`;
      D.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      const over = D.elementFromPoint(W.innerWidth / 2, y)?.closest('.showcase-track');
      if (over && over !== node) over.classList.add('drag-over');
    };

    const end = (ev) => {
      D.removeEventListener('touchmove', move);
      D.removeEventListener('touchend', end);
      clone.remove();
      node.style.opacity = '';

      const y = ev.changedTouches[0].clientY;
      const target = D.elementFromPoint(W.innerWidth / 2, y)?.closest('.showcase-track');

      D.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));

      if (target && target !== node) {
        target.before(node);
        this.saveDraftOrderFromDom();
      }
    };

    D.addEventListener('touchmove', move, { passive: false });
    D.addEventListener('touchend', end);
  }

  bindControls(root) {
    if (this._boundRoot === root) return;
    this._boundRoot = root;

    const applySearch = U.func?.debounceFrame?.(async () => {
      this.searchQuery = String($('sc-search')?.value || '').trim();
      this.searchSel.clear();
      await this.renderList();
      const clearBtn = $('sc-search-clear');
      if (clearBtn) clearBtn.style.display = this.searchQuery ? '' : 'none';
    }) || (async () => {
      this.searchQuery = String($('sc-search')?.value || '').trim();
      this.searchSel.clear();
      await this.renderList();
    });

    root.addEventListener('input', (e) => {
      if (e.target.id === 'sc-search') applySearch();
    });

    root.addEventListener('keydown', (e) => {
      if (e.target.id === 'sc-search' && e.key === 'Enter') e.target.blur();
    });

    const actions = {
      'sc-search-clear': () => {
        const inp = $('sc-search');
        if (inp) {
          inp.value = '';
          inp.blur();
        }
        this.searchQuery = '';
        this.searchSel.clear();
        this.renderList().catch(() => {});
      },
      'sc-edit': () => this.enterEdit(),
      'sc-save': () => this.saveEdit(),
      'sc-create': () => this.createFromEdit(),
      'sc-reset': () => this.resetEdit(),
      'sc-exit': () => this.exitEdit(),
      'sc-playall': () => this.playContext(),
      'sc-shuffle': () => {
        const tracks = this.getActiveListTracks();
        if (!tracks.length) {
          W.NotificationSystem?.warning?.('Нет активных треков');
          return;
        }

        const ctx = this.getCurrentContext();
        W.AlbumsManager?.setPlayingAlbum?.(ctx.isPlaylist ? `__showcase__:${ctx.id}` : SHOWCASE_KEY);
        W.playerCore?.setPlaylist?.(tracks, 0, null, { preservePosition: false });
        W.playerCore?.toggleShuffle?.();
        W.playerCore?.play?.(0);
        W.PlayerUI?.ensurePlayerBlock?.(0, { userInitiated: true });
        this.highlightCurrentTrack(W.playerCore?.getCurrentTrackUid?.());
      },
      'sc-sort': () => this.openSort(),
      'sc-tg-e': () => {
        this.state.ui.hid = !this.state.ui.hid;
        this._saveState();
        this.renderList().catch(() => {});
      },
      'sc-tg-n': () => {
        this.state.ui.num = !this.state.ui.num;
        this._saveState();
        this.renderList().catch(() => {});
      },
      'sc-tg-v': () => {
        this.state.ui.view = this.state.ui.view === 'flat' ? 'grouped' : 'flat';
        this._saveState();
        this.renderList().catch(() => {});
      },
      'sc-b-add': () => {
        const ctx = this.getCurrentContext();

        if (ctx.isPlaylist) {
          const pl = byId(this.state.pls, ctx.id);
          if (pl) {
            [...this.searchSel].forEach((uid) => {
              if (!W.TrackRegistry?.getTrackByUid?.(uid)) return;
              if (!pl.uids.includes(uid)) {
                pl.uids.push(uid);
                pl.ord.push(uid);
              }
              pl.hid = pl.hid.filter((item) => item !== uid);
            });
          }
        } else {
          [...this.searchSel].forEach((uid) => {
            if (!W.TrackRegistry?.getTrackByUid?.(uid)) return;
            if (!this.state.def.ord.includes(uid)) this.state.def.ord.push(uid);
            this.state.def.hid = this.state.def.hid.filter((item) => item !== uid);
          });
        }

        this.searchSel.clear();
        this.searchQuery = '';
        this._saveState();
        this.renderTab().catch(() => {});
        W.NotificationSystem?.success?.('Добавлено в текущий плейлист');
      },
      'sc-b-new': () => this.createFromEdit(true),
      'sc-b-clr': () => {
        this.searchSel.clear();
        this.renderList().catch(() => {});
      }
    };

    root.addEventListener('touchstart', (e) => {
      const dragHandle = e.target.closest('.showcase-drag-handle');
      if (dragHandle && this.draft && !this.searchQuery) {
        e.preventDefault();
        this.startTouchDrag(e, dragHandle.closest('.showcase-track'));
        return;
      }

      const row = e.target.closest('.showcase-track');
      if (row && (this.draft || this.searchQuery) && !e.target.closest('button')) {
        this._wasLongPress = false;
        this._longPressTimer = setTimeout(() => {
          this._wasLongPress = true;
          this.toggleSelection(row.dataset.uid);
          navigator.vibrate?.(50);
        }, 500);
      }
    }, { passive: false });

    root.addEventListener('touchmove', () => clearTimeout(this._longPressTimer), { passive: true });
    root.addEventListener('touchend', () => clearTimeout(this._longPressTimer));

    root.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && actions[button.id]) {
        actions[button.id]();
        return;
      }

      if (this._wasLongPress) return;

      const row = e.target.closest('.showcase-track');
      const uid = row?.dataset.uid;
      if (!row || !uid) return;

      if (this.draft) {
        if (e.target.closest('.showcase-hide-btn')) return this.toggleHidden(uid);
        if (e.target.closest('.sc-arrow-up')) return this.moveRow(uid, -1);
        if (e.target.closest('.sc-arrow-down')) return this.moveRow(uid, 1);
        if (e.target.closest('.showcase-checkbox')) return this.toggleSelection(uid);
        return;
      }

      if (this.searchQuery) {
        if (e.target.closest('.showcase-checkbox')) return this.toggleSelection(uid);
        this.openTrackMenu(uid);
        return;
      }

      if (e.target.closest('.showcase-track-menu-btn')) {
        this.openTrackMenu(uid);
        return;
      }

      if (e.target.closest('.like-star') || e.target.closest('.offline-ind')) {
        this.openTrackMenu(uid);
        return;
      }

      const ctx = this.getCurrentContext();
      if (ctx.hid.includes(uid)) {
        this.openTrackMenu(uid);
        return;
      }

      this.playContext(uid);
    });

    root.addEventListener('dragstart', (e) => {
      if (!this.draft || this.searchQuery) return;
      const row = e.target.closest('.showcase-track');
      if (!row) return;
      e.dataTransfer.setData('text/plain', row.dataset.uid);
      row.classList.add('is-dragging');
    });

    root.addEventListener('dragover', (e) => {
      if (!this.draft || this.searchQuery) return;
      e.preventDefault();
      const row = e.target.closest('.showcase-track');
      if (row) row.classList.add('drag-over');
    });

    root.addEventListener('dragleave', (e) => {
      e.target.closest('.showcase-track')?.classList.remove('drag-over');
    });

    root.addEventListener('drop', (e) => {
      if (!this.draft || this.searchQuery) return;
      e.preventDefault();

      const target = e.target.closest('.showcase-track');
      const draggedUid = e.dataTransfer.getData('text/plain');
      D.querySelectorAll('.drag-over').forEach((node) => node.classList.remove('drag-over'));

      if (target && draggedUid && draggedUid !== target.dataset.uid) {
        const dragged = D.querySelector(`.showcase-track[data-uid="${CSS.escape(draggedUid)}"]`);
        if (dragged) {
          target.before(dragged);
          this.saveDraftOrderFromDom();
        }
      }
    });

    root.addEventListener('dragend', () => {
      D.querySelectorAll('.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
    });
  }

  renderMultiPanel() {
    let panel = $('sc-multi-panel');
    const hasSelection = this.searchQuery ? this.searchSel.size > 0 : false;

    if (!hasSelection) {
      panel?.remove();
      return;
    }

    if (!panel) {
      panel = D.createElement('div');
      panel.id = 'sc-multi-panel';
      panel.className = 'showcase-sticky-bar animate-in';
      D.body.appendChild(panel);
    }

    panel.innerHTML = `
      <span>Выбрано: ${this.searchSel.size}</span>
      <button class="showcase-btn" id="sc-b-add">Добавить в текущий</button>
      <button class="showcase-btn" id="sc-b-new">Создать новый</button>
      <button class="showcase-btn" id="sc-b-clr">Очистить</button>
    `;
  }

  _saveScrollPosition() {
    try {
      const ctx = this.getCurrentContext();
      const key = this._scrollKeyPrefix + (ctx.isPlaylist ? `playlist:${ctx.id}` : 'all');
      localStorage.setItem(key, String(D.documentElement.scrollTop || D.body.scrollTop || 0));
    } catch {}
  }

  _restoreScrollPosition() {
    try {
      const ctx = this.getCurrentContext();
      const key = this._scrollKeyPrefix + (ctx.isPlaylist ? `playlist:${ctx.id}` : 'all');
      const y = Number(localStorage.getItem(key) || 0);
      requestAnimationFrame(() => W.scrollTo(0, Number.isFinite(y) ? y : 0));
    } catch {}
  }

  highlightCurrentTrack(uid) {
    D.querySelectorAll('.showcase-track.current').forEach((node) => node.classList.remove('current'));
    if (!uid) return;
    D.querySelectorAll(`.showcase-track[data-uid="${CSS.escape(uid)}"]`).forEach((node) => node.classList.add('current'));
  }

  renderTabSafe() {
    this.renderTab().catch((e) => {
      console.error('[Showcase] render failed', e);
      W.NotificationSystem?.error?.('Ошибка вкладки Витрина Разбита');
    });
  }
}

W.ShowcaseManager = new ShowcaseManager();
export default W.ShowcaseManager;

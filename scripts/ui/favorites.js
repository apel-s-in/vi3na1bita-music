// scripts/ui/favorites.js
// Единый модуль управления избранным (uid-based)

(function FavoritesModule() {
  'use strict';
  const w = window;

  // === КОНСТАНТЫ ===
  const SPECIAL_FAVORITES_KEY = '__favorites__';
  const SPECIAL_RELIZ_KEY = '__reliz__';
  const LIKED_UID_KEY = 'likedTrackUids:v1';
  const REFS_UID_KEY = 'favoritesAlbumRefsByUid:v1';
  const COVER_TTL_MS = 12 * 60 * 60 * 1000;

  w.SPECIAL_FAVORITES_KEY = SPECIAL_FAVORITES_KEY;
  w.SPECIAL_RELIZ_KEY = SPECIAL_RELIZ_KEY;

  // === STORAGE ===
  const albumCoverCache = Object.create(null);

  function getLikedUidMap() {
    try {
      const raw = localStorage.getItem(LIKED_UID_KEY);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch { return {}; }
  }

  function setLikedUidMap(map) {
    try { localStorage.setItem(LIKED_UID_KEY, JSON.stringify(map || {})); } catch {}
  }

  function getLikedUidsForAlbum(albumKey) {
    const map = getLikedUidMap();
    const arr = map[albumKey];
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map(x => String(x || '').trim()).filter(Boolean))];
  }

  function isFavorite(albumKey, trackUid) {
    const a = String(albumKey || '').trim();
    const uid = String(trackUid || '').trim();
    return a && uid && getLikedUidsForAlbum(a).includes(uid);
  }

  function toggleLike(albumKey, trackUid, makeLiked = null) {
    const a = String(albumKey || '').trim();
    const uid = String(trackUid || '').trim();
    if (!a || !uid) return false;

    const map = getLikedUidMap();
    let arr = [...new Set((map[a] || []).map(x => String(x || '').trim()).filter(Boolean))];
    const has = arr.includes(uid);
    const shouldLike = makeLiked !== null ? !!makeLiked : !has;

    if (shouldLike && !has) arr.push(uid);
    else if (!shouldLike && has) arr = arr.filter(x => x !== uid);

    map[a] = [...new Set(arr)];
    setLikedUidMap(map);

    try { w.dispatchEvent(new CustomEvent('favorites:changed', { detail: { albumKey: a, uid, liked: shouldLike } })); } catch {}
    return true;
  }

  // === REFS ===
  function readRefs() {
    try {
      const raw = localStorage.getItem(REFS_UID_KEY);
      return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function writeRefs(arr) {
    try { localStorage.setItem(REFS_UID_KEY, JSON.stringify(arr || [])); } catch {}
  }

  function ensureRefsWithLikes() {
    const refs = readRefs();
    const seen = new Set(refs.map(x => `${x?.a}:${x?.uid}`));
    const map = getLikedUidMap();
    let changed = false;

    for (const a of Object.keys(map)) {
      for (const uid of (map[a] || [])) {
        const u = String(uid || '').trim();
        if (!u) continue;
        const k = `${a}:${u}`;
        if (!seen.has(k)) { refs.push({ a, uid: u }); seen.add(k); changed = true; }
      }
    }
    if (changed) writeRefs(refs);
    return refs;
  }

  function removeRef(albumKey, uid) {
    const a = String(albumKey || '').trim();
    const u = String(uid || '').trim();
    if (!a || !u) return false;
    const refs = readRefs().filter(r => !(r?.a === a && String(r?.uid || '').trim() === u));
    writeRefs(refs);
    return true;
  }

  // === MODEL ===
  async function buildModel() {
    ensureRefsWithLikes();
    const refs = readRefs();
    const out = [];
    const albumsIndex = w.albumsIndex || [];

    for (const ref of refs) {
      const a = String(ref?.a || '').trim();
      const uid = String(ref?.uid || '').trim();
      if (!a || !uid) continue;

      const meta = albumsIndex.find(x => x?.key === a);
      if (!meta?.base) continue;

      let cfg = null;
      try {
        const base = meta.base.endsWith('/') ? meta.base : `${meta.base}/`;
        const r = await fetch(`${base}config.json`, { cache: 'no-cache' });
        if (r.ok) cfg = await r.json();
      } catch {}

      const tracks = cfg?.tracks || [];
      const tr = tracks.find(t => String(t?.uid || '').trim() === uid);
      const isActive = getLikedUidsForAlbum(a).includes(uid);
      const base = meta.base.endsWith('/') ? meta.base : `${meta.base}/`;

      out.push({
        title: tr?.title || 'Трек',
        uid,
        audio: isActive && tr?.audio ? new URL(tr.audio, base).toString() : null,
        lyrics: isActive && tr?.lyrics ? new URL(tr.lyrics, base).toString() : null,
        fulltext: isActive && tr?.fulltext ? new URL(tr.fulltext, base).toString() : null,
        __a: a, __uid: uid, __active: isActive,
        __artist: cfg?.artist || 'Витрина Разбита',
        __album: cfg?.albumName || 'Альбом',
        __cover: 'img/logo.png'
      });
    }
    w.favoritesRefsModel = out;
    return out;
  }

  // === MODALS ===
  function createModalBg(html) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg active';
    bg.innerHTML = html;
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  function showDeleteConfirm(params) {
    const { albumKey, uid, title, onDeleted } = params || {};
    if (!albumKey || !uid) return;

    const modal = createModalBg(`
      <div class="modal-feedback" style="max-width:420px">
        <button class="bigclose" aria-label="Закрыть">×</button>
        <h3>Удалить из «ИЗБРАННОГО»?</h3>
        <p><strong>${escapeHtml(title)}</strong></p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
          <button class="offline-btn" data-act="cancel">Отмена</button>
          <button class="offline-btn online" data-act="delete">Удалить</button>
        </div>
      </div>
    `);

    modal.querySelector('.bigclose')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-act="cancel"]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      removeRef(albumKey, uid);
      document.getElementById(`fav_${albumKey}_${uid}`)?.remove();
      modal.remove();
      w.NotificationSystem?.success('Удалено');
      onDeleted?.();
    });
  }

  function showInactiveModal(params) {
    const { albumKey, uid, title, onDeleted } = params || {};
    if (!albumKey || !uid) return;

    const modal = createModalBg(`
      <div class="modal-feedback" style="max-width:420px">
        <button class="bigclose" aria-label="Закрыть">×</button>
        <h3>Трек неактивен</h3>
        <p><strong>${escapeHtml(title)}</strong></p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
          <button class="offline-btn online" data-act="add">Добавить в ⭐</button>
          <button class="offline-btn" data-act="remove">Удалить</button>
        </div>
      </div>
    `);

    modal.querySelector('.bigclose')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-act="add"]')?.addEventListener('click', () => {
      toggleLike(albumKey, uid, true);
      modal.remove();
      w.NotificationSystem?.success('Добавлено в ⭐');
    });
    modal.querySelector('[data-act="remove"]')?.addEventListener('click', () => {
      modal.remove();
      showDeleteConfirm({ albumKey, uid, title, onDeleted });
    });
  }

  // === INIT ===
  function initialize() {
    try {
      const raw = localStorage.getItem(LIKED_UID_KEY);
      if (!raw) setLikedUidMap({});
    } catch {}
    console.log('✅ FavoritesManager initialized');
  }

  // === EXPORTS ===
  w.FavoritesManager = {
    initialize,
    getLikedUidMap,
    getLikedUidsForAlbum,
    isFavorite,
    toggleLike
  };

  w.FavoritesData = {
    readFavoritesRefsByUid: readRefs,
    writeFavoritesRefsByUid: writeRefs,
    ensureFavoritesRefsWithLikes: ensureRefsWithLikes,
    buildFavoritesRefsModel: buildModel,
    removeFavoritesRef: removeRef,
    showFavoritesInactiveModal: showInactiveModal,
    showFavoritesDeleteConfirm: showDeleteConfirm
  };

  w.buildFavoritesRefsModel = buildModel;
  w.openFavoritesView = async () => w.AlbumsManager?.loadAlbum(SPECIAL_FAVORITES_KEY);

  // Legacy compat
  w.getLikedMap = getLikedUidMap;
  w.getLikedForAlbum = getLikedUidsForAlbum;
  w.toggleLikeForAlbum = (a, uid, liked) => toggleLike(a, uid, liked);
})();

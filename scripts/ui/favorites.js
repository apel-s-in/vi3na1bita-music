// scripts/ui/favorites.js — Управление избранным
(function() {
  'use strict';
  const KEY = 'likedTrackUids:v1';
  const REFS_KEY = 'favoritesAlbumRefsByUid:v1';
  
  const getMap = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const setMap = m => { try { localStorage.setItem(KEY, JSON.stringify(m || {})); } catch {} };
  
  const getLiked = album => { const arr = getMap()[album]; return Array.isArray(arr) ? [...new Set(arr.map(x => String(x||'').trim()).filter(Boolean))] : []; };
  const isFav = (album, uid) => album && uid && getLiked(album).includes(String(uid).trim());
  
  const toggle = (album, uid, liked = null) => {
    const a = String(album||'').trim(), u = String(uid||'').trim();
    if (!a || !u) return false;
    const map = getMap();
    let arr = [...new Set((map[a]||[]).map(x => String(x||'').trim()).filter(Boolean))];
    const has = arr.includes(u), shouldLike = liked !== null ? !!liked : !has;
    if (shouldLike && !has) arr.push(u);
    else if (!shouldLike && has) arr = arr.filter(x => x !== u);
    map[a] = [...new Set(arr)];
    setMap(map);
    try { window.dispatchEvent(new CustomEvent('favorites:changed', { detail: { albumKey: a, uid: u, liked: shouldLike } })); } catch {}
    return true;
  };
  
  // Refs
  const readRefs = () => { try { return JSON.parse(localStorage.getItem(REFS_KEY)) || []; } catch { return []; } };
  const writeRefs = arr => { try { localStorage.setItem(REFS_KEY, JSON.stringify(arr || [])); } catch {} };
  
  const ensureRefs = () => {
    const refs = readRefs(), seen = new Set(refs.map(x => `${x?.a}:${x?.uid}`)), map = getMap();
    let changed = false;
    for (const a of Object.keys(map)) {
      for (const uid of (map[a] || [])) {
        const u = String(uid||'').trim(), k = `${a}:${u}`;
        if (u && !seen.has(k)) { refs.push({ a, uid: u }); seen.add(k); changed = true; }
      }
    }
    if (changed) writeRefs(refs);
    return refs;
  };
  
  const removeRef = (album, uid) => {
    const a = String(album||'').trim(), u = String(uid||'').trim();
    if (!a || !u) return false;
    writeRefs(readRefs().filter(r => !(r?.a === a && String(r?.uid||'').trim() === u)));
    return true;
  };
  
  // Build model
  async function buildModel() {
    ensureRefs();
    const refs = readRefs(), out = [], idx = window.albumsIndex || [];
    for (const ref of refs) {
      const a = String(ref?.a||'').trim(), uid = String(ref?.uid||'').trim();
      if (!a || !uid) continue;
      const meta = idx.find(x => x?.key === a);
      if (!meta?.base) continue;
      let cfg = null;
      try {
        const base = meta.base.endsWith('/') ? meta.base : `${meta.base}/`;
        const r = await fetch(`${base}config.json`, { cache: 'no-cache' });
        if (r.ok) cfg = await r.json();
      } catch {}
      const tracks = cfg?.tracks || [], tr = tracks.find(t => String(t?.uid||'').trim() === uid);
      const isActive = getLiked(a).includes(uid), base = meta.base.endsWith('/') ? meta.base : `${meta.base}/`;
      out.push({
        title: tr?.title || 'Трек', uid,
        audio: isActive && tr?.audio ? new URL(tr.audio, base).toString() : null,
        lyrics: isActive && tr?.lyrics ? new URL(tr.lyrics, base).toString() : null,
        fulltext: isActive && tr?.fulltext ? new URL(tr.fulltext, base).toString() : null,
        __a: a, __uid: uid, __active: isActive,
        __artist: cfg?.artist || 'Витрина Разбита',
        __album: cfg?.albumName || 'Альбом', __cover: 'img/logo.png'
      });
    }
    window.favoritesRefsModel = out;
    return out;
  }
  
  // Modals
  const esc = s => { const d = document.createElement('div'); d.textContent = String(s||''); return d.innerHTML; };
  
  const createModal = html => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg active';
    bg.innerHTML = html;
    bg.addEventListener('click', e => e.target === bg && bg.remove());
    document.body.appendChild(bg);
    return bg;
  };
  
  const showDelete = ({ albumKey, uid, title, onDeleted }) => {
    if (!albumKey || !uid) return;
    const m = createModal(`<div class="modal-feedback" style="max-width:420px"><button class="bigclose">×</button><h3>Удалить из избранного?</h3><p><strong>${esc(title)}</strong></p><div style="display:flex;gap:10px;justify-content:center;margin-top:16px"><button class="offline-btn" data-act="cancel">Отмена</button><button class="offline-btn online" data-act="delete">Удалить</button></div></div>`);
    m.querySelector('.bigclose')?.addEventListener('click', () => m.remove());
    m.querySelector('[data-act="cancel"]')?.addEventListener('click', () => m.remove());
    m.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      removeRef(albumKey, uid);
      document.getElementById(`fav_${albumKey}_${uid}`)?.remove();
      m.remove();
      window.NotificationSystem?.success('Удалено');
      onDeleted?.();
    });
  };
  
  const showInactive = ({ albumKey, uid, title, onDeleted }) => {
    if (!albumKey || !uid) return;
    const m = createModal(`<div class="modal-feedback" style="max-width:420px"><button class="bigclose">×</button><h3>Трек неактивен</h3><p><strong>${esc(title)}</strong></p><div style="display:flex;gap:10px;justify-content:center;margin-top:16px"><button class="offline-btn online" data-act="add">Добавить ⭐</button><button class="offline-btn" data-act="remove">Удалить</button></div></div>`);
    m.querySelector('.bigclose')?.addEventListener('click', () => m.remove());
    m.querySelector('[data-act="add"]')?.addEventListener('click', () => { toggle(albumKey, uid, true); m.remove(); window.NotificationSystem?.success('Добавлено ⭐'); });
    m.querySelector('[data-act="remove"]')?.addEventListener('click', () => { m.remove(); showDelete({ albumKey, uid, title, onDeleted }); });
  };
  
  const init = () => { try { if (!localStorage.getItem(KEY)) setMap({}); } catch {} console.log('✅ FavoritesManager initialized'); };
  
  window.FavoritesManager = { initialize: init, getLikedUidMap: getMap, getLikedUidsForAlbum: getLiked, isFavorite: isFav, toggleLike: toggle };
  window.FavoritesData = { readFavoritesRefsByUid: readRefs, writeFavoritesRefsByUid: writeRefs, ensureFavoritesRefsWithLikes: ensureRefs, buildFavoritesRefsModel: buildModel, removeFavoritesRef: removeRef, showFavoritesInactiveModal: showInactive, showFavoritesDeleteConfirm: showDelete };
  window.buildFavoritesRefsModel = buildModel;
  window.openFavoritesView = async () => window.AlbumsManager?.loadAlbum('__favorites__');
})();

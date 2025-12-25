// scripts/ui/favorites-data.js
// Data-хелперы «Избранного» + модель refs по UID + миграция legacy refs.
// Поведение oldstar:
// - refs (список строк) живут отдельно
// - лайк (likedTrackUids:v1) определяет активность строки
// - снятие ⭐ НЕ удаляет ref (удаление только через модалку)

(function FavoritesDataModule() {
  const w = window;

  const LEGACY_REFS_KEY = w.FAVORITES_REFS_KEY || 'favoritesAlbumRefs:v1'; // {a, t:number}
  const REFS_UID_KEY = 'favoritesAlbumRefsByUid:v1'; // {a, uid:string}

  const COVER_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
  const albumCoverCache = Object.create(null);

  const absJoin = typeof w.absJoin === 'function'
    ? w.absJoin
    : ((b, r) => new URL(String(r || ''), String(b || '') + '/').toString());

  function getLikedUidMap() {
    if (w.FavoritesManager && typeof w.FavoritesManager.getLikedUidMap === 'function') {
      return w.FavoritesManager.getLikedUidMap();
    }
    // fallback: прямое чтение
    try {
      const raw = localStorage.getItem('likedTrackUids:v1');
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch {
      return {};
    }
  }

  function getLikedUidsForAlbum(albumKey) {
    try {
      const map = getLikedUidMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      if (!Array.isArray(arr)) return [];
      return Array.from(new Set(arr.map(x => String(x || '').trim()).filter(Boolean)));
    } catch {
      return [];
    }
  }

  function readFavoritesRefsByUid() {
    try {
      const raw = localStorage.getItem(REFS_UID_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writeFavoritesRefsByUid(arr) {
    try {
      localStorage.setItem(REFS_UID_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  }

  async function migrateLegacyRefsIfNeeded() {
    // Если новый ключ уже есть — не трогаем
    try {
      const already = localStorage.getItem(REFS_UID_KEY);
      if (already) return;
    } catch {}

    // Если legacy нет — создадим пустой
    let legacyRaw = null;
    try { legacyRaw = localStorage.getItem(LEGACY_REFS_KEY); } catch {}
    if (!legacyRaw) {
      writeFavoritesRefsByUid([]);
      return;
    }

    let legacy = null;
    try { legacy = JSON.parse(legacyRaw); } catch { legacy = []; }
    if (!Array.isArray(legacy) || legacy.length === 0) {
      writeFavoritesRefsByUid([]);
      return;
    }

    const albumsIndex = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];
    if (!albumsIndex.length) {
      // нет индекса — миграцию отложим, но чтобы не сломаться создадим пустое
      writeFavoritesRefsByUid([]);
      return;
    }

    const out = [];
    const seen = new Set();

    for (const ref of legacy) {
      const a = String(ref?.a || '').trim();
      const t = parseInt(ref?.t, 10);
      if (!a || !Number.isFinite(t)) continue;

      const meta = albumsIndex.find(x => x && x.key === a);
      if (!meta || !meta.base) continue;

      let cfg = null;
      try {
        const r = await fetch(absJoin(meta.base, 'config.json'), { cache: 'no-cache' });
        if (!r.ok) continue;
        cfg = await r.json();
      } catch {
        continue;
      }

      const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
      const tr = tracks[t] || null; // legacy refs использовали 0-based index
      const uid = String(tr?.uid || '').trim();
      if (!uid) continue;

      const k = `${a}:${uid}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ a, uid });
    }

    writeFavoritesRefsByUid(out);
  }

  function addFavoritesRefIfMissing(albumKey, uid) {
      // Делегирование в FavoritesManager
      if (w.FavoritesManager && typeof w.FavoritesManager.addRef === 'function') {
          return w.FavoritesManager.addRef(albumKey, uid);
      }
      // Fallback для обратной совместимости, если FavoritesManager недоступен
      const a = String(albumKey || '').trim();
      const u = String(uid || '').trim();
      if (!a || !u) return false;
      const refs = readFavoritesRefsByUid();
      const exists = refs.some(r => r && r.a === a && String(r.uid || '').trim() === u);
      if (exists) return false;
      refs.push({ a, uid: u });
      writeFavoritesRefsByUid(refs);
      return true;
  }

  function removeFavoritesRef(albumKey, uid) {
      // Делегирование в FavoritesManager
      if (w.FavoritesManager && typeof w.FavoritesManager.removeRef === 'function') {
          return w.FavoritesManager.removeRef(albumKey, uid);
      }
      // Fallback для обратной совместимости, если FavoritesManager недоступен
      const a = String(albumKey || '').trim();
      const u = String(uid || '').trim();
      if (!a || !u) return false;
      const refs = readFavoritesRefsByUid();
      const next = refs.filter(r => !(r && r.a === a && String(r.uid || '').trim() === u));
      writeFavoritesRefsByUid(next);
      if (Array.isArray(w.favoritesRefsModel)) {
          w.favoritesRefsModel = w.favoritesRefsModel.filter(it => !(it && it.__a === a && it.__uid === u));
      }
      return next.length !== refs.length;
  }

  function getSortedFavoritesRefsByUid() {
    const refs = readFavoritesRefsByUid().slice();

    const order = (w.ICON_ALBUMS_ORDER || []).map(x => x.key)
      .filter(k => k !== w.SPECIAL_FAVORITES_KEY && k !== w.SPECIAL_RELIZ_KEY);
    const orderMap = new Map(order.map((k, i) => [k, i]));

    refs.sort((r1, r2) => {
      const o1 = orderMap.has(r1.a) ? orderMap.get(r1.a) : 999;
      const o2 = orderMap.has(r2.a) ? orderMap.get(r2.a) : 999;
      if (o1 !== o2) return o1 - o2;
      return String(r1.uid || '').localeCompare(String(r2.uid || ''));
    });

    return refs;
  }

  async function getAlbumConfigByKey(albumKey) {
    if (!albumKey) return null;

    const albumConfigCache = w.albumConfigCache || {};

    if (albumConfigCache[albumKey]?.config) return albumConfigCache[albumKey].config;

    const albumsIndex = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];
    const meta = albumsIndex.find(a => a && a.key === albumKey) || null;
    if (!meta) return null;

    try {
      const r = await fetch(absJoin(meta.base, 'config.json'), { cache: 'no-cache' });
      if (!r.ok) return null;
      const data = await r.json();

      // нормализуем пути (как раньше)
      (data.tracks || []).forEach(t => {
        if (t.audio) t.audio = absJoin(meta.base, t.audio);
        if (t.lyrics) t.lyrics = absJoin(meta.base, t.lyrics);
        if (t.fulltext) t.fulltext = absJoin(meta.base, t.fulltext);
      });

      albumConfigCache[albumKey] = { base: meta.base, config: data };
      w.albumConfigCache = albumConfigCache;

      return data;
    } catch {
      return null;
    }
  }

  async function getAlbumCoverUrl(albumKey) {
    const now = Date.now();

    try {
      const sKey = `favCoverCache:v1:${albumKey}`;
      const raw = sessionStorage.getItem(sKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.url && obj.ts && (now - obj.ts) < COVER_TTL_MS) {
          albumCoverCache[albumKey] = { url: obj.url, ts: obj.ts };
          return obj.url;
        }
      }
    } catch {}

    const cache = albumCoverCache[albumKey];
    if (cache && (now - cache.ts) < COVER_TTL_MS) return cache.url;

    // ✅ Обложка: берём первую картинку центральной галереи через GalleryManager (единый источник)
    try {
      const url = await w.GalleryManager?.getFirstCoverUrl?.(albumKey);
      const safe = (url && typeof url === 'string') ? url : 'img/logo.png';
      albumCoverCache[albumKey] = { url: safe, ts: now };
      try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url: safe, ts: now })); } catch {}
      return safe;
    } catch {}

    albumCoverCache[albumKey] = { url: 'img/logo.png', ts: now };
    try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url: 'img/logo.png', ts: now })); } catch {}
    return 'img/logo.png';
  }

  async function buildFavoritesRefsModel() {
    await migrateLegacyRefsIfNeeded();

    const refs = getSortedFavoritesRefsByUid();
    const out = [];

    for (const ref of refs) {
      const a = String(ref?.a || '').trim();
      const uid = String(ref?.uid || '').trim();
      if (!a || !uid) continue;

      let cfg = null;
      try { cfg = await getAlbumConfigByKey(a); } catch {}

      const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
      const tr = tracks.find(t => String(t?.uid || '').trim() === uid) || null;

      const cover = await getAlbumCoverUrl(a);
      const isActive = getLikedUidsForAlbum(a).includes(uid);

      out.push({
        title: tr?.title || 'Трек',
        uid,
        audio: (isActive && tr?.audio) ? tr.audio : null,
        lyrics: (isActive && tr?.lyrics) ? tr.lyrics : null,
        fulltext: (isActive && tr?.fulltext) ? (tr.fulltext || null) : null,
        __a: a,
        __uid: uid,
        __artist: cfg?.artist || 'Витрина Разбита',
        __album: cfg?.albumName || 'Альбом',
        __active: isActive,
        __cover: cover
      });
    }

    w.favoritesRefsModel = out;
    return out;
  }

  function updateFavoritesRefsModelActiveFlag(albumKey, uid, isActive) {
    const a = String(albumKey || '').trim();
    const u = String(uid || '').trim();
    const model = w.favoritesRefsModel;
    if (!a || !u || !Array.isArray(model)) return;

    const item = model.find(x => x && x.__a === a && x.__uid === u);
    if (!item) return;

    item.__active = !!isActive;

    if (item.__active) {
      // При активации — данные подхватятся при следующем buildFavoritesRefsModel,
      // но для realtime можно оставить как есть (UI обновит классы/звёзды).
    } else {
      item.audio = null;
      item.lyrics = null;
      item.fulltext = null;
    }
  }

  // removeFavoritesRef реализован выше как removeFavoritesRef(albumKey, uid)

  function showFavoritesInactiveModal(params) {
    const albumKey = String(params?.albumKey || '').trim();
    const uid = String(params?.uid || '').trim();
    const title = String(params?.title || 'Трек');
    if (!albumKey || !uid) return;

    const esc = w.Utils?.escapeHtml
      ? (s) => w.Utils.escapeHtml(String(s || ''))
      : (s) => String(s || '');

    const html = `
      <div class="modal-feedback" style="max-width: 420px;">
        <button class="bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>

        <div style="font-size: 1.08em; font-weight: 900; color: #eaf2ff; margin-bottom: 10px;">
          Трек неактивен
        </div>

        <div style="color:#9db7dd; line-height:1.45; margin-bottom: 14px;">
          <div style="margin-bottom: 8px;"><strong>Трек:</strong> ${esc(title)}</div>
          <div style="opacity:.9;">
            Вы можете вернуть трек в ⭐ или удалить его из списка «ИЗБРАННОЕ».
          </div>
        </div>

        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn online" data-act="add" style="min-width: 160px;">Добавить в ⭐</button>
          <button class="offline-btn" data-act="remove" style="min-width: 160px;">Удалить</button>
        </div>
      </div>
    `;

    const modal = (w.Utils && typeof w.Utils.createModal === 'function')
      ? w.Utils.createModal(html)
      : null;

    // Fallback (если Utils ещё не готов) — не падаем
    if (!modal) return;

    modal.querySelector('[data-act="add"]')?.addEventListener('click', () => {
      if (w.FavoritesManager && typeof w.FavoritesManager.toggleLike === 'function') {
        w.FavoritesManager.toggleLike(albumKey, uid, true);
      }
      try { modal.remove(); } catch {}
    });

    modal.querySelector('[data-act="remove"]')?.addEventListener('click', () => {
      try { modal.remove(); } catch {}
      showFavoritesDeleteConfirm({ albumKey, uid, title, onDeleted: params?.onDeleted });
    });
  }

  function showFavoritesDeleteConfirm(params) {
    const albumKey = String(params?.albumKey || '').trim();
    const uid = String(params?.uid || '').trim();
    const title = String(params?.title || 'Трек');
    if (!albumKey || !uid) return;

    const esc = w.Utils?.escapeHtml
      ? (s) => w.Utils.escapeHtml(String(s || ''))
      : (s) => String(s || '');

    const html = `
      <div class="modal-feedback" style="max-width: 420px;">
        <button class="bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>

        <div style="font-size: 1.08em; font-weight: 900; color: #eaf2ff; margin-bottom: 10px;">
          Удалить из «ИЗБРАННОГО»?
        </div>

        <div style="color:#9db7dd; line-height:1.45; margin-bottom: 14px;">
          <div style="margin-bottom: 8px;"><strong>Трек:</strong> ${esc(title)}</div>
          <div style="opacity:.9;">
            Трек исчезнет из списка «ИЗБРАННОЕ». Лайк (⭐) можно оставить/снять отдельно.
          </div>
        </div>

        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn" data-act="cancel" style="min-width: 130px;">Отмена</button>
          <button class="offline-btn online" data-act="delete" style="min-width: 130px;">Удалить</button>
        </div>
      </div>
    `;

    const modal = (w.Utils && typeof w.Utils.createModal === 'function')
      ? w.Utils.createModal(html)
      : null;

    if (!modal) return;

    modal.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      try { modal.remove(); } catch {}
    });

    modal.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      let success = false;

      if (w.FavoritesManager && typeof w.FavoritesManager.removeRef === 'function') {
        success = w.FavoritesManager.removeRef(albumKey, uid, { source: 'favoritesModal' });
      } else {
        success = removeFavoritesRef(albumKey, uid);
      }

      try { modal.remove(); } catch {}

      if (success) {
        w.NotificationSystem?.success('Удалено из «ИЗБРАННОГО»');
        if (typeof params?.onDeleted === 'function') params.onDeleted();
      } else {
        w.NotificationSystem?.error('Не удалось удалить');
      }
    });
  }

  // Realtime: при изменении лайков — ТОЛЬКО обновляем модель (active/inactive),
  // но НЕ управляем refs здесь. Управление refs — единая ответственность FavoritesManager.
  window.addEventListener('favorites:changed', (e) => {
    const d = e?.detail || {};
    const a = String(d.albumKey || '').trim();
    const uid = String(d.uid || '').trim();
    const liked = !!d.liked;
    if (!a || !uid) return;

    try {
      updateFavoritesRefsModelActiveFlag(a, uid, liked);
    } catch {}
  });

  w.FavoritesData = {
    // refs
    readFavoritesRefsByUid,
    writeFavoritesRefsByUid,
    addFavoritesRefIfMissing,
    removeFavoritesRef,
    getSortedFavoritesRefsByUid,

    // model builder
    buildFavoritesRefsModel,
    updateFavoritesRefsModelActiveFlag,

    // covers/config
    getAlbumConfigByKey,
    getAlbumCoverUrl,

    // удаление ref только через модалку
    removeFavoritesRef,
    showFavoritesInactiveModal,
    showFavoritesDeleteConfirm
  };

  // Back-compat имена (чтобы AlbumsManager не падал)
  w.buildFavoritesRefsModel = buildFavoritesRefsModel;
  w.updateFavoritesRefsModelActiveFlag = updateFavoritesRefsModelActiveFlag;
})();

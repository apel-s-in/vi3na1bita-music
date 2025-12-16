// scripts/ui/favorites-data.js
// Data-хелперы «Избранного» + TTL-кэш обложек.
// Экспортирует совместимые функции в window.* для обратной совместимости.

(function FavoritesDataModule() {
  const w = window;

  const FAVORITES_REFS_KEY = window.FAVORITES_REFS_KEY || 'favoritesAlbumRefs:v1';
  const COVER_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
  const albumCoverCache = Object.create(null);

  function getLikedMap() {
    try { const raw = localStorage.getItem('likedTracks:v2'); const obj = raw ? JSON.parse(raw) : {}; return obj && typeof obj === 'object' ? obj : {}; }
    catch { return {}; }
  }
  
  function getLikedForAlbum(albumKey) {
    try {
      const map = getLikedMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      if (!Array.isArray(arr)) return [];
      const norm = Array.from(new Set(arr.map(n => parseInt(n, 10)).filter(Number.isFinite)));
      return norm;
    } catch {
      return [];
    }
  }

  function readFavoritesRefs() {
    try { const raw = localStorage.getItem(FAVORITES_REFS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
    catch { return []; }
  }
  
  function writeFavoritesRefs(arr) {
    try { localStorage.setItem(FAVORITES_REFS_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch {}
  }

  function ensureFavoritesRefsWithLikes() {
    const refs = readFavoritesRefs();
    const keySet = new Set(refs.map(x => `${x.a}:${x.t}`));

    try {
      const map = getLikedMap();
      const albumsIndex = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];

      const indexKeys = albumsIndex.map(a => a && a.key).filter(Boolean);
      const likedKeys = Object.keys(map || {});
      const allKeysSet = new Set([...indexKeys, ...likedKeys]);

      for (const akey of allKeysSet) {
        const liked = Array.isArray(map?.[akey]) ? map[akey] : [];
        for (const ti of liked) {
          const k = `${akey}:${ti}`;
          if (!keySet.has(k)) {
            refs.push({ a: akey, t: ti });
            keySet.add(k);
          }
        }
      }
    } catch {}

    writeFavoritesRefs(refs);
    return refs;
  }

  function getSortedFavoritesRefs() {
    const refs = ensureFavoritesRefsWithLikes().slice();
    const ICON_ALBUMS_ORDER = (w.ICON_ALBUMS_ORDER || []).map(x => x.key)
      .filter(k => k !== w.SPECIAL_FAVORITES_KEY && k !== w.SPECIAL_RELIZ_KEY);
    const orderMap = new Map(ICON_ALBUMS_ORDER.map((k, i) => [k, i]));
    refs.sort((r1, r2) => {
      const o1 = orderMap.has(r1.a) ? orderMap.get(r1.a) : 999;
      const o2 = orderMap.has(r2.a) ? orderMap.get(r2.a) : 999;
      if (o1 !== o2) return o1 - o2;
      return (r1.t - r2.t);
    });
    return refs;
  }

  async function getAlbumConfigByKey(albumKey) {
    if (!albumKey) return null;
    const albumConfigCache = w.albumConfigCache || {};

    let realKey = albumKey;
    if (typeof w.resolveRealAlbumKey === 'function') {
      try {
        const cand = w.resolveRealAlbumKey(albumKey);
        if (cand) realKey = cand;
      } catch {}
    }

    if (albumConfigCache[albumKey]?.config) return albumConfigCache[albumKey].config;
    if (albumConfigCache[realKey]?.config)  return albumConfigCache[realKey].config;

    const albumsIndex = w.albumsIndex || [];
    const meta = (albumsIndex.find(a => a && a.key === realKey) ||
                  albumsIndex.find(a => a && a.key === albumKey)) || null;
    if (!meta) return null;

    const base = (typeof w.normalizeBase === 'function') ? w.normalizeBase(meta.base) : meta.base;
    const absJoin = typeof w.absJoin === 'function'
      ? w.absJoin
      : ((b, r) => new URL(String(r || ''), String(b || '') + '/').toString());

    try {
      const r = await fetch(absJoin(base, 'config.json'), { cache: 'no-cache' });
      if (!r || !r.ok) return null;
      const data = await r.json();
      (data.tracks || []).forEach(t => {
        t.audio   = absJoin(base, t.audio);
        t.lyrics  = absJoin(base, t.lyrics);
        if (t.fulltext) t.fulltext = absJoin(base, t.fulltext);
      });

      albumConfigCache[realKey]  = { base, config: data };
      albumConfigCache[albumKey] = { base, config: data };
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

    try {
      const centralIdForAlbumKey = w.centralIdForAlbumKey;
      const normalizeGalleryItem = w.normalizeGalleryItem;
      const CENTRAL_GALLERY_BASE = w.CENTRAL_GALLERY_BASE || './albums/gallery/';
      const cid = typeof centralIdForAlbumKey === 'function' ? centralIdForAlbumKey(albumKey) : null;
      if (!cid) {
        albumCoverCache[albumKey] = { url: 'img/logo.png', ts: now };
        try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url: 'img/logo.png', ts: now })); } catch {}
        return 'img/logo.png';
      }
      const baseDir = `${CENTRAL_GALLERY_BASE}${cid}/`;
      const r = await fetch(baseDir + 'index.json', { cache: 'force-cache' });
      if (r.ok) {
        const j = await r.json();
        const first = Array.isArray(j.items) ? j.items[0] : (Array.isArray(j) ? j[0] : null);
        if (first) {
          const norm = typeof normalizeGalleryItem === 'function' ? normalizeGalleryItem(first, baseDir) : first;
          const url = (norm && (norm.formats?.webp || norm.formats?.full || norm.src)) || 'img/logo.png';
          albumCoverCache[albumKey] = { url, ts: now };
          try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url, ts: now })); } catch {}
          return url;
        }
      }
    } catch {}

    albumCoverCache[albumKey] = { url: 'img/logo.png', ts: now };
    try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url: 'img/logo.png', ts: now })); } catch {}
    return 'img/logo.png';
  }

  async function buildFavoritesRefsModel() {
    const sortedRefs = getSortedFavoritesRefs();
    const out = [];

    for (const ref of sortedRefs) {
      const active = getLikedForAlbum(ref.a).includes(ref.t);

      let cfg = null;
      try { cfg = await getAlbumConfigByKey(ref.a); } catch {}
      const tr = cfg?.tracks?.[ref.t] || null;

      const cover = await getAlbumCoverUrl(ref.a);

      if (tr && tr.audio) {
        out.push({
          title: tr.title,
          audio: tr.audio,
          lyrics: tr.lyrics,
          fulltext: tr.fulltext || null,
          __a: ref.a,
          __t: ref.t,
          __artist: cfg?.artist || 'Витрина Разбита',
          __album: cfg?.albumName || 'Альбом',
          __active: active,
          __cover: cover
        });
        continue;
      }

      // ⚠️ Трек не найден (альбом недоступен / config.json не загрузился / индекс вне диапазона).
      // ВАЖНО: НЕ трогаем likedTracks:v2 автоматически — refs могут быть неактивными.
      console.warn(`⚠️ Track not found: album=${ref.a}, track=${ref.t}`);

      // Добавляем “неактивную” строку в модель, чтобы UI мог:
      // - показать её серой,
      // - предложить “Добавить в ⭐” или “Удалить” через модалку,
      // - дать возможность очистить refs кнопкой “Удалить недоступные”.
      out.push({
        title: `Трек ${ref.t}`,
        audio: null,
        lyrics: null,
        fulltext: null,
        __a: ref.a,
        __t: ref.t,
        __artist: 'Витрина Разбита',
        __album: 'Альбом',
        __active: false,
        __cover: cover
      });
    }

    w.favoritesRefsModel = out;
    return out;
  }

  function updateFavoritesRefsModelActiveFlag(albumKey, trackIndex, isActive) {
    const model = w.favoritesRefsModel;
    if (!Array.isArray(model)) return;
    const item = model.find(x => x.__a === albumKey && x.__t === trackIndex);
    if (item) item.__active = !!isActive;
  }

  function centralIdForAlbumKey(albumKey) {
    if (!albumKey) return null;
    if (albumKey === '__favorites__') return null;
    
    const ALBUM_GALLERY_MAP = {
      'krevetochka': '00',
      'mezhdu-zlom-i-dobrom': '01',
      'golos-dushi': '02',
      '__reliz__': 'news'
    };
    
    const CENTRAL_ALLOWED_IDS = new Set(['00', '01', '02', 'news']);
    const id = ALBUM_GALLERY_MAP[albumKey] || null;
    return id && CENTRAL_ALLOWED_IDS.has(id) ? id : null;
  }

  function normalizeGalleryItem(raw, baseDir) {
    if (!raw) return null;

    const toAbs = (p) => {
      if (!p) return null;
      const s = String(p).replace(/^\.?\//, '');
      if (/^https?:\/\//i.test(s)) return s;
      if (/^(albums|img|icons|assets)\//i.test(s)) return `./${s}`;
      return baseDir + s;
    };

    if (typeof raw === 'string') {
      const isHtml = /\.html(\?|#|$)/i.test(raw);
      const src = toAbs(raw);
      return { 
        type: isHtml ? 'html' : 'img', 
        src, 
        formats: null, 
        ar: 1 
      };
    }

    const type = (String(raw.type || '').toLowerCase() === 'html') ? 'html' : 'img';
    if (type === 'html') {
      const src = toAbs(raw.src || '');
      return { type: 'html', src, formats: null, ar: 1 };
    }

    const fm = raw.formats || {};
    const formats = {
      webp: toAbs(fm.webp || null),
      full: toAbs(fm.full || raw.src || null),
      thumb: toAbs(fm.thumb || null)
    };
    const src = formats.full || toAbs(raw.src || '');
    
    return { type: 'img', src, formats, ar: 1 };
  }

  function normalizeBase(b) {
    try {
      const hasScheme = /^[a-z]+:\/\//i.test(String(b));
      const u = new URL(String(b), hasScheme ? undefined : (location.origin + '/'));
      return u.origin + u.pathname.replace(/\/+$/, '');
    } catch {
      const s = String(b || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
      if (/^https?:\/\//i.test(s)) return s;
      return location.origin + '/' + s.replace(/^\/+/, '');
    }
  }

  function absJoin(base, rel) {
    try {
      return new URL(String(rel || ''), normalizeBase(base) + '/').toString();
    } catch {
      const norm = normalizeBase(base);
      return norm + '/' + String(rel || '').replace(/^\/+/, '');
    }
  }

  w.centralIdForAlbumKey = centralIdForAlbumKey;
  w.normalizeGalleryItem = normalizeGalleryItem;
  w.normalizeBase = normalizeBase;
  w.absJoin = absJoin;
  w.CENTRAL_GALLERY_BASE = w.APP_CONFIG?.CENTRAL_GALLERY_BASE || './albums/gallery/';

  function removeFavoritesRef(albumKey, trackIndex) {
    const a = String(albumKey || '');
    const t = parseInt(trackIndex, 10);
    if (!a || !Number.isFinite(t)) return false;

    const refs = readFavoritesRefs();
    const next = refs.filter(r => !(r && r.a === a && r.t === t));
    writeFavoritesRefs(next);

    // Если модель уже в памяти — удалим элемент
    if (Array.isArray(w.favoritesRefsModel)) {
      w.favoritesRefsModel = w.favoritesRefsModel.filter(it => !(it && it.__a === a && it.__t === t));
    }

    return true;
  }

  function createModalBg(html) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg active';
    bg.innerHTML = html;

    bg.addEventListener('click', (e) => {
      if (e.target === bg) bg.remove();
    });

    document.body.appendChild(bg);
    return bg;
  }

  function showFavoritesDeleteConfirm(params) {
    const albumKey = String(params?.albumKey || '');
    const trackIndex = parseInt(params?.trackIndex, 10);
    const title = String(params?.title || 'Трек');

    if (!albumKey || !Number.isFinite(trackIndex)) return;

    const modal = createModalBg(`
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
          <div style="margin-bottom: 8px;"><strong>Трек:</strong> ${escapeHtml(title)}</div>
          <div style="opacity:.9;">
            Трек исчезнет из списка «ИЗБРАННОЕ». Если он был отмечен ⭐ — отметка может остаться в альбоме.
          </div>
        </div>

        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn" data-act="cancel" style="min-width: 130px;">Отмена</button>
          <button class="offline-btn online" data-act="delete" style="min-width: 130px;">Удалить</button>
        </div>
      </div>
    `);

    modal.querySelector('.bigclose')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-act="cancel"]')?.addEventListener('click', () => modal.remove());

    modal.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      const ok = removeFavoritesRef(albumKey, trackIndex);

      // Удалим строку из DOM если она есть
      const rowId = `fav_${albumKey}_${trackIndex}`;
      document.getElementById(rowId)?.remove();

      // Перенумерация (только треки, не кнопки)
      const rows = Array.from(document.querySelectorAll('#track-list .track'));
      rows.forEach((row, i) => {
        const n = row.querySelector('.tnum');
        if (n) n.textContent = String(i + 1).padStart(2, '0');
      });

      modal.remove();

      if (ok) {
        w.NotificationSystem?.success('Удалено из «ИЗБРАННОГО»');
        if (typeof params?.onDeleted === 'function') params.onDeleted();
      } else {
        w.NotificationSystem?.error('Не удалось удалить');
      }
    });
  }

  function showFavoritesInactiveModal(params) {
    const albumKey = String(params?.albumKey || '');
    const trackIndex = parseInt(params?.trackIndex, 10);
    const title = String(params?.title || 'Трек');

    if (!albumKey || !Number.isFinite(trackIndex)) return;

    const modal = createModalBg(`
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
          <div style="margin-bottom: 8px;"><strong>Трек:</strong> ${escapeHtml(title)}</div>
          <div style="opacity:.9;">
            Вы можете вернуть трек в ⭐ или удалить его из списка «ИЗБРАННОЕ».
          </div>
        </div>

        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn online" data-act="add" style="min-width: 160px;">Добавить в ⭐</button>
          <button class="offline-btn" data-act="remove" style="min-width: 160px;">Удалить</button>
        </div>
      </div>
    `);

    modal.querySelector('.bigclose')?.addEventListener('click', () => modal.remove());

    modal.querySelector('[data-act="add"]')?.addEventListener('click', () => {
      // Включаем лайк (это вернёт __active = true)
      if (w.FavoritesManager && typeof w.FavoritesManager.toggleLike === 'function') {
        w.FavoritesManager.toggleLike(albumKey, trackIndex, true);
      } else if (typeof w.toggleLikeForAlbum === 'function') {
        w.toggleLikeForAlbum(albumKey, trackIndex, true);
      }

      // Подправим модель
      updateFavoritesRefsModelActiveFlag(albumKey, trackIndex, true);

      // Подправим DOM строки (если есть)
      const row = document.getElementById(`fav_${albumKey}_${trackIndex}`);
      if (row) {
        row.classList.remove('inactive');
        const star = row.querySelector('.like-star');
        if (star) star.src = 'img/star.png';
      }

      modal.remove();
      w.NotificationSystem?.success('Добавлено в ⭐');

      if (typeof params?.onChanged === 'function') params.onChanged({ active: true });
    });

    modal.querySelector('[data-act="remove"]')?.addEventListener('click', () => {
      modal.remove();
      showFavoritesDeleteConfirm({ albumKey, trackIndex, title, onDeleted: params?.onDeleted });
    });
  }

  // маленькая утилита, чтобы не зависеть от index.html escapeHtml
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  w.FavoritesData = {
    readFavoritesRefs,
    writeFavoritesRefs,
    ensureFavoritesRefsWithLikes,
    getSortedFavoritesRefs,
    getAlbumConfigByKey,
    buildFavoritesRefsModel,
    updateFavoritesRefsModelActiveFlag,
    getAlbumCoverUrl,

    // NEW API (модалки + удаление ref)
    removeFavoritesRef,
    showFavoritesInactiveModal,
    showFavoritesDeleteConfirm
  };

  w.readFavoritesRefs = readFavoritesRefs;
  w.writeFavoritesRefs = writeFavoritesRefs;
  w.ensureFavoritesRefsWithLikes = ensureFavoritesRefsWithLikes;
  w.getSortedFavoritesRefs = getSortedFavoritesRefs;
  w.getAlbumConfigByKey = getAlbumConfigByKey;
  w.buildFavoritesRefsModel = buildFavoritesRefsModel;
  w.updateFavoritesRefsModelActiveFlag = updateFavoritesRefsModelActiveFlag;

})();

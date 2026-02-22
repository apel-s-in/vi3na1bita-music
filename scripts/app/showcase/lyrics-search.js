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

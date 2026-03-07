/**
 * scripts/app/showcase/lyrics-search.js
 * Offline fast search (title/album/lyrics).
 * V2: Global search across entire catalog.
 */

const W = window;
const INDEX_URL = './data/lyrics-index-v1.json';

let _loaded = false;
let _pending = null;
let _idx = {};

const normStr = (s) => String(s || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (q) => {
  const s = normStr(q);
  return s ? s.split(' ').filter(w => w.length >= 2) : [];
};

export async function ensureLyricsIndexLoaded() {
  if (_loaded) return true;
  if (_pending) return _pending;

  _pending = (async () => {
    try {
      const r = await fetch(INDEX_URL, { cache: 'force-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || j.v !== 1) throw new Error('Bad index');
      _idx = j.idx && typeof j.idx === 'object' ? j.idx : {};
      _loaded = true;
      return true;
    } catch (e) {
      _idx = {}; _loaded = false; return false;
    } finally { _pending = null; }
  })();
  return _pending;
}

function getTrackText(uid) {
  const t = W.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return { title: '', album: '' };
  return { title: String(t.title || ''), album: String(W.TrackRegistry?.getAlbumTitle?.(t.sourceAlbum) || t.album || '') };
}

export function searchUidsByQuery({ query }) {
  const q = String(query || '').trim();
  const allUids = W.TrackRegistry?.getAllUids?.() || [];
  if (!q) return allUids;

  const qNorm = normStr(q);
  const toks = tokenize(qNorm);

  let candidates = allUids;
  if (_loaded && toks.length) {
    const set = new Set();
    toks.forEach(tok => { if (Array.isArray(_idx[tok])) _idx[tok].forEach(u => set.add(u)); });
    if (set.size > 0) candidates = [...set];
  }

  const scored = candidates.map(uid => {
    const { title, album } = getTrackText(uid);
    const tN = normStr(title), aN = normStr(album);
    let score = 0;
    if (tN.includes(qNorm)) score += 120;
    if (aN.includes(qNorm)) score += 70;
    toks.forEach(tok => {
      if (tN.includes(tok)) score += 40;
      else if (aN.includes(tok)) score += 20;
      else if (_loaded && Array.isArray(_idx[tok]) && _idx[tok].includes(uid)) score += 8;
    });
    return { uid, score };
  }).filter(x => x.score > 0);

  scored.sort((x, y) => y.score - x.score);
  return scored.map(x => x.uid);
}

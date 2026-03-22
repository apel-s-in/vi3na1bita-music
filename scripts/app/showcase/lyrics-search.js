const W = window, I = './data/lyrics-index-v1.json';
let _l = false, _idx = {};
const nS = s => String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}\s]+/gu,' ').replace(/\s+/g,' ').trim(), tK = q => { const s = nS(q); return s ? s.split(' ').filter(w => w.length >= 2) : []; };
export const ensureLyricsIndexLoaded = async () => {
  if (_l) return true;
  return W.Utils.func.memoAsyncOnce('app:showcase:lyrics-index', async () => {
    try {
      const j = W.Utils?.fetchCache?.getJson ? await W.Utils.fetchCache.getJson({ key: 'lyrics:index:v1', url: I, ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } }) : await (W.NetPolicy?.fetchWithTraffic?.(I, { cache: 'force-cache' }) || fetch(I, { cache: 'force-cache' })).then(r => { if (!r.ok) throw 1; return r.json(); });
      if (!j || j.v !== 1) throw 1;
      _idx = j.idx && typeof j.idx === 'object' ? j.idx : {};
      _l = true;
      return true;
    } catch {
      _idx = {};
      _l = false;
      return false;
    }
  });
};
const gTT = u => { const t = W.TrackRegistry?.getTrackByUid?.(u); return t ? { title: String(t.title||''), album: String(W.TrackRegistry?.getAlbumTitle?.(t.sourceAlbum)||t.album||'') } : { title: '', album: '' }; };
export const searchUidsByQuery = ({ query: q }) => {
  const qN = nS(q), tks = tK(qN), all = W.TrackRegistry?.getAllUids?.() || []; if (!qN) return all;
  let c = all; if (_l && tks.length) { const s = new Set(); tks.forEach(t => Array.isArray(_idx[t]) && _idx[t].forEach(u => s.add(u))); if (s.size) c = [...s]; }
  return c.map(u => { const { title: t, album: a } = gTT(u), tN = nS(t), aN = nS(a); let sc = 0; if (tN.includes(qN)) sc += 120; if (aN.includes(qN)) sc += 70; tks.forEach(k => { if (tN.includes(k)) sc += 40; else if (aN.includes(k)) sc += 20; else if (_l && Array.isArray(_idx[k]) && _idx[k].includes(u)) sc += 8; }); return { uid: u, score: sc }; }).filter(x => x.score > 0).sort((x, y) => y.score - x.score).map(x => x.uid);
};

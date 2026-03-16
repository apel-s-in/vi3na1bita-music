// UID.002_(UID-first core)_(держать трек главным объектом системы)_(registry остаётся центральной точкой доступа по uid)
// UID.016_(Feature flags on track)_(подготовить richer track model)_(registry должен быть естественной точкой future feature/profile binding)
// UID.019_(Compact TrackProfile index)_(дать bridge от контентного слоя к semantic слою)_(добавить безопасные passthrough методы preview/full profile)
// UID.020_(Full TrackProfile per uid)_(не раздувать registry heavy data)_(registry только делегирует в window.Intel.trackProfiles если слой доступен)
// UID.094_(No-paralysis rule)_(не ломать текущий контентный bootstrap)_(если intel-слой отсутствует, registry работает как раньше)

const _tr = new Map(), _alb = new Map(), _cfg = new Map(), _albTr = new Map(), _pHlth = new Map();
let _popP = null;

const toUrl = (b, r) => {
  try {
    const cB = String(b).replace(/\/+$/, '') + '/';
    return /^https?:\/\//i.test(cB) && r ? new URL(String(r).replace(/^(\.\/|\/)+/, ''), cB).toString() : null;
  } catch {
    return null;
  }
};

const getSrcOrd = () => (
  (localStorage.getItem('sourcePref') || (window.location?.hostname.includes('yandexcloud.net') ? 'yandex' : 'github')) === 'github'
    ? ['github', 'yandex']
    : ['yandex', 'github']
);

const isHlthy = s => !_pHlth.has(s) || (Date.now() - _pHlth.get(s).at > (_pHlth.get(s).ok ? 3600000 : 30000)) || _pHlth.get(s).ok;
const mark = (s, ok) => _pHlth.set(s, { ok, at: Date.now() });

async function fetchFall(bs, p, t = 6000) {
  for (const s of getSrcOrd()) {
    if (!isHlthy(s) || !bs[s]) continue;
    try {
      const c = new AbortController(), id = setTimeout(() => c.abort(), t);
      const r = await fetch(bs[s].replace(/\/+$/, '') + '/' + p.replace(/^\/+/, ''), { cache: 'force-cache', signal: c.signal });
      clearTimeout(id);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mark(s, true);
      return { json: await r.json(), src: s, base: bs[s] };
    } catch {
      mark(s, false);
    }
  }
  return null;
}

export const getSmartUrlInfo = async (uid, prop = 'audio', q = 'hi') => {
  const t = _tr.get(String(uid || '').trim()), c = _cfg.get(t?.sourceAlbum);
  if (!c?.bases) return null;
  const pPath = prop === 'audio'
    ? (String(q).toLowerCase() === 'lo' ? (t.rel_audio_low || t.rel_audio) : t.rel_audio)
    : (prop === 'lyrics' ? t.rel_lyrics : t.rel_fulltext);
  if (!pPath) return null;
  for (const s of [...getSrcOrd(), ...getSrcOrd()]) {
    if ((isHlthy(s) || _pHlth.has(s)) && c.bases[s] && toUrl(c.bases[s], pPath)) return { url: toUrl(c.bases[s], pPath), provider: s };
  }
  return null;
};

export const registerTrack = (t, aM) => {
  const u = String(t?.uid || '').trim();
  if (!u) return;
  _tr.set(u, {
    uid: u,
    title: t.title || 'Трек',
    audio: t.audio || null,
    audio_low: t.audio_low || null,
    src: t.audio || null,
    size: t.size || 0,
    size_low: t.size_low || 0,
    lyrics: t.lyrics || null,
    fulltext: t.fulltext || null,
    sourceAlbum: t.sourceAlbum || null,
    album: aM?.title || null,
    rel_audio: t.rel_audio || null,
    rel_audio_low: t.rel_audio_low || null,
    rel_lyrics: t.rel_lyrics || null,
    rel_fulltext: t.rel_fulltext || null
  });
  if (t.sourceAlbum && aM?.title) _alb.set(t.sourceAlbum, aM.title);
};

export const getTrackByUid = u => _tr.get(String(u || '').trim()) || null;
export const getAllUids = () => [..._tr.keys()];
export const getAlbumTitle = k => _alb.get(k) || null;
export const getAlbumConfig = k => _cfg.get(k) || null;
export const getTracksForAlbum = k => _albTr.get(k) || [];
export const getTrackProfilePreview = uid => window.Intel?.trackProfiles?.getPreview?.(uid) || null;
export const hasTrackProfile = uid => !!getTrackProfilePreview(uid);
export const getTrackProfile = async uid => await window.Intel?.trackProfiles?.getProfile?.(uid) || null;

export const ensurePopulated = async () => {
  if (_popP) return _popP;
  return (_popP = (async () => {
    if (!window.albumsIndex?.length) try { await window.Utils?.onceEvent?.(window, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    await Promise.allSettled((window.albumsIndex || []).filter(a => !a.key.startsWith('__')).map(async a => {
      try {
        const bs = {
          yandex: a.yandex_base ? `${a.yandex_base.replace(/\/$/, '')}/` : '',
          github: a.github_base ? `${a.github_base.replace(/\/$/, '')}/` : ''
        };
        const cK = `tr:cfg:${a.key}`, c = window.Utils?.fetchCache?.get?.(cK, 43200000, 'session');
        const r = c ? c : await fetchFall(bs, 'config.json', 6000);
        if (!r) return;
        if (!c) window.Utils?.fetchCache?.set?.(cK, { json: r.json, src: r.src, base: r.base }, 'session');

        const tit = r.json.albumName || a.title;
        _alb.set(a.key, tit);
        _cfg.set(a.key, {
          title: tit,
          bases: bs,
          activeSrc: r.src,
          artist: r.json.artist || 'Витрина Разбита',
          links: (r.json.social_links || r.json.socials || []).map(s => ({ label: s.title || s.label, url: s.url }))
        });

        _albTr.set(a.key, (r.json.tracks || []).map((t, i) => {
          const hi = toUrl(r.base, t.audio), lo = toUrl(r.base, t.audio_low), u = String(t.uid || '').trim() || null;
          if (u) registerTrack({
            uid: u,
            title: t.title,
            audio: hi,
            audio_low: lo,
            size: t.size,
            size_low: t.size_low,
            lyrics: toUrl(r.base, t.lyrics),
            fulltext: toUrl(r.base, t.fulltext),
            sourceAlbum: a.key,
            rel_audio: t.audio,
            rel_audio_low: t.audio_low,
            rel_lyrics: t.lyrics,
            rel_fulltext: t.fulltext
          }, { title: tit });
          return {
            num: i + 1,
            title: t.title || `Трек ${i + 1}`,
            uid: u,
            src: hi,
            sources: hi || lo ? { audio: { hi, lo } } : null,
            lyrics: toUrl(r.base, t.lyrics),
            fulltext: toUrl(r.base, t.fulltext),
            hasLyrics: t.hasLyrics ?? !!t.lyrics
          };
        }));
      } catch {}
    }));
  })());
};

export const resetSourceCache = () => {
  _pHlth.clear();
  _popP = null;
  _tr.clear();
  _alb.clear();
  _cfg.clear();
  _albTr.clear();
  try {
    Object.keys(sessionStorage).filter(k => k.startsWith('tr:cfg:')).forEach(k => sessionStorage.removeItem(k));
  } catch {}
};

window.TrackRegistry = {
  registerTrack,
  getTrackByUid,
  getAllUids,
  getAlbumTitle,
  ensurePopulated,
  getAlbumConfig,
  getTracksForAlbum,
  getSmartUrlInfo,
  resetSourceCache,
  hasTrackProfile,
  getTrackProfilePreview,
  getTrackProfile
};

export default window.TrackRegistry;

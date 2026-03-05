/**
 * track-registry.js — Глобальный реестр треков по uid.
 * v2.1 — исправлен дублированный getSmartUrlInfo, корректный failover
 */

const _tracks = new Map();
const _albums = new Map();
const _albumConfigs = new Map();
const _albumTracks = new Map();
let _populatedPromise = null;

const toUrl = (b, r) => {
  if (!r || !b) return null;
  try {
    const cleanRel = String(r).replace(/^(\.\/|\/)+/, '');
    const cleanBase = String(b).replace(/\/+$/, '') + '/';
    if (!/^https?:\/\//i.test(cleanBase)) return null;
    return new URL(cleanRel, cleanBase).toString();
  } catch (e) {
    console.warn('[TrackRegistry] URL build failed:', b, r, e);
    return null;
  }
};

// Кэш доступности источников: { yandex: { ok, at }, github: { ok, at } }
// Ключ — albumKey, чтобы разные альбомы не мешали друг другу
const _rtCache = new Map();
const TTL_OK_MS = 60_000;
const TTL_FAIL_MS = 10_000;

async function probeProvider(albumKey, provider, baseStr) {
  if (!baseStr) return false;
  const cacheKey = `${albumKey}:${provider}`;
  const now = Date.now();
  const cached = _rtCache.get(cacheKey);
  const ttl = cached?.ok ? TTL_OK_MS : TTL_FAIL_MS;
  if (cached && (now - cached.at) < ttl) return !!cached.ok;

  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 2500);
    const url = baseStr.replace(/\/+$/, '') + '/config.json?_p=' + now;
    const r = await fetch(url, { method: 'HEAD', mode: 'cors', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(id);
    _rtCache.set(cacheKey, { ok: r.ok, at: now });
    return r.ok;
  } catch {
    _rtCache.set(cacheKey, { ok: false, at: now });
    return false;
  }
}

export async function getSmartUrlInfo(uid, prop = 'audio', quality = 'hi') {
  const track = _tracks.get(String(uid || '').trim());
  if (!track || !track.sourceAlbum) return null;

  const conf = _albumConfigs.get(track.sourceAlbum);
  if (!conf || !conf.bases) return null;

  let relPath = null;
  const q = String(quality || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
  if (prop === 'audio') relPath = q === 'lo' ? (track.rel_audio_low || track.rel_audio) : track.rel_audio;
  else if (prop === 'lyrics') relPath = track.rel_lyrics;
  else if (prop === 'fulltext') relPath = track.rel_fulltext;

  if (!relPath) return null;

  const pref = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  const secondary = pref === 'github' ? 'yandex' : 'github';

  // Пробуем приоритетный источник, при неудаче — резервный
  const primaryOk = await probeProvider(track.sourceAlbum, pref, conf.bases[pref]);
  const order = primaryOk ? [pref, secondary] : [secondary, pref];

  for (const src of order) {
    const baseStr = conf.bases[src];
    if (!baseStr) continue;
    const url = toUrl(baseStr, relPath);
    if (url) {
      conf.activeSrc = src;
      // Уведомляем UI об изменении источника
      if (window.playerCore?.currentProvider !== src) {
        window.dispatchEvent(new CustomEvent('player:providerChanged', { detail: { provider: src } }));
      }
      return { url, provider: src };
    }
  }

  return null;
}

export function registerTrack(track, albumMeta) {
  if (!track?.uid) return;
  const uid = String(track.uid).trim();
  if (!uid) return;

  _tracks.set(uid, {
    uid,
    title: track.title || 'Трек',
    audio: track.audio || null,
    audio_low: track.audio_low || null,
    src: track.audio || null,
    size: track.size || 0,
    size_low: track.size_low || 0,
    lyrics: track.lyrics || null,
    fulltext: track.fulltext || null,
    sourceAlbum: track.sourceAlbum || null,
    album: albumMeta?.title || null,
    // Относительные пути для роутера (не зависят от источника)
    rel_audio: track.rel_audio || null,
    rel_audio_low: track.rel_audio_low || null,
    rel_lyrics: track.rel_lyrics || null,
    rel_fulltext: track.rel_fulltext || null
  });

  if (track.sourceAlbum && albumMeta?.title) {
    _albums.set(track.sourceAlbum, albumMeta.title);
  }
}

export function getTrackByUid(uid) {
  return _tracks.get(String(uid || '').trim()) || null;
}

export function getAllUids() {
  return [..._tracks.keys()];
}

export function getAlbumTitle(key) { return _albums.get(key) || null; }
export function getAlbumConfig(key) { return _albumConfigs.get(key) || null; }
export function getTracksForAlbum(key) { return _albumTracks.get(key) || []; }

export async function ensurePopulated() {
  if (_populatedPromise) return _populatedPromise;
  _populatedPromise = (async () => {
    if (!window.albumsIndex?.length) {
      try { await window.Utils?.onceEvent?.(window, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    }
    const idx = window.albumsIndex || [];
    await Promise.allSettled(idx.filter(a => !a.key.startsWith('__')).map(async a => {
      try {
        const y_base = a.yandex_base
          ? (a.yandex_base.endsWith('/') ? a.yandex_base : `${a.yandex_base}/`)
          : (a.base ? (a.base.endsWith('/') ? a.base : `${a.base}/`) : '');

        const g_base = a.github_base
          ? (a.github_base.endsWith('/') ? a.github_base : `${a.github_base}/`)
          : (a.base ? (a.base.endsWith('/') ? a.base : `${a.base}/`) : '');

        const pref = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
        const secondary = pref === 'github' ? 'yandex' : 'github';

        const tryFetchConfig = async (src) => {
          const b = src === 'yandex' ? y_base : g_base;
          if (!b) return null;
          try {
            const ctrl = new AbortController();
            const id = setTimeout(() => ctrl.abort(), 3500);
            const res = await fetch(`${b}config.json?_t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
            clearTimeout(id);
            if (res.ok) return { raw: await res.json(), base: b, src };
          } catch {}
          return null;
        };

        let confData = await tryFetchConfig(pref);
        if (!confData) confData = await tryFetchConfig(secondary);
        if (!confData) return;

        const { raw, src: activeSrc } = confData;
        const title = raw.albumName || a.title;
        _albums.set(a.key, title);

        _albumConfigs.set(a.key, {
          title,
          bases: { yandex: y_base, github: g_base },
          activeSrc,
          artist: raw.artist || 'Витрина Разбита',
          links: (raw.social_links || raw.socials || []).map(s => ({ label: s.title || s.label, url: s.url }))
        });

        // Треки строим с ОТНОСИТЕЛЬНЫМИ путями — URL будет строиться динамически через getSmartUrlInfo
        // Но для первоначальной загрузки используем активный источник
        const activeBase = activeSrc === 'yandex' ? y_base : g_base;

        const trks = (raw.tracks || []).map((t, i) => {
          const hi = toUrl(activeBase, t.audio);
          const lo = toUrl(activeBase, t.audio_low);
          const uid = String(t.uid || '').trim() || null;

          if (uid) {
            registerTrack({
              uid, title: t.title,
              audio: hi, audio_low: lo,
              size: t.size, size_low: t.size_low,
              lyrics: toUrl(activeBase, t.lyrics),
              fulltext: toUrl(activeBase, t.fulltext),
              sourceAlbum: a.key,
              // Сохраняем rel-пути для динамического роутинга
              rel_audio: t.audio,
              rel_audio_low: t.audio_low,
              rel_lyrics: t.lyrics,
              rel_fulltext: t.fulltext
            }, { title });
          }

          return {
            num: i + 1,
            title: t.title || `Трек ${i + 1}`,
            uid,
            src: hi,
            sources: (hi || lo) ? { audio: { hi, lo } } : null,
            lyrics: toUrl(activeBase, t.lyrics),
            fulltext: toUrl(activeBase, t.fulltext),
            hasLyrics: t.hasLyrics ?? !!t.lyrics
          };
        });

        _albumTracks.set(a.key, trks);
      } catch (e) {
        console.error('[TrackRegistry]', a.key, e);
      }
    }));
  })();
  return _populatedPromise;
}

// Сброс кэша при смене приоритета источника (вызывается из профиля)
export function resetSourceCache() {
  _rtCache.clear();
  _populatedPromise = null;
  _tracks.clear();
  _albums.clear();
  _albumConfigs.clear();
  _albumTracks.clear();
}

const TrackRegistry = {
  registerTrack, getTrackByUid, getAllUids, getAlbumTitle,
  ensurePopulated, getAlbumConfig, getTracksForAlbum,
  getSmartUrlInfo, resetSourceCache
};
window.TrackRegistry = TrackRegistry;
export default TrackRegistry;

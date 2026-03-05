/**
 * track-registry.js — Глобальный реестр треков по uid.
 * v2.2 — Robust dual-source (Yandex Cloud + GitHub Pages), CORS-safe
 */

const _tracks = new Map();
const _albums = new Map();
const _albumConfigs = new Map();
const _albumTracks = new Map();
let _populatedPromise = null;

// Кэш доступности: albumKey:provider → { ok, at }
const _srcCache = new Map();
const TTL_OK = 120_000;   // 2 мин если ок
const TTL_FAIL = 15_000;  // 15 сек если fail

const toUrl = (b, r) => {
  if (!r || !b) return null;
  try {
    const cleanRel = String(r).replace(/^(\.\/|\/)+/, '');
    const cleanBase = String(b).replace(/\/+$/, '') + '/';
    if (!/^https?:\/\//i.test(cleanBase)) return null;
    return new URL(cleanRel, cleanBase).toString();
  } catch {
    return null;
  }
};

function getSourcePref() {
  const host = window.location?.hostname || '';
  const stored = localStorage.getItem('sourcePref');
  if (stored === 'github' || stored === 'yandex') return stored;
  // Автоматика: если мы на Yandex Cloud → yandex, иначе github
  return host.includes('yandexcloud.net') ? 'yandex' : 'github';
}

function getSourceOrder() {
  const pref = getSourcePref();
  return pref === 'github' ? ['github', 'yandex'] : ['yandex', 'github'];
}

// Попытка fetch JSON с таймаутом. Возвращает { json, src } или null.
async function fetchJsonWithFallback(bases, path, timeout = 5000) {
  const order = getSourceOrder();
  for (const src of order) {
    const base = bases[src];
    if (!base) continue;
    const url = base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
    const cacheKey = `${url}`;
    const cached = _srcCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.at) < (cached.ok ? TTL_OK : TTL_FAIL)) {
      if (!cached.ok) continue;
    }
    try {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), timeout);
      const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(id);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      _srcCache.set(cacheKey, { ok: true, at: now });
      return { json, src, base };
    } catch (e) {
      _srcCache.set(cacheKey, { ok: false, at: now });
      console.warn(`[TrackRegistry] fetch ${src} failed for ${path}:`, e?.message || e);
    }
  }
  return null;
}

// Строит URL ресурса (аудио/лирика/fulltext) с учётом приоритетного источника
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

  const order = getSourceOrder();
  for (const src of order) {
    const base = conf.bases[src];
    if (!base) continue;
    const url = toUrl(base, relPath);
    if (url) {
      // Уведомляем UI о текущем провайдере
      window.dispatchEvent(new CustomEvent('player:providerChanged', { detail: { provider: src } }));
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

export function getAllUids() { return [..._tracks.keys()]; }
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
          : '';
        const g_base = a.github_base
          ? (a.github_base.endsWith('/') ? a.github_base : `${a.github_base}/`)
          : '';

        const bases = { yandex: y_base, github: g_base };

        // Используем fetchJsonWithFallback — пробует оба источника по приоритету
        const result = await fetchJsonWithFallback(bases, 'config.json', 5000);
        if (!result) {
          console.warn(`[TrackRegistry] No accessible source for album ${a.key}`);
          return;
        }

        const { json: raw, src: activeSrc, base: activeBase } = result;
        const title = raw.albumName || a.title;
        _albums.set(a.key, title);

        _albumConfigs.set(a.key, {
          title,
          bases,
          activeSrc,
          artist: raw.artist || 'Витрина Разбита',
          links: (raw.social_links || raw.socials || []).map(s => ({ label: s.title || s.label, url: s.url }))
        });

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

export function resetSourceCache() {
  _srcCache.clear();
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

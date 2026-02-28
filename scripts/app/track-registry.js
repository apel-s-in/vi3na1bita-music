/**
 * track-registry.js — Глобальный реестр треков по uid.
 * Позволяет любому модулю получить метаданные трека без доступа к кэшу альбомов.
 */

const _tracks = new Map();
const _albums = new Map();
const _albumConfigs = new Map();
const _albumTracks = new Map();
let _populatedPromise = null;

const toUrl = (b, r) => r ? new URL(r, b).toString() : null;

/**
 * Зарегистрировать трек.
 * @param {Object} track - { uid, title, audio, audio_low, size, size_low, lyrics, fulltext, sourceAlbum }
 * @param {Object} [albumMeta] - { title }
 */
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
    album: albumMeta?.title || null
  });

  if (track.sourceAlbum && albumMeta?.title) {
    _albums.set(track.sourceAlbum, albumMeta.title);
  }
}

/**
 * Получить трек по uid.
 */
export function getTrackByUid(uid) {
  const u = String(uid || '').trim();
  return _tracks.get(u) || null;
}

/**
 * Получить все зарегистрированные uid.
 */
export function getAllUids() {
  return [..._tracks.keys()];
}

/**
 * Получить название альбома по ключу.
 */
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
        const base = a.base.endsWith('/') ? a.base : `${a.base}/`;
        const r = await fetch(`${base}config.json`, { cache: 'force-cache' });
        if (!r.ok) return;
        const raw = await r.json();
        
        const title = raw.albumName || a.title;
        _albums.set(a.key, title);
        
        _albumConfigs.set(a.key, {
          title,
          artist: raw.artist || 'Витрина Разбита',
          links: (raw.social_links || raw.socials || []).map(s => ({ label: s.title || s.label, url: s.url }))
        });

        const trks = (raw.tracks || []).map((t, i) => {
          const hi = toUrl(base, t.audio), lo = toUrl(base, t.audio_low), uid = String(t.uid || '').trim() || null;
          if (uid) registerTrack({ uid, title: t.title, audio: hi, audio_low: lo, size: t.size, size_low: t.size_low, lyrics: toUrl(base, t.lyrics), fulltext: toUrl(base, t.fulltext), sourceAlbum: a.key }, { title });
          return { num: i + 1, title: t.title || `Трек ${i + 1}`, uid, src: hi, sources: (hi || lo) ? { audio: { hi, lo } } : null, lyrics: toUrl(base, t.lyrics), fulltext: toUrl(base, t.fulltext), hasLyrics: t.hasLyrics ?? !!t.lyrics };
        });
        _albumTracks.set(a.key, trks);
      } catch(e) { console.error('[TrackRegistry]', e); }
    }));
  })();
  return _populatedPromise;
}

// Глобальный доступ
const TrackRegistry = { registerTrack, getTrackByUid, getAllUids, getAlbumTitle, ensurePopulated, getAlbumConfig, getTracksForAlbum };
window.TrackRegistry = TrackRegistry;

export default TrackRegistry;

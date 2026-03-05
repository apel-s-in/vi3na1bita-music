/**
 * track-registry.js — Глобальный реестр треков по uid.
 * Позволяет любому модулю получить метаданные трека без доступа к кэшу альбомов.
 */

const _tracks = new Map();
const _albums = new Map();
const _albumConfigs = new Map();
const _albumTracks = new Map();
let _populatedPromise = null;

// Безопасное формирование URL (Оптимизировано: валидация + очистка путей)
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

// Глобальный маршрутизатор (Оптимизированный: O(1) маршрутизация без блокирующих HEAD-запросов)
export async function getSmartUrlInfo(uid, prop = 'audio', quality = 'hi') {
  const track = _tracks.get(uid);
  if (!track || !track.sourceAlbum) return null;
  const conf = _albumConfigs.get(track.sourceAlbum);
  if (!conf || !conf.bases) return null;

  let relPath = null;
  if (prop === 'audio') relPath = quality === 'lo' ? (track.rel_audio_low || track.rel_audio) : track.rel_audio;
  else if (prop === 'lyrics') relPath = track.rel_lyrics;
  else if (prop === 'fulltext') relPath = track.rel_fulltext;
  
  if (!relPath) return null;
  const cleanRel = relPath.replace(/^(\.\/|\/)/, ''); 

  // Используем тот источник, который был реально доступен при инициализации (или ручной выбор)
  const pref = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  const activeSrc = conf.activeSrc || pref;

  const sources = activeSrc === 'github'
    ? ['github','yandex']
    : ['yandex','github'];
  
  for (const src of sources) {
    const baseStr = conf.bases[src];
    if (!baseStr) continue;

    const url = toUrl(baseStr, relPath);
    if (url) {
      return { url, provider: src };
    }
  }
  
  return null;
}

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
        // Поддержка старой и новой схемы albums.json
        const base = a.base ? (a.base.endsWith('/') ? a.base : `${a.base}/`) : '';

        const y_base = a.yandex_base
          ? (a.yandex_base.endsWith('/') ? a.yandex_base : `${a.yandex_base}/`)
          : base;

        const g_base = a.github_base
          ? (a.github_base.endsWith('/') ? a.github_base : `${a.github_base}/`)
          : base;     
        let pref = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
        const tryFetchConfig = async (src) => {
            const b = src === 'yandex' ? y_base : g_base;
            if (!b) return null;
            try {
                const res = await fetch(`${b}config.json`, { cache: 'no-cache' }); // Важно! Конфиги тянем свежие
                if (res.ok) return { raw: await res.json(), base: b };
            } catch (e) {}
            return null;
        };

        // Запрашиваем конфиг с учетом приоритета и резерва
        let activeSrc = pref;
        let confData = await tryFetchConfig(activeSrc);
        if (!confData) {
          activeSrc = pref === 'yandex' ? 'github' : 'yandex';
          confData = await tryFetchConfig(activeSrc);
        }
        if (!confData) return;
        
        const raw = confData.raw;
        const activeBase = confData.base;

        const title = raw.albumName || a.title;
        _albums.set(a.key, title);
        
        _albumConfigs.set(a.key, {
          title,
          bases: { yandex: y_base, github: g_base },
          activeSrc: activeSrc, // Сохраняем реально работающий источник для плеера
          artist: raw.artist || 'Витрина Разбита',
          links: (raw.social_links || raw.socials || []).map(s => ({ label: s.title || s.label, url: s.url }))
        });

        const trks = (raw.tracks || []).map((t, i) => {
          const hi = toUrl(activeBase, t.audio), lo = toUrl(activeBase, t.audio_low), uid = String(t.uid || '').trim() || null;
          if (uid) {
              const trkObj = { uid, title: t.title, audio: hi, audio_low: lo, size: t.size, size_low: t.size_low, lyrics: toUrl(activeBase, t.lyrics), fulltext: toUrl(activeBase, t.fulltext), sourceAlbum: a.key };
              // Сохраняем относительные пути для роутера
              trkObj.rel_audio = t.audio; trkObj.rel_audio_low = t.audio_low; trkObj.rel_lyrics = t.lyrics; trkObj.rel_fulltext = t.fulltext;
              registerTrack(trkObj, { title });
          }
          return { num: i + 1, title: t.title || `Трек ${i + 1}`, uid, src: hi, sources: (hi || lo) ? { audio: { hi, lo } } : null, lyrics: toUrl(activeBase, t.lyrics), fulltext: toUrl(activeBase, t.fulltext), hasLyrics: t.hasLyrics ?? !!t.lyrics };
        });
        _albumTracks.set(a.key, trks);
      } catch(e) { console.error('[TrackRegistry]', e); }
    }));
  })();
  return _populatedPromise;
}

// Глобальный доступ
const TrackRegistry = { registerTrack, getTrackByUid, getAllUids, getAlbumTitle, ensurePopulated, getAlbumConfig, getTracksForAlbum, getSmartUrlInfo };
window.TrackRegistry = TrackRegistry;

export default TrackRegistry;

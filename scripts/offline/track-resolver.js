/**
 * track-registry.js — Глобальный реестр треков по uid.
 * Позволяет любому модулю получить метаданные трека без доступа к кэшу альбомов.
 */

const _tracks = new Map();
const _albums = new Map();

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
export function getAlbumTitle(key) {
  return _albums.get(key) || null;
}

// Глобальный доступ
const TrackRegistry = { registerTrack, getTrackByUid, getAllUids, getAlbumTitle };
window.TrackRegistry = TrackRegistry;

export default TrackRegistry;

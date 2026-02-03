// scripts/app/track-registry.js

let _tracks = [];
let _byUid = new Map();

const safeStr = (v) => (v ? String(v).trim() : null);

/**
 * Нормализация URL относительно базы
 */
const resolveUrl = (base, url) => {
  if (!url || !base) return url;
  try { return new URL(url, base).toString(); } catch { return url; }
};

/**
 * ГЛАВНЫЙ МЕТОД РЕГИСТРАЦИИ
 * Превращает сырой JSON из конфига в "Идеальный Трек" для всего приложения.
 */
export function registerTrack(raw, albumMeta = {}) {
  if (!raw || !raw.uid) return;

  const uid = safeStr(raw.uid);
  
  // Если уже есть, обновляем данные (на случай перезагрузки конфига)
  // но лучше просто игнорировать, чтобы не тратить ресурсы, если данные статичны.
  if (_byUid.has(uid)) return _byUid.get(uid);

  // Определяем базовый путь (если передан в meta)
  const baseUrl = albumMeta.base || '';

  // 1. Формируем ссылки
  const urlHi = resolveUrl(baseUrl, raw.audio || raw.urlHi); // audio - из нового конфига
  const urlLo = resolveUrl(baseUrl, raw.audio_low || raw.urlLo);
  const lyricsUrl = resolveUrl(baseUrl, raw.lyrics);
  const fulltextUrl = resolveUrl(baseUrl, raw.fulltext);

  // 2. Метаданные альбома (фоллбеки)
  const albumTitle = raw.album || albumMeta.title || albumMeta.albumName || 'Альбом';
  const artistName = raw.artist || albumMeta.artist || 'Витрина Разбита';
  const coverUrl = resolveUrl(baseUrl, raw.cover || albumMeta.cover || albumMeta.background || 'img/logo.png');
  const sourceAlbumKey = safeStr(raw.sourceAlbum || albumMeta.key || albumMeta.id);

  // 3. Собираем Идеальный Трек
  const track = {
    // Идентификаторы
    uid: uid,
    sourceAlbum: sourceAlbumKey, // Ключ родного альбома (важно для навигации)

    // Отображение
    title: safeStr(raw.title || 'Без названия'),
    artist: artistName,
    album: albumTitle,
    cover: coverUrl,
    
    // Воспроизведение (PlayerCore)
    src: urlHi, // По умолчанию играем Hi
    audio: urlHi, // Алиас для совместимости
    audio_low: urlLo, // Алиас для совместимости
    
    // Офлайн и Резолвер (OfflineManager)
    sources: {
      audio: {
        hi: urlHi,
        lo: urlLo
      }
    },
    sizeHi: Number(raw.size || raw.sizeHi || 0),
    sizeLo: Number(raw.size_low || raw.sizeLo || 0),

    // Лирика
    lyrics: lyricsUrl,
    fulltext: fulltextUrl,
    hasLyrics: !!(lyricsUrl || raw.hasLyrics),

    // Техническое поле
    _registeredAt: Date.now()
  };

  _tracks.push(track);
  _byUid.set(uid, track);
  
  return track;
}

/**
 * Массовая регистрация из конфига альбома
 */
export function registerTracks(trackList, albumMeta) {
  if (!Array.isArray(trackList)) return;
  trackList.forEach(t => registerTrack(t, albumMeta));
}

export function getAllTracks() { return [..._tracks]; }
export function getTrackByUid(uid) { return _byUid.get(safeStr(uid)); }
export function findTrack(predicate) { return _tracks.find(predicate); }

// Экспорт API
const API = { registerTrack, registerTracks, getAllTracks, getTrackByUid, findTrack };
export const TrackRegistry = API;
window.TrackRegistry = API;

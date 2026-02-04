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
 */
export function registerTrack(raw, albumMeta = {}) {
  if (!raw || !raw.uid) {
    if(raw) console.warn('Skipping track without UID:', raw.title);
    return;
  }

  const uid = safeStr(raw.uid);
  
  // Метаданные из вызова (приоритетные)
  const metaTitle = albumMeta.title || albumMeta.albumName;
  const metaArtist = albumMeta.artist;
  const metaKey = albumMeta.key || albumMeta.id;

  // --- ЛОГИКА ОБНОВЛЕНИЯ СУЩЕСТВУЮЩЕГО ---
  if (_byUid.has(uid)) {
    const existing = _byUid.get(uid);
    
    // Если у нас есть нормальное название альбома, а в реестре заглушка - обновляем
    if (metaTitle && (existing.album === 'Альбом' || !existing.album)) {
      existing.album = metaTitle;
    }
    
    // FIX: Берем ключ из меты ИЛИ из сырых данных, если в реестре пусто
    const newKey = metaKey || raw.sourceAlbum;
    if (!existing.sourceAlbum && newKey) {
      existing.sourceAlbum = newKey;
    }

    // Если в реестре нет ссылки на обложку - обновляем
    if ((!existing.cover || existing.cover.includes('logo.png')) && albumMeta.cover) {
       existing.cover = resolveUrl(albumMeta.base, albumMeta.cover);
    }
    
    return existing;
  }
  // ------------------------------------------

  // Базовый путь для ссылок
  const baseUrl = albumMeta.base || '';

  // Формируем ссылки
  const urlHi = resolveUrl(baseUrl, raw.audio || raw.urlHi);
  const urlLo = resolveUrl(baseUrl, raw.audio_low || raw.urlLo);
  const lyricsUrl = resolveUrl(baseUrl, raw.lyrics);
  const fulltextUrl = resolveUrl(baseUrl, raw.fulltext);

  // Определяем название
  // 1. Из raw.album (внутри трека в config.json)
  // 2. Из metaTitle (передано аргументом, например из заголовка config.json)
  // 3. Фоллбек
  const albumTitle = raw.album || metaTitle || 'Альбом';
  const artistName = raw.artist || metaArtist || 'Витрина Разбита';
  const coverUrl = resolveUrl(baseUrl, raw.cover || albumMeta.cover || albumMeta.background || 'img/logo.png');
  const sourceAlbumKey = safeStr(raw.sourceAlbum || metaKey);

  const track = {
    uid: uid,
    sourceAlbum: sourceAlbumKey,
    title: safeStr(raw.title || 'Без названия'),
    artist: artistName,
    album: albumTitle,
    cover: coverUrl,
    src: urlHi, 
    audio: urlHi,
    audio_low: urlLo,
    sources: { audio: { hi: urlHi, lo: urlLo } },
    sizeHi: Number(raw.size || raw.sizeHi || 0),
    sizeLo: Number(raw.size_low || raw.sizeLo || 0),
    lyrics: lyricsUrl,
    fulltext: fulltextUrl,
    hasLyrics: !!(lyricsUrl || raw.hasLyrics),
    _registeredAt: Date.now()
  };

  _tracks.push(track);
  _byUid.set(uid, track);
  
  return track;
}

export function registerTracks(trackList, albumMeta) {
  if (!Array.isArray(trackList)) return;
  trackList.forEach(t => registerTrack(t, albumMeta));
}

export function getAllTracks() { return [..._tracks]; }
export function getTrackByUid(uid) { return _byUid.get(safeStr(uid)); }
export function findTrack(predicate) { return _tracks.find(predicate); }

const API = { registerTrack, registerTracks, getAllTracks, getTrackByUid, findTrack };
export const TrackRegistry = API;
window.TrackRegistry = API;

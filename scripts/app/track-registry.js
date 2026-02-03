import { cleanUpOrphanedCache } from '../offline/cache-db.js';

let _tracks = [];
let _byUid = new Map();
let _fuse = null; // Если используешь поиск fuse.js, иначе можно убрать

// Очистка UID и гарантия строки
const safeUid = (val) => (val ? String(val).trim() : null);

/**
 * Главная функция регистрации треков из конфигов
 */
export function registerTracks(albumTracks, albumMeta) {
  if (!Array.isArray(albumTracks)) return;

  albumTracks.forEach(raw => {
    // 1. Берем UID строго из конфига
    let uid = safeUid(raw.uid);

    // FALLBACK: Если UID забыли в конфиге, генерируем из Артист+Название (стабильно)
    // НЕ ИСПОЛЬЗУЕМ URL, так как он меняется!
    if (!uid) {
       const key = `${albumMeta.artist || 'Unknown'}-${raw.title || 'Untitled'}`;
       // Простой хэш или строка, главное чтобы не зависело от http://...
       uid = key.replace(/\s+/g, '-').toLowerCase(); 
       console.warn(`⚠️ Track without UID in ${albumMeta.albumName}. Generated: ${uid}`);
    }

    // Проверка на дубликаты (Критично для мульти-альбомности)
    if (_byUid.has(uid)) {
       const existing = _byUid.get(uid);
       // Если это тот же трек (перезагрузка) - ок. Если разные - ошибка.
       if (existing.title !== raw.title) {
         console.error(`🔥 UID COLLISION: ${uid} is used by "${existing.title}" and "${raw.title}"`);
       }
       return; 
    }

    // Нормализация объекта трека под единый стандарт приложения
    const track = {
      ...raw,
      uid: uid,
      // Сохраняем поля для резолвера (ТЗ 7.4.2)
      audio: raw.audio,          // Hi URL
      audio_low: raw.audio_low,  // Lo URL
      sizeHi: raw.size,          // Размер Hi (MB)
      sizeLo: raw.size_low,      // Размер Lo (MB)
      
      // Метаданные
      album: albumMeta.albumName,
      artist: albumMeta.artist || raw.artist,
      cover: raw.cover || albumMeta.cover || albumMeta.background, // Фоллбек обложки
      sourceAlbum: albumMeta.id || albumMeta.albumName, // Для группировки
      
      // Флаг, что данные полные
      _registered: true
    };

    _tracks.push(track);
    _byUid.set(uid, track);
  });

  // Обновляем поисковый индекс, если нужно
  // updateSearchIndex(); 
}

export function getAllTracks() { return [..._tracks]; }
export function getTrackByUid(uid) { return _byUid.get(safeUid(uid)); }

// Поиск (если нужен простой фильтр)
export function findTrack(predicate) { return _tracks.find(predicate); }

export const TrackRegistry = { registerTracks, getAllTracks, getTrackByUid };

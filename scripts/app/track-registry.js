// scripts/app/track-registry.js

let _tracks = [];
let _byUid = new Map();

// Очистка UID и гарантия строки
const safeUid = (val) => (val ? String(val).trim() : null);

/**
 * Регистрация одного трека (используется в albums.js и loaders.js)
 */
export function registerTrack(raw, albumMeta = {}) {
  if (!raw) return;

  // 1. Берем UID строго
  let uid = safeUid(raw.uid);

  // FALLBACK: Если UID нет
  if (!uid) {
     const key = `${albumMeta.artist || raw.artist || 'Unknown'}-${raw.title || 'Untitled'}`;
     uid = key.replace(/\s+/g, '-').toLowerCase(); 
     console.warn(`⚠️ Track without UID. Generated: ${uid}`);
  }

  // Проверка на дубликаты (игнорируем, если уже есть)
  if (_byUid.has(uid)) return;

  // Нормализация
  const track = {
    ...raw,
    uid: uid,
    // Поля для резолвера (адаптация под разные форматы входящих данных)
    audio: raw.audio || raw.urlHi,
    audio_low: raw.audio_low || raw.urlLo,
    sizeHi: raw.size || raw.sizeHi,
    sizeLo: raw.size_low || raw.sizeLo,
    
    // Метаданные (с фоллбеками)
    album: raw.album || albumMeta.albumName,
    artist: raw.artist || albumMeta.artist,
    cover: raw.cover || albumMeta.cover || albumMeta.background,
    sourceAlbum: raw.sourceAlbum || albumMeta.id || albumMeta.albumName, 
    
    _registered: true
  };

  _tracks.push(track);
  _byUid.set(uid, track);
}

/**
 * Регистрация массива треков (для совместимости)
 */
export function registerTracks(albumTracks, albumMeta) {
  if (Array.isArray(albumTracks)) {
    albumTracks.forEach(t => registerTrack(t, albumMeta));
  }
}

export function getAllTracks() { return [..._tracks]; }
export function getTrackByUid(uid) { return _byUid.get(safeUid(uid)); }
export function findTrack(predicate) { return _tracks.find(predicate); }

// Формируем объект API
const API = { registerTrack, registerTracks, getAllTracks, getTrackByUid, findTrack };

// Экспортируем как default и как именованную константу
export const TrackRegistry = API;

// ВАЖНО: Делаем доступным глобально для модулей, которые не используют import (offline-modal, favorites)
window.TrackRegistry = API;

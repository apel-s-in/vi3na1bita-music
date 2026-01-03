// scripts/app/track-registry.js
// Глобально-лёгкий реестр треков по uid, без побочных эффектов.

const REG = new Map();
// shape: { uid, title, urlHi, urlLo, sizeHi, sizeLo, lyrics, fulltext, sourceAlbum? }

export function registerTrack(meta) {
  if (!meta || !meta.uid) return;
  const rec = {
    uid: meta.uid,
    title: meta.title || '',
    urlHi: meta.audio || meta.urlHi || null,
    urlLo: meta.audio_low || meta.urlLo || null,
    sizeHi: Number(meta.size || meta.sizeHi || 0),
    sizeLo: Number(meta.size_low || meta.sizeLo || 0),
    lyrics: meta.lyrics || null,
    fulltext: meta.fulltext || null,
    sourceAlbum: meta.sourceAlbum || null,
  };
  REG.set(rec.uid, rec);
}

export function getTrackByUid(uid) {
  return REG.get(uid) || null;
}

export function getAllUids() {
  return Array.from(REG.keys());
}

// Для отладки/диагностики
export const TrackRegistry = { registerTrack, getTrackByUid, getAllUids };

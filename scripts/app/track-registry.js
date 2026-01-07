// scripts/app/track-registry.js
// Реестр метаданных треков (ТЗ 7.1)

const registry = new Map();

export function registerTrack(track) {
  if (!track) return;
  const uid = String(track.uid || '').trim();
  if (!uid) return;

  const existing = registry.get(uid);
  const merged = existing ? { ...existing, ...track } : { ...track };

  merged.uid = uid;

  if (track.sources?.audio?.hi) merged.urlHi = track.sources.audio.hi;
  if (track.sources?.audio?.lo) merged.urlLo = track.sources.audio.lo;
  if (track.audio) merged.urlHi = merged.urlHi || track.audio;
  if (track.audio_low) merged.urlLo = merged.urlLo || track.audio_low;

  // ✅ Sizes normalization (critical for offline completeness detection)
  // Support both legacy fields (size/size_low) and normalized fields (sizeHi/sizeLo).
  const sizeHi =
    (typeof track.sizeHi === 'number' ? track.sizeHi : null) ??
    (typeof track.size === 'number' ? track.size : null);

  const sizeLo =
    (typeof track.sizeLo === 'number' ? track.sizeLo : null) ??
    (typeof track.size_low === 'number' ? track.size_low : null);

  if (typeof sizeHi === 'number') merged.sizeHi = sizeHi;
  if (typeof sizeLo === 'number') merged.sizeLo = sizeLo;

  // Keep legacy keys too (some code paths still read them)
  if (typeof track.size === 'number') merged.size = track.size;
  if (typeof track.size_low === 'number') merged.size_low = track.size_low;

  registry.set(uid, merged);
}

export function registerTracks(tracks) {
  if (!Array.isArray(tracks)) return;
  tracks.forEach(t => registerTrack(t));
}

export function getTrackByUid(uid) {
  const u = String(uid || '').trim();
  if (!u) return null;
  return registry.get(u) || null;
}

export function getAllTracks() {
  return Array.from(registry.values());
}

export function clearRegistry() {
  registry.clear();
}

// ✅ Публикуем реестр в window для OFFLINE модалки/updates/re-cache (v1.0).
// Это не добавляет зависимостей, только упрощает доступ из UI/IIFE к ESM данным.
try {
  window.TrackRegistry = {
    registerTrack,
    registerTracks,
    getTrackByUid,
    getAllTracks,
    clearRegistry
  };
} catch {}


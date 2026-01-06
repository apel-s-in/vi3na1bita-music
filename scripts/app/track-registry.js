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

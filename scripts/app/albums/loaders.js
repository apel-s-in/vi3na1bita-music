// scripts/app/albums/loaders.js
// Загрузка/нормализация данных альбома (tracks/socials) + регистрация треков в TrackRegistry.

import { registerTrack } from '../track-registry.js';

export function firstUrl(base, rel) {
  return rel ? new URL(rel, base).toString() : null;
}

export function normalizeSocials(raw) {
  if (Array.isArray(raw?.social_links)) return raw.social_links;
  if (Array.isArray(raw?.socials)) return raw.socials.map((s) => ({ label: s?.title, url: s?.url }));
  return [];
}

export function normalizeTracks(tracks, base, albumKey) {
  const out = [];
  const list = Array.isArray(tracks) ? tracks : [];

  for (let i = 0; i < list.length; i++) {
    const t = list[i] || {};

    const fileHi = firstUrl(base, t.audio);
    const fileLo = firstUrl(base, t.audio_low);

    const lyrics = firstUrl(base, t.lyrics);
    const fulltext = firstUrl(base, t.fulltext);

    const uid = typeof t.uid === 'string' && t.uid.trim() ? t.uid.trim() : null;

    const sizeHi = typeof t.size === 'number' ? t.size : null;
    const sizeLo = typeof t.size_low === 'number' ? t.size_low : null;

    const hasLyrics = typeof t.hasLyrics === 'boolean' ? t.hasLyrics : !!lyrics;

    const tr = {
      num: i + 1,
      title: t.title || `Трек ${i + 1}`,
      file: fileHi, // back-compat (часть кода может использовать t.file)
      fileHi,
      fileLo,
      sizeHi,
      sizeLo,
      sources: (fileHi || fileLo) ? { audio: { hi: fileHi, lo: fileLo } } : null,
      lyrics,
      fulltext,
      uid,
      hasLyrics,
    };

    out.push(tr);

    // Регистрация в TrackRegistry (UID-only)
    if (uid) {
      try {
        registerTrack({
          uid,
          title: tr.title,
          audio: tr.fileHi || tr.file || null,
          audio_low: tr.fileLo || null,
          size: tr.sizeHi || null,
          size_low: tr.sizeLo || null,
          sources: tr.sources || null,
          lyrics: tr.lyrics || null,
          fulltext: tr.fulltext || null,
          sourceAlbum: albumKey,
        });
      } catch {}
    }
  }

  return out;
}

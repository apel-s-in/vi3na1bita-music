// scripts/app/albums/loaders.js
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

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i] || {};

    const fileHi = firstUrl(base, t.audio);
    const fileLo = firstUrl(base, t.audio_low);

    const lyrics = firstUrl(base, t.lyrics);
    const fulltext = firstUrl(base, t.fulltext);

    const uid = typeof t.uid === 'string' && t.uid.trim() ? t.uid.trim() : null;

    const sizeHi = typeof t.size === 'number' ? t.size : null;
    const sizeLo = typeof t.size_low === 'number' ? t.size_low : null;

    const hasLyrics = typeof t.hasLyrics === 'boolean' ? t.hasLyrics : !!lyrics;
    const sources = fileHi || fileLo ? { audio: { hi: fileHi, lo: fileLo } } : null;

    const tr = {
      num: i + 1,
      title: t.title || `Трек ${i + 1}`,
      file: fileHi, // back-compat
      fileHi,
      fileLo,
      sizeHi,
      sizeLo,
      sources,
      lyrics,
      fulltext,
      uid,
      hasLyrics,
    };

    out.push(tr);

    if (uid) {
      try {
        registerTrack({
          uid,
          title: tr.title,
          audio: tr.fileHi || tr.file || null,
          audio_low: tr.fileLo || null,
          size: tr.sizeHi || null,
          size_low: tr.sizeLo || null,
          lyrics: tr.lyrics || null,
          fulltext: tr.fulltext || null,
          sourceAlbum: albumKey,
        });
      } catch {}
    }
  }

  return out;
}

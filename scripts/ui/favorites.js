// scripts/ui/favorites.js
import FavoritesV2 from "../core/favorites-v2.js";

function safeStr(x) {
  return String(x ?? "").trim();
}

function getTrack(uid) {
  try {
    const tr = window.TrackRegistry?.getTrackByUid?.(uid) || null;
    return tr || null;
  } catch {
    return null;
  }
}

export function buildFavoritesModel() {
  FavoritesV2.ensureMigrated();

  const liked = FavoritesV2.readLikedSet();
  const refs = FavoritesV2.readRefsByUid();
  const items = Object.values(refs)
    .filter((r) => r && r.uid)
    .sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0))
    .map((ref) => {
      const uid = safeStr(ref.uid);
      const tr = getTrack(uid);
      if (!tr) return null;

      const active = liked.has(uid);

      return {
        uid,
        sourceAlbum: safeStr(tr.sourceAlbum),

        __active: active,
        __inactive: !active,

        // best-effort fields (used by favorites-view/albums/offline/policy)
        title: tr.title || '',
        audio: tr.audio || tr.urlHi || null,
        audio_low: tr.audio_low || tr.urlLo || null,
        sources: tr.sources || (tr.urlHi || tr.urlLo ? { audio: { hi: tr.urlHi || null, lo: tr.urlLo || null } } : null),

        lyrics: tr.lyrics || null,
        fulltext: tr.fulltext || null,

        size: (typeof tr.sizeHi === 'number' ? tr.sizeHi : (typeof tr.size === 'number' ? tr.size : null)),
        size_low: (typeof tr.sizeLo === 'number' ? tr.sizeLo : (typeof tr.size_low === 'number' ? tr.size_low : null)),

        hasLyrics: (typeof tr.hasLyrics === 'boolean') ? tr.hasLyrics : !!tr.lyrics,
      };
    })
    .filter(Boolean);

  // active first, then inactive
  items.sort((a, b) => Number(!!b.__active) - Number(!!a.__active));

  return items;
}

/**
 * Important: no autoplay here. Ever.
 */
export function rebuildFavoritesView() {
  const model = buildFavoritesModel();
  window.FavoritesUI?.renderFavoritesList?.(model);
}

export default {
  buildFavoritesModel,
  rebuildFavoritesView,
};

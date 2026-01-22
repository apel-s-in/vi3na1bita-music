// scripts/ui/favorites.js
import FavoritesV2 from "../core/favorites-v2.js";

function safeStr(x) {
  return String(x ?? "").trim();
}

function getAllTracksFromIndex() {
  // В твоём проекте есть TrackRegistry или albumsIndex.
  // Поддержим 2 варианта:
  const reg = window.TrackRegistry;
  if (reg?.getAllTracks) return reg.getAllTracks();

  // fallback: пробуем текущий альбом
  const cfg = window.__albumConfig;
  return Array.isArray(cfg?.tracks) ? cfg.tracks : [];
}

function buildTrackByUidMap() {
  const all = getAllTracksFromIndex();
  const map = new Map();
  for (const t of all) {
    const uid = safeStr(t?.uid);
    if (!uid) continue;
    map.set(uid, t);
  }
  return map;
}

export function buildFavoritesModel() {
  FavoritesV2.ensureMigrated();

  const liked = FavoritesV2.readLikedSet();
  const refs = FavoritesV2.readRefsByUid();
  const byUid = buildTrackByUidMap();

  const items = Object.values(refs)
    .filter((r) => r && r.uid)
    .sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0))
    .map((ref) => {
      const uid = safeStr(ref.uid);
      const base = byUid.get(uid);
      if (!base) return null;

      const active = liked.has(uid);
      return {
        ...base,
        uid,
        __active: active,
        __inactive: !active,
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

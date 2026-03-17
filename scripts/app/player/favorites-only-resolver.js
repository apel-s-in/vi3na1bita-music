const W = window;

const sUid = v => String(v || '').trim() || null;
const isFavView = key => String(key || '') === (W.SPECIAL_FAVORITES_KEY || '__favorites__');
const isShowcase = key => String(key || '').startsWith(W.SPECIAL_SHOWCASE_KEY || '__showcase__');

const getShowcaseHiddenSet = (albumKey) => {
  try {
    if (!isShowcase(albumKey) || !W.ShowcaseManager?._ctxHiddenSet) return new Set();
    const raw = String(albumKey || '');
    const id = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : '__default__';
    return new Set(W.ShowcaseManager._ctxHiddenSet(id));
  } catch {
    return new Set();
  }
};

const normalizeTrack = t => t && sUid(t.uid) ? t : null;

export function resolveFavoritesOnlyState({
  sourcePlaylist = [],
  playingAlbum = '',
  favoritesOnly = false,
  currentUid = null,
  isFavorite = () => false,
  favoritesState = { active: [], inactive: [] }
} = {}) {
  const src = sourcePlaylist.map(normalizeTrack).filter(Boolean);
  const hiddenSet = getShowcaseHiddenSet(playingAlbum);
  const activeFavSet = new Set((favoritesState.active || []).map(i => sUid(i.uid)).filter(Boolean));

  const basePlayable = src.filter(t => {
    const uid = sUid(t.uid);
    if (!uid) return false;
    if (hiddenSet.has(uid)) return false;
    if (isFavView(playingAlbum) && !activeFavSet.has(uid)) return false;
    return true;
  });

  const favPlayable = basePlayable.filter(t => isFavorite(sUid(t.uid)));
  const resolved = favoritesOnly ? favPlayable : basePlayable;
  const currentAllowed = !!resolved.find(t => sUid(t.uid) === sUid(currentUid));
  const currentIndex = resolved.findIndex(t => sUid(t.uid) === sUid(currentUid));

  return {
    sourcePlaylist: src,
    playingAlbum,
    hiddenSet,
    basePlayable,
    favoritesPlayable: favPlayable,
    resolvedPlaylist: resolved,
    currentAllowed,
    currentIndex,
    firstPlayableUid: sUid(resolved[0]?.uid),
    isEmptyForFavoritesMode: favPlayable.length === 0
  };
}

export function canLaunchTrackInFavoritesOnlyContext({ uid, albumKey } = {}) {
  const safeUid = sUid(uid);
  if (!safeUid) return { ok: false, reason: 'bad_uid' };
  if (!W.playerCore) return { ok: true };
  if (String(localStorage.getItem('favoritesOnlyMode') || '0') !== '1') return { ok: true };

  const hiddenSet = getShowcaseHiddenSet(albumKey);
  if (hiddenSet.has(safeUid)) return { ok: false, reason: 'hidden' };
  if (!W.playerCore.isFavorite(safeUid)) return { ok: false, reason: 'not_favorite' };
  return { ok: true };
}

export default { resolveFavoritesOnlyState, canLaunchTrackInFavoritesOnlyContext };

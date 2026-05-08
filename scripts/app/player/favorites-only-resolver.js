const W = window, sUid = v => String(v || '').trim() || null, isFavView = key => String(key || '') === (W.SPECIAL_FAVORITES_KEY || '__favorites__'), isShowcase = key => String(key || '').startsWith(W.SPECIAL_SHOWCASE_KEY || '__showcase__'), normalizeTrack = t => t && sUid(t.uid) ? t : null;

const getShowcaseHiddenSet = albumKey => { try { if (!isShowcase(albumKey) || !W.ShowcaseManager?._ctxHiddenSet) return new Set(); const raw = String(albumKey || ''), id = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : '__default__'; return new Set(W.ShowcaseManager._ctxHiddenSet(id)); } catch { return new Set(); } };

export const resolveFavoritesOnlyState = ({ sourcePlaylist = [], playingAlbum = '', favoritesOnly = false, currentUid = null, isFavorite = () => false, favoritesState = { active: [], inactive: [] } } = {}) => {
  const src = sourcePlaylist.map(normalizeTrack).filter(Boolean), hiddenSet = getShowcaseHiddenSet(playingAlbum), activeFavSet = new Set((favoritesState.active || []).map(i => sUid(i.uid)).filter(Boolean));
  const basePlayable = src.filter(t => { const uid = sUid(t.uid); return uid && !hiddenSet.has(uid) && !(isFavView(playingAlbum) && !activeFavSet.has(uid)); }), favPlayable = basePlayable.filter(t => isFavorite(sUid(t.uid))), resolved = favoritesOnly ? favPlayable : basePlayable, currentAllowed = !!resolved.find(t => sUid(t.uid) === sUid(currentUid)), currentIndex = resolved.findIndex(t => sUid(t.uid) === sUid(currentUid));
  return { sourcePlaylist: src, playingAlbum, hiddenSet, basePlayable, favoritesPlayable: favPlayable, resolvedPlaylist: resolved, currentAllowed, currentIndex, firstPlayableUid: sUid(resolved[0]?.uid), isEmptyForFavoritesMode: favPlayable.length === 0 };
};

export const getFavoritesOnlyVisibleUidSetForContext = ({ contextType = 'album', albumKey = '', sourcePlaylist = [], isFavorite = () => false, favoritesState = { active: [], inactive: [] } } = {}) => contextType === 'favorites' ? new Set([...new Set((favoritesState.active || []).map(i => sUid(i.uid)).filter(Boolean))].filter(uid => isFavorite(uid))) : new Set((resolveFavoritesOnlyState({ sourcePlaylist, playingAlbum: albumKey, favoritesOnly: true, currentUid: null, isFavorite, favoritesState }).resolvedPlaylist || []).map(t => sUid(t.uid)).filter(Boolean));

export const getFavoritesOnlyVisibleUidSet = (opts = {}) => getFavoritesOnlyVisibleUidSetForContext({ ...opts, contextType: isFavView(opts.playingAlbum) ? 'favorites' : (isShowcase(opts.playingAlbum) ? 'showcase' : 'album'), albumKey: opts.playingAlbum });

export const canLaunchTrackInFavoritesOnlyContext = ({ uid, albumKey } = {}) => {
  const safeUid = sUid(uid); if (!safeUid) return { ok: false, reason: 'bad_uid' };
  if (!W.playerCore || String(localStorage.getItem('favoritesOnlyMode') || '0') !== '1') return { ok: true };
  if (getShowcaseHiddenSet(albumKey).has(safeUid)) return { ok: false, reason: 'hidden' };
  if (!W.playerCore.isFavorite(safeUid)) return { ok: false, reason: 'not_favorite' };
  return { ok: true };
};

W.FavoritesOnlyResolver = { resolveFavoritesOnlyState, getFavoritesOnlyVisibleUidSet, getFavoritesOnlyVisibleUidSetForContext, canLaunchTrackInFavoritesOnlyContext };
export default W.FavoritesOnlyResolver;

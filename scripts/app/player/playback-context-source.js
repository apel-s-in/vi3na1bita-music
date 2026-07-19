import { getAlbumPlaybackTracks } from '../albums/album-playback-builder.js';
const W = window, FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__', SHOW = W.SPECIAL_SHOWCASE_KEY || '__showcase__', LOGO = 'img/logo.png', s = v => String(v || '').trim();

export const getFavoritesSourcePlaylist = () => (W.playerCore?.getFavoritesState?.()?.active || []).map(i => {
  const tr = W.TrackRegistry?.getTrackByUid?.(i.uid) || {}, sAlb = i.sourceAlbum || tr.sourceAlbum || null;
  return { ...tr, uid: i.uid, sourceAlbum: sAlb, album: 'Избранное', cover: W.AlbumsManager?.covers?.get?.(sAlb) || LOGO };
}).filter(t => t?.uid);

export const getAlbumSourcePlaylist = albumKey => {
  const key = s(albumKey); if (!key) return [];
  if (key === FAV) return getFavoritesSourcePlaylist();
  if (String(key).startsWith(SHOW)) return W.ShowcaseManager?.getContextSourcePlaylist?.(key) || [];
  const am = W.AlbumsManager, d = am?.cache?.get?.(key); if (!d) return [];
  return getAlbumPlaybackTracks({ albumKey:key, album:d, cover:am?.covers?.get?.(key), logo:LOGO });
};

export const getSourcePlaylistForContext = albumKey => getAlbumSourcePlaylist(albumKey);

W.PlaybackContextSource = { getFavoritesSourcePlaylist, getAlbumSourcePlaylist, getSourcePlaylistForContext };
export default W.PlaybackContextSource;

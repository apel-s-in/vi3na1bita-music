const W = window, FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__', SHOW = W.SPECIAL_SHOWCASE_KEY || '__showcase__', LOGO = 'img/logo.png', s = v => String(v || '').trim();

function mapAlbumTrack(albumKey, albumData, cover, t) { return { src: t.src, sources: t.sources, title: t.title, artist: albumData.artist, album: albumData.title, cover: cover || LOGO, uid: t.uid, lyrics: t.lyrics, fulltext: t.fulltext, hasLyrics: t.hasLyrics, sourceAlbum: albumKey }; }

export function getFavoritesSourcePlaylist() {
  return (W.playerCore?.getFavoritesState?.()?.active || []).map(i => {
    const tr = W.TrackRegistry?.getTrackByUid?.(i.uid) || {}, sAlb = i.sourceAlbum || tr.sourceAlbum || null;
    return { ...tr, uid: i.uid, sourceAlbum: sAlb, album: 'Избранное', cover: W.AlbumsManager?.covers?.get?.(sAlb) || 'img/logo.png' };
  }).filter(t => t?.uid);
}

export function getAlbumSourcePlaylist(albumKey) {
  const key = s(albumKey); if (!key) return [];
  if (key === FAV) return getFavoritesSourcePlaylist();
  if (String(key).startsWith(SHOW)) return W.ShowcaseManager?.getContextSourcePlaylist?.(key) || [];
  const am = W.AlbumsManager, d = am?.cache?.get?.(key); if (!d) return [];
  if (!d._pTracks) d._pTracks = (d.tracks || []).filter(t => t.src).map(t => mapAlbumTrack(key, d, am?.covers?.get?.(key) || LOGO, t));
  return d._pTracks || [];
}

export function getSourcePlaylistForContext(albumKey) { return getAlbumSourcePlaylist(albumKey); }

const api = { getFavoritesSourcePlaylist, getAlbumSourcePlaylist, getSourcePlaylistForContext };
W.PlaybackContextSource = api;
export default api;

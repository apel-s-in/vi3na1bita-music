const W = window;
const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
const SHOW = W.SPECIAL_SHOWCASE_KEY || '__showcase__';
const LOGO = 'img/logo.png';
const s = v => String(v || '').trim();

function mapAlbumTrack(albumKey, albumData, cover, t) {
  return {
    src: t.src,
    sources: t.sources,
    title: t.title,
    artist: albumData.artist,
    album: albumData.title,
    cover: cover || LOGO,
    uid: t.uid,
    lyrics: t.lyrics,
    fulltext: t.fulltext,
    hasLyrics: t.hasLyrics,
    sourceAlbum: albumKey
  };
}

function getFavoritesSourcePlaylist() {
  const pc = W.playerCore;
  const st = pc?.getFavoritesState?.() || { active: [] };
  return (st.active || []).map(i => {
    const tr = W.TrackRegistry?.getTrackByUid?.(i.uid) || {};
    const sAlb = i.sourceAlbum || tr.sourceAlbum || null;
    const realCover = W.AlbumsManager?.covers?.get?.(sAlb) || 'img/logo.png';
    return {
      ...tr,
      uid: i.uid,
      sourceAlbum: sAlb,
      album: 'Избранное',
      cover: realCover
    };
  }).filter(t => t?.uid);
}

function getAlbumSourcePlaylist(albumKey) {
  const key = s(albumKey);
  if (!key) return [];
  if (key === FAV) return getFavoritesSourcePlaylist();
  if (String(key).startsWith(SHOW)) return W.ShowcaseManager?.getContextSourcePlaylist?.(key) || [];

  const am = W.AlbumsManager;
  const d = am?.cache?.get?.(key);
  if (!d) return [];
  if (!d._pTracks) {
    const cover = am?.covers?.get?.(key) || LOGO;
    d._pTracks = (d.tracks || []).filter(t => t.src).map(t => mapAlbumTrack(key, d, cover, t));
  }
  return d._pTracks || [];
}

function getSourcePlaylistForContext(albumKey) {
  return getAlbumSourcePlaylist(albumKey);
}

const api = { getFavoritesSourcePlaylist, getAlbumSourcePlaylist, getSourcePlaylistForContext };
W.PlaybackContextSource = api;

export { getFavoritesSourcePlaylist, getAlbumSourcePlaylist, getSourcePlaylistForContext };
export default api;

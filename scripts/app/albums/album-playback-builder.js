export const buildAlbumPlaybackTracks = ({ albumKey, album, cover = '', logo = 'img/logo.png' } = {}) =>
  (album?.tracks || []).filter(t => t?.src).map(t => ({ ...t, artist: album?.artist, album: album?.title, cover: cover || logo, sourceAlbum: albumKey }));

export const getAlbumPlaybackTracks = ({ albumKey, album, cover = '', logo = 'img/logo.png' } = {}) => {
  if (!album) return [];
  return album._pTracks || (album._pTracks = buildAlbumPlaybackTracks({ albumKey, album, cover, logo }));
};

export const clearAlbumPlaybackTracks = album => { if (album) delete album._pTracks; };

export default { buildAlbumPlaybackTracks, getAlbumPlaybackTracks, clearAlbumPlaybackTracks };

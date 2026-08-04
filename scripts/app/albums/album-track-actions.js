import { setFavoriteStarState } from '../../ui/icon-utils.js';
import { makeFavoritesOnlyAfterPlay, playWithFavoritesOnlyResolution } from '../player/favorites-only-actions.js';
import { getAlbumPlaybackTracks } from './album-playback-builder.js';
const W = window;
const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
const safe = value => String(value == null ? '' : value).trim();
export const bindAlbumTrackActions = ({ root, getCurrentAlbum, getAlbum, getCover, setPlayingAlbum, highlightCurrentTrack, logo = 'img/logo.png' } = {}) => {
  if (!root || root._albumTrackActionsBound) return false;
  root._albumTrackActionsBound = true;
  root.addEventListener('click', event => {
    W.playerCore?.prepareContext?.();
    if (getCurrentAlbum?.() === FAV || event.target.closest('.offline-ind')) return;
    const row = event.target.closest('.track');
    if (!row || !root.contains(row)) return;
    const albumKey = safe(row.dataset.album);
    const uid = safe(row.dataset.uid);
    const player = W.playerCore;
    if (!albumKey || albumKey.startsWith('__') || !uid || !player) return;
    const star = event.target.closest('.like-star');
    if (star) {
      event.preventDefault();
      event.stopPropagation();
      setFavoriteStarState(star, !player.isFavorite(uid));
      star.classList.add('animating');
      setTimeout(() => star.classList.remove('animating'), 320);
      player.toggleFavorite(uid, { fromAlbum: true, albumKey });
      return;
    }
    const album = getAlbum?.(albumKey);
    if (!album) return;
    setPlayingAlbum?.(albumKey);
    const playlist = getAlbumPlaybackTracks({ albumKey, album, cover: getCover?.(albumKey), logo });
    const index = playlist.findIndex(track => track.uid === uid);
    if (index < 0) return;
    const afterPlay = makeFavoritesOnlyAfterPlay({ highlight: (trackIndex, meta) => highlightCurrentTrack?.(trackIndex, meta), ensureBlock: (trackIndex, options) => W.PlayerUI?.ensurePlayerBlock?.(trackIndex, options) });
    return playWithFavoritesOnlyResolution({
      list: playlist,
      uid,
      albumKey,
      track: playlist[index],
      play: (list, trackUid) => player.playExactFromPlaylist?.(list, trackUid, { dir: 1 }),
      addFavorite: trackUid => player.toggleFavorite(trackUid, { fromAlbum: true, albumKey }),
      disableMode: () => localStorage.setItem('favoritesOnlyMode', '0'),
      afterPlay: () => afterPlay({ index, uid, albumKey })
    });
  });
  return true;
};
export default { bindAlbumTrackActions };

// UID.002_(UID-first core)_(строки обычного альбома адресуются по uid)_(renderer не владеет playback)
// UID.094_(No-paralysis rule)_(renderer только создаёт DOM)_(не вызывает play/pause/stop)
// UID.096_(Helper-first anti-duplication policy)_(HTML обычных track rows вынесен из AlbumsManager)

import { injectIndicator } from '../../ui/offline-indicators.js';
import { renderFavoriteStar } from '../../ui/icon-utils.js';

export const renderAlbumTracks = ({ root, albumKey, tracks = [], escapeHtml = v => String(v || ''), isFavorite = () => false } = {}) => {
  if (!root) return false;
  const esc = escapeHtml, key = esc(albumKey);
  root.innerHTML = (Array.isArray(tracks) ? tracks : []).map((t, i) => {
    const uid = esc(t?.uid), liked = !!(t?.uid && isFavorite(t.uid)), num = String(t?.num ?? i + 1).padStart(2, '0');
    return `<div class="track" id="trk${i}" data-index="${i}" data-album="${key}" data-uid="${uid}"><div class="tnum">${num}.</div><div class="track-title">${esc(t?.title || 'Без названия')}</div>${renderFavoriteStar(liked, `data-album="${key}" data-uid="${uid}"`)}</div>`;
  }).join('');
  root.querySelectorAll('.track[data-uid]').forEach(injectIndicator);
  return true;
};

export default { renderAlbumTracks };

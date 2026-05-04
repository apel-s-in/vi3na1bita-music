// scripts/analytics/backup-merge.js
// Thin compatibility facade. Favorites/playlists merge вынесены в отдельные файлы.

import { mergeFavoritesStorageSafe } from './favorites-storage-merge.js';
import { mergePlaylistsStorageSafe } from './playlists-storage-merge.js';

export const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const minPositive = (...vs) => Math.min(...vs.map(toNum).filter(v => v > 0)) || 0;

export const getBackupConflictPolicy = () => {
  try { return ['ask','latest','trash'].includes(localStorage.getItem('backup:conflict_policy:v1')) ? localStorage.getItem('backup:conflict_policy:v1') : 'ask'; } catch { return 'ask'; }
};

export { mergeFavoritesStorageSafe, mergePlaylistsStorageSafe };

export const mergeProfileStorageValueSafe = (k, l, r) =>
  r == null ? l : (l == null ? r : (k === '__favorites_v2__' ? mergeFavoritesStorageSafe(l, r) : (k === 'sc3:playlists' ? mergePlaylistsStorageSafe(l, r) : r)));

export default { toNum, minPositive, getBackupConflictPolicy, mergeFavoritesStorageSafe, mergePlaylistsStorageSafe, mergeProfileStorageValueSafe };

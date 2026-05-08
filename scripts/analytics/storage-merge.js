// UID.096_(Helper-first anti-duplication policy)_(storage merge — каноническое имя вместо backup-merge)_(backup-merge остаётся только facade) UID.099_(Multi-device sync model)_(favorites/playlists/profile merge в одном public API)_(без circular imports)
import { toNum, minPositive, getBackupConflictPolicy } from './storage-merge-utils.js';
import { mergeFavoritesStorageSafe } from './favorites-storage-merge.js';
import { mergePlaylistsStorageSafe } from './playlists-storage-merge.js';
export { toNum, minPositive, getBackupConflictPolicy, mergeFavoritesStorageSafe, mergePlaylistsStorageSafe };
export const mergeProfileStorageValueSafe = (k, l, r) => r == null ? l : (l == null ? r : (k === '__favorites_v2__' ? mergeFavoritesStorageSafe(l, r) : (k === 'sc3:playlists' ? mergePlaylistsStorageSafe(l, r) : r)));
export default { toNum, minPositive, getBackupConflictPolicy, mergeFavoritesStorageSafe, mergePlaylistsStorageSafe, mergeProfileStorageValueSafe };

// UID.096_(Helper-first anti-duplication policy)_(storage merge — каноническое имя вместо backup-merge)_(backup-merge остаётся только facade) UID.099_(Multi-device sync model)_(favorites/playlists/profile merge в одном public API)_(без circular imports)
import { toNum, minPositive, getBackupConflictPolicy } from './storage-merge-utils.js';
import { mergePlaylistsStorageSafe } from './playlists-storage-merge.js';

export { toNum, minPositive, getBackupConflictPolicy, mergePlaylistsStorageSafe };

export const mergeProfileStorageValueSafe = (key, localValue, remoteValue) => {
  if (remoteValue == null) return localValue;
  if (localValue == null) return remoteValue;
  return key === 'sc3:playlists' ? mergePlaylistsStorageSafe(localValue, remoteValue) : remoteValue;
};

export default { toNum, minPositive, getBackupConflictPolicy, mergePlaylistsStorageSafe, mergeProfileStorageValueSafe };

export const CLOUD_BACKUP_DIR = 'app:/Backup';
export const CLOUD_BACKUP_LATEST_PATH = `${CLOUD_BACKUP_DIR}/vi3na1bita_backup.vi3bak`;
export const CLOUD_BACKUP_META_PATH = `${CLOUD_BACKUP_DIR}/vi3na1bita_backup_meta.json`;
export const CLOUD_BACKUP_VERSION_RE = /^app:\/Backup\/vi3na1bita_backup(?:_[A-Za-z0-9._-]+)?\.vi3bak$/;

export const safeCloudString = v => String(v == null ? '' : v).trim();
export const safeCloudNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const buildBackupHistoryPath = ts => `${CLOUD_BACKUP_DIR}/vi3na1bita_backup_${safeCloudString(ts)}.vi3bak`;

export const isLatestBackupPath = path => safeCloudString(path) === CLOUD_BACKUP_LATEST_PATH;
export const isVersionedBackupPath = path => CLOUD_BACKUP_VERSION_RE.test(safeCloudString(path));
export const sanitizeBackupPath = path => {
  const p = safeCloudString(path);
  if (!p) return CLOUD_BACKUP_LATEST_PATH;
  if (p === CLOUD_BACKUP_LATEST_PATH) return CLOUD_BACKUP_LATEST_PATH;
  return isVersionedBackupPath(p) ? p : CLOUD_BACKUP_LATEST_PATH;
};

export const normalizeCloudBackupMeta = (m = {}) => ({
  latestPath: safeCloudString(m?.latestPath || CLOUD_BACKUP_LATEST_PATH),
  historyPath: safeCloudString(m?.historyPath || ''),
  timestamp: safeCloudNum(m?.timestamp),
  appVersion: safeCloudString(m?.appVersion || 'unknown'),
  ownerYandexId: safeCloudString(m?.ownerYandexId || ''),
  profileName: safeCloudString(m?.profileName || 'Слушатель') || 'Слушатель',
  sourceDeviceStableId: safeCloudString(m?.sourceDeviceStableId || ''),
  sourceDeviceLabel: safeCloudString(m?.sourceDeviceLabel || ''),
  sourceDeviceClass: safeCloudString(m?.sourceDeviceClass || ''),
  sourcePlatform: safeCloudString(m?.sourcePlatform || ''),
  level: Math.max(1, safeCloudNum(m?.level || 1)),
  xp: safeCloudNum(m?.xp),
  achievementsCount: safeCloudNum(m?.achievementsCount),
  favoritesCount: safeCloudNum(m?.favoritesCount),
  playlistsCount: safeCloudNum(m?.playlistsCount),
  statsCount: safeCloudNum(m?.statsCount),
  eventCount: safeCloudNum(m?.eventCount),
  devicesCount: safeCloudNum(m?.devicesCount),
  deviceStableCount: safeCloudNum(m?.deviceStableCount),
  checksum: safeCloudString(m?.checksum || ''),
  version: safeCloudString(m?.version || 'unknown'),
  size: safeCloudNum(m?.size),
  sizeHuman: safeCloudString(m?.sizeHuman || ''),
  path: safeCloudString(m?.path || ''),
  name: safeCloudString(m?.name || ''),
  modified: m?.modified || null,
  isLatest: !!m?.isLatest
});

export const normalizeCloudBackupListItem = (item = {}) => {
  const path = safeCloudString(item?.path);
  const meta = normalizeCloudBackupMeta(item);
  return {
    ...meta,
    path,
    name: safeCloudString(item?.name || (isLatestBackupPath(path) ? 'vi3na1bita_backup.vi3bak' : path.split('/').pop() || '')),
    modified: item?.modified || null,
    isLatest: isLatestBackupPath(path) || !!item?.isLatest
  };
};

export default {
  CLOUD_BACKUP_DIR,
  CLOUD_BACKUP_LATEST_PATH,
  CLOUD_BACKUP_META_PATH,
  CLOUD_BACKUP_VERSION_RE,
  safeCloudString,
  safeCloudNum,
  buildBackupHistoryPath,
  isLatestBackupPath,
  isVersionedBackupPath,
  sanitizeBackupPath,
  normalizeCloudBackupMeta,
  normalizeCloudBackupListItem
};

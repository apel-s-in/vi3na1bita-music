// UID.003_(Event log truth)_(формальный контракт событий для sync/restore/journal)_(event log становится общей правдой, stats остаются rebuildable cache)
// UID.017_(Launch source stats)_(готовить source-aware события)_(все пользовательские действия получают понятный domain/source)
// UID.099_(Multi-device sync model)_(merge по eventId)_(события должны быть idempotent и device-aware)

export const EVENT_SCHEMA_VERSION = 1;

export const EVENT_TYPES = Object.freeze({
  LISTEN_START: 'LISTEN_START',
  LISTEN_COMPLETE: 'LISTEN_COMPLETE',
  LISTEN_SKIP: 'LISTEN_SKIP',
  FEATURE_USED: 'FEATURE_USED',
  ACHIEVEMENT_UNLOCK: 'ACHIEVEMENT_UNLOCK',
  FAVORITE_CHANGED: 'FAVORITE_CHANGED',
  PLAYLIST_CHANGED: 'PLAYLIST_CHANGED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  DEVICE_UPDATED: 'DEVICE_UPDATED',
  BACKUP_CREATED: 'BACKUP_CREATED',
  RESTORE_APPLIED: 'RESTORE_APPLIED',
  SYNC_STATE_CHANGED: 'SYNC_STATE_CHANGED'
});

const sS = v => String(v == null ? '' : v).trim();
const sN = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const getEventDomain = type => ({
  LISTEN_START: 'listening',
  LISTEN_COMPLETE: 'listening',
  LISTEN_SKIP: 'listening',
  FEATURE_USED: 'feature',
  ACHIEVEMENT_UNLOCK: 'achievement',
  FAVORITE_CHANGED: 'favorites',
  PLAYLIST_CHANGED: 'playlists',
  PROFILE_UPDATED: 'profile',
  DEVICE_UPDATED: 'devices',
  BACKUP_CREATED: 'cloud',
  RESTORE_APPLIED: 'cloud',
  SYNC_STATE_CHANGED: 'cloud'
})[sS(type)] || 'generic';

export const isBackupNoiseEvent = ev =>
  sS(ev?.type) === EVENT_TYPES.FEATURE_USED && sS(ev?.data?.feature).startsWith('backup');

export const isCloudServiceEvent = ev =>
  [EVENT_TYPES.BACKUP_CREATED, EVENT_TYPES.RESTORE_APPLIED, EVENT_TYPES.SYNC_STATE_CHANGED].includes(sS(ev?.type));

export const isBackupSemanticNoiseEvent = ev =>
  isBackupNoiseEvent(ev) || isCloudServiceEvent(ev);

export const normalizeEventEnvelope = ({
  eventId,
  sessionId,
  deviceHash,
  deviceStableId,
  platform,
  type,
  uid = null,
  timestamp = Date.now(),
  data = {}
} = {}) => ({
  v: EVENT_SCHEMA_VERSION,
  eventId: sS(eventId) || crypto.randomUUID(),
  sessionId: sS(sessionId) || '',
  deviceHash: sS(deviceHash),
  deviceStableId: sS(deviceStableId),
  platform: sS(platform || 'web'),
  domain: getEventDomain(type),
  type: sS(type || 'UNKNOWN'),
  uid: uid == null ? null : sS(uid),
  timestamp: sN(timestamp) || Date.now(),
  data: data && typeof data === 'object' ? data : {}
});

export const describeEventForUi = ev => {
  const type = sS(ev?.type), d = ev?.data || {};
  if (type === EVENT_TYPES.LISTEN_COMPLETE) return { icon: '🎵', title: 'Прослушано', desc: `Валидно: ${d.isValidListen ? 'да' : 'нет'} · полностью: ${d.isFullListen ? 'да' : 'нет'} · ${sN(d.listenedSeconds)} сек` };
  if (type === EVENT_TYPES.LISTEN_SKIP) return { icon: '⏭️', title: 'Пропущено', desc: `${sN(d.listenedSeconds)} сек` };
  if (type === EVENT_TYPES.LISTEN_START) return { icon: '▶️', title: 'Старт прослушивания', desc: sS(d.variant || 'audio') };
  if (type === EVENT_TYPES.ACHIEVEMENT_UNLOCK) return { icon: '🏆', title: 'Достижение открыто', desc: `${sS(d.name || d.id || 'Достижение')} · +${sN(d.xp)} XP` };
  if (type === EVENT_TYPES.FAVORITE_CHANGED) return { icon: d.liked ? '⭐' : '☆', title: d.liked ? 'Добавлено в избранное' : 'Убрано из избранного', desc: sS(d.source || d.albumKey || '') };
  if (type === EVENT_TYPES.PLAYLIST_CHANGED) return { icon: '📋', title: 'Плейлист изменён', desc: `${sS(d.action || 'update')}${d.name ? ` · ${sS(d.name)}` : ''}` };
  if (type === EVENT_TYPES.PROFILE_UPDATED) return { icon: '👤', title: 'Профиль обновлён', desc: sS(d.field || 'profile') };
  if (type === EVENT_TYPES.DEVICE_UPDATED) return { icon: '📱', title: 'Устройство обновлено', desc: sS(d.action || 'device') };
  if (type === EVENT_TYPES.BACKUP_CREATED) return { icon: '☁️', title: 'Backup сохранён', desc: `${sS(d.reason || 'save')}${d.uploadedDevice ? ' · device settings' : ''}` };
  if (type === EVENT_TYPES.RESTORE_APPLIED) return { icon: '📥', title: 'Backup восстановлен', desc: `${sS(d.mode || 'all')}${d.deviceApplied ? ' · device settings' : ''}` };
  if (type === EVENT_TYPES.FEATURE_USED) return { icon: '🛠️', title: 'Функция использована', desc: sS(d.feature || '') };
  return { icon: '•', title: type || 'Событие', desc: sS(ev?.uid || '') };
};

export default {
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  getEventDomain,
  isBackupNoiseEvent,
  isCloudServiceEvent,
  isBackupSemanticNoiseEvent,
  normalizeEventEnvelope,
  describeEventForUi
};

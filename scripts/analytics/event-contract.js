export const EVENT_SCHEMA_VERSION = 2;
export const EVENT_TYPES = Object.freeze({ LISTEN_START: 'LISTEN_START', LISTEN_COMPLETE: 'LISTEN_COMPLETE', FEATURE_USED: 'FEATURE_USED', ACHIEVEMENT_UNLOCK: 'ACHIEVEMENT_UNLOCK', FAVORITE_CHANGED: 'FAVORITE_CHANGED', PLAYLIST_CHANGED: 'PLAYLIST_CHANGED', PROFILE_UPDATED: 'PROFILE_UPDATED', DEVICE_UPDATED: 'DEVICE_UPDATED', AUTH_EVENT: 'AUTH_EVENT', BACKUP_CREATED: 'BACKUP_CREATED', RESTORE_APPLIED: 'RESTORE_APPLIED', SYNC_STATE_CHANGED: 'SYNC_STATE_CHANGED', RECOMMENDATION_SHOWN: 'RECOMMENDATION_SHOWN', RECOMMENDATION_CLICKED: 'RECOMMENDATION_CLICKED', RECOMMENDATION_ACCEPTED: 'RECOMMENDATION_ACCEPTED', RECOMMENDATION_DISMISSED: 'RECOMMENDATION_DISMISSED', RECOMMENDATION_CONTROLS_CHANGED: 'RECOMMENDATION_CONTROLS_CHANGED', UI_PERSONALIZATION_CHANGED: 'UI_PERSONALIZATION_CHANGED', GAME_STATE_CHANGED: 'GAME_STATE_CHANGED' });
const sS = v => String(v == null ? '' : v).trim(), sN = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const getEventDomain = t => ({ LISTEN_START: 'listening', LISTEN_COMPLETE: 'listening', FEATURE_USED: 'feature', ACHIEVEMENT_UNLOCK: 'achievement', FAVORITE_CHANGED: 'favorites', PLAYLIST_CHANGED: 'playlists', PROFILE_UPDATED: 'profile', DEVICE_UPDATED: 'devices', AUTH_EVENT: 'auth', BACKUP_CREATED: 'cloud', RESTORE_APPLIED: 'cloud', SYNC_STATE_CHANGED: 'cloud', RECOMMENDATION_SHOWN: 'recommendations', RECOMMENDATION_CLICKED: 'recommendations', RECOMMENDATION_ACCEPTED: 'recommendations', RECOMMENDATION_DISMISSED: 'recommendations', RECOMMENDATION_CONTROLS_CHANGED: 'recommendations', UI_PERSONALIZATION_CHANGED: 'profile', GAME_STATE_CHANGED: 'games' }[sS(t)] || 'generic');
export const isBackupNoiseEvent = e => sS(e?.type) === EVENT_TYPES.FEATURE_USED && sS(e?.data?.feature).startsWith('backup');
export const isCloudServiceEvent = e => [EVENT_TYPES.BACKUP_CREATED, EVENT_TYPES.RESTORE_APPLIED, EVENT_TYPES.SYNC_STATE_CHANGED].includes(sS(e?.type));
export const isBackupSemanticNoiseEvent = e => isBackupNoiseEvent(e) || isCloudServiceEvent(e);
export const V7_SYNC_EVENT_TYPES = new Set([EVENT_TYPES.LISTEN_START, EVENT_TYPES.LISTEN_COMPLETE, EVENT_TYPES.FEATURE_USED, EVENT_TYPES.PLAYLIST_CHANGED, EVENT_TYPES.RECOMMENDATION_SHOWN, EVENT_TYPES.RECOMMENDATION_CLICKED, EVENT_TYPES.RECOMMENDATION_ACCEPTED, EVENT_TYPES.RECOMMENDATION_DISMISSED, EVENT_TYPES.RECOMMENDATION_CONTROLS_CHANGED, EVENT_TYPES.UI_PERSONALIZATION_CHANGED, EVENT_TYPES.GAME_STATE_CHANGED]);
export const isV7SyncEvent = event => V7_SYNC_EVENT_TYPES.has(sS(event?.type)) && !isBackupSemanticNoiseEvent(event);
export const normalizeEventEnvelope = ({ eventId, sessionId, deviceHash, deviceStableId, deviceLabel = '', deviceClass = '', devicePwa = false, deviceOs = '', deviceBrowser = '', deviceLang = '', deviceTimezone = '', deviceScreen = '', platform, type, uid = null, timestamp = Date.now(), data = {}, deviceSeq = 0, prevHash = '', eventHash = '', chainId = '', sourceClock = null, ownerYandexIdHash = '' } = {}) => ({ v: EVENT_SCHEMA_VERSION, eventId: sS(eventId) || crypto.randomUUID(), sessionId: sS(sessionId), deviceHash: sS(deviceHash), deviceStableId: sS(deviceStableId), deviceLabel: sS(deviceLabel), deviceClass: sS(deviceClass), devicePwa: !!devicePwa, deviceOs: sS(deviceOs), deviceBrowser: sS(deviceBrowser), deviceLang: sS(deviceLang), deviceTimezone: sS(deviceTimezone), deviceScreen: sS(deviceScreen), platform: sS(platform || 'web'), domain: getEventDomain(type), type: sS(type || 'UNKNOWN'), uid: uid == null ? null : sS(uid), timestamp: sN(timestamp) || Date.now(), sourceClock: sourceClock && typeof sourceClock === 'object' ? sourceClock : null, chainId: sS(chainId), deviceSeq: sN(deviceSeq), prevHash: sS(prevHash), eventHash: sS(eventHash), ownerYandexIdHash: sS(ownerYandexIdHash), data: data && typeof data === 'object' ? data : {} });
export const describeEventForUi = ev => {
  const t = sS(ev?.type), d = ev?.data || {};
  if (t === EVENT_TYPES.LISTEN_COMPLETE) return { icon: d.skipClass === 'micro_skip' || d.skipClass === 'early_skip' || d.skipClass === 'valid_skip' ? '⏭️' : '🎵', title: d.skipClass === 'full' ? 'Прослушано полностью' : d.skipClass === 'partial_end' ? 'Прослушано частично' : 'Прослушивание завершено', desc: `Валидно: ${d.isValidListen ? 'да' : 'нет'} · полностью: ${d.isFullListen ? 'да' : 'нет'} · ${sN(d.listenedSeconds || (d.isFullListen ? d.trackDuration : 0))} сек` };
  if (t === EVENT_TYPES.LISTEN_START) return { icon: '▶️', title: 'Старт прослушивания', desc: sS(d.variant || 'audio') };
  if (t === EVENT_TYPES.ACHIEVEMENT_UNLOCK) return {
    icon: '🏆',
    title: 'Достижение открыто',
    desc: `${sS(d.name || d.id || 'Достижение')} · ${
      d.rewardStatus === 'server_pending'
        ? 'награда проверяется сервером'
        : 'награда готовится'
    }`
  };
  if (t === EVENT_TYPES.FAVORITE_CHANGED) return { icon: d.liked ? '⭐' : '☆', title: d.liked ? 'Добавлено в избранное' : 'Убрано из избранного', desc: sS(d.source || d.albumKey) };
  if (t === EVENT_TYPES.PLAYLIST_CHANGED) return { icon: '📋', title: 'Плейлист изменён', desc: `${sS(d.action || 'update')}${d.name ? ` · ${sS(d.name)}` : ''}` };
  if (t === EVENT_TYPES.PROFILE_UPDATED) return { icon: '👤', title: 'Профиль обновлён', desc: sS(d.field || 'profile') };
  if (t === EVENT_TYPES.DEVICE_UPDATED) return { icon: '📱', title: 'Устройство обновлено', desc: sS(d.action || 'device') };
  if (t === EVENT_TYPES.AUTH_EVENT) return { icon: '🔐', title: 'Авторизация', desc: [sS(d.action || 'auth'), sS(d.login), sS(d.displayName), sS(d.device), sS(d.status)].filter(Boolean).join(' · ') };
  if (t === EVENT_TYPES.BACKUP_CREATED) return { icon: '☁️', title: 'Backup сохранён', desc: `${sS(d.reason || 'save')}${d.uploadedDevice ? ' · device settings' : ''}` };
  if (t === EVENT_TYPES.RESTORE_APPLIED) return { icon: '📥', title: 'Backup восстановлен', desc: `${sS(d.mode || 'all')}${d.deviceApplied ? ' · device settings' : ''}` };
  if (t === EVENT_TYPES.SYNC_STATE_CHANGED) return { icon: d.ok === false ? '⚠️' : '☁️', title: d.ok === false ? 'Ошибка синхронизации' : 'Синхронизация выполнена', desc: [sS(d.reason || 'sync'), d.uploadedEventArchive ? 'события' : '', d.uploadedShared ? 'плейлисты' : '', d.uploadedDevice ? 'настройки' : '', sS(d.error)].filter(Boolean).join(' · ') };
  if (t === EVENT_TYPES.FEATURE_USED) return { icon: '🛠️', title: 'Функция использована', desc: sS(d.feature) };
  if (t === EVENT_TYPES.RECOMMENDATION_SHOWN) return { icon: '💡', title: 'Показана рекомендация', desc: sS(d.reasonCode || d.context) };
  if (t === EVENT_TYPES.RECOMMENDATION_CLICKED) return { icon: '👆', title: 'Открыта рекомендация', desc: sS(d.reasonCode || d.context) };
  if (t === EVENT_TYPES.RECOMMENDATION_ACCEPTED) return { icon: '▶️', title: 'Рекомендация принята', desc: sS(d.reasonCode || d.context) };
  if (t === EVENT_TYPES.RECOMMENDATION_DISMISSED) return { icon: '🙈', title: 'Рекомендация скрыта', desc: sS(d.reasonCode || d.context) };
  if (t === EVENT_TYPES.RECOMMENDATION_CONTROLS_CHANGED) return { icon: '🎚️', title: 'Настройки рекомендаций изменены', desc: sS(d.reason || 'controls') };
  if (t === EVENT_TYPES.UI_PERSONALIZATION_CHANGED) return { icon: '🎨', title: 'Интерфейс персонализирован', desc: sS(d.reason || 'ui') };
  if (t === EVENT_TYPES.GAME_STATE_CHANGED) return { icon: '🎮', title: 'Игровые данные сохранены', desc: [sS(d.gameId), sS(d.key)].filter(Boolean).join(' · ') };
  return { icon: '•', title: t || 'Событие', desc: sS(ev?.uid) };
};
export default { EVENT_SCHEMA_VERSION, EVENT_TYPES, V7_SYNC_EVENT_TYPES, getEventDomain, isBackupNoiseEvent, isCloudServiceEvent, isBackupSemanticNoiseEvent, isV7SyncEvent, normalizeEventEnvelope, describeEventForUi };

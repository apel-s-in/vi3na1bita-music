import { normalizeCloudBackupMeta as normalizeCloudMetaBase, safeCloudNum, safeCloudString } from './cloud-contract.js';

export const safeNum = safeCloudNum;
export const safeString = safeCloudString;
export const safeJsonParse = (r, f = null) => { try { return JSON.parse(r); } catch { return f; } };
export const normalizeBackupSummary = (s = {}) => normalizeCloudMetaBase(s || {});
export const getRichnessScore = summary => {
  const value = normalizeBackupSummary(summary);
  return safeNum(value.playlistsCount) * 60 + safeNum(value.statsCount) * 6 + safeNum(value.eventCount) * 2 + safeNum(value.devicesCount) * 25 + safeNum(value.deviceStableCount) * 30;
};

const domainValue = (summary, domain) => {
  const value = normalizeBackupSummary(summary || {});
  if (domain === 'playlists') return safeNum(value.playlistsCount);
  if (domain === 'stats') return safeNum(value.statsCount) * 10 + safeNum(value.eventCount);
  if (domain === 'devices') return safeNum(value.deviceStableCount) * 10 + safeNum(value.devicesCount);
  return 0;
};

export const getBackupDomainDiff = (local, cloud) => Object.fromEntries(['playlists', 'stats', 'devices'].map(domain => {
  const localValue = domainValue(local, domain);
  const cloudValue = domainValue(cloud, domain);
  const diff = cloudValue - localValue;
  return [domain, { local: localValue, cloud: cloudValue, diff, winner: diff > 0 ? 'cloud' : diff < 0 ? 'local' : 'equal' }];
}));

export const compareLocalVsCloud = (l, c) => {
  const ll = normalizeBackupSummary(l || {}), cc = normalizeBackupSummary(c || {}), lTs = safeNum(ll.timestamp), cTs = safeNum(cc.timestamp), lSc = getRichnessScore(ll), cSc = getRichnessScore(cc), scoreDiff = cSc - lSc, tsDiff = cTs - lTs, domainDiff = getBackupDomainDiff(ll, cc);
  if (!c || (!cTs && cSc === 0)) return { state: 'no_cloud', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  const vals = Object.values(domainDiff), cW = vals.filter(x => x.winner === 'cloud').length, lW = vals.filter(x => x.winner === 'local').length, bC = vals.some(x => x.diff >= 10) || domainDiff.stats.diff >= 20, bL = vals.some(x => x.diff <= -10) || domainDiff.stats.diff <= -20;
  if (lTs === 0 && lSc <= 1200 && cSc > 0) return { state: 'cloud_richer_new_device', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (!cW && !lW) return { state: 'equivalent', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (cW && lW) return { state: 'conflict', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  return { state: cW ? (bC || cTs >= lTs ? 'cloud_richer' : 'cloud_probably_richer') : (bL || lTs >= cTs ? 'local_richer' : 'local_probably_richer'), localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
};

export const getLocalBackupUiSnapshot = profile => {
  try {
    const cached = safeJsonParse(localStorage.getItem('backup:last_local_summary:v1') || 'null', null) || {};
    const playlists = safeJsonParse(localStorage.getItem('sc3:playlists'), []);
    const devices = window.DeviceRegistry?.getDeviceRegistry?.() || safeJsonParse(localStorage.getItem('backup:device_registry:v1'), []) || [];
    const current = window.DeviceRegistry?.getCurrentDeviceIdentity?.() || {};
    const currentRow = (Array.isArray(devices) ? devices : []).find(device => safeString(device?.deviceStableId) === safeString(current?.deviceStableId)) || {};
    return normalizeBackupSummary({
      ...cached,
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || cached.timestamp),
      favoritesCount: 0,
      achievementsCount: 0,
      level: 1,
      xp: 0,
      playlistsCount: Array.isArray(playlists) ? playlists.filter(item => !item?.deletedAt).length : safeNum(cached.playlistsCount),
      profileName: profile?.name || cached.profileName || 'Слушатель',
      statsCount: safeNum(cached.statsCount),
      eventCount: safeNum(cached.eventCount),
      devicesCount: Array.isArray(devices) ? devices.length : safeNum(cached.devicesCount),
      deviceStableCount: window.DeviceRegistry?.countDeviceStableIds?.(devices) || new Set((Array.isArray(devices) ? devices : []).map(device => safeString(device?.deviceStableId)).filter(Boolean)).size || safeNum(cached.deviceStableCount),
      sourceDeviceStableId: safeString(current?.deviceStableId || cached.sourceDeviceStableId || ''),
      sourceDeviceLabel: safeString(currentRow?.label || cached.sourceDeviceLabel || ''),
      sourceDeviceClass: safeString(currentRow?.class || cached.sourceDeviceClass || ''),
      sourcePlatform: safeString(currentRow?.platform || cached.sourcePlatform || '')
    });
  } catch {
    return normalizeBackupSummary({ appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown', timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts')), profileName: profile?.name || 'Слушатель', achievementsCount: 0, favoritesCount: 0, level: 1, xp: 0 });
  }
};

export const normalizeCloudBackupMeta = m => normalizeCloudMetaBase(m || {});
export const getBackupCompareLabel = (l, c) => c ? ({no_cloud:'Облачная копия отсутствует',cloud_richer_new_device:'Облако выглядит как основной источник для нового устройства',cloud_richer:'Облако богаче и новее локального профиля',cloud_probably_richer:'Облако вероятно богаче локального профиля',local_richer:'Локальные данные богаче облачной копии',local_probably_richer:'Локальный профиль вероятно богаче облачного',equivalent:'Локальная и облачная копии практически эквивалентны',conflict:'Есть смешанные признаки: нужна ручная проверка'})[compareLocalVsCloud(l||{},c||{}).state] || 'Сравнение недоступно' : 'Нет данных о копии';
export default { safeNum, safeString, safeJsonParse, normalizeBackupSummary, normalizeCloudBackupMeta, getRichnessScore, getBackupDomainDiff, compareLocalVsCloud, getLocalBackupUiSnapshot, getBackupCompareLabel };

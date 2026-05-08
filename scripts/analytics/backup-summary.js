import { normalizeCloudBackupMeta as normalizeCloudMetaBase, safeCloudNum, safeCloudString } from './cloud-contract.js';

export const safeNum = safeCloudNum;
export const safeString = safeCloudString;
export const safeJsonParse = (r, f = null) => { try { return JSON.parse(r); } catch { return f; } };
export const normalizeBackupSummary = (s = {}) => normalizeCloudMetaBase(s || {});
export const getRichnessScore = s => { const x = normalizeBackupSummary(s); return safeNum(x.level)*1000 + safeNum(x.xp) + safeNum(x.achievementsCount)*250 + safeNum(x.favoritesCount)*40 + safeNum(x.playlistsCount)*60 + safeNum(x.statsCount)*6 + safeNum(x.eventCount)*2 + safeNum(x.devicesCount)*25 + safeNum(x.deviceStableCount)*30; };

const domainValue = (s, d) => { const x = normalizeBackupSummary(s || {}); return d === 'favorites' ? safeNum(x.favoritesCount) : d === 'playlists' ? safeNum(x.playlistsCount) : d === 'achievements' ? safeNum(x.achievementsCount) * 100 + safeNum(x.level) * 10 + safeNum(x.xp) : d === 'stats' ? safeNum(x.statsCount) * 10 + safeNum(x.eventCount) : d === 'devices' ? safeNum(x.deviceStableCount) * 10 + safeNum(x.devicesCount) : 0; };

export const getBackupDomainDiff = (l, c) => Object.fromEntries(['favorites', 'playlists', 'achievements', 'stats', 'devices'].map(d => { const local = domainValue(l, d), cloud = domainValue(c, d), diff = cloud - local; return [d, { local, cloud, diff, winner: diff > 0 ? 'cloud' : (diff < 0 ? 'local' : 'equal') }]; }));

export const compareLocalVsCloud = (l, c) => {
  const ll = normalizeBackupSummary(l || {}), cc = normalizeBackupSummary(c || {}), lTs = safeNum(ll.timestamp), cTs = safeNum(cc.timestamp), lSc = getRichnessScore(ll), cSc = getRichnessScore(cc), scoreDiff = cSc - lSc, tsDiff = cTs - lTs, domainDiff = getBackupDomainDiff(ll, cc);
  if (!c || (!cTs && cSc === 0)) return { state: 'no_cloud', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  const vals = Object.values(domainDiff), cW = vals.filter(x => x.winner === 'cloud').length, lW = vals.filter(x => x.winner === 'local').length, bC = vals.some(x => x.diff >= 10) || domainDiff.achievements.diff >= 100 || domainDiff.stats.diff >= 20, bL = vals.some(x => x.diff <= -10) || domainDiff.achievements.diff <= -100 || domainDiff.stats.diff <= -20;
  if (lTs === 0 && lSc <= 1200 && cSc > 0) return { state: 'cloud_richer_new_device', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (!cW && !lW) return { state: 'equivalent', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (cW && lW) return { state: 'conflict', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  return { state: cW ? (bC || cTs >= lTs ? 'cloud_richer' : 'cloud_probably_richer') : (bL || lTs >= cTs ? 'local_richer' : 'local_probably_richer'), localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
};

export const getLocalBackupUiSnapshot = p => {
  try {
    const c = safeJsonParse(localStorage.getItem('backup:last_local_summary:v1') || 'null', null) || {}, f = safeJsonParse(localStorage.getItem('__favorites_v2__'), []), pl = safeJsonParse(localStorage.getItem('sc3:playlists'), []), r = window.DeviceRegistry?.getDeviceRegistry?.() || safeJsonParse(localStorage.getItem('backup:device_registry:v1'), []) || [], a = window.achievementEngine, cur = window.DeviceRegistry?.getCurrentDeviceIdentity?.() || {}, row = (Array.isArray(r) ? r : []).find(d => safeString(d?.deviceStableId) === safeString(cur?.deviceStableId)) || {};
    return normalizeBackupSummary({ ...c, appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown', timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || c?.timestamp), favoritesCount: Array.isArray(f) ? f.filter(i => !i?.inactiveAt && !i?.deletedAt).length : safeNum(c?.favoritesCount), playlistsCount: Array.isArray(pl) ? pl.filter(x => !x?.deletedAt).length : safeNum(c?.playlistsCount), profileName: p?.name || c?.profileName || 'Слушатель', level: safeNum(a?.profile?.level || c?.level || 1), xp: safeNum(a?.profile?.xp || c?.xp || 0), achievementsCount: Object.keys(a?.unlocked || {}).length || safeNum(c?.achievementsCount), statsCount: safeNum(c?.statsCount), eventCount: safeNum(c?.eventCount), devicesCount: Array.isArray(r) ? r.length : safeNum(c?.devicesCount), deviceStableCount: window.DeviceRegistry?.countDeviceStableIds?.(r) || new Set((Array.isArray(r) ? r : []).map(d => safeString(d?.deviceStableId)).filter(Boolean)).size || safeNum(c?.deviceStableCount), sourceDeviceStableId: safeString(cur?.deviceStableId || c?.sourceDeviceStableId || ''), sourceDeviceLabel: safeString(row?.label || c?.sourceDeviceLabel || ''), sourceDeviceClass: safeString(row?.class || c?.sourceDeviceClass || ''), sourcePlatform: safeString(row?.platform || c?.sourcePlatform || '') });
  } catch { return normalizeBackupSummary({ appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown', timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts')), profileName: p?.name || 'Слушатель', level: safeNum(window.achievementEngine?.profile?.level || 1), xp: safeNum(window.achievementEngine?.profile?.xp || 0), achievementsCount: Object.keys(window.achievementEngine?.unlocked || {}).length }); }
};

export const normalizeCloudBackupMeta = m => normalizeCloudMetaBase(m || {});
export const getBackupCompareLabel = (l, c) => c ? ({no_cloud:'Облачная копия отсутствует',cloud_richer_new_device:'Облако выглядит как основной источник для нового устройства',cloud_richer:'Облако богаче и новее локального профиля',cloud_probably_richer:'Облако вероятно богаче локального профиля',local_richer:'Локальные данные богаче облачной копии',local_probably_richer:'Локальный профиль вероятно богаче облачного',equivalent:'Локальная и облачная копии практически эквивалентны',conflict:'Есть смешанные признаки: нужна ручная проверка'})[compareLocalVsCloud(l||{},c||{}).state] || 'Сравнение недоступно' : 'Нет данных о копии';
export default { safeNum, safeString, safeJsonParse, normalizeBackupSummary, normalizeCloudBackupMeta, getRichnessScore, getBackupDomainDiff, compareLocalVsCloud, getLocalBackupUiSnapshot, getBackupCompareLabel };

import { normalizeCloudBackupMeta as normalizeCloudMetaBase, safeCloudNum, safeCloudString } from './cloud-contract.js';

export const safeNum = safeCloudNum;
export const safeString = safeCloudString;
export const safeJsonParse = (r, f = null) => { try { return JSON.parse(r); } catch { return f; } };

export const normalizeBackupSummary = (s = {}) => normalizeCloudMetaBase(s || {});

export const getRichnessScore = s => { const x=normalizeBackupSummary(s); return safeNum(x.level)*1000 + safeNum(x.xp) + safeNum(x.achievementsCount)*250 + safeNum(x.favoritesCount)*40 + safeNum(x.playlistsCount)*60 + safeNum(x.statsCount)*6 + safeNum(x.eventCount)*2 + safeNum(x.devicesCount)*25 + safeNum(x.deviceStableCount)*30; };

const domainValue = (s, d) => {
  const x = normalizeBackupSummary(s || {});
  if (d === 'favorites') return safeNum(x.favoritesCount);
  if (d === 'playlists') return safeNum(x.playlistsCount);
  if (d === 'achievements') return safeNum(x.achievementsCount) * 100 + safeNum(x.level) * 10 + safeNum(x.xp);
  if (d === 'stats') return safeNum(x.statsCount) * 10 + safeNum(x.eventCount);
  if (d === 'devices') return safeNum(x.deviceStableCount) * 10 + safeNum(x.devicesCount);
  return 0;
};

export const getBackupDomainDiff = (l, c) => {
  const domains = ['favorites', 'playlists', 'achievements', 'stats', 'devices'];
  return Object.fromEntries(domains.map(d => {
    const local = domainValue(l, d), cloud = domainValue(c, d), diff = cloud - local;
    return [d, { local, cloud, diff, winner: diff > 0 ? 'cloud' : (diff < 0 ? 'local' : 'equal') }];
  }));
};

export const compareLocalVsCloud = (l, c) => {
  const ll = normalizeBackupSummary(l || {}), cc = normalizeBackupSummary(c || {});
  const lTs = safeNum(ll.timestamp), cTs = safeNum(cc.timestamp), lSc = getRichnessScore(ll), cSc = getRichnessScore(cc);
  const scoreDiff = cSc - lSc, tsDiff = cTs - lTs, domainDiff = getBackupDomainDiff(ll, cc);
  if (!c || (!cTs && cSc === 0)) return { state: 'no_cloud', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };

  const vals = Object.values(domainDiff);
  const cloudWins = vals.filter(x => x.winner === 'cloud').length;
  const localWins = vals.filter(x => x.winner === 'local').length;
  const bigCloud = vals.some(x => x.diff >= 10) || domainDiff.achievements.diff >= 100 || domainDiff.stats.diff >= 20;
  const bigLocal = vals.some(x => x.diff <= -10) || domainDiff.achievements.diff <= -100 || domainDiff.stats.diff <= -20;

  if (lTs === 0 && lSc <= 1200 && cSc > 0) return { state: 'cloud_richer_new_device', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (!cloudWins && !localWins) return { state: 'equivalent', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (cloudWins && localWins) return { state: 'conflict', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (cloudWins) return { state: bigCloud || cTs >= lTs ? 'cloud_richer' : 'cloud_probably_richer', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  if (localWins) return { state: bigLocal || lTs >= cTs ? 'local_richer' : 'local_probably_richer', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
  return { state: 'equivalent', localTs: lTs, cloudTs: cTs, localScore: lSc, cloudScore: cSc, scoreDiff, tsDiff, domainDiff };
};

export const getLocalBackupUiSnapshot = p => {
  try {
    const cached = safeJsonParse(localStorage.getItem('backup:last_local_summary:v1') || 'null', null) || {};
    const f = safeJsonParse(localStorage.getItem('__favorites_v2__'), []);
    const pl = safeJsonParse(localStorage.getItem('sc3:playlists'), []);
    const r = window.DeviceRegistry?.getDeviceRegistry?.() || safeJsonParse(localStorage.getItem('backup:device_registry:v1'), []) || [];
    const a = window.achievementEngine;
    const cur = window.DeviceRegistry?.getCurrentDeviceIdentity?.() || {};
    const row = (Array.isArray(r) ? r : []).find(d => safeString(d?.deviceStableId) && safeString(d?.deviceStableId) === safeString(cur?.deviceStableId)) || {};
    return normalizeBackupSummary({
      ...cached,
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || cached?.timestamp),
      favoritesCount: Array.isArray(f) ? f.filter(i => !i?.inactiveAt).length : safeNum(cached?.favoritesCount),
      playlistsCount: Array.isArray(pl) ? pl.filter(x => !x?.deletedAt).length : safeNum(cached?.playlistsCount),
      profileName: p?.name || cached?.profileName || 'Слушатель',
      level: safeNum(a?.profile?.level || cached?.level || 1),
      xp: safeNum(a?.profile?.xp || cached?.xp || 0),
      achievementsCount: Object.keys(a?.unlocked || {}).length || safeNum(cached?.achievementsCount),
      statsCount: safeNum(cached?.statsCount),
      eventCount: safeNum(cached?.eventCount),
      devicesCount: Array.isArray(r) ? r.length : safeNum(cached?.devicesCount),
      deviceStableCount: window.DeviceRegistry?.countDeviceStableIds?.(r) || new Set((Array.isArray(r) ? r : []).map(d => safeString(d?.deviceStableId)).filter(Boolean)).size || safeNum(cached?.deviceStableCount),
      sourceDeviceStableId: safeString(cur?.deviceStableId || cached?.sourceDeviceStableId || ''),
      sourceDeviceLabel: safeString(row?.label || cached?.sourceDeviceLabel || ''),
      sourceDeviceClass: safeString(row?.class || cached?.sourceDeviceClass || ''),
      sourcePlatform: safeString(row?.platform || cached?.sourcePlatform || '')
    });
  } catch {
    return normalizeBackupSummary({
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts')),
      favoritesCount: 0,
      playlistsCount: 0,
      profileName: p?.name || 'Слушатель',
      level: safeNum(window.achievementEngine?.profile?.level || 1),
      xp: safeNum(window.achievementEngine?.profile?.xp || 0),
      achievementsCount: Object.keys(window.achievementEngine?.unlocked || {}).length,
      devicesCount: 0,
      deviceStableCount: 0
    });
  }
};

export const normalizeCloudBackupMeta = m => normalizeCloudMetaBase(m || {});

export const getBackupCompareLabel = (l, c) => c ? ({no_cloud:'Облачная копия отсутствует',cloud_richer_new_device:'Облако выглядит как основной источник для нового устройства',cloud_richer:'Облако богаче и новее локального профиля',cloud_probably_richer:'Облако вероятно богаче локального профиля',local_richer:'Локальные данные богаче облачной копии',local_probably_richer:'Локальный профиль вероятно богаче облачного',equivalent:'Локальная и облачная копии практически эквивалентны',conflict:'Есть смешанные признаки: нужна ручная проверка'})[compareLocalVsCloud(l||{},c||{}).state] || 'Сравнение недоступно' : 'Нет данных о копии';

export default { safeNum, safeString, safeJsonParse, normalizeBackupSummary, normalizeCloudBackupMeta, getRichnessScore, getBackupDomainDiff, compareLocalVsCloud, getLocalBackupUiSnapshot, getBackupCompareLabel };

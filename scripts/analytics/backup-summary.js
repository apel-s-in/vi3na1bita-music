export function safeNum(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export function safeString(v) {
  return String(v == null ? '' : v).trim();
}

export function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function getRichnessScore(summary = {}) {
  return (
    safeNum(summary.level) * 1000 +
    safeNum(summary.xp) +
    safeNum(summary.achievementsCount) * 250 +
    safeNum(summary.favoritesCount) * 40 +
    safeNum(summary.playlistsCount) * 60 +
    safeNum(summary.statsCount) * 6 +
    safeNum(summary.eventCount) * 2 +
    safeNum(summary.devicesCount) * 25 +
    safeNum(summary.deviceStableCount) * 30
  );
}

export function compareLocalVsCloud(localSummary, cloudMeta) {
  const localTs = safeNum(localSummary?.timestamp);
  const cloudTs = safeNum(cloudMeta?.timestamp);
  const localScore = getRichnessScore(localSummary);
  const cloudScore = getRichnessScore(cloudMeta);
  const scoreDiff = cloudScore - localScore;
  const tsDiff = cloudTs - localTs;

  const noCloudData = !cloudMeta || (!cloudTs && cloudScore === 0);
  const noLocalEvidence = localTs === 0 && localScore <= 1200;

  if (noCloudData) return { state: 'no_cloud', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (noLocalEvidence && cloudScore > 0) return { state: 'cloud_richer_new_device', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (cloudTs > localTs && cloudScore >= localScore) return { state: 'cloud_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (localTs > cloudTs && localScore >= cloudScore) return { state: 'local_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (Math.abs(tsDiff) < 2 * 60000 && Math.abs(scoreDiff) < 300) return { state: 'equivalent', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (cloudScore > localScore && cloudTs >= localTs) return { state: 'cloud_probably_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (localScore > cloudScore && localTs >= cloudTs) return { state: 'local_probably_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  return { state: 'conflict', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
}

export function getLocalBackupUiSnapshot(localProfile) {
  try {
    const favs = safeJsonParse(localStorage.getItem('__favorites_v2__') || '[]', []) || [];
    const pls = safeJsonParse(localStorage.getItem('sc3:playlists') || '[]', []) || [];
    const reg = safeJsonParse(localStorage.getItem('backup:device_registry:v1') || '[]', []) || [];
    return {
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || 0),
      favoritesCount: Array.isArray(favs) ? favs.filter(i => !i?.inactiveAt).length : 0,
      playlistsCount: Array.isArray(pls) ? pls.length : 0,
      profileName: localProfile?.name || 'Слушатель',
      level: safeNum(window.achievementEngine?.profile?.level || 1),
      xp: safeNum(window.achievementEngine?.profile?.xp || 0),
      achievementsCount: Object.keys(window.achievementEngine?.unlocked || {}).length,
      devicesCount: Array.isArray(reg) ? reg.length : 0,
      deviceStableCount: Array.isArray(reg) ? new Set(reg.map(d => safeString(d?.deviceStableId || '')).filter(Boolean)).size : 0
    };
  } catch {
    return {
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || 0),
      favoritesCount: 0,
      playlistsCount: 0,
      profileName: localProfile?.name || 'Слушатель',
      level: safeNum(window.achievementEngine?.profile?.level || 1),
      xp: safeNum(window.achievementEngine?.profile?.xp || 0),
      achievementsCount: Object.keys(window.achievementEngine?.unlocked || {}).length,
      devicesCount: 0,
      deviceStableCount: 0
    };
  }
}

export function getBackupCompareLabel(localInfo, cloudInfo) {
  if (!cloudInfo) return 'Нет данных о копии';
  const cmp = compareLocalVsCloud(localInfo || {}, cloudInfo || {});
  return ({
    no_cloud: 'Облачная копия отсутствует',
    cloud_richer_new_device: 'Облако выглядит как основной источник для нового устройства',
    cloud_richer: 'Облако богаче и новее локального профиля',
    cloud_probably_richer: 'Облако вероятно богаче локального профиля',
    local_richer: 'Локальные данные богаче облачной копии',
    local_probably_richer: 'Локальный профиль вероятно богаче облачного',
    equivalent: 'Локальная и облачная копии практически эквивалентны',
    conflict: 'Есть смешанные признаки: нужна ручная проверка'
  })[cmp.state] || 'Сравнение недоступно';
}

export default {
  safeNum,
  safeString,
  safeJsonParse,
  getRichnessScore,
  compareLocalVsCloud,
  getLocalBackupUiSnapshot,
  getBackupCompareLabel
};

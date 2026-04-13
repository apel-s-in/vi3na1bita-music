// scripts/analytics/backup-sync-engine.js
// Умный автосейв: только при реальных изменениях, с защитой от затирания облака.

import { safeNum, safeString, safeJsonParse, compareLocalVsCloud } from './backup-summary.js';

const LS_SYNC_ENABLED = 'backup:autosync:enabled';
const LS_RESTORE_DONE = 'backup:restore_or_skip_done';
const COOLDOWN_MS = 60 * 1000;

let _timer = null, _lastSaveAt = 0, _bound = false, _syncReady = false;

function getLocalProfileSummary() {
  const rpg = window.achievementEngine?.profile || { level: 1, xp: 0 };
  const ach = window.achievementEngine?.unlocked || {};
  const favs = safeJsonParse(localStorage.getItem('__favorites_v2__') || '[]', []) || [];
  const pls = safeJsonParse(localStorage.getItem('sc3:playlists') || '[]', []) || [];
  let devicesCount = 0, deviceStableCount = 0;

  try {
    const reg = safeJsonParse(localStorage.getItem('backup:device_registry:v1') || '[]', []) || [];
    if (Array.isArray(reg)) {
      devicesCount = reg.length;
      deviceStableCount = new Set(reg.map(d => safeString(d?.deviceStableId || '')).filter(Boolean)).size;
    }
  } catch {}

  return {
    timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || 0),
    level: safeNum(rpg.level || 1),
    xp: safeNum(rpg.xp || 0),
    achievementsCount: Object.keys(ach || {}).length,
    favoritesCount: Array.isArray(favs) ? favs.filter(i => !i?.inactiveAt).length : 0,
    playlistsCount: Array.isArray(pls) ? pls.length : 0,
    statsCount: 0,
    eventCount: 0,
    devicesCount,
    deviceStableCount
  };
}

async function enrichLocalSummaryWithDb(summary) {
  try {
    const { metaDB } = await import('./meta-db.js');
    const [stats, warm] = await Promise.all([
      metaDB.getAllStats().catch(() => []),
      metaDB.getEvents('events_warm').catch(() => [])
    ]);
    return {
      ...summary,
      statsCount: Array.isArray(stats) ? stats.filter(x => x?.uid && x.uid !== 'global').length : safeNum(summary?.statsCount),
      eventCount: Array.isArray(warm) ? warm.length : safeNum(summary?.eventCount)
    };
  } catch {
    return summary;
  }
}

const PROFILE_WATCH_KEYS = new Set([
  '__favorites_v2__', 'sc3:playlists', 'sc3:default', 'sc3:activeId',
  'sc3:ui_v2', 'sourcePref', 'favoritesOnlyMode', 'qualityMode:v1',
  'lyricsViewMode', 'lyricsAnimationEnabled', 'logoPulseEnabled', 'dl_format_v1',
]);

export function isSyncEnabled() {
  return localStorage.getItem(LS_SYNC_ENABLED) !== '0';
}

export function isSyncReady() { return _syncReady; }

// КРИТИЧНО: canUpload проверяет что восстановление уже произошло
// или пользователь явно пропустил его. Без этого — пустые данные
// нового устройства могут затереть облачный прогресс.
function canUpload() {
  return _syncReady && isSyncEnabled() && isRestoreOrSkipDone();
}

export function isRestoreOrSkipDone() {
  return localStorage.getItem(LS_RESTORE_DONE) === '1';
}

// Вызывается ТОЛЬКО после:
// 1. Успешного restore из облака
// 2. Явного пропуска пользователем модалки восстановления
// 3. Когда облако НЕ новее (cloud_not_newer) — значит локальные данные актуальны
// 4. Когда облачной копии нет (no_cloud_backup) — нечего затирать
// 5. Ручного save-backup из профиля
export function markRestoreOrSkipDone(reason = 'unknown') {
  localStorage.setItem(LS_RESTORE_DONE, '1');
  console.debug('[BackupSyncEngine] restore/skip done, reason:', reason);
}

export function markSyncReady(reason = 'manual') {
  if (_syncReady) return;
  _syncReady = true;

  // Автоматически разрешаем upload если облако не новее или его нет
  const autoSafeReasons = [
    'no_cloud_backup', 'cloud_not_newer', 'diff_too_small',
    'no_auth_local_only', 'logged_out_local_only', 'offline_skip',
    'meta_check_failed', 'timeout_fallback',
    'auto_restore', 'restore_completed', 'manual_save',
    'user_skipped_restore'
  ];
  if (autoSafeReasons.includes(reason)) {
    markRestoreOrSkipDone(reason);
  }

  console.debug('[BackupSyncEngine] sync READY, reason:', reason);
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason } }));
}

export function setSyncEnabled(v) {
  localStorage.setItem(LS_SYNC_ENABLED, v ? '1' : '0');
  if (!v) { clearTimeout(_timer); _timer = null; }
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
}

function emitState(state) {
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state } }));
}

async function canSafelyUploadAgainstCloud(disk, token) {
  try {
    const cloudMeta = await disk.getMeta(token).catch(() => null);
    const localSummary = await enrichLocalSummaryWithDb(getLocalProfileSummary());
    const cmp = compareLocalVsCloud(localSummary, cloudMeta);

    if (cmp.state === 'no_cloud') {
      return { ok: true, reason: 'no_cloud' };
    }

    if (cmp.state === 'local_richer' || cmp.state === 'local_probably_richer' || cmp.state === 'equivalent') {
      return { ok: true, reason: cmp.state, compare: cmp, cloudMeta };
    }

    if (cmp.state === 'cloud_richer' || cmp.state === 'cloud_probably_richer') {
      return { ok: false, reason: cmp.state, compare: cmp, cloudMeta };
    }

    return { ok: false, reason: 'conflict', compare: cmp, cloudMeta };
  } catch (e) {
    return { ok: false, reason: 'cloud_compare_failed', error: String(e?.message || '') };
  }
}

function markDirty(isAchievement = false) {
  if (!canUpload()) return;
  try { localStorage.setItem('backup:local_dirty_ts', String(Date.now())); } catch {}

  clearTimeout(_timer);
  const delay = isAchievement ? 5000 : COOLDOWN_MS;

  _timer = setTimeout(async () => {
    // Повторная проверка на случай если за время cooldown что-то изменилось
    if (!canUpload()) return;

    const ya = window.YandexAuth;
    const disk = window.YandexDisk;
    if (!ya || !disk) return;
    if (ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
    if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return;
    if (Date.now() - _lastSaveAt < 10000) return;

    emitState('syncing');
    try {
      const { BackupVault } = await import('./backup-vault.js');
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) { emitState('idle'); return; }

      const backup = await BackupVault.buildBackupObject();

      // ЗАЩИТА: не аплоадим пустой бэкап
      const statsCount = backup?.data?.stats?.length || 0;
      const eventsCount = backup?.data?.eventLog?.warm?.length || 0;
      const achCount = Object.keys(backup?.data?.achievements || {}).length;
      const favsRaw = backup?.data?.localStorage?.['__favorites_v2__'];
      const plsRaw = backup?.data?.localStorage?.['sc3:playlists'];
      let favsCount = 0, plsCount = 0;
      try { favsCount = JSON.parse(favsRaw || '[]').filter(i => !i.inactiveAt).length; } catch {}
      try { plsCount = JSON.parse(plsRaw || '[]').length; } catch {}

      // Если всё пустое — скорее всего это свежее устройство, НЕ аплоадим
      if (statsCount <= 1 && eventsCount === 0 && achCount === 0 && favsCount === 0 && plsCount === 0) {
        console.debug('[BackupSyncEngine] skip upload: backup appears empty (fresh device?)');
        emitState('idle');
        return;
      }

      // compare-before-write: не затираем облако, если оно богаче
      const safeUpload = await canSafelyUploadAgainstCloud(disk, token);
      if (!safeUpload.ok) {
        console.debug('[BackupSyncEngine] skip upload: cloud is richer or compare failed', safeUpload.reason);
        emitState('idle');
        if (safeUpload.cloudMeta) {
          try {
            localStorage.setItem('yandex:last_backup_check', JSON.stringify(safeUpload.cloudMeta));
            window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
          } catch {}
        }
        if (safeUpload.reason === 'cloud_richer' || safeUpload.reason === 'cloud_probably_richer') {
          window.dispatchEvent(new CustomEvent('yandex:cloud:newer', {
            detail: {
              meta: safeUpload.cloudMeta || null,
              compareState: safeUpload.reason,
              localScore: safeUpload.compare?.localScore || 0,
              cloudScore: safeUpload.compare?.cloudScore || 0,
              localTs: safeUpload.compare?.localTs || 0,
              cloudTs: safeUpload.compare?.cloudTs || 0
            }
          }));
        }
        return;
      }

      const meta = await disk.upload(token, backup);
      _lastSaveAt = Date.now();

      try {
        localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
        localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
        localStorage.setItem('yandex:last_backup_local_ts', String(
          Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())
        ));
        window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
      } catch {}

      emitState('ok');
      setTimeout(() => emitState('idle'), 3000);
      console.debug('[BackupSyncEngine] profile autosave ok', new Date().toLocaleTimeString());

      if (window.eventLogger) {
        window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup' });
        window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
      }
    } catch (e) {
      emitState('idle');
      console.debug('[BackupSyncEngine] autosave skip:', e?.message);
    }
  }, delay);
}

export function initBackupSyncEngine() {
  if (_bound) return;
  _bound = true;

  if (!localStorage._bsePatched) {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      origSetItem(key, value);
      if (PROFILE_WATCH_KEYS.has(key) && _syncReady && !key.startsWith('backup:') && !key.startsWith('yandex:')) {
        markDirty(false);
      }
    };
    localStorage._bsePatched = true;
  }

  window.addEventListener('achievements:updated', (e) => {
    if (e.detail?.unlocked > 0 && _syncReady) {
      markDirty(true);
    }
  });

  setTimeout(() => {
    if (!_syncReady) {
      console.debug('[BackupSyncEngine] timeout fallback: forcing sync ready');
      markSyncReady('timeout_fallback');
    }
  }, 5 * 60 * 1000);

  console.debug('[BackupSyncEngine] initialized (profile watch only, compare-before-write enabled)');
}

export function getSyncIntervalSec() { return 60; }
export function setSyncInterval() {}

export default {
  initBackupSyncEngine, markSyncReady, isSyncReady,
  isSyncEnabled, setSyncEnabled, getSyncIntervalSec, setSyncInterval,
  markRestoreOrSkipDone, isRestoreOrSkipDone
};

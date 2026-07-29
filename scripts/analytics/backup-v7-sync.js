// Backup v7 sync engine.
// Не управляет playback и применяет каждый rangeKey ровно один раз.
import { metaDB } from './meta-db.js';
import { normalizeStatsProjection } from './stats-shard-contract.js';
import { mergePlaylistsStorageSafe } from './playlists-storage-merge.js';
import { collectDeviceSettingsLocalStorage, isPlaybackSensitiveDeviceSettingKey, shouldApplyDeviceSettingKey } from './device-settings-contract.js';
import { AccountDataContext } from './account-data-boundary.js';
import YandexBackupV7 from '../core/yandex-backup-v7.js';
import {
  buildNextBackupV7Range,
  clearPendingBackupV7Range,
  readBackupV7State,
  verifyBackupV7Range,
  writeBackupV7State
} from './backup-v7-range.js';
import { recordSyncRevision } from './sync-revisions.js';

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
let syncPromise = null;

const knownRangeKeys = async () => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const request = metaDB.db.transaction('backup_known_ranges', 'readonly').objectStore('backup_known_ranges').getAllKeys();
    request.onsuccess = () => resolve((request.result || []).map(safe).filter(Boolean));
    request.onerror = () => reject(request.error);
  });
};

const applyCountMap = (target, source) => {
  const output = { ...(target || {}) };
  Object.entries(source || {}).forEach(([key, amount]) => {
    output[key] = num(output[key]) + num(amount);
  });
  return output;
};

const applyVerifiedRange = async range => {
  const verified = await verifyBackupV7Range(range);
  await metaDB.init();

  return new Promise((resolve, reject) => {
    const stores = ['backup_known_ranges', 'backup_mutations', 'stats', 'global'];
    const tx = metaDB.db.transaction(stores, 'readwrite');
    const known = tx.objectStore('backup_known_ranges');
    const mutations = tx.objectStore('backup_mutations');
    const stats = tx.objectStore('stats');
    const global = tx.objectStore('global');
    let skipped = false;

    const knownRequest = known.get(verified.rangeKey);
    knownRequest.onsuccess = () => {
      if (knownRequest.result) {
        skipped = true;
        return;
      }

      const projection = normalizeStatsProjection(verified.projection);
      Object.entries(projection.tracks).forEach(([uid, value]) => {
        const request = stats.get(uid);
        request.onsuccess = () => {
          const row = request.result || {
            uid,
            globalListenSeconds: 0,
            globalValidListenCount: 0,
            globalFullListenCount: 0,
            firstPlayedAt: verified.createdAt,
            lastPlayedAt: verified.createdAt,
            featuresUsed: {}
          };
          const byHourMs = Array.from({ length: 24 }, (_, index) => num(row.byHourMs?.[index]) + num(projection.byHourMs[index] && value.listenMs ? 0 : 0));
          const byWeekdayMs = Array.from({ length: 7 }, (_, index) => num(row.byWeekdayMs?.[index]));
          stats.put({
            ...row,
            globalListenSeconds: num(row.globalListenSeconds) + value.listenMs / 1000,
            globalValidListenCount: num(row.globalValidListenCount) + value.validPlays,
            globalFullListenCount: num(row.globalFullListenCount) + value.fullPlays,
            lastPlayedAt: Math.max(num(row.lastPlayedAt), num(verified.createdAt)),
            featuresUsed: applyCountMap(row.featuresUsed, value.features),
            byHourMs,
            byWeekdayMs,
            byHour: byHourMs.map(amount => amount / 1000),
            byWeekday: byWeekdayMs.map(amount => amount / 1000)
          });
        };
      });

      const globalRequest = stats.get('global');
      globalRequest.onsuccess = () => {
        const row = globalRequest.result || { uid: 'global', globalListenSeconds: 0, globalValidListenCount: 0, globalFullListenCount: 0, firstPlayedAt: verified.createdAt, lastPlayedAt: verified.createdAt, featuresUsed: {} };
        stats.put({ ...row, featuresUsed: applyCountMap(row.featuresUsed, projection.features), lastPlayedAt: Math.max(num(row.lastPlayedAt), num(verified.createdAt)) });
      };

      const mutationRows = Object.values(verified.mutations || {}).filter(item => item?.key);
      mutationRows.forEach(item => {
        const key = safe(item.key);
        const request = mutations.get(key);
        request.onsuccess = () => {
          const old = request.result;
          if (num(old?.updatedAt) > num(item.updatedAt)) return;

          if (key === 'profile') {
            global.put({ key: 'user_profile', value: item.value || { name: 'Слушатель', avatar: '😎' } });
          } else if (key === 'sc3:playlists') {
            const remote = JSON.stringify(Array.isArray(item.value) ? item.value : []);
            localStorage.setItem(key, mergePlaylistsStorageSafe(localStorage.getItem(key), remote, 'latest'));
          } else if (['sc3:default', 'sc3:albumColors'].includes(key)) {
            localStorage.setItem(key, JSON.stringify(item.value || {}));
          }
          mutations.put({ key, updatedAt: num(item.updatedAt), rangeKey: verified.rangeKey });
        };
      });

      known.put({
        rangeKey: verified.rangeKey,
        deviceId: safe(verified.deviceId),
        chainId: safe(verified.chainId),
        fromSeq: num(verified.fromSeq),
        toSeq: num(verified.toSeq),
        hash: safe(verified.hash),
        appliedAt: Date.now()
      });
    };

    tx.oncomplete = () => resolve({ applied: !skipped, skipped, rangeKey: verified.rangeKey });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('backup_v7_apply_aborted'));
  });
};

const pullAll = async () => {
  let applied = 0;
  let remaining = 0;

  for (let page = 0; page < 100; page++) {
    const known = await knownRangeKeys();
    const result = await YandexBackupV7.pullRanges(known);
    const ranges = Array.isArray(result.ranges) ? result.ranges : [];

    for (const range of ranges) {
      const apply = await applyVerifiedRange(range);
      if (apply.applied) applied++;
    }

    remaining = num(result.remaining);
    if (!ranges.length || remaining <= 0) break;
  }

  if (applied) {
    window.dispatchEvent(new CustomEvent('stats:updated', { detail: { reason: 'backup_v7_pull', ranges: applied } }));
    window.dispatchEvent(new CustomEvent('analytics:logUpdated', { detail: { reason: 'backup_v7_pull', ranges: applied } }));
    window.dispatchEvent(new CustomEvent('playlists:updated', { detail: { reason: 'backup_v7_pull' } }));
    window.dispatchEvent(new CustomEvent('profile:data:refreshed', { detail: { reason: 'backup_v7_pull' } }));
  }
  return { applied, remaining };
};

const pushAll = async auth => {
  let uploaded = 0;
  let duplicate = 0;

  for (let page = 0; page < 100; page++) {
    const range = await buildNextBackupV7Range({
      deviceId: auth.deviceId,
      ownerYandexIdHash: auth.ownerYandexIdHash
    });
    if (!range) break;

    const result = await YandexBackupV7.pushRange(range);
    const serverRange = {
      ...range,
      hash: safe(result.hash),
      rangeKey: safe(result.rangeKey),
      deviceId: safe(result.deviceId || auth.deviceId)
    };
    await verifyBackupV7Range(serverRange);
    await metaDB.tx('backup_known_ranges', 'readwrite', store => store.put({
      rangeKey: serverRange.rangeKey,
      deviceId: serverRange.deviceId,
      chainId: serverRange.chainId,
      fromSeq: serverRange.fromSeq,
      toSeq: serverRange.toSeq,
      hash: serverRange.hash,
      appliedAt: Date.now(),
      uploadedByCurrentDevice: true
    }));
    await writeBackupV7State({ uploadedSeq: serverRange.toSeq, lastError: '' });
    await clearPendingBackupV7Range();

    if (result.duplicate) duplicate++;
    else uploaded++;
  }
  return { uploaded, duplicate };
};

const putSettings = async () => {
  const settings = { version: '7.0', localStorage: collectDeviceSettingsLocalStorage(localStorage) };
  return YandexBackupV7.putSettings(settings);
};

const getSettings = async () => {
  const result = await YandexBackupV7.getSettings();
  const settings = result?.settings;
  if (!result?.exists || !settings?.localStorage) return { applied: 0 };

  const playing = !!window.playerCore?.isPlaying?.();
  let applied = 0;
  Object.entries(settings.localStorage).forEach(([key, value]) => {
    if (!shouldApplyDeviceSettingKey(key)) return;
    if (playing && isPlaybackSensitiveDeviceSettingKey(key)) return;
    try {
      localStorage.setItem(key, String(value));
      applied++;
    } catch {}
  });
  return { applied };
};

const runSync = async ({ reason = 'autosync', includeSettings = true } = {}) => {
  await AccountDataContext.requireCurrentOwner();
  const authorization = (await YandexBackupV7.authorize()).authorization;
  if (!authorization?.deviceId || !authorization?.ownerYandexIdHash) throw new Error('backup_v7_authorization_invalid');

  const pull = await pullAll();
  const push = await pushAll(authorization);
  const settingsPull = includeSettings ? await getSettings().catch(() => ({ applied: 0 })) : { applied: 0 };
  const settingsPush = includeSettings ? await putSettings().catch(() => null) : null;
  const at = Date.now();

  await writeBackupV7State({ lastSyncAt: at, lastError: '' });
  localStorage.setItem('yandex:last_backup_local_ts', String(at));
  recordSyncRevision({
    hash: '',
    timestamp: at,
    domains: ['v7'],
    uploadedShared: push.uploaded > 0 || push.duplicate > 0,
    uploadedDevice: !!settingsPush?.ok,
    uploadedEventArchive: false,
    reason,
    ok: true
  });
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'ok' } }));
  return { ok: true, authorization, pull, push, settingsPull, settingsPush };
};

export const syncBackupV7 = options => {
  if (syncPromise) return syncPromise;
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'syncing' } }));
  syncPromise = runSync(options).catch(async error => {
    await writeBackupV7State({ lastError: safe(error?.message || 'backup_v7_sync_failed') }).catch(() => null);
    recordSyncRevision({ reason: options?.reason || 'autosync', ok: false, error: safe(error?.message || 'backup_v7_sync_failed') });
    window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'idle' } }));
    throw error;
  }).finally(() => {
    syncPromise = null;
  });
  return syncPromise;
};

export const getBackupV7Status = async () => {
  const state = await readBackupV7State();
  return { ...state, syncing: !!syncPromise, knownRanges: (await knownRangeKeys()).length };
};

export default { syncBackupV7, getBackupV7Status };

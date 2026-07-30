// Backup v7.1 sync engine.
// Не управляет playback. Raw ranges являются источником общей локальной аналитики.
import { metaDB } from './meta-db.js';
import { collectDeviceSettingsLocalStorage, isPlaybackSensitiveDeviceSettingKey, shouldApplyDeviceSettingKey } from './device-settings-contract.js';
import { exportAccountCachePolicies, applyAccountCachePolicies } from '../offline/cache-db.js';
import { getDeviceContext } from '../core/device-context.js';
import { getSocialSession } from '../core/social-session.js';
import { AccountDataContext } from './account-data-boundary.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { rebuildStatsFromEvents } from './stats-state.js';
import YandexBackupV7 from '../core/yandex-backup-v7.js';
import {
  buildPendingBackupV7Batch,
  commitUploadedBackupV7Batch,
  readBackupV7State,
  verifyBackupV7Range,
  writeBackupV7State
} from './backup-v7-range.js';
import { stableStringify, sha256Hex } from './event-integrity.js';
import { recordSyncRevision } from './sync-revisions.js';

const TEMPLATE_KEY = 'backup:v7:settings-template-device';
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
let syncPromise = null;
let repairBound = false;

const getAllRows = async store => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const request = metaDB.db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const parseRows = raw => {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const buildBackupV7SharedDocument = async () => ({
  version: '7.1',
  schemaVersion: 2,
  playlists: parseRows(localStorage.getItem('sc3:playlists')),
  updatedAt: Date.now()
});

export const applyBackupV7SharedDocument = async document => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return { applied: false };
  const playlists = Array.isArray(document.playlists) ? document.playlists : null;
  if (!playlists) return { applied: false, playlists: 0 };
  window.__backupV7SharedApplying = true;
  try {
    localStorage.setItem('sc3:playlists', JSON.stringify(playlists));
  } finally {
    window.__backupV7SharedApplying = false;
  }
  window.dispatchEvent(new CustomEvent('playlists:updated', { detail: { reason: 'backup_v71_shared' } }));
  return { applied: true, playlists: playlists.length };
};

const readWatermarks = async () => (await getAllRows('backup_chain_watermarks')).map(row => ({
  deviceId: safe(row.deviceId),
  chainId: safe(row.chainId),
  toSeq: num(row.toSeq),
  lastRangeHash: safe(row.lastRangeHash)
})).filter(row => row.deviceId && row.chainId);

const saveVerifiedRanges = async ({ ranges = [], watermarks = [], currentDeviceId = '', ownerYandexIdHash = '' } = {}) => {
  const unique = new Map();

  for (const range of Array.isArray(ranges) ? ranges : []) {
    const key = safe(range?.rangeKey);
    if (key && !unique.has(key)) unique.set(key, range);
  }

  const verified = [];
  for (const range of unique.values()) {
    verified.push(await verifyBackupV7Range(range, { ownerYandexIdHash }));
  }

  await metaDB.init();

  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(['backup_event_ranges', 'backup_known_ranges', 'backup_chain_watermarks'], 'readwrite');
    const rangeStore = tx.objectStore('backup_event_ranges');
    const knownStore = tx.objectStore('backup_known_ranges');
    const watermarkStore = tx.objectStore('backup_chain_watermarks');
    let inserted = 0;

    verified.forEach(range => {
      const request = rangeStore.get(range.rangeKey);
      request.onsuccess = () => {
        if (request.result) return;
        inserted++;
        const own = safe(range.deviceId) === safe(currentDeviceId);
        rangeStore.put({
          ...range,
          projected: own,
          storedAt: Date.now(),
          projectedAt: own ? Date.now() : 0
        });
        knownStore.put({
          rangeKey: range.rangeKey,
          deviceId: range.deviceId,
          chainId: range.chainId,
          fromSeq: range.fromSeq,
          toSeq: range.toSeq,
          hash: range.hash,
          appliedAt: own ? Date.now() : 0
        });
      };
    });

    (Array.isArray(watermarks) ? watermarks : []).forEach(item => {
      const deviceId = safe(item?.deviceId);
      const chainId = safe(item?.chainId);
      if (!deviceId || !chainId) return;
      watermarkStore.put({
        key: `${deviceId}:${chainId}`,
        deviceId,
        chainId,
        toSeq: num(item.toSeq),
        lastRangeHash: safe(item.lastRangeHash),
        updatedAt: Date.now()
      });
    });

    tx.oncomplete = () => resolve({ inserted, verified: verified.length });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('backup_v71_range_store_aborted'));
  });
};

const readCompleteEventTruth = async () => {
  const [ranges, warm, hot] = await Promise.all([
    getAllRows('backup_event_ranges'),
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getEvents('events_hot').catch(() => [])
  ]);

  return normalizeEventList([
    ...ranges.flatMap(range => Array.isArray(range.events) ? range.events : []),
    ...warm,
    ...hot
  ], {
    limit: 0,
    dropNoise: true,
    sort: true,
    dedupeAchievementUnlocks: false
  });
};

const markRangesProjected = async () => {
  const rows = await getAllRows('backup_event_ranges');
  await metaDB.tx('backup_event_ranges', 'readwrite', store => {
    rows.forEach(row => store.put({ ...row, projected: true, projectedAt: Date.now() }));
  });
};

export const rebuildBackupV7LocalAnalytics = async ({ reason = 'backup_v71_rebuild', force = false } = {}) => {
  if (!force && window.playerCore?.isPlaying?.()) return { rebuilt: false, deferred: true };

  const rows = await getAllRows('backup_event_ranges');
  if (!rows.some(row => row.projected !== true)) return { rebuilt: false, deferred: false };

  const events = await readCompleteEventTruth();
  await rebuildStatsFromEvents(metaDB, events, { reason });
  await markRangesProjected();

  window.dispatchEvent(new CustomEvent('analytics:logUpdated', { detail: { reason, events: events.length } }));
  window.dispatchEvent(new CustomEvent('profile:data:refreshed', { detail: { reason } }));
  return { rebuilt: true, deferred: false, events: events.length };
};

const bindDeferredRepair = () => {
  if (repairBound) return;
  repairBound = true;
  const repair = () => {
    if (window.playerCore?.isPlaying?.()) return;
    rebuildBackupV7LocalAnalytics({ reason: 'backup_v71_deferred_rebuild' }).catch(() => null);
  };
  window.addEventListener('player:pause', repair);
  window.addEventListener('player:stop', repair);
  window.addEventListener('player:ended', repair);
};

const settingsSemanticHash = value => sha256Hex(stableStringify(value));

const buildSettingsPayload = async () => ({
  version: '7.1',
  device: getDeviceContext(),
  preferences: collectDeviceSettingsLocalStorage(localStorage),
  cachePolicies: await exportAccountCachePolicies().catch(() => ({}))
});

const applySettingsDocument = async settings => {
  if (!settings || typeof settings !== 'object') return { applied: 0 };
  if (window.playerCore?.isPlaying?.()) return { applied: 0, deferred: true };

  let applied = 0;
  Object.entries(settings.preferences || settings.localStorage || {}).forEach(([key, value]) => {
    if (!shouldApplyDeviceSettingKey(key) || isPlaybackSensitiveDeviceSettingKey(key)) return;
    try {
      localStorage.setItem(key, String(value));
      applied++;
    } catch {}
  });

  await applyAccountCachePolicies(settings.cachePolicies || {}).catch(() => null);
  window.OfflineIndicators?.refreshAllIndicators?.().catch(() => null);
  return { applied, deferred: false };
};

const runSync = async ({ reason = 'autosync', includeSettings = true, pushEnabled = true, maxPullRanges = 50, includeDeviceCatalog = false } = {}) => {
  if (document.hidden) throw new Error('backup_v71_foreground_required');
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) throw new Error('backup_v71_network_unavailable');

  await AccountDataContext.requireCurrentOwner();
  bindDeferredRepair();

  const social = await getSocialSession();
  const yandexId = safe(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id);
  const ownerYandexIdHash = safe(social?.ownerYandexIdHash || social?.authorization?.ownerYandexIdHash) || (yandexId ? await sha256Hex(`ya:${yandexId}`) : '');
  const deviceId = safe(social?.accountDevice?.deviceId || localStorage.getItem('deviceStableId'));
  if (!/^[a-f0-9]{64}$/.test(ownerYandexIdHash)) throw new Error('backup_v71_owner_hash_required');
  if (!deviceId) throw new Error('backup_v71_device_required');

  const state = await readBackupV7State();
  const batch = pushEnabled ? await buildPendingBackupV7Batch({ deviceId, ownerYandexIdHash }) : null;
  const watermarks = await readWatermarks();

  const settingsPayload = includeSettings ? await buildSettingsPayload() : null;
  const localSettingsHash = settingsPayload ? await settingsSemanticHash(settingsPayload) : '';
  const sharedPayload = pushEnabled ? await buildBackupV7SharedDocument() : null;
  const settingsTemplateDeviceId = safe(localStorage.getItem(TEMPLATE_KEY));
  const sendSettings = !!settingsPayload && !settingsTemplateDeviceId && localSettingsHash !== state.settingsLocalHash;

  const result = await YandexBackupV7.sync({
    pushRanges: batch?.ranges || [],
    watermarks,
    knownSettingsHash: state.settingsServerHash,
    knownSharedHash: state.sharedServerHash,
    shared: sharedPayload,
    settings: sendSettings ? settingsPayload : null,
    settingsTemplateDeviceId,
    includeDeviceCatalog: includeDeviceCatalog === true,
    maxPullRanges: Math.max(1, Math.min(50, Math.floor(Number(maxPullRanges) || 50)))
  });

  const authorization = result?.authorization;
  if (!authorization?.deviceId || !authorization?.ownerYandexIdHash) {
    throw new Error('backup_v71_authorization_invalid');
  }
  if (safe(authorization.deviceId) !== deviceId) throw new Error('backup_v71_device_identity_mismatch');
  if (safe(authorization.ownerYandexIdHash) !== ownerYandexIdHash) throw new Error('backup_v71_owner_identity_mismatch');
  if (authorization.initializationRequired) throw new Error('backup_device_initialization_required');

  const pulledRanges = Array.isArray(result?.pull?.ranges) ? result.pull.ranges : [];
  const stored = await saveVerifiedRanges({
    ranges: [...(batch?.ranges || []), ...pulledRanges],
    watermarks: result?.pull?.watermarks || [],
    currentDeviceId: deviceId,
    ownerYandexIdHash
  });

  if (batch?.ranges?.length) await commitUploadedBackupV7Batch(batch);

  const sharedDocument = result?.shared?.current || null;
  const sharedApplied = sharedDocument ? await applyBackupV7SharedDocument(sharedDocument) : { applied: false };

  let templateApplied = false;
  if (settingsTemplateDeviceId && result?.settings?.template) {
    const applied = await applySettingsDocument(result.settings.template);
    if (!applied.deferred) {
      templateApplied = true;
      localStorage.removeItem(TEMPLATE_KEY);
    }
  }

  const serverSettingsHash = safe(
    result?.settings?.pushed?.hash ||
    result?.settings?.current?.hash ||
    state.settingsServerHash
  );
  const at = Date.now();

  await writeBackupV7State({
    lastSyncAt: at,
    settingsLocalHash: sendSettings ? localSettingsHash : state.settingsLocalHash,
    settingsServerHash: serverSettingsHash,
    sharedServerHash: safe(result?.shared?.hash || state.sharedServerHash),
    settingsTemplateApplied: state.settingsTemplateApplied || templateApplied,
    lastError: ''
  });

  const rebuild = await rebuildBackupV7LocalAnalytics({ reason: 'backup_v71_sync' });
  localStorage.setItem('yandex:last_backup_local_ts', String(at));

  const push = {
    uploaded: Number(result?.push?.accepted || 0),
    duplicate: Number(result?.push?.duplicates || 0)
  };
  const pull = {
    applied: stored.inserted,
    returned: Number(result?.pull?.returned || 0),
    remaining: Number(result?.pull?.remaining || 0)
  };

  recordSyncRevision({
    timestamp: at,
    domains: ['v7.1'],
    uploadedShared: push.uploaded > 0 || push.duplicate > 0,
    uploadedDevice: result?.settings?.pushed?.changed === true,
    uploadedEventArchive: push.uploaded > 0,
    reason,
    ok: true
  });

  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'ok' } }));
  return { ok: true, authorization, push, pull, rebuild, shared: { applied: sharedApplied.applied === true, changed: result?.shared?.changed === true, hash: safe(result?.shared?.hash) }, settings: result.settings || null };
};

export const syncBackupV7 = options => {
  if (syncPromise) return syncPromise;

  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'syncing' } }));
  syncPromise = runSync(options).catch(async error => {
    await writeBackupV7State({ lastError: safe(error?.message || 'backup_v71_sync_failed') }).catch(() => null);
    recordSyncRevision({ reason: options?.reason || 'autosync', ok: false, error: safe(error?.message || 'backup_v71_sync_failed') });
    window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'idle' } }));
    throw error;
  }).finally(() => {
    syncPromise = null;
  });

  return syncPromise;
};

export const getBackupV7Status = async () => {
  const state = await readBackupV7State();
  const [ranges, watermarks] = await Promise.all([
    getAllRows('backup_event_ranges'),
    getAllRows('backup_chain_watermarks')
  ]);
  return {
    ...state,
    syncing: !!syncPromise,
    storedRanges: ranges.length,
    pendingProjectionRanges: ranges.filter(row => row.projected !== true).length,
    watermarks: watermarks.length
  };
};

export default {
  syncBackupV7,
  getBackupV7Status,
  rebuildBackupV7LocalAnalytics
};

// Backup v7.1 sync engine.
// Не управляет playback. Raw ranges являются источником общей локальной аналитики.
import { metaDB } from './meta-db.js';
import { collectDeviceSettingsLocalStorage, isPlaybackSensitiveDeviceSettingKey, shouldApplyDeviceSettingKey } from './device-settings-contract.js';
import { exportAccountCachePolicies, applyAccountCachePolicies } from '../offline/cache-db.js';
import { getDeviceContext } from '../core/device-context.js';
import { getSocialSession } from '../core/social-session.js';
import { AccountDataContext } from './account-data-boundary.js';
import { buildStatsProjection, buildStatsProjectionShard, emptyStatsProjection, mergeStatsProjectionInto, projectionStreak, projectionToStatsRows, STATS_SHARD_VERSION, verifyStatsProjectionShard } from './stats-shard-contract.js';
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
import { clearBackupV7Checkpoint, createBackupV7Checkpoint, restoreBackupV7Checkpoint } from './backup-v7-recovery.js';
import { ingestBackupDomainEvents } from './backup-domain-state.js';

const TEMPLATE_KEY = 'backup:v7:settings-template-device';
const MAX_PULL_PAGES_PER_SLOT = 4;
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

const chainKey = range => `${safe(range?.deviceId)}:${safe(range?.chainId)}`;

const quarantineChain = async ({ key, ranges, error }) => {
  const row = {
    key,
    deviceId: safe(ranges?.[0]?.deviceId),
    chainId: safe(ranges?.[0]?.chainId),
    rangeKeys: (ranges || []).map(range => safe(range?.rangeKey)).filter(Boolean).slice(0, 100),
    error: safe(error?.message || error).slice(0, 240),
    quarantinedAt: Date.now()
  };
  await metaDB.setStoreValue('backup_chain_quarantine', key, row);
  return row;
};

const clearChainQuarantine = key => metaDB.tx('backup_chain_quarantine', 'readwrite', store => store.delete(key));

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

const saveVerifiedRanges = async ({ ranges = [], watermarks = [], ownerYandexIdHash = '' } = {}) => {
  const unique = new Map();

  for (const range of Array.isArray(ranges) ? ranges : []) {
    const key = safe(range?.rangeKey);
    if (key && !unique.has(key)) unique.set(key, range);
  }

  const existingWatermarks = new Map(
    (await getAllRows('backup_chain_watermarks')).map(row => [safe(row.key || `${row.deviceId}:${row.chainId}`), row])
  );
  const groups = new Map();
  for (const range of unique.values()) {
    const key = chainKey(range);
    if (!key || key === ':') continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(range);
  }

  const verified = [];
  const quarantined = [];
  for (const [key, chainRanges] of groups) {
    const ordered = chainRanges.sort((left, right) => num(left.fromSeq) - num(right.fromSeq));
    try {
      const chainVerified = [];
      const base = existingWatermarks.get(key) || null;
      for (const range of ordered) {
        const checked = await verifyBackupV7Range(range, { ownerYandexIdHash });
        const previous = chainVerified[chainVerified.length - 1];

        if (!previous && base) {
          if (Number(checked.toSeq) <= Number(base.toSeq || 0)) {
            if (Number(checked.toSeq) === Number(base.toSeq || 0) && safe(checked.hash) !== safe(base.lastRangeHash)) {
              throw new Error('backup_v71_existing_watermark_hash_mismatch');
            }
            continue;
          }
          if (Number(checked.fromSeq) !== Number(base.toSeq || 0) + 1) throw new Error('backup_v71_chain_gap');
          if (safe(checked.previousRangeHash) !== safe(base.lastRangeHash)) throw new Error('backup_v71_previous_range_hash_mismatch');
        }

        if (!previous && !base) {
          if (Number(checked.fromSeq) !== 1) throw new Error('backup_v71_chain_must_start_at_one');
          if (safe(checked.previousRangeHash)) throw new Error('backup_v71_genesis_previous_hash_invalid');
        }

        if (previous && Number(checked.fromSeq) !== Number(previous.toSeq) + 1) throw new Error('backup_v71_chain_gap');
        if (previous && safe(checked.previousRangeHash) !== safe(previous.hash)) throw new Error('backup_v71_previous_range_hash_mismatch');
        chainVerified.push(checked);
      }
      verified.push(...chainVerified);
      await clearChainQuarantine(key).catch(() => null);
    } catch (error) {
      quarantined.push(await quarantineChain({ key, ranges: ordered, error }));
    }
  }

  const rollups = new Map();
  for (const range of verified) {
    const shard = await buildStatsProjectionShard(range);
    await verifyStatsProjectionShard(shard, range);
    rollups.set(range.rangeKey, shard);
  }

  await metaDB.init();

  const storedResult = await new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(['backup_event_ranges', 'backup_chain_watermarks', 'backup_stats_rollups'], 'readwrite');
    const rangeStore = tx.objectStore('backup_event_ranges');
    const watermarkStore = tx.objectStore('backup_chain_watermarks');
    const rollupStore = tx.objectStore('backup_stats_rollups');
    let inserted = 0;

    verified.forEach(range => {
      const shard = rollups.get(range.rangeKey);
      if (shard) rollupStore.put(shard);
      const request = rangeStore.get(range.rangeKey);
      request.onsuccess = () => {
        const storedAt = Date.now();
        if (request.result) {
          rangeStore.put({
            ...request.result,
            cloudConfirmed: true,
            cloudUploadedAt: Number(request.result.cloudUploadedAt || storedAt),
            verifiedAt: Number(request.result.verifiedAt || storedAt)
          });
          return;
        }
        inserted++;
        rangeStore.put({
          ...range,
          deviceChain: `${safe(range.deviceId)}:${safe(range.chainId)}`,
          cloudConfirmed: true,
          cloudUploadedAt: storedAt,
          verifiedAt: storedAt,
          storedAt
        });
      };
    });

    const quarantinedKeys = new Set(quarantined.map(item => safe(item.key)));
    (Array.isArray(watermarks) ? watermarks : []).forEach(item => {
      const deviceId = safe(item?.deviceId);
      const chainId = safe(item?.chainId);
      const key = `${deviceId}:${chainId}`;
      if (!deviceId || !chainId || quarantinedKeys.has(key)) return;
      watermarkStore.put({
        key,
        deviceId,
        chainId,
        toSeq: num(item.toSeq),
        lastRangeHash: safe(item.lastRangeHash),
        updatedAt: Date.now()
      });
    });

    tx.oncomplete = () => resolve({ inserted, verified: verified.length, quarantined });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('backup_v71_range_store_aborted'));
  });

  const domainEvents = [];
  verified.forEach(range => {
    (Array.isArray(range.events) ? range.events : []).forEach(event => domainEvents.push(event));
  });
  const domains = await ingestBackupDomainEvents(domainEvents).catch(() => ({ applied: 0 }));
  return { ...storedResult, domainEventsApplied: Number(domains.applied || 0) };
};

const nextStoreRow = async (storeName, afterKey = null, indexName = '') => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const store = metaDB.db.transaction(storeName, 'readonly').objectStore(storeName);
    const source = indexName ? store.index(indexName) : store;
    const range = afterKey == null ? null : IDBKeyRange.lowerBound(afterKey, true);
    const request = source.openCursor(range);
    request.onsuccess = () => resolve(request.result ? { key: request.result.key, primaryKey: request.result.primaryKey, value: request.result.value } : null);
    request.onerror = () => reject(request.error);
  });
};

const putStoreRow = async (storeName, row) => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(row);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(`backup_store_put_failed:${storeName}`));
  });
};

const deleteStoreRow = async (storeName, key) => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

const ensureStatsRollups = async () => {
  let cursorKey = '';
  let built = 0;
  let verified = 0;

  while (true) {
    const entry = await nextStoreRow('backup_event_ranges', cursorKey);
    if (!entry) break;
    cursorKey = entry.key;
    const range = entry.value;
    const existing = await metaDB.getStoreValue('backup_stats_rollups', range.rangeKey).catch(() => null);

    try {
      if (existing) {
        await verifyStatsProjectionShard(existing, range);
        verified++;
        continue;
      }
    } catch {
      await deleteStoreRow('backup_stats_rollups', range.rangeKey).catch(() => null);
    }

    const checked = await verifyBackupV7Range(range, { ownerYandexIdHash: range.ownerYandexIdHash });
    const shard = await buildStatsProjectionShard(checked);
    await verifyStatsProjectionShard(shard, checked);
    await putStoreRow('backup_stats_rollups', shard);
    built++;
  }

  return { built, verified };
};

const streamStatsRollups = async () => {
  let projection = emptyStatsProjection();
  const coverage = new Map();
  let cursorKey = null;
  let shards = 0;

  while (true) {
    const entry = await nextStoreRow('backup_stats_rollups', cursorKey, 'chainSeq');
    if (!entry) break;
    cursorKey = entry.key;
    const shard = await verifyStatsProjectionShard(entry.value);
    projection = mergeStatsProjectionInto(projection, shard);
    const key = `${safe(shard.deviceStableId)}:${safe(shard.chainId)}`;
    if (!coverage.has(key)) coverage.set(key, []);
    coverage.get(key).push([Number(shard.fromSeq || 0), Number(shard.toSeq || 0)]);
    shards++;
  }

  coverage.forEach(rows => rows.sort((left, right) => left[0] - right[0]));
  return { projection, coverage, shards };
};

const eventCoveredByRollup = (event, coverage) => {
  const key = `${safe(event?.deviceStableId)}:${safe(event?.chainId)}`;
  const seq = Number(event?.deviceSeq || 0);
  if (!key || !seq) return false;
  return (coverage.get(key) || []).some(([fromSeq, toSeq]) => seq >= fromSeq && seq <= toSeq);
};

const writeProjectionAtomic = async projection => {
  const rows = projectionToStatsRows(projection);
  const streak = projectionStreak(projection);
  await metaDB.init();

  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(['stats', 'global'], 'readwrite');
    const statsStore = tx.objectStore('stats');
    const globalStore = tx.objectStore('global');
    statsStore.clear();
    rows.forEach(row => statsStore.put(row));
    globalStore.put({ key: 'global_streak', value: streak });
    globalStore.put({ key: 'backup_stats_rollup_schema', value: { version: STATS_SHARD_VERSION, shards: 0, rebuiltAt: Date.now() } });
    tx.oncomplete = () => resolve({ rows: rows.length, streak });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('backup_stats_projection_commit_failed'));
  });
};

const compactUploadedLocalEvents = async coverage => {
  const [warm, hot] = await Promise.all([
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getEvents('events_hot').catch(() => [])
  ]);
  const warmCovered = warm.filter(event => eventCoveredByRollup(event, coverage));
  const hotCovered = hot.filter(event => eventCoveredByRollup(event, coverage));
  if (warmCovered.length) await metaDB.deleteEvents(warmCovered, 'events_warm');
  if (hotCovered.length) await metaDB.deleteEvents(hotCovered, 'events_hot');
  return { warm: warmCovered.length, hot: hotCovered.length };
};

const compactOldRawRanges = async ({ retentionMs = 35 * 24 * 60 * 60 * 1000 } = {}) => {
  const cutoff = Date.now() - retentionMs;
  let cursorKey = '';
  let deleted = 0;

  while (true) {
    const entry = await nextStoreRow('backup_event_ranges', cursorKey);
    if (!entry) break;
    cursorKey = entry.key;
    const range = entry.value;
    if (Number(range?.createdAt || range?.storedAt || 0) >= cutoff) continue;
    if (range.localPacked === true && Number(range.cloudUploadedAt || 0) <= 0) continue;
    if (range.cloudConfirmed !== true && Number(range.cloudUploadedAt || 0) <= 0) continue;
    const shard = await metaDB.getStoreValue('backup_stats_rollups', range.rangeKey).catch(() => null);
    if (!shard) continue;
    try {
      await verifyStatsProjectionShard(shard, range);
      await deleteStoreRow('backup_event_ranges', range.rangeKey);
      deleted++;
    } catch {}
  }

  return deleted;
};

export const rebuildBackupV7LocalAnalytics = async ({ reason = 'backup_v71_rebuild', force = false } = {}) => {
  if (!force && window.playerCore?.isPlaying?.()) return { rebuilt: false, deferred: true };

  const migration = await ensureStatsRollups();
  const streamed = await streamStatsRollups();
  const [warm, hot] = await Promise.all([
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getEvents('events_hot').catch(() => [])
  ]);
  const pendingEvents = [...warm, ...hot].filter(event => !eventCoveredByRollup(event, streamed.coverage));
  const localProjection = buildStatsProjection(pendingEvents);
  const projection = mergeStatsProjectionInto(streamed.projection, localProjection);
  const committed = await writeProjectionAtomic(projection);

  const compactedEvents = await compactUploadedLocalEvents(streamed.coverage);
  const deletedRawRanges = await compactOldRawRanges();

  window.dispatchEvent(new CustomEvent('stats:rebuilt', { detail: { reason, shards: streamed.shards, pendingEvents: pendingEvents.length } }));
  window.dispatchEvent(new CustomEvent('analytics:logUpdated', { detail: { reason, events: pendingEvents.length } }));
  window.dispatchEvent(new CustomEvent('profile:data:refreshed', { detail: { reason } }));

  return {
    rebuilt: true,
    deferred: false,
    shards: streamed.shards,
    pendingEvents: pendingEvents.length,
    statsRows: committed.rows,
    rollupsBuilt: migration.built,
    compactedEvents,
    deletedRawRanges
  };
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

const validateBackupAuthorization = ({ result, deviceId, ownerYandexIdHash }) => {
  const authorization = result?.authorization;
  if (!authorization?.deviceId || !authorization?.ownerYandexIdHash) throw new Error('backup_v71_authorization_invalid');
  if (safe(authorization.deviceId) !== safe(deviceId)) throw new Error('backup_v71_device_identity_mismatch');
  if (safe(authorization.ownerYandexIdHash) !== safe(ownerYandexIdHash)) throw new Error('backup_v71_owner_identity_mismatch');
  if (authorization.initializationRequired) throw new Error('backup_device_initialization_required');
  return authorization;
};

const pullBackupV7Pages = async ({ firstRequest, currentDeviceId, ownerYandexIdHash, maxPages = MAX_PULL_PAGES_PER_SLOT } = {}) => {
  const pages = [];
  let request = { ...firstRequest };
  let storedTotal = 0;
  let quarantined = [];
  let previousWatermarkSignature = stableStringify(await readWatermarks());

  for (let page = 0; page < Math.max(1, Math.floor(Number(maxPages) || 1)); page++) {
    const result = await YandexBackupV7.sync(request);
    validateBackupAuthorization({ result, deviceId: currentDeviceId, ownerYandexIdHash });

    const ranges = Array.isArray(result?.pull?.ranges) ? result.pull.ranges : [];
    const stored = await saveVerifiedRanges({
      ranges: page === 0 ? [...(request.pushRanges || []), ...ranges] : ranges,
      watermarks: result?.pull?.watermarks || [],
      ownerYandexIdHash
    });

    storedTotal += Number(stored.inserted || 0);
    quarantined = [...quarantined, ...(stored.quarantined || [])];
    pages.push({ result, stored });

    if (Number(result?.pull?.remaining || 0) <= 0) {
      return { pages, firstResult: pages[0].result, result, storedTotal, quarantined, exhausted: false };
    }

    const watermarks = await readWatermarks();
    const nextSignature = stableStringify(watermarks);
    if (nextSignature === previousWatermarkSignature) {
      return { pages, firstResult: pages[0].result, result, storedTotal, quarantined, exhausted: true, stoppedReason: 'no_watermark_progress' };
    }
    previousWatermarkSignature = nextSignature;

    request = {
      pushRanges: [],
      watermarks,
      knownSettingsHash: safe(result?.settings?.pushed?.hash || result?.settings?.current?.hash || request.knownSettingsHash),
      knownSharedHash: safe(result?.shared?.hash || request.knownSharedHash),
      shared: null,
      settings: null,
      settingsTemplateDeviceId: '',
      includeDeviceCatalog: false,
      maxPullRanges: request.maxPullRanges
    };
  }

  const result = pages[pages.length - 1]?.result || null;
  return { pages, firstResult: pages[0]?.result || null, result, storedTotal, quarantined, exhausted: Number(result?.pull?.remaining || 0) > 0, stoppedReason: 'page_limit' };
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
  const settingsPayload = includeSettings ? await buildSettingsPayload() : null;
  const localSettingsHash = settingsPayload ? await settingsSemanticHash(settingsPayload) : '';
  const sharedPayload = pushEnabled ? await buildBackupV7SharedDocument() : null;
  const settingsTemplateDeviceId = safe(localStorage.getItem(TEMPLATE_KEY));
  const sendSettings = !!settingsPayload && !settingsTemplateDeviceId && localSettingsHash !== state.settingsLocalHash;

  const exchange = await pullBackupV7Pages({
    firstRequest: {
      pushRanges: batch?.ranges || [],
      watermarks: await readWatermarks(),
      knownSettingsHash: state.settingsServerHash,
      knownSharedHash: state.sharedServerHash,
      shared: sharedPayload,
      settings: sendSettings ? settingsPayload : null,
      settingsTemplateDeviceId,
      includeDeviceCatalog: includeDeviceCatalog === true,
      maxPullRanges: Math.max(1, Math.min(50, Math.floor(Number(maxPullRanges) || 50)))
    },
    currentDeviceId: deviceId,
    ownerYandexIdHash,
    maxPages: MAX_PULL_PAGES_PER_SLOT
  });

  const result = exchange.firstResult;
  const finalResult = exchange.result || result;
  const authorization = validateBackupAuthorization({ result, deviceId, ownerYandexIdHash });
  if (batch?.ranges?.length) await commitUploadedBackupV7Batch(batch);

  const checkpoint = await createBackupV7Checkpoint({ reason: `backup_v71_sync:${reason}` });
  try {
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

    const serverSettingsHash = safe(result?.settings?.pushed?.hash || result?.settings?.current?.hash || state.settingsServerHash);
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
    await clearBackupV7Checkpoint();
    localStorage.setItem('yandex:last_backup_local_ts', String(at));

    const push = {
      uploaded: Number(result?.push?.accepted || 0),
      duplicate: Number(result?.push?.duplicates || 0)
    };
    const pull = {
      applied: exchange.storedTotal,
      returned: exchange.pages.reduce((sum, page) => sum + Number(page.result?.pull?.returned || 0), 0),
      remaining: Number(finalResult?.pull?.remaining || 0),
      pages: exchange.pages.length,
      pageLimitReached: exchange.exhausted === true,
      stoppedReason: safe(exchange.stoppedReason)
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
    return {
      ok: true,
      authorization,
      push,
      pull,
      rebuild,
      quarantine: exchange.quarantined,
      shared: {
        applied: sharedApplied.applied === true,
        changed: result?.shared?.changed === true,
        hash: safe(result?.shared?.hash)
      },
      settings: result?.settings || null
    };
  } catch (error) {
    await restoreBackupV7Checkpoint(checkpoint).catch(() => null);
    throw error;
  }
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
export const readBackupV7JournalEvents = async ({ sinceAt = Date.now() - 30 * 24 * 60 * 60 * 1000, limit = 2000 } = {}) => {
  await metaDB.init();
  const events = new Map();
  const add = event => {
    const eventId = safe(event?.eventId);
    const timestamp = Number(event?.timestamp || 0);
    if (!eventId || timestamp < sinceAt) return;
    events.set(eventId, event);
  };

  await new Promise((resolve, reject) => {
    const request = metaDB.db.transaction('backup_event_ranges', 'readonly').objectStore('backup_event_ranges').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      (Array.isArray(cursor.value?.events) ? cursor.value.events : []).forEach(add);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });

  const [warm, hot] = await Promise.all([
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getEvents('events_hot').catch(() => [])
  ]);
  const queued = Array.isArray(window.eventLogger?.queue) ? window.eventLogger.queue : [];
  [...warm, ...hot, ...queued].forEach(add);

  return [...events.values()]
    .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
    .slice(0, Math.max(100, Number(limit) || 2000));
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
    watermarks: watermarks.length
  };
};

export default {
  syncBackupV7,
  getBackupV7Status,
  rebuildBackupV7LocalAnalytics,
  readBackupV7JournalEvents
};

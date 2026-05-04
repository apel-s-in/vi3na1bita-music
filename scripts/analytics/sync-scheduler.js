// UID.073_(Hybrid sync orchestrator)_(scheduler отдельно от state и cloud guard)_(autosave становится domain-driven)
// UID.099_(Multi-device sync model)_(dirty domains + compare-before-write)_(не писать backup на каждый setItem)
// UID.096_(Helper-first anti-duplication policy)_(уменьшить backup-sync-engine)

import { safeNum, safeJsonParse } from './backup-summary.js';
import { markDomainDirty, consumeDirtyState, DOMAIN_DEBOUNCE_MS } from './sync-domains.js';
import { uploadBackupBundle } from './backup-upload-runner.js';
import { canUpload, emitSyncState, getLastUploadAt, setLastUploadAt } from './sync-state.js';
import { checkCloudSafe, writeCachedCloudMeta } from './sync-cloud-guard.js';

let _timer = null, _dueAt = 0;

export const cancelScheduledSync = () => {
  clearTimeout(_timer);
  _timer = null;
  _dueAt = 0;
};

const persistDirtyDomain = domain => {
  try {
    localStorage.setItem('backup:local_dirty_ts', String(Date.now()));
    const prev = safeJsonParse(localStorage.getItem('backup:last_dirty_domains:v1') || '[]', []);
    localStorage.setItem('backup:last_dirty_domains:v1', JSON.stringify([...new Set([...(Array.isArray(prev) ? prev : []), domain].filter(Boolean))]));
  } catch {}
};

const isEffectivelyEmptyBackup = data => {
  const fRaw = data?.localStorage?.['__favorites_v2__'];
  const pRaw = data?.localStorage?.['sc3:playlists'];
  let favoritesCount = 0, playlistsCount = 0;
  try { favoritesCount = JSON.parse(fRaw || '[]').filter(i => !i?.inactiveAt && !i?.deletedAt).length; } catch {}
  try { playlistsCount = JSON.parse(pRaw || '[]').filter(p => !p?.deletedAt).length; } catch {}
  return (data?.stats?.length || 0) <= 1 &&
    (data?.eventLog?.warm?.length || 0) === 0 &&
    Object.keys(data?.achievements || {}).length === 0 &&
    favoritesCount === 0 &&
    playlistsCount === 0;
};

const persistUploadResult = ({ meta, backup } = {}) => {
  try {
    if (meta) {
      localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
      localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
      localStorage.setItem('yandex:last_backup_check_ts', String(Date.now()));
    }
    localStorage.removeItem('backup:last_dirty_domains:v1');
    if (backup) localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
    window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
  } catch {}
};

const emitCloudNewerIfNeeded = result => {
  if (!['cloud_richer', 'cloud_probably_richer'].includes(result?.reason)) return;
  window.dispatchEvent(new CustomEvent('yandex:cloud:newer', {
    detail: {
      meta: result.cloudMeta || null,
      compareState: result.reason,
      localScore: result.compare?.localScore || 0,
      cloudScore: result.compare?.cloudScore || 0,
      localTs: result.compare?.localTs || 0,
      cloudTs: result.compare?.cloudTs || 0
    }
  }));
};

export const runScheduledSyncNow = async ({ reason = 'autosync' } = {}) => {
  if (!canUpload()) return false;

  const ya = window.YandexAuth, disk = window.YandexDisk;
  if (!ya || !disk || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return false;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return false;
  if (Date.now() - getLastUploadAt() < 10000) return false;

  emitSyncState('syncing');
  try {
    const { BackupVault } = await import('./backup-vault.js');
    const token = ya.getToken();
    if (!token || !ya.isTokenAlive()) { emitSyncState('idle'); return false; }

    const backup = await BackupVault.buildBackupObject();
    const data = backup?.data || {};
    if (isEffectivelyEmptyBackup(data)) { emitSyncState('idle'); return false; }

    const safe = await checkCloudSafe(disk, token);
    if (!safe.ok) {
      emitSyncState('idle');
      if (safe.cloudMeta) {
        writeCachedCloudMeta(safe.cloudMeta);
        window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
      }
      emitCloudNewerIfNeeded(safe);
      return false;
    }

    const uploaded = await uploadBackupBundle({ disk, token, BackupVault, backup, force: false, uploadDevice: true, reason });
    if (!uploaded.uploadedShared && !uploaded.uploadedDevice) { emitSyncState('idle'); return false; }

    setLastUploadAt(Date.now());
    persistUploadResult({ meta: uploaded.meta, backup: uploaded.uploadedShared ? backup : null });
    emitSyncState('ok');
    setTimeout(() => emitSyncState('idle'), 3000);
    if (window.eventLogger) window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
    return true;
  } catch (e) {
    emitSyncState('idle');
    console.debug('[BackupSyncEngine] skip:', e?.message);
    return false;
  }
};

export const scheduleSync = ({ immediate = false, domain = 'generic' } = {}) => {
  if (!canUpload()) return false;
  const cleanDomain = String(domain || 'generic').trim() || 'generic';
  markDomainDirty(cleanDomain);
  persistDirtyDomain(cleanDomain);

  const dirtyState = consumeDirtyState();
  const delay = immediate ? DOMAIN_DEBOUNCE_MS.achievements : (dirtyState.debounceMs || DOMAIN_DEBOUNCE_MS.generic);
  const dueAt = Date.now() + Math.max(0, safeNum(delay));

  // Медленный домен не должен отодвигать уже запланированный быстрый save.
  if (_timer && _dueAt && dueAt >= _dueAt) return true;

  cancelScheduledSync();
  _dueAt = dueAt;
  _timer = setTimeout(() => {
    _timer = null;
    _dueAt = 0;
    runScheduledSyncNow({ reason: 'autosync' });
  }, Math.max(0, dueAt - Date.now()));
  return true;
};

export default {
  cancelScheduledSync,
  runScheduledSyncNow,
  scheduleSync
};

// UID.073_(Hybrid sync orchestrator)_(scheduler отдельно от state и cloud guard)_(autosave становится domain-driven) UID.099_(Multi-device sync model)_(dirty domains + compare-before-write)_(не писать backup на каждый setItem) UID.096_(Helper-first anti-duplication policy)_(уменьшить backup-sync-engine)
import { safeNum, safeJsonParse } from './backup-summary.js'; import { markDomainDirty, consumeDirtyState, DOMAIN_DEBOUNCE_MS } from './sync-domains.js'; import { uploadBackupBundle } from './backup-upload-runner.js'; import { canUpload, emitSyncState, getLastUploadAt, setLastUploadAt } from './sync-state.js'; import { checkCloudSafe, writeCachedCloudMeta } from './sync-cloud-guard.js'; import { recordSyncRevision } from './sync-revisions.js';
let _timer = null, _dueAt = 0;
export const cancelScheduledSync = () => { clearTimeout(_timer); _timer = null; _dueAt = 0; };
const persistDirtyDomain = d => { try { localStorage.setItem('backup:local_dirty_ts', String(Date.now())); const p = safeJsonParse(localStorage.getItem('backup:last_dirty_domains:v1') || '[]', []); localStorage.setItem('backup:last_dirty_domains:v1', JSON.stringify([...new Set([...(Array.isArray(p) ? p : []), d].filter(Boolean))])); } catch {} };
const isEmpty = d => { let f = 0, p = 0; try { f = JSON.parse(d?.localStorage?.['__favorites_v2__'] || '[]').filter(i => !i?.inactiveAt && !i?.deletedAt).length; p = JSON.parse(d?.localStorage?.['sc3:playlists'] || '[]').filter(x => !x?.deletedAt).length; } catch {} return (d?.stats?.length || 0) <= 1 && (d?.eventLog?.warm?.length || 0) === 0 && Object.keys(d?.achievements || {}).length === 0 && f === 0 && p === 0; };
const persistRes = ({ meta, backup } = {}) => { try { if (meta) { const ms = JSON.stringify(meta); localStorage.setItem('yandex:last_backup_meta', ms); localStorage.setItem('yandex:last_backup_check', ms); localStorage.setItem('yandex:last_backup_check_ts', String(Date.now())); } localStorage.removeItem('backup:last_dirty_domains:v1'); if (backup) localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now()))); window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated')); } catch {} };
export const runScheduledSyncNow = async ({ reason = 'autosync' } = {}) => {
  if (!canUpload() || Date.now() - getLastUploadAt() < 10000 || !(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return false;
  const ya = window.YandexAuth, disk = window.YandexDisk; if (!ya || !disk || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return false;
  emitSyncState('syncing');
  try {
    const { BackupVault } = await import('./backup-vault.js'), token = ya.getToken(); if (!token || !ya.isTokenAlive()) { emitSyncState('idle'); return false; }
    const backup = await BackupVault.buildBackupObject(); if (isEmpty(backup?.data)) { emitSyncState('idle'); return false; }
    const safe = await checkCloudSafe(disk, token);
    if (!safe.ok) { emitSyncState('idle'); recordSyncRevision({ reason, ok: false, error: safe.reason || 'cloud_not_safe' }); if (safe.cloudMeta) { writeCachedCloudMeta(safe.cloudMeta); window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated')); } if (['cloud_richer', 'cloud_probably_richer'].includes(safe.reason)) window.dispatchEvent(new CustomEvent('yandex:cloud:newer', { detail: { meta: safe.cloudMeta, compareState: safe.reason, localScore: safe.compare?.localScore || 0, cloudScore: safe.compare?.cloudScore || 0, localTs: safe.compare?.localTs || 0, cloudTs: safe.compare?.cloudTs || 0 }})); return false; }
    const leaseRes = disk.acquireSyncLease ? await disk.acquireSyncLease(token, { reason, ttlMs: 45000 }).catch(e => ({ ok: false, reason: e?.message || 'lease_failed' })) : { ok: true, lease: { deviceStableId: String(localStorage.getItem('deviceStableId') || ''), deviceHash: String(localStorage.getItem('deviceHash') || ''), startedAt: Date.now(), expiresAt: Date.now() + 30000, reason }};
    if (!leaseRes?.ok) { emitSyncState('idle'); recordSyncRevision({ reason, ok: false, error: leaseRes?.reason || 'lease_busy' }); return false; }
    let up; try { up = await uploadBackupBundle({ disk, token, BackupVault, backup, force: false, uploadDevice: true, reason, syncLease: leaseRes.lease }); } finally { if (leaseRes.lease) disk.releaseSyncLease?.(token, leaseRes.lease).catch(() => null); }
    if (!up.uploadedShared && !up.uploadedDevice) { emitSyncState('idle'); return false; }
    setLastUploadAt(Date.now()); persistRes({ meta: up.meta, backup: up.uploadedShared ? backup : null }); emitSyncState('ok'); setTimeout(() => emitSyncState('idle'), 3000); if (window.eventLogger) window.dispatchEvent(new CustomEvent('analytics:forceFlush')); return true;
  } catch (e) { emitSyncState('idle'); recordSyncRevision({ reason, ok: false, error: e?.message || 'sync_failed' }); return false; }
};
export const scheduleSync = ({ immediate = false, domain = 'generic' } = {}) => {
  if (!canUpload()) return false;
  const d = String(domain || 'generic').trim() || 'generic'; markDomainDirty(d); persistDirtyDomain(d);
  const ds = consumeDirtyState(), delay = immediate ? DOMAIN_DEBOUNCE_MS.achievements : (ds.debounceMs || DOMAIN_DEBOUNCE_MS.generic), dueAt = Date.now() + Math.max(0, safeNum(delay));
  if (_timer && _dueAt && dueAt >= _dueAt) return true;
  cancelScheduledSync(); _dueAt = dueAt; _timer = setTimeout(() => { _timer = null; _dueAt = 0; runScheduledSyncNow({ reason: 'autosync' }); }, Math.max(0, dueAt - Date.now())); return true;
};
export default { cancelScheduledSync, runScheduledSyncNow, scheduleSync };

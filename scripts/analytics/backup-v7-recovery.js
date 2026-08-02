// Backup v7 materialization checkpoint.
// Не управляет playback и не содержит физических audio blobs.
import { metaDB } from './meta-db.js';
import { exportAccountCachePolicies, applyAccountCachePolicies } from '../offline/cache-db.js';

const CHECKPOINT_KEY = 'latest';
const safe = value => String(value == null ? '' : value).trim();

const readRows = async store => metaDB.getStoreAll(store).catch(() => []);

const replaceRows = async (store, rows = []) => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    objectStore.clear();
    (Array.isArray(rows) ? rows : []).forEach(row => objectStore.put(row));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(`checkpoint_restore_failed:${store}`));
  });
};

export const createBackupV7Checkpoint = async ({ reason = 'backup_v71_materialization' } = {}) => {
  const [stats, global, eventsHot, watermarks, cachePolicies] = await Promise.all([
    readRows('stats'),
    readRows('global'),
    readRows('events_hot'),
    readRows('backup_chain_watermarks'),
    exportAccountCachePolicies().catch(() => ({}))
  ]);
  const checkpoint = {
    version: 1,
    checkpointId: `checkpoint_${crypto.randomUUID()}`,
    reason: safe(reason),
    createdAt: Date.now(),
    localStorage: {
      playlists: localStorage.getItem('sc3:playlists'),
      settingsTemplateDevice: localStorage.getItem('backup:v7:settings-template-device')
    },
    stats,
    global,
    eventsHot,
    watermarks,
    cachePolicies
  };
  await metaDB.setStoreValue('backup_recovery_checkpoints', CHECKPOINT_KEY, checkpoint);
  return checkpoint;
};

export const restoreBackupV7Checkpoint = async checkpointRaw => {
  const checkpoint = checkpointRaw || (await metaDB.getStoreValue('backup_recovery_checkpoints', CHECKPOINT_KEY).catch(() => null))?.value;
  if (!checkpoint?.checkpointId) throw new Error('backup_v71_checkpoint_missing');
  await Promise.all([
    replaceRows('stats', checkpoint.stats),
    replaceRows('global', checkpoint.global),
    replaceRows('events_hot', checkpoint.eventsHot),
    replaceRows('backup_chain_watermarks', checkpoint.watermarks)
  ]);
  if (checkpoint.localStorage?.playlists == null) localStorage.removeItem('sc3:playlists');
  else localStorage.setItem('sc3:playlists', checkpoint.localStorage.playlists);
  if (checkpoint.localStorage?.settingsTemplateDevice == null) localStorage.removeItem('backup:v7:settings-template-device');
  else localStorage.setItem('backup:v7:settings-template-device', checkpoint.localStorage.settingsTemplateDevice);
  await applyAccountCachePolicies(checkpoint.cachePolicies || {}).catch(() => null);
  window.dispatchEvent(new CustomEvent('backup:v7:checkpoint-restored', { detail: { checkpointId: checkpoint.checkpointId, reason: checkpoint.reason } }));
  return checkpoint;
};

export const clearBackupV7Checkpoint = () => metaDB.tx('backup_recovery_checkpoints', 'readwrite', store => store.delete(CHECKPOINT_KEY));

export const getBackupV7Checkpoint = async () => (await metaDB.getStoreValue('backup_recovery_checkpoints', CHECKPOINT_KEY).catch(() => null))?.value || null;

export default { createBackupV7Checkpoint, restoreBackupV7Checkpoint, clearBackupV7Checkpoint, getBackupV7Checkpoint };

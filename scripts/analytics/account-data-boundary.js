// Account-local vault.
// Переключает пользовательские данные, но не управляет playback.
import { metaDB } from './meta-db.js';
import { applyAccountCachePolicies, exportAccountCachePolicies } from '../offline/cache-db.js';
const VAULT_DB = 'Vi3AccountVault_v1';
const VAULT_STORE = 'profiles';
const VAULT_VERSION = 1;
const OWNER_KEY = 'account:data-owner:v1';
const LOCAL_OWNER = '__local__';
const EXACT_STORAGE_KEYS = new Set([
  '__favorites_v2__',
  'sc3:playlists',
  'sc3:default',
  'sc3:albumColors',
  'backup:device_registry:v1',
  'backup:last_local_summary:v1',
  'backup:last_shared_semantic_hash:v1',
  'backup:last_history_upload_at:v1',
  'backup:last_dirty_domains:v1',
  'backup:local_dirty_ts',
  'backup:restore_or_skip_done',
  'backup:sync_revisions:v1',
  'yandex:last_backup_check',
  'yandex:last_backup_meta',
  'yandex:last_backup_local_ts',
  'yandex:last_backup_check_ts',
  'yandex:onboarding:skip:until',
  'intel:internal-user-id',
  'intel:provider-identity:v1',
  'intel:provider-consents:v1',
  'intel:hybrid-sync:v1',
  'eventLedger:chainId:v1',
  'favoriteMirror:outbox:v1',
  'favoriteMirror:revision:v1',
  'listeningReceipts:completionOutbox:v1',
  'vf_unread'
]);
const STORAGE_PREFIXES = Object.freeze(['gc_data_', 'backup:last_device_settings_hash:v1:', 'backup:event_archive:last_seq:v2:', 'backup:event_archive:last_hash:v2:', 'vf_webpush_sync_']);
const safe = value => String(value == null ? '' : value).trim();
const currentYandexId = () => safe(window.YandexAuth?.getProfile?.()?.yandexId);
const isAccountStorageKey = key => EXACT_STORAGE_KEYS.has(key) || STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
const listAccountStorageKeys = () => {
  const keys = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && isAccountStorageKey(key)) keys.push(key);
    }
  } catch {}
  return keys;
};
const collectAccountStorage = () =>
  Object.fromEntries(
    listAccountStorageKeys()
      .map(key => [key, localStorage.getItem(key)])
      .filter(([, value]) => value != null)
  );
const replaceAccountStorage = values => {
  listAccountStorageKeys().forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch {}
  });
  Object.entries(values || {}).forEach(([key, value]) => {
    if (!isAccountStorageKey(key) || value == null) return;
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  });
};
const ownerStorageKey = async owner => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`account:${safe(owner)}`));
  return [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
};
let vaultPromise = null;
const openVault = () => {
  if (vaultPromise) return vaultPromise;
  vaultPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB, VAULT_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) {
        db.createObjectStore(VAULT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    vaultPromise = null;
    throw error;
  });
  return vaultPromise;
};
const vaultGet = async owner => {
  const db = await openVault();
  const key = await ownerStorageKey(owner);
  return new Promise((resolve, reject) => {
    const request = db.transaction(VAULT_STORE, 'readonly').objectStore(VAULT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};
const vaultPut = async (owner, snapshot) => {
  const db = await openVault();
  const key = await ownerStorageKey(owner);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readwrite');
    tx.objectStore(VAULT_STORE).put({ key, ownerYandexId: owner === LOCAL_OWNER ? '' : owner, updatedAt: Date.now(), snapshot });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};
const emptySnapshot = () => ({ version: 1, metaDB: {}, localStorage: {}, cachePolicies: {} });
const captureCurrentSnapshot = async () => ({ version: 1, savedAt: Date.now(), metaDB: await metaDB.exportSnapshot(), localStorage: collectAccountStorage(), cachePolicies: await exportAccountCachePolicies().catch(() => ({})) });
const applySnapshot = async snapshot => {
  const data = snapshot || emptySnapshot();
  await metaDB.replaceSnapshot(data.metaDB || {});
  replaceAccountStorage(data.localStorage || {});
  await applyAccountCachePolicies(data.cachePolicies || {}).catch(() => null);
};
const hasMeaningfulCurrentData = async () => {
  const [stats, hot, warm, achievements] = await Promise.all([metaDB.getAllStats().catch(() => []), metaDB.getEvents('events_hot').catch(() => []), metaDB.getEvents('events_warm').catch(() => []), metaDB.getGlobal('unlocked_achievements').catch(() => null)]);
  let favorites = [];
  let playlists = [];
  try {
    favorites = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]');
    playlists = JSON.parse(localStorage.getItem('sc3:playlists') || '[]');
  } catch {}
  return stats.some(row => row?.uid && row.uid !== 'global') || hot.length > 0 || warm.length > 0 || Object.keys(achievements?.value || {}).length > 0 || favorites.length > 0 || playlists.length > 0;
};
const askToAdoptLocalData = owner =>
  new Promise(resolve => {
    if (!window.Modals?.choice) {
      resolve(false);
      return;
    }
    window.Modals.choice({
      title: 'Локальный прогресс',
      textHtml: 'На устройстве есть прогресс без привязки к аккаунту.<br><br>' + 'Перенести его в текущий Яндекс-аккаунт? ' + 'Кэш музыки останется общим в любом случае.',
      actions: [
        { key: 'adopt', text: 'Перенести в аккаунт', primary: true, onClick: () => resolve(true) },
        { key: 'empty', text: 'Открыть чистый профиль', onClick: () => resolve(false) }
      ],
      onClose: () => resolve(false)
    });
  });
const reloadAccountRuntime = async reason => {
  try {
    const rows = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]');
    window.FavoritesManager?.replaceSnapshot?.(rows, { reason });
  } catch {}
  await window.achievementEngine?.hydrateFromStorage?.({ forceCheck: false, silent: true, reason }).catch(() => null);
  ['stats:updated', 'analytics:logUpdated', 'favorites:updated', 'playlists:updated', 'profile:data:refreshed'].forEach(name => window.dispatchEvent(new CustomEvent(name, { detail: { reason } })));
  window.PlayerUI?.updateMiniHeader?.();
  window.PlayerUI?.updatePlaylistFiltering?.();
  window.OfflineIndicators?.refreshAllIndicators?.().catch(() => null);
  const current = window.AlbumsManager?.getCurrentAlbum?.();
  if (current && !['__games__', '__friends__'].includes(current)) {
    window.AlbumsManager?.loadAlbum?.(current).catch(() => null);
  }
};
let initialized = false;
let activeOwner = '';
let switchPromise = Promise.resolve();
const getStoredOwner = () => safe(localStorage.getItem(OWNER_KEY));
const setStoredOwner = owner => {
  activeOwner = safe(owner) || LOCAL_OWNER;
  localStorage.setItem(OWNER_KEY, activeOwner);
};
const flushAnalytics = async ({ from, to }) => {
  window.dispatchEvent(new CustomEvent('account:data-switching', { detail: { from, to } }));
  await window.eventLogger?.flush?.().catch(() => null);
  await window.statsAggregator?.waitForIdle?.().catch(() => null);
};
const performSwitch = async (targetOwner, { adoptLocalData = null } = {}) => {
  const target = safe(targetOwner) || LOCAL_OWNER;
  const current = activeOwner || getStoredOwner() || LOCAL_OWNER;
  if (current === target) {
    setStoredOwner(target);
    return { ok: true, switched: false, ownerYandexId: target };
  }
  const previousRestoring = window._isRestoring === true;
  window.__accountDataSwitching = true;
  try {
    await import('./backup-sync-engine.js').then(module => module.suspendSyncForAccountSwitch?.()).catch(() => null);
    await flushAnalytics({ from: current, to: target });
    window._isRestoring = true;
    const currentSnapshot = await captureCurrentSnapshot();
    await vaultPut(current, currentSnapshot);
    const targetRow = await vaultGet(target);
    let targetSnapshot = targetRow?.snapshot || null;
    if (!targetSnapshot && current === LOCAL_OWNER && target !== LOCAL_OWNER && (await hasMeaningfulCurrentData())) {
      const adopt = adoptLocalData == null ? await askToAdoptLocalData(target) : adoptLocalData === true;
      if (adopt) {
        targetSnapshot = currentSnapshot;
        await vaultPut(target, targetSnapshot);
      }
    }
    await applySnapshot(targetSnapshot || emptySnapshot());
    setStoredOwner(target);
    await reloadAccountRuntime(`account_switch:${current}:${target}`);
    window.dispatchEvent(new CustomEvent('account:data-switched', { detail: { from: current, to: target, ownerYandexId: target === LOCAL_OWNER ? '' : target } }));
    return { ok: true, switched: true, ownerYandexId: target };
  } finally {
    window._isRestoring = previousRestoring;
    window.__accountDataSwitching = false;
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent('analytics:logUpdated', { detail: { reason: 'account_switch_complete' } }));
    });
  }
};
const switchTo = (owner, options = {}) => {
  const requestedOwner = safe(owner) || LOCAL_OWNER;
  switchPromise = switchPromise.catch(() => null).then(() => performSwitch(requestedOwner, options));
  return switchPromise;
};
export const AccountDataContext = {
  getCurrentOwner() {
    return activeOwner || getStoredOwner() || LOCAL_OWNER;
  },
  isSwitching() {
    return !!window.__accountDataSwitching;
  },
  async switchToYandexAccount(yandexId, options = {}) {
    const owner = safe(yandexId);
    if (!owner) {
      throw new Error('account_owner_required');
    }
    return switchTo(owner, options);
  },
  async switchToLocal(options = {}) {
    return switchTo(LOCAL_OWNER, options);
  },
  async requireCurrentOwner() {
    await switchPromise;
    const yandexId = currentYandexId();
    if (!yandexId) {
      throw new Error('local_data_owner_auth_required');
    }
    if (this.getCurrentOwner() !== yandexId) {
      await this.switchToYandexAccount(yandexId);
    }
    if (this.getCurrentOwner() !== yandexId) {
      throw new Error('local_data_owner_mismatch');
    }
    return { ok: true, ownerYandexId: yandexId };
  },
  async saveCurrent() {
    await switchPromise;
    const owner = this.getCurrentOwner();
    await vaultPut(owner, await captureCurrentSnapshot());
    return true;
  }
};
export const initAccountDataBoundary = async () => {
  if (initialized) return switchPromise;
  initialized = true;
  activeOwner = getStoredOwner();
  if (!activeOwner) {
    setStoredOwner(LOCAL_OWNER);
  }
  window.addEventListener('yandex:auth:changed', event => {
    const owner = safe(event.detail?.profile?.yandexId) || currentYandexId();
    if (event.detail?.status === 'active' && owner) {
      AccountDataContext.switchToYandexAccount(owner).catch(error => window.NotificationSystem?.error?.(`Не удалось переключить профиль: ${error?.message || 'ошибка'}`));
    } else if (event.detail?.status === 'logged_out') {
      AccountDataContext.switchToLocal().catch(() => null);
    }
  });
  const owner = currentYandexId();
  if (window.YandexAuth?.getSessionStatus?.() === 'active' && owner) {
    return AccountDataContext.switchToYandexAccount(owner);
  }
  return AccountDataContext.switchToLocal();
};
window.AccountDataContext = AccountDataContext;
export default AccountDataContext;

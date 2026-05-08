import { metaDB } from './meta-db.js';
import DeviceRegistry from './device-registry.js';
import { normalizeCloudBackupMeta } from './cloud-contract.js';
import { collectSharedSnapshotLocalStorage } from './snapshot-contract.js';
import { buildDeviceSettingsPath, collectDeviceSettingsLocalStorage, normalizeDeviceSettingsSnapshot } from './device-settings-contract.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { buildAchievementBackupState, deriveAchievementUnlockMetaFromEvents } from './achievement-state.js';
import { readLedgerCheckpoint } from './event-integrity.js';

const sortObj = v => Array.isArray(v) ? v.map(sortObj) : (!v || typeof v !== 'object') ? v : Object.keys(v).sort().reduce((a, k) => (a[k] = sortObj(v[k]), a), {});
export const stableStringify = v => JSON.stringify(sortObj(v));
export const sha256Hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s||''))))].map(b => b.toString(16).padStart(2,'0')).join('');

export const readBackupOwnerIdentity = async () => { const p = window.YandexAuth?.getProfile?.(); return { internalUserId: localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || crypto.randomUUID(), ownerYandexId: String(p?.yandexId||p?.id||'').trim()||null, ownerLogin: String(p?.login||'').trim()||null, ownerDisplayName: String(p?.displayName||p?.realName||'').trim()||null }; };

export const readDeviceRegistryForBackup = async () => {
  const { getOrCreateDeviceHash, getOrCreateDeviceStableId } = await import('../core/device-identity.js'), { detectCurrentDeviceProfile } = await import('../core/device-profile.js');
  const h = await getOrCreateDeviceHash(), id = await getOrCreateDeviceStableId();
  const prof = detectCurrentDeviceProfile({ registry: DeviceRegistry.getDeviceRegistry(), savedLabel: localStorage.getItem('yandex:onboarding:device_label') || '' });
  const cur = DeviceRegistry.normalizeDeviceRow({ ...prof, deviceHash: h, deviceStableId: id, platform: prof.platform || (window.Utils?.getPlatform?.()?.isIOS ? 'ios' : (/Android/i.test(navigator.userAgent) ? 'android' : 'web')), userAgent: navigator.userAgent, firstSeenAt: Number(localStorage.getItem('app:first-install-ts') || Date.now()), lastSeenAt: Date.now(), lastBackupAt: Date.now(), seenHashes: [h] });
  const fin = DeviceRegistry.normalizeDeviceRegistry([...DeviceRegistry.normalizeDeviceRegistry(DeviceRegistry.getDeviceRegistry()), cur]);
  const limit = new Set(fin.map(d => d.deviceStableId || d.deviceHash).filter(Boolean)).size;
  const res = fin.length > limit ? fin.slice(0, limit) : fin;
  DeviceRegistry.saveDeviceRegistry(res); return res;
};

const dedupIntel = arr => Array.isArray(arr) && arr.length ? [...new Map(arr.filter(r => r?.key).map(r => [String(r.key), r])).values()] : [];

export const buildBackupDataSnapshot = async () => {
  try { window.dispatchEvent(new CustomEvent('analytics:forceFlush')); await new Promise(r => setTimeout(r, 80)); } catch {}
  const [st, h, w, a, aM, str, uP, uR, lP, pI, hS, rS, cS, iR, ledger] = await Promise.all([metaDB.getAllStats(), metaDB.getEvents('events_hot').catch(()=>[]), metaDB.getEvents('events_warm'), metaDB.getGlobal('unlocked_achievements'), metaDB.getGlobal('achievement_unlock_meta'), metaDB.getGlobal('global_streak'), metaDB.getGlobal('user_profile'), metaDB.getGlobal('user_profile_rpg'), metaDB.getStoreAll('listener_profile').catch(()=>[]), metaDB.getStoreAll('provider_identity').catch(()=>[]), metaDB.getStoreAll('hybrid_sync').catch(()=>[]), metaDB.getStoreAll('recommendation_state').catch(()=>[]), metaDB.getStoreAll('collection_state').catch(()=>[]), metaDB.getStoreAll('intel_runtime').catch(()=>[]), readLedgerCheckpoint(metaDB).catch(()=>null)]);
  const warmTrimmed = normalizeEventList([...(Array.isArray(w)?w:[]), ...(Array.isArray(h)?h:[])], { limit: 10000 });
  return { stats: st, eventLog: { warm: warmTrimmed }, ledger: ledger || {}, achievements: a?.value || {}, streaks: str?.value || {}, userProfile: uP?.value || { name: 'Слушатель', avatar: '😎' }, userProfileRpg: uR?.value || { xp: 0, level: 1 }, achievementState: buildAchievementBackupState({ unlocked: a?.value || {}, unlockMeta: { ...deriveAchievementUnlockMetaFromEvents(warmTrimmed), ...(aM?.value || {}) }, profileRpg: uR?.value || { xp: 0, level: 1 }, streaks: str?.value || {}, events: warmTrimmed }), localStorage: collectSharedSnapshotLocalStorage(localStorage), intel: { listenerProfile: dedupIntel(lP), providerIdentity: dedupIntel(pI), hybridSync: dedupIntel(hS), recommendationState: dedupIntel(rS), collectionState: dedupIntel(cS), intelRuntime: dedupIntel(iR) } };
};

export const buildBackupRevision = ({ identity: i, devices: dv, data: d, currentDevice: c } = {}) => normalizeCloudBackupMeta({ timestamp: Date.now(), appVersion: window.APP_CONFIG?.APP_VERSION || null, version: '6.0', eventCount: Array.isArray(d?.eventLog?.warm) ? d.eventLog.warm.length : 0, statsCount: Array.isArray(d?.stats) ? d.stats.length : 0, devicesCount: Array.isArray(dv) ? dv.length : 0, profileName: String(d?.userProfile?.name || 'Слушатель'), sourceDeviceStableId: String(c?.deviceStableId || ''), sourceDeviceLabel: String(c?.label || ''), sourceDeviceClass: String(c?.class || ''), sourcePlatform: String(c?.platform || ''), ownerYandexId: String(i?.ownerYandexId || ''), achievementsCount: Object.keys(d?.achievements || {}).length, level: Math.max(1, Number(d?.userProfileRpg?.level || 1)), xp: Number(d?.userProfileRpg?.xp || 0), deviceStableCount: DeviceRegistry.countDeviceStableIds(dv || []) });

export const buildDeviceSettingsObject = async ({ identity: id, currentDevice: cd } = {}) => {
  const o = id || await readBackupOwnerIdentity(), c = cd || (() => { const m = DeviceRegistry.getCurrentDeviceIdentity(); return DeviceRegistry.normalizeDeviceRegistry(DeviceRegistry.getDeviceRegistry()).find(d => (m?.deviceStableId && d.deviceStableId === m.deviceStableId) || (m?.deviceHash && d.deviceHash === m.deviceHash)) || null; })();
  const sId = String(c?.deviceStableId || localStorage.getItem('deviceStableId') || '').trim();
  return normalizeDeviceSettingsSnapshot({ version: '1.0', timestamp: Date.now(), ownerYandexId: String(o?.ownerYandexId || ''), deviceStableId: sId, deviceHash: String(c?.deviceHash || localStorage.getItem('deviceHash') || '').trim(), sourceDeviceLabel: String(c?.label || ''), sourceDeviceClass: String(c?.class || ''), sourcePlatform: String(c?.platform || ''), path: buildDeviceSettingsPath(sId), localStorage: collectDeviceSettingsLocalStorage(localStorage) });
};

export const buildFullBackupObject = async () => {
  const [identity, devices, data] = await Promise.all([readBackupOwnerIdentity(), readDeviceRegistryForBackup(), buildBackupDataSnapshot()]), curIdentity = DeviceRegistry.getCurrentDeviceIdentity(), currentDevice = Array.isArray(devices) ? devices.find(x => (curIdentity?.deviceStableId && x.deviceStableId === curIdentity.deviceStableId) || (curIdentity?.deviceHash && x.deviceHash === curIdentity.deviceHash)) || devices[0] || null;
  const eventLogHash = await sha256Hex(stableStringify(data?.eventLog?.warm || [])), sharedStorageHash = await sha256Hex(stableStringify(data?.localStorage || {})), ledger = data?.ledger || {};
  const revision = { ...buildBackupRevision({ identity, devices, data, currentDevice }), eventLedgerHead: String(ledger.headHash || ''), eventLedgerSeq: Number(ledger.deviceSeq || 0), eventLedgerDeviceStableId: String(ledger.deviceStableId || currentDevice?.deviceStableId || ''), eventLogHash, sharedStorageHash };
  const payloadHash = await sha256Hex(stableStringify({ identity, devices, revision, data }));
  return { version: '6.0', createdAt: Date.now(), identity, devices, revision, integrity: { algorithm: 'SHA-256', payloadHash, ownerBinding: await sha256Hex(`${identity.ownerYandexId||'anon'}::${identity.internalUserId||'local'}::${payloadHash}`), createdByAppVersion: window.APP_CONFIG?.APP_VERSION || 'unknown', schemaVersion: '6.0', minReaderVersion: '8.3.0', sourceDeviceStableId: String(currentDevice?.deviceStableId || ''), eventLedgerHead: revision.eventLedgerHead, eventLedgerSeq: revision.eventLedgerSeq, eventLedgerDeviceStableId: revision.eventLedgerDeviceStableId, eventLogHash, sharedStorageHash }, data };
};

export default { stableStringify, sha256Hex, readBackupOwnerIdentity, readDeviceRegistryForBackup, buildBackupDataSnapshot, buildBackupRevision, buildDeviceSettingsObject, buildFullBackupObject };

import { safeJsonParse, safeString } from './backup-summary.js';

const LS_REGISTRY = 'backup:device_registry:v1';

export function getDeviceRegistry() {
  const reg = safeJsonParse(localStorage.getItem(LS_REGISTRY) || '[]', []);
  return Array.isArray(reg) ? reg.filter(Boolean) : [];
}

export function saveDeviceRegistry(rows) {
  const out = Array.isArray(rows) ? rows.filter(Boolean) : [];
  localStorage.setItem(LS_REGISTRY, JSON.stringify(out));
  return out;
}

export function getCurrentDeviceIdentity() {
  return {
    deviceHash: safeString(localStorage.getItem('deviceHash') || ''),
    deviceStableId: safeString(localStorage.getItem('deviceStableId') || '')
  };
}

export function isSameDevice(a, b) {
  const aStable = safeString(a?.deviceStableId || '');
  const bStable = safeString(b?.deviceStableId || '');
  const aHash = safeString(a?.deviceHash || '');
  const bHash = safeString(b?.deviceHash || '');

  if (aStable && bStable) return aStable === bStable;
  if (!aStable && !bStable && aHash && bHash) return aHash === bHash;
  return false;
}

export function isCurrentDevice(row, current = getCurrentDeviceIdentity()) {
  return isSameDevice(row, current);
}

export function getOtherDevices(rows, current = getCurrentDeviceIdentity()) {
  return (Array.isArray(rows) ? rows : []).filter(row => !isCurrentDevice(row, current));
}

export function countDeviceStableIds(rows) {
  return new Set(
    (Array.isArray(rows) ? rows : [])
      .map(d => safeString(d?.deviceStableId || ''))
      .filter(Boolean)
  ).size;
}

export function removeDevicesFromRegistry(rows, selectedRows) {
  const stableIdsToDelete = new Set(
    (Array.isArray(selectedRows) ? selectedRows : [])
      .map(d => safeString(d?.deviceStableId || ''))
      .filter(Boolean)
  );
  const hashesToDelete = new Set(
    (Array.isArray(selectedRows) ? selectedRows : [])
      .map(d => safeString(d?.deviceHash || ''))
      .filter(Boolean)
  );

  return (Array.isArray(rows) ? rows : []).filter(d => {
    const stable = safeString(d?.deviceStableId || '');
    const hash = safeString(d?.deviceHash || '');
    if (stable && stableIdsToDelete.has(stable)) return false;
    if (!stable && hash && hashesToDelete.has(hash)) return false;
    return true;
  });
}

export default {
  getDeviceRegistry,
  saveDeviceRegistry,
  getCurrentDeviceIdentity,
  isSameDevice,
  isCurrentDevice,
  getOtherDevices,
  countDeviceStableIds,
  removeDevicesFromRegistry
};

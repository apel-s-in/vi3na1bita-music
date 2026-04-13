import { safeJsonParse, safeString, safeNum } from './backup-summary.js';

const LS_REGISTRY = 'backup:device_registry:v1';

export function getDeviceRegistry() {
  const reg = safeJsonParse(localStorage.getItem(LS_REGISTRY) || '[]', []);
  return Array.isArray(reg) ? reg.filter(Boolean) : [];
}

export function normalizeDeviceRow(row = {}) {
  const seenHashes = Array.isArray(row?.seenHashes)
    ? [...new Set(row.seenHashes.map(x => safeString(x)).filter(Boolean))]
    : [];
  const deviceHash = safeString(row?.deviceHash || '');
  if (deviceHash && !seenHashes.includes(deviceHash)) seenHashes.push(deviceHash);

  return {
    ...row,
    deviceHash,
    deviceStableId: safeString(row?.deviceStableId || ''),
    platform: safeString(row?.platform || 'web') || 'web',
    userAgent: safeString(row?.userAgent || ''),
    firstSeenAt: safeNum(row?.firstSeenAt || 0),
    lastSeenAt: safeNum(row?.lastSeenAt || 0),
    seenHashes
  };
}

export function normalizeDeviceRegistry(rows) {
  const src = Array.isArray(rows) ? rows : [];
  const byKey = new Map();

  src.map(normalizeDeviceRow).forEach(row => {
    const key = row.deviceStableId || row.deviceHash;
    if (!key) return;

    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      return;
    }

    byKey.set(key, normalizeDeviceRow({
      ...prev,
      ...row,
      firstSeenAt: (() => {
        const vals = [safeNum(prev.firstSeenAt), safeNum(row.firstSeenAt)].filter(v => v > 0);
        return vals.length ? Math.min(...vals) : 0;
      })(),
      lastSeenAt: Math.max(safeNum(prev.lastSeenAt), safeNum(row.lastSeenAt)),
      seenHashes: [...new Set([...(prev.seenHashes || []), ...(row.seenHashes || []), prev.deviceHash, row.deviceHash].filter(Boolean))]
    }));
  });

  return [...byKey.values()].sort((a, b) => safeNum(a.firstSeenAt) - safeNum(b.firstSeenAt));
}

export function saveDeviceRegistry(rows) {
  const out = normalizeDeviceRegistry(rows);
  localStorage.setItem(LS_REGISTRY, JSON.stringify(out));
  return out;
}

export function getCurrentDeviceIdentity() {
  return normalizeDeviceRow({
    deviceHash: localStorage.getItem('deviceHash') || '',
    deviceStableId: localStorage.getItem('deviceStableId') || ''
  });
}

export function isSameDevice(a, b) {
  const aa = normalizeDeviceRow(a || {});
  const bb = normalizeDeviceRow(b || {});
  if (aa.deviceStableId && bb.deviceStableId) return aa.deviceStableId === bb.deviceStableId;
  if (!aa.deviceStableId && !bb.deviceStableId && aa.deviceHash && bb.deviceHash) return aa.deviceHash === bb.deviceHash;
  return false;
}

export function isCurrentDevice(row, current = getCurrentDeviceIdentity()) {
  return isSameDevice(row, current);
}

export function getOtherDevices(rows, current = getCurrentDeviceIdentity()) {
  return normalizeDeviceRegistry(rows).filter(row => !isCurrentDevice(row, current));
}

export function countDeviceStableIds(rows) {
  return new Set(
    normalizeDeviceRegistry(rows)
      .map(d => safeString(d?.deviceStableId || ''))
      .filter(Boolean)
  ).size;
}

export function removeDevicesFromRegistry(rows, selectedRows) {
  const stableIdsToDelete = new Set(
    normalizeDeviceRegistry(selectedRows)
      .map(d => safeString(d?.deviceStableId || ''))
      .filter(Boolean)
  );
  const hashesToDelete = new Set(
    normalizeDeviceRegistry(selectedRows)
      .map(d => safeString(d?.deviceHash || ''))
      .filter(Boolean)
  );

  return normalizeDeviceRegistry(rows).filter(d => {
    const stable = safeString(d?.deviceStableId || '');
    const hash = safeString(d?.deviceHash || '');
    if (stable && stableIdsToDelete.has(stable)) return false;
    if (!stable && hash && hashesToDelete.has(hash)) return false;
    return true;
  });
}

const DeviceRegistry = {
  getDeviceRegistry,
  normalizeDeviceRow,
  normalizeDeviceRegistry,
  saveDeviceRegistry,
  getCurrentDeviceIdentity,
  isSameDevice,
  isCurrentDevice,
  getOtherDevices,
  countDeviceStableIds,
  removeDevicesFromRegistry
};

if (typeof window !== 'undefined') {
  window.DeviceRegistry = DeviceRegistry;
}

export default DeviceRegistry;

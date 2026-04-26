import DeviceRegistry from '../analytics/device-registry.js';
import { getOrCreateDeviceHash, getOrCreateDeviceStableId } from './device-identity.js';
import { detectCurrentDeviceProfile } from './device-profile.js';

const DEVICE_LABEL_KEY = 'yandex:onboarding:device_label';
const sS = v => String(v == null ? '' : v).trim();
const sN = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const currentProfile = (registry = [], label = '') => detectCurrentDeviceProfile({
  registry: Array.isArray(registry) ? registry : [],
  savedLabel: sS(label || localStorage.getItem(DEVICE_LABEL_KEY) || '')
});

export async function ensureCurrentDeviceRegistryRow({ label = '', registry = null } = {}) {
  const rows = Array.isArray(registry) ? registry : DeviceRegistry.getDeviceRegistry();
  const [deviceHash, deviceStableId] = await Promise.all([getOrCreateDeviceHash(), getOrCreateDeviceStableId()]);
  const prof = currentProfile(rows, label);
  const row = DeviceRegistry.normalizeDeviceRow({
    ...prof,
    deviceHash,
    deviceStableId,
    label: sS(label || prof.label),
    firstSeenAt: sN(localStorage.getItem('app:first-install-ts')) || Date.now(),
    lastSeenAt: Date.now(),
    seenHashes: [deviceHash]
  });
  const out = DeviceRegistry.saveDeviceRegistry([...rows, row]);
  try { localStorage.setItem(DEVICE_LABEL_KEY, row.label); } catch {}
  return out.find(d => d.deviceStableId === deviceStableId) || row;
}

export async function bindCurrentInstallToDeviceStableId({
  deviceStableId,
  label = '',
  deviceClass = '',
  platform = '',
  registry = null
} = {}) {
  const targetStableId = sS(deviceStableId);
  if (!targetStableId) return await ensureCurrentDeviceRegistryRow({ label, registry });

  const baseRows = DeviceRegistry.normalizeDeviceRegistry(Array.isArray(registry) ? registry : DeviceRegistry.getDeviceRegistry());
  const deviceHash = await getOrCreateDeviceHash();
  const prof = currentProfile(baseRows, label);
  const finalLabel = sS(label || prof.label);
  let found = false;

  const rows = baseRows.map(d => {
    if (sS(d?.deviceStableId) !== targetStableId) return d;
    found = true;
    return DeviceRegistry.normalizeDeviceRow({
      ...d,
      deviceStableId: targetStableId,
      label: finalLabel || d.label || prof.label,
      class: sS(deviceClass || d.class || prof.class),
      platform: sS(platform || d.platform || prof.platform),
      userAgent: navigator.userAgent,
      lastSeenAt: Date.now(),
      seenHashes: [...new Set([...(d.seenHashes || []), d.deviceHash, deviceHash].map(sS).filter(Boolean))]
    });
  });

  if (!found) {
    rows.push(DeviceRegistry.normalizeDeviceRow({
      ...prof,
      deviceHash,
      deviceStableId: targetStableId,
      label: finalLabel,
      class: sS(deviceClass || prof.class),
      platform: sS(platform || prof.platform),
      userAgent: navigator.userAgent,
      firstSeenAt: sN(localStorage.getItem('app:first-install-ts')) || Date.now(),
      lastSeenAt: Date.now(),
      seenHashes: [deviceHash]
    }));
  }

  try {
    localStorage.setItem('deviceStableId', targetStableId);
    localStorage.setItem('deviceHash', deviceHash);
    localStorage.setItem(DEVICE_LABEL_KEY, finalLabel);
  } catch {}

  const out = DeviceRegistry.saveDeviceRegistry(rows);
  return out.find(d => d.deviceStableId === targetStableId) || null;
}

export default {
  ensureCurrentDeviceRegistryRow,
  bindCurrentInstallToDeviceStableId
};

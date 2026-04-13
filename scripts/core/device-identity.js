// scripts/core/device-identity.js
// Стабильная идентификация устройства без зависимости от случайного UUID.
// Fingerprint строится из стабильных характеристик браузера.

const LS_DEVICE_HASH = 'deviceHash';
const LS_DEVICE_STABLE = 'deviceStableFingerprint';
const LS_DEVICE_STABLE_ID = 'deviceStableId';

function buildStableFingerprint() {
  const parts = [
    navigator.platform || '',
    navigator.language || '',
    String(screen.width || 0),
    String(screen.height || 0),
    String(screen.colorDepth || 0),
    String(navigator.hardwareConcurrency || 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.userAgent.slice(0, 80)
  ];
  return parts.join('|');
}

async function sha256Short(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch {
    // fallback для старых браузеров
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(16).padStart(8, '0');
  }
}

export async function getOrCreateDeviceHash() {
  const existing = localStorage.getItem(LS_DEVICE_HASH);
  const stableFingerprint = buildStableFingerprint();
  const storedFingerprint = localStorage.getItem(LS_DEVICE_STABLE);

  // Если fingerprint совпадает — устройство то же самое, возвращаем существующий hash
  if (existing && storedFingerprint === stableFingerprint) {
    return existing;
  }

  // Если fingerprint изменился ИЛИ нет hash — генерируем детерминированный hash из fingerprint + соль
  // Соль берём из существующего hash чтобы разные установки на одном устройстве имели разный hash
  const salt = existing ? existing.slice(0, 8) : Math.random().toString(36).slice(2, 10);
  const newHash = 'dv_' + await sha256Short(stableFingerprint + salt);

  localStorage.setItem(LS_DEVICE_HASH, newHash);
  localStorage.setItem(LS_DEVICE_STABLE, stableFingerprint);
  return newHash;
}

export async function getOrCreateDeviceStableId() {
  const existing = localStorage.getItem(LS_DEVICE_STABLE_ID);
  const stableFingerprint = buildStableFingerprint();
  if (existing) return existing;
  const stableId = 'dst_' + await sha256Short(stableFingerprint);
  localStorage.setItem(LS_DEVICE_STABLE_ID, stableId);
  return stableId;
}

export function getCurrentDeviceHash() {
  return localStorage.getItem(LS_DEVICE_HASH) || null;
}

export function getCurrentDeviceStableId() {
  return localStorage.getItem(LS_DEVICE_STABLE_ID) || null;
}

export default {
  getOrCreateDeviceHash,
  getOrCreateDeviceStableId,
  getCurrentDeviceHash,
  getCurrentDeviceStableId
};

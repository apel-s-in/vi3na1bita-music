import { safeJsonParse, safeString, safeNum } from './backup-summary.js';

const LS_REGISTRY = 'backup:device_registry:v1';

export const getDeviceRegistry = () => (safeJsonParse(localStorage.getItem(LS_REGISTRY), [])||[]).filter(Boolean);

export const normalizeDeviceRow = (r = {}) => {
  const sH=Array.isArray(r?.seenHashes)?[...new Set(r.seenHashes.map(safeString).filter(Boolean))]:[], dH=safeString(r?.deviceHash||'');
  if(dH&&!sH.includes(dH)) sH.push(dH);
  const pf=safeString(r?.platform||'web')||'web';
  const cl=((v,p)=>{const x=safeString(v).toLowerCase();if(['iphone','ipad','android','desktop','tablet'].includes(x))return x.charAt(0).toUpperCase()+x.slice(1);if(p==='ios')return 'iPhone';if(p==='android')return 'Android';return 'Desktop';})(r?.class,pf);
  const lb=safeString(r?.label||'')||({ ios:'Мой iPhone', android:'Моё Android устройство', web:'Мой Desktop' }[pf]||'Моё устройство');
  return { ...r, deviceHash:dH, deviceStableId:safeString(r?.deviceStableId||''), platform:pf, class:cl, label:lb, userAgent:safeString(r?.userAgent||''), firstSeenAt:safeNum(r?.firstSeenAt), lastSeenAt:safeNum(r?.lastSeenAt), lastBackupAt:safeNum(r?.lastBackupAt), seenHashes:sH };
};

export const normalizeDeviceRegistry = rows => {
  if (!Array.isArray(rows) || !rows.length) return [];

  // Шаг 1: нормализуем каждую строку
  const normalized = rows.map(normalizeDeviceRow).filter(r => r.deviceStableId || r.deviceHash);

  // Шаг 2: строим граф связей hash ↔ stableId из ВСЕХ записей
  const hashToStableId = new Map();
  normalized.forEach(r => {
    const sid = safeString(r.deviceStableId);
    const hash = safeString(r.deviceHash);
    const seenH = Array.isArray(r.seenHashes) ? r.seenHashes.map(safeString).filter(Boolean) : [];
    if (sid) {
      if (hash && !hashToStableId.has(hash)) hashToStableId.set(hash, sid);
      seenH.forEach(h => { if (h && !hashToStableId.has(h)) hashToStableId.set(h, sid); });
    }
  });

  // Шаг 3: определяем каноничный ключ для каждой записи
  const getCanonicalKey = r => {
    if (r.deviceStableId) return r.deviceStableId;
    if (r.deviceHash && hashToStableId.has(r.deviceHash)) return hashToStableId.get(r.deviceHash);
    if (Array.isArray(r.seenHashes)) {
      for (const h of r.seenHashes) {
        if (hashToStableId.has(h)) return hashToStableId.get(h);
      }
    }
    return r.deviceHash || null;
  };

  // Шаг 4: группируем по каноничному ключу и мержим
  const grouped = new Map();
  normalized.forEach(r => {
    const key = getCanonicalKey(r);
    if (!key) return;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, r);
      return;
    }

    // Мержим записи с одинаковым ключом. Более свежая запись побеждает в label/class/platform.
    const newer = safeNum(r.lastSeenAt) >= safeNum(existing.lastSeenAt) ? r : existing;
    const older = newer === r ? existing : r;
    const merged = normalizeDeviceRow({
      ...older,
      ...newer,
      deviceStableId: existing.deviceStableId || r.deviceStableId,
      deviceHash: newer.deviceHash || older.deviceHash,
      firstSeenAt: Math.min(...[safeNum(existing.firstSeenAt), safeNum(r.firstSeenAt)].filter(v => v > 0)) || 0,
      lastSeenAt: Math.max(safeNum(existing.lastSeenAt), safeNum(r.lastSeenAt)),
      lastBackupAt: Math.max(safeNum(existing.lastBackupAt), safeNum(r.lastBackupAt)),
      label: newer.label || older.label,
      platform: newer.platform || older.platform,
      class: newer.class || older.class,
      seenHashes: [
        ...new Set([
          ...(existing.seenHashes || []),
          ...(r.seenHashes || []),
          existing.deviceHash,
          r.deviceHash
        ].filter(Boolean))
      ]
    });
    grouped.set(key, merged);
  });

  // Шаг 5: сортируем по firstSeenAt (старые первыми)
  return [...grouped.values()].sort((a, b) => safeNum(a.firstSeenAt) - safeNum(b.firstSeenAt));
};

export const saveDeviceRegistry = r => { const o = normalizeDeviceRegistry(r); localStorage.setItem(LS_REGISTRY, JSON.stringify(o)); return o; };

export const getCurrentDeviceIdentity = () => normalizeDeviceRow({ deviceHash: localStorage.getItem('deviceHash')||'', deviceStableId: localStorage.getItem('deviceStableId')||'' });

export const isSameDevice = (a, b) => { const aa=normalizeDeviceRow(a||{}), bb=normalizeDeviceRow(b||{}); return (aa.deviceStableId&&bb.deviceStableId) ? aa.deviceStableId===bb.deviceStableId : (aa.deviceHash&&bb.deviceHash ? aa.deviceHash===bb.deviceHash : false); };

export const isCurrentDevice = (r, c = getCurrentDeviceIdentity()) => isSameDevice(r, c);

export const getOtherDevices = (r, c = getCurrentDeviceIdentity()) => normalizeDeviceRegistry(r).filter(x => !isCurrentDevice(x, c));

export const countDeviceStableIds = r => new Set(normalizeDeviceRegistry(r).map(d => safeString(d?.deviceStableId)).filter(Boolean)).size;

export const removeDevicesFromRegistry = (r, sR) => { const sD=normalizeDeviceRegistry(sR), stI=new Set(sD.map(d=>safeString(d?.deviceStableId)).filter(Boolean)), hsI=new Set(sD.map(d=>safeString(d?.deviceHash)).filter(Boolean)); return normalizeDeviceRegistry(r).filter(d => !(safeString(d?.deviceStableId) && stI.has(safeString(d?.deviceStableId))) && !(!safeString(d?.deviceStableId) && safeString(d?.deviceHash) && hsI.has(safeString(d?.deviceHash)))); };

const DeviceRegistry = { getDeviceRegistry, normalizeDeviceRow, normalizeDeviceRegistry, saveDeviceRegistry, getCurrentDeviceIdentity, isSameDevice, isCurrentDevice, getOtherDevices, countDeviceStableIds, removeDevicesFromRegistry };

if(typeof window!=='undefined') window.DeviceRegistry = DeviceRegistry;
export default DeviceRegistry;

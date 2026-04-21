import { safeJsonParse, safeString, safeNum } from './backup-summary.js';

const LS_REGISTRY = 'backup:device_registry:v1';

export const getDeviceRegistry = () => (safeJsonParse(localStorage.getItem(LS_REGISTRY), [])||[]).filter(Boolean);

export const normalizeDeviceRow = (r = {}) => {
  const sH=Array.isArray(r?.seenHashes)?[...new Set(r.seenHashes.map(safeString).filter(Boolean))]:[], dH=safeString(r?.deviceHash||'');
  if(dH&&!sH.includes(dH)) sH.push(dH);
  const pf=safeString(r?.platform||'web')||'web';
  const cl=((v,p)=>{const x=safeString(v).toLowerCase();if(['iphone','ipad','android','desktop','tablet'].includes(x))return x.charAt(0).toUpperCase()+x.slice(1);if(p==='ios')return 'iPhone';if(p==='android')return 'Android';return 'Desktop';})(r?.class,pf);
  const lb=safeString(r?.label||'')||({ ios:'Мой iPhone', android:'Моё Android устройство', web:'Мой Desktop' }[pf]||'Моё устройство');
  return { ...r, deviceHash:dH, deviceStableId:safeString(r?.deviceStableId||''), platform:pf, class:cl, label:lb, userAgent:safeString(r?.userAgent||''), firstSeenAt:safeNum(r?.firstSeenAt), lastSeenAt:safeNum(r?.lastSeenAt), seenHashes:sH };
};

export const normalizeDeviceRegistry = rows => {
  const bK = new Map();
  const hashToStableId = new Map(); // hash → stableId, чтобы склеить старые записи с новыми

  // Первый проход: собираем mapping hash → stableId из всех записей у которых есть оба поля
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const sid = safeString(r?.deviceStableId);
    const hash = safeString(r?.deviceHash);
    const seenH = Array.isArray(r?.seenHashes) ? r.seenHashes.map(safeString).filter(Boolean) : [];
    if (sid) {
      if (hash) hashToStableId.set(hash, sid);
      seenH.forEach(h => hashToStableId.set(h, sid));
    }
  });

  // Второй проход: группируем по stableId (если известен) или по hash
  (Array.isArray(rows) ? rows : []).map(normalizeDeviceRow).filter(r => r.deviceStableId || r.deviceHash).forEach(r => {
    let k = r.deviceStableId;
    if (!k && r.deviceHash) {
      k = hashToStableId.get(r.deviceHash) || r.deviceHash;
    }
    // Дополнительная проверка seenHashes — может быть связь через них
    if (!r.deviceStableId && Array.isArray(r.seenHashes)) {
      for (const h of r.seenHashes) {
        if (hashToStableId.has(h)) { k = hashToStableId.get(h); break; }
      }
    }

    const p = bK.get(k);
    if (!p) return bK.set(k, r);

    bK.set(k, normalizeDeviceRow({
      ...p, ...r,
      deviceStableId: p.deviceStableId || r.deviceStableId,
      deviceHash: p.deviceHash || r.deviceHash,
      firstSeenAt: Math.min(...[safeNum(p.firstSeenAt), safeNum(r.firstSeenAt)].filter(v => v > 0)) || 0,
      lastSeenAt: Math.max(safeNum(p.lastSeenAt), safeNum(r.lastSeenAt)),
      label: p.label || r.label,
      seenHashes: [...new Set([...(p.seenHashes || []), ...(r.seenHashes || []), p.deviceHash, r.deviceHash].filter(Boolean))]
    }));
  });

  return [...bK.values()].sort((a, b) => safeNum(a.firstSeenAt) - safeNum(b.firstSeenAt));
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

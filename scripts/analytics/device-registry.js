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

export const normalizeDeviceRegistry = rows => { const bK=new Map(); (Array.isArray(rows)?rows:[]).map(normalizeDeviceRow).filter(r=>r.deviceStableId||r.deviceHash).forEach(r => { const k=r.deviceStableId||r.deviceHash, p=bK.get(k); if(!p) return bK.set(k, r); bK.set(k, normalizeDeviceRow({ ...p, ...r, firstSeenAt: Math.min(...[safeNum(p.firstSeenAt), safeNum(r.firstSeenAt)].filter(v=>v>0))||0, lastSeenAt: Math.max(safeNum(p.lastSeenAt), safeNum(r.lastSeenAt)), seenHashes: [...new Set([...(p.seenHashes||[]), ...(r.seenHashes||[]), p.deviceHash, r.deviceHash].filter(Boolean))] })); }); return [...bK.values()].sort((a,b)=>safeNum(a.firstSeenAt)-safeNum(b.firstSeenAt)); };

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

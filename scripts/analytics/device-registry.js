import { safeJsonParse, safeString, safeNum } from './backup-summary.js';

const LS_REGISTRY = 'backup:device_registry:v1';
const normAuthHistory = a => (Array.isArray(a) ? a : []).map(x => ({ ts: safeNum(x?.ts || x?.at), browser: safeString(x?.browser || ''), os: safeString(x?.os || ''), lang: safeString(x?.lang || ''), timezone: safeString(x?.timezone || ''), pwa: !!x?.pwa })).filter(x => x.ts > 0).sort((a,b)=>b.ts-a.ts).slice(0, 20);

export const getDeviceRegistry = () => (safeJsonParse(localStorage.getItem(LS_REGISTRY), [])||[]).filter(Boolean);

export const normalizeDeviceRow = (r = {}) => {
  const sH = Array.isArray(r?.seenHashes) ? [...new Set(r.seenHashes.map(safeString).filter(Boolean))] : [], dH = safeString(r?.deviceHash||'');
  if(dH && !sH.includes(dH)) sH.push(dH);
  const pf = safeString(r?.platform||'web')||'web';
  const cl = ((v,p)=>{const x=safeString(v).toLowerCase();if(['iphone','ipad','android','desktop','tablet'].includes(x))return x.charAt(0).toUpperCase()+x.slice(1);if(p==='ios')return 'iPhone';if(p==='android')return 'Android';return 'Desktop';})(r?.class,pf);
  return { ...r, deviceHash: dH, deviceStableId: safeString(r?.deviceStableId||''), platform: pf, class: cl, label: safeString(r?.label||'')||({ios:'Мой iPhone',android:'Моё Android устройство',web:'Мой Desktop'}[pf]||'Моё устройство'), os: safeString(r?.os||''), browser: safeString(r?.browser||''), screen: safeString(r?.screen||''), lang: safeString(r?.lang||''), pwa: !!r?.pwa, userAgent: safeString(r?.userAgent||''), firstSeenAt: safeNum(r?.firstSeenAt), lastSeenAt: safeNum(r?.lastSeenAt), lastBackupAt: safeNum(r?.lastBackupAt), retiredAt: safeNum(r?.retiredAt), authHistory: normAuthHistory(r?.authHistory), seenHashes: sH };
};

export const normalizeDeviceRegistry = rows => {
  if (!Array.isArray(rows) || !rows.length) return [];
  const normalized = rows.map(normalizeDeviceRow).filter(r => r.deviceStableId || r.deviceHash), hashToStableId = new Map(), grouped = new Map();
  normalized.forEach(r => { const sid = safeString(r.deviceStableId); if (sid) { [r.deviceHash, ...(r.seenHashes || [])].filter(Boolean).forEach(h => { if (!hashToStableId.has(h)) hashToStableId.set(h, sid); }); } });
  normalized.forEach(r => {
    const key = r.deviceStableId || hashToStableId.get(r.deviceHash) || r.seenHashes?.find(h => hashToStableId.has(h)) || r.deviceHash;
    if (!key) return;
    const ex = grouped.get(key);
    if (!ex) return grouped.set(key, r);
    const newer = safeNum(r.lastSeenAt) >= safeNum(ex.lastSeenAt) ? r : ex, older = newer === r ? ex : r;
    grouped.set(key, normalizeDeviceRow({ ...older, ...newer, deviceStableId: ex.deviceStableId || r.deviceStableId, deviceHash: newer.deviceHash || older.deviceHash, firstSeenAt: Math.min(...[safeNum(ex.firstSeenAt), safeNum(r.firstSeenAt)].filter(v => v > 0)) || 0, lastSeenAt: Math.max(safeNum(ex.lastSeenAt), safeNum(r.lastSeenAt)), lastBackupAt: Math.max(safeNum(ex.lastBackupAt), safeNum(r.lastBackupAt)), label: newer.label || older.label, platform: newer.platform || older.platform, class: newer.class || older.class, retiredAt: Math.max(safeNum(ex.retiredAt), safeNum(r.retiredAt)), authHistory: normAuthHistory([...(ex.authHistory || []), ...(r.authHistory || [])]), seenHashes: [...new Set([...(ex.seenHashes || []), ...(r.seenHashes || []), ex.deviceHash, r.deviceHash].filter(Boolean))] }));
  });
  return [...grouped.values()].sort((a, b) => safeNum(a.firstSeenAt) - safeNum(b.firstSeenAt));
};

export const saveDeviceRegistry = r => { const o = normalizeDeviceRegistry(r); localStorage.setItem(LS_REGISTRY, JSON.stringify(o)); return o; };
export const getCurrentDeviceIdentity = () => normalizeDeviceRow({ deviceHash: localStorage.getItem('deviceHash')||'', deviceStableId: localStorage.getItem('deviceStableId')||'' });
export const isSameDevice = (a, b) => { const aa=normalizeDeviceRow(a||{}), bb=normalizeDeviceRow(b||{}); return (aa.deviceStableId&&bb.deviceStableId) ? aa.deviceStableId===bb.deviceStableId : (aa.deviceHash&&bb.deviceHash ? aa.deviceHash===bb.deviceHash : false); };
export const isCurrentDevice = (r, c = getCurrentDeviceIdentity()) => isSameDevice(r, c);
export const getOtherDevices = (r, c = getCurrentDeviceIdentity()) => normalizeDeviceRegistry(r).filter(x => !isCurrentDevice(x, c));
export const countDeviceStableIds = r => new Set(normalizeDeviceRegistry(r).map(d => safeString(d?.deviceStableId)).filter(Boolean)).size;
export const retireDevicesInRegistry = (r, sR, ts = Date.now()) => { const sD=normalizeDeviceRegistry(sR), stI=new Set(sD.map(d=>safeString(d?.deviceStableId)).filter(Boolean)), hsI=new Set(sD.map(d=>safeString(d?.deviceHash)).filter(Boolean)); return normalizeDeviceRegistry(r).map(d => (stI.has(safeString(d?.deviceStableId)) || (!safeString(d?.deviceStableId) && hsI.has(safeString(d?.deviceHash)))) ? normalizeDeviceRow({ ...d, retiredAt: safeNum(ts) || Date.now(), lastSeenAt: Math.max(safeNum(d.lastSeenAt), safeNum(ts)) }) : d); };

const DeviceRegistry = { getDeviceRegistry, normalizeDeviceRow, normalizeDeviceRegistry, saveDeviceRegistry, getCurrentDeviceIdentity, isSameDevice, isCurrentDevice, getOtherDevices, countDeviceStableIds, retireDevicesInRegistry };
if(typeof window!=='undefined') window.DeviceRegistry = DeviceRegistry;
export default DeviceRegistry;

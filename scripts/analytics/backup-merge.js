// scripts/analytics/backup-merge.js
// Все чистые merge-функции для backup/restore. Импортируется из backup-vault.js и может использоваться в hybrid-sync.

import { isDeletedRow } from './tombstone-contract.js';

export const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const minPositive = (...vs) => Math.min(...vs.map(toNum).filter(v => v > 0)) || 0;

export const maxDateStr = (a, b) => [String(a||'').trim(), String(b||'').trim()].sort().pop() || '';

export const mergeNumArrayMax = (a, b, len = 0) => Array.from({ length: Math.max(len, a?.length||0, b?.length||0) }, (_, i) => Math.max(toNum(a?.[i]), toNum(b?.[i])));

export const mergeNumericMapMax = (a = {}, b = {}) => Object.fromEntries([...new Set([...Object.keys(a||{}), ...Object.keys(b||{})])].map(k => [k, Math.max(toNum(a?.[k]), toNum(b?.[k]))]).filter(([,v]) => v > 0));

export const mergeStatRowSafe = (l = {}, r = {}) => ({ uid: String(r.uid || l.uid || '').trim(), globalListenSeconds: Math.max(toNum(l.globalListenSeconds), toNum(r.globalListenSeconds)), globalValidListenCount: Math.max(toNum(l.globalValidListenCount), toNum(r.globalValidListenCount)), globalFullListenCount: Math.max(toNum(l.globalFullListenCount), toNum(r.globalFullListenCount)), firstPlayedAt: minPositive(l.firstPlayedAt, r.firstPlayedAt), lastPlayedAt: Math.max(toNum(l.lastPlayedAt), toNum(r.lastPlayedAt)), featuresUsed: mergeNumericMapMax(l.featuresUsed, r.featuresUsed), ...(l.byHour?.length || r.byHour?.length ? { byHour: mergeNumArrayMax(l.byHour, r.byHour, 24) } : {}), ...(l.byWeekday?.length || r.byWeekday?.length ? { byWeekday: mergeNumArrayMax(l.byWeekday, r.byWeekday, 7) } : {}) });

export const mergeAchievementsSafe = (l = {}, r = {}) => { const o = { ...l }; Object.entries(r||{}).forEach(([k, v]) => o[k] = (toNum(o[k]) > 0 && toNum(v) > 0) ? Math.min(toNum(o[k]), toNum(v)) : (toNum(v) || toNum(o[k]) || Date.now())); return o; };

const parseS = (r, f) => { try { return JSON.parse(r); } catch { return f; } };
const uniq = a => [...new Set((Array.isArray(a)?a:[]).filter(Boolean))];

export const mergeFavoritesStorageSafe = (lR, rR) => { const m = new Map(); [...parseS(lR,[]), ...parseS(rR,[])].forEach(i => { const u = String(i?.uid||'').trim(); if(!u)return; const p=m.get(u), cA=!i?.inactiveAt; if(!p) return m.set(u,{...i,uid:u}); if((p&&!p.inactiveAt)||cA) return m.set(u,{...p,...i,uid:u,inactiveAt:null,addedAt:minPositive(p.addedAt,i.addedAt)||Date.now(),sourceAlbum:p.sourceAlbum||i.sourceAlbum||p.albumKey||i.albumKey||null,albumKey:p.albumKey||i.albumKey||p.sourceAlbum||i.sourceAlbum||null}); m.set(u,{...p,...i,uid:u,inactiveAt:Math.max(toNum(p.inactiveAt),toNum(i.inactiveAt))}); }); return JSON.stringify([...m.values()]); };

const normPl = pl => ({ ...(pl||{}), id:String(pl?.id||'').trim(), name:String(pl?.name||'Плейлист'), color:String(pl?.color||''), createdAt:toNum(pl?.createdAt)||Date.now(), updatedAt:toNum(pl?.updatedAt)||toNum(pl?.createdAt)||0, deletedAt:toNum(pl?.deletedAt), order:uniq(pl?.order), hidden:uniq(pl?.hidden), ops:Array.isArray(pl?.ops)?pl.ops:[] });
export const mergePlaylistsStorageSafe = (lR, rR) => { const m = new Map(); [...parseS(lR,[]), ...parseS(rR,[])].map(normPl).forEach(pl => { const id=pl.id; if(!id)return; const p=m.get(id); if(!p) return m.set(id,pl); let ord=[],ops=[]; if((p.ops?.length||0)||(pl.ops?.length||0)){ const oM=new Map(); [...(p.ops||[]),...(pl.ops||[])].forEach(op=>oM.set(`${op.t}:${op.u}:${op.ts}`,op)); ops=[...oM.values()].sort((a,b)=>toNum(a.ts)-toNum(b.ts)); const st=new Set(); ops.forEach(op=>op.t==='add'?st.add(op.u):st.delete(op.u)); ord=[...st]; } else ord=uniq([...(p.order||[]),...(pl.order||[])]); const deletedAt=Math.max(toNum(p.deletedAt),toNum(pl.deletedAt)), updatedAt=Math.max(toNum(p.updatedAt),toNum(pl.updatedAt)); m.set(id,{...p,...pl,id,name:pl.name||p.name||'Плейлист',color:pl.color||p.color||'',createdAt:minPositive(p.createdAt,pl.createdAt)||Date.now(),updatedAt,deletedAt:deletedAt>updatedAt?deletedAt:0,order:ord,hidden:uniq([...(p.hidden||[]),...(pl.hidden||[])]).filter(u=>ord.includes(u)),ops:ops.slice(-300)}); }); return JSON.stringify([...m.values()].filter(x=>x.id)); };

export const mergeProfileStorageValueSafe = (k, l, r) => r == null ? l : (l == null ? r : (k === '__favorites_v2__' ? mergeFavoritesStorageSafe(l, r) : (k === 'sc3:playlists' ? mergePlaylistsStorageSafe(l, r) : r)));

export default { toNum, minPositive, maxDateStr, mergeNumArrayMax, mergeNumericMapMax, mergeStatRowSafe, mergeAchievementsSafe, mergeFavoritesStorageSafe, mergePlaylistsStorageSafe, mergeProfileStorageValueSafe };

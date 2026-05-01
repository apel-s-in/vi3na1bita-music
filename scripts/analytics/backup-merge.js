// scripts/analytics/backup-merge.js
// Все чистые merge-функции для backup/restore. Импортируется из backup-vault.js и может использоваться в hybrid-sync.

export const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const minPositive = (...vs) => Math.min(...vs.map(toNum).filter(v => v > 0)) || 0;
export const maxDateStr = (a, b) => [String(a||'').trim(), String(b||'').trim()].sort().pop() || '';
export const mergeNumArrayMax = (a, b, len = 0) => Array.from({ length: Math.max(len, a?.length||0, b?.length||0) }, (_, i) => Math.max(toNum(a?.[i]), toNum(b?.[i])));
export const mergeNumericMapMax = (a = {}, b = {}) => Object.fromEntries([...new Set([...Object.keys(a||{}), ...Object.keys(b||{})])].map(k => [k, Math.max(toNum(a?.[k]), toNum(b?.[k]))]).filter(([,v]) => v > 0));
export const mergeStatRowSafe = (l = {}, r = {}) => ({ uid: String(r.uid || l.uid || '').trim(), globalListenSeconds: Math.max(toNum(l.globalListenSeconds), toNum(r.globalListenSeconds)), globalValidListenCount: Math.max(toNum(l.globalValidListenCount), toNum(r.globalValidListenCount)), globalFullListenCount: Math.max(toNum(l.globalFullListenCount), toNum(r.globalFullListenCount)), firstPlayedAt: minPositive(l.firstPlayedAt, r.firstPlayedAt), lastPlayedAt: Math.max(toNum(l.lastPlayedAt), toNum(r.lastPlayedAt)), featuresUsed: mergeNumericMapMax(l.featuresUsed, r.featuresUsed), ...(l.byHour?.length || r.byHour?.length ? { byHour: mergeNumArrayMax(l.byHour, r.byHour, 24) } : {}), ...(l.byWeekday?.length || r.byWeekday?.length ? { byWeekday: mergeNumArrayMax(l.byWeekday, r.byWeekday, 7) } : {}) });
export const mergeAchievementsSafe = (l = {}, r = {}) => { const o = { ...l }; Object.entries(r||{}).forEach(([k, v]) => o[k] = (toNum(o[k]) > 0 && toNum(v) > 0) ? Math.min(toNum(o[k]), toNum(v)) : (toNum(v) || toNum(o[k]) || Date.now())); return o; };

const parseS = (r, f) => { try { return JSON.parse(r); } catch { return f; } };
const uniq = a => [...new Set((Array.isArray(a)?a:[]).filter(Boolean))];
export const getBackupConflictPolicy = () => {
  try { return ['ask','latest','trash'].includes(localStorage.getItem('backup:conflict_policy:v1')) ? localStorage.getItem('backup:conflict_policy:v1') : 'ask'; } catch { return 'ask'; }
};

const favClock = i => Math.max(toNum(i?.updatedAt), toNum(i?.deletedAt), toNum(i?.inactiveAt), toNum(i?.addedAt));
const normFav = i => ({ ...(i||{}), uid:String(i?.uid||'').trim(), addedAt:toNum(i?.addedAt)||Date.now(), updatedAt:favClock(i)||Date.now(), inactiveAt:toNum(i?.inactiveAt), deletedAt:toNum(i?.deletedAt), sourceAlbum:i?.sourceAlbum||i?.albumKey||null, albumKey:i?.albumKey||i?.sourceAlbum||null });
const mergeFavPair = (a, b, policy) => {
  const newest = favClock(b) >= favClock(a) ? b : a, oldest = newest === b ? a : b;
  if (policy === 'latest') return newest;
  if (policy === 'trash' && (toNum(a.deletedAt) || toNum(b.deletedAt))) {
    const del = toNum(a.deletedAt) >= toNum(b.deletedAt) ? a : b, live = del === a ? b : a;
    return toNum(del.deletedAt) >= favClock(live) ? { ...live, ...del, inactiveAt: 0 } : { ...oldest, ...newest, deletedAt: 0, inactiveAt: 0 };
  }
  const active = (!a.inactiveAt && !a.deletedAt) || (!b.inactiveAt && !b.deletedAt);
  if (newest.deletedAt && !active) return { ...oldest, ...newest };
  if (newest.deletedAt && favClock(newest) >= favClock(oldest)) return { ...oldest, ...newest, inactiveAt: 0 };
  if (active) return { ...oldest, ...newest, inactiveAt: 0, deletedAt: 0, addedAt: minPositive(a.addedAt,b.addedAt)||Date.now(), updatedAt: Math.max(favClock(a),favClock(b)) };
  return { ...oldest, ...newest, inactiveAt: Math.max(toNum(a.inactiveAt),toNum(b.inactiveAt)), deletedAt: 0, updatedAt: Math.max(favClock(a),favClock(b)) };
};
export const mergeFavoritesStorageSafe = (lR, rR, policy = getBackupConflictPolicy()) => {
  const m = new Map();
  [...parseS(lR,[]), ...parseS(rR,[])].map(normFav).forEach(i => {
    if (!i.uid) return;
    const p = m.get(i.uid);
    m.set(i.uid, p ? { ...mergeFavPair(p, i, policy), uid: i.uid } : i);
  });
  return JSON.stringify([...m.values()]);
};

const plClock = p => Math.max(toNum(p?.updatedAt), toNum(p?.deletedAt), toNum(p?.createdAt));
const normPl = pl => ({ ...(pl||{}), id:String(pl?.id||'').trim(), name:String(pl?.name||'Плейлист'), color:String(pl?.color||''), createdAt:toNum(pl?.createdAt)||Date.now(), updatedAt:toNum(pl?.updatedAt)||toNum(pl?.createdAt)||0, deletedAt:toNum(pl?.deletedAt), order:uniq(pl?.order), hidden:uniq(pl?.hidden), ops:Array.isArray(pl?.ops)?pl.ops:[] });
const mergePlPair = (p, pl, policy) => {
  const newest = plClock(pl) >= plClock(p) ? pl : p, oldest = newest === pl ? p : pl;
  if (policy === 'latest') return { ...oldest, ...newest, id: pl.id };
  if (policy === 'trash' && (toNum(p.deletedAt) || toNum(pl.deletedAt))) {
    const del = toNum(p.deletedAt) >= toNum(pl.deletedAt) ? p : pl, live = del === p ? pl : p;
    if (toNum(del.deletedAt) >= plClock(live)) return { ...live, ...del, id: pl.id, deletedAt: toNum(del.deletedAt), updatedAt: Math.max(plClock(live), plClock(del)) };
  }
  let ord=[],ops=[];
  if((p.ops?.length||0)||(pl.ops?.length||0)){
    const oM=new Map(); [...(p.ops||[]),...(pl.ops||[])].forEach(op=>oM.set(`${op.t}:${op.u}:${op.ts}`,op));
    ops=[...oM.values()].sort((a,b)=>toNum(a.ts)-toNum(b.ts));
    const st=new Set(); ops.forEach(op=>op.t==='add'?st.add(op.u):st.delete(op.u)); ord=[...st];
  } else ord=uniq([...(p.order||[]),...(pl.order||[])]);
  const deletedAt=Math.max(toNum(p.deletedAt),toNum(pl.deletedAt)), updatedAt=Math.max(toNum(p.updatedAt),toNum(pl.updatedAt));
  return { ...p, ...pl, id:pl.id, name:pl.name||p.name||'Плейлист', color:pl.color||p.color||'', createdAt:minPositive(p.createdAt,pl.createdAt)||Date.now(), updatedAt, deletedAt:deletedAt>=updatedAt?deletedAt:0, order:ord, hidden:uniq([...(p.hidden||[]),...(pl.hidden||[])]).filter(u=>ord.includes(u)), ops:ops.slice(-300) };
};
export const mergePlaylistsStorageSafe = (lR, rR, policy = getBackupConflictPolicy()) => {
  const m = new Map();
  [...parseS(lR,[]), ...parseS(rR,[])].map(normPl).forEach(pl => {
    if (!pl.id) return;
    const p = m.get(pl.id);
    m.set(pl.id, p ? mergePlPair(p, pl, policy) : pl);
  });
  return JSON.stringify([...m.values()].filter(x=>x.id));
};

export const mergeProfileStorageValueSafe = (k, l, r) => r == null ? l : (l == null ? r : (k === '__favorites_v2__' ? mergeFavoritesStorageSafe(l, r) : (k === 'sc3:playlists' ? mergePlaylistsStorageSafe(l, r) : r)));

export default { toNum, minPositive, maxDateStr, mergeNumArrayMax, mergeNumericMapMax, mergeStatRowSafe, mergeAchievementsSafe, getBackupConflictPolicy, mergeFavoritesStorageSafe, mergePlaylistsStorageSafe, mergeProfileStorageValueSafe };

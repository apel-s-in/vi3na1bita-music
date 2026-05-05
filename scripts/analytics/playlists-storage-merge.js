import { toNum, minPositive, getBackupConflictPolicy } from './storage-merge-utils.js';

const parseS = (r, f) => { try { return JSON.parse(r); } catch { return f; } };
const uniq = a => [...new Set((Array.isArray(a)?a:[]).filter(Boolean))];
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

export default { mergePlaylistsStorageSafe };

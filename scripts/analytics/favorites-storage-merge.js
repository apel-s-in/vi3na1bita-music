import { toNum, minPositive, getBackupConflictPolicy } from './storage-merge-utils.js';

const parseS = (r, f) => { try { return JSON.parse(r); } catch { return f; } };
const favClock = i => Math.max(toNum(i?.updatedAt), toNum(i?.deletedAt), toNum(i?.inactiveAt), toNum(i?.addedAt));
const normFav = i => ({ ...(i || {}), uid: String(i?.uid || '').trim(), addedAt: toNum(i?.addedAt) || Date.now(), updatedAt: favClock(i) || Date.now(), inactiveAt: toNum(i?.inactiveAt), deletedAt: toNum(i?.deletedAt), sourceAlbum: i?.sourceAlbum || i?.albumKey || null, albumKey: i?.albumKey || i?.sourceAlbum || null });

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
  if (active) return { ...oldest, ...newest, inactiveAt: 0, deletedAt: 0, addedAt: minPositive(a.addedAt, b.addedAt) || Date.now(), updatedAt: Math.max(favClock(a), favClock(b)) };
  return { ...oldest, ...newest, inactiveAt: Math.max(toNum(a.inactiveAt), toNum(b.inactiveAt)), deletedAt: 0, updatedAt: Math.max(favClock(a), favClock(b)) };
};

export const mergeFavoritesStorageSafe = (lR, rR, policy = getBackupConflictPolicy()) => {
  const m = new Map();
  [...parseS(lR, []), ...parseS(rR, [])].map(normFav).forEach(i => i.uid && m.set(i.uid, m.has(i.uid) ? { ...mergeFavPair(m.get(i.uid), i, policy), uid: i.uid } : i));
  return JSON.stringify([...m.values()]);
};
export default { mergeFavoritesStorageSafe };

// scripts/analytics/backup-merge.js
// Все чистые merge-функции для backup/restore.
// Импортируется из backup-vault.js и может использоваться в hybrid-sync.

export const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const minPositive = (...vals) => {
  const xs = vals.map(toNum).filter(v => v > 0);
  return xs.length ? Math.min(...xs) : 0;
};

export const maxDateStr = (a, b) =>
  [String(a || '').trim(), String(b || '').trim()].sort().pop() || '';

export const mergeNumArrayMax = (a, b, len = 0) => {
  const size = Math.max(len, Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
  return Array.from({ length: size }, (_, i) => Math.max(toNum(a?.[i]), toNum(b?.[i])));
};

export const mergeNumericMapMax = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  keys.forEach(k => { const v = Math.max(toNum(a?.[k]), toNum(b?.[k])); if (v > 0) out[k] = v; });
  return out;
};

export const mergeStatRowSafe = (localRow = {}, remoteRow = {}) => {
  const merged = {
    uid: String(remoteRow?.uid || localRow?.uid || '').trim(),
    globalListenSeconds: Math.max(toNum(localRow?.globalListenSeconds), toNum(remoteRow?.globalListenSeconds)),
    globalValidListenCount: Math.max(toNum(localRow?.globalValidListenCount), toNum(remoteRow?.globalValidListenCount)),
    globalFullListenCount: Math.max(toNum(localRow?.globalFullListenCount), toNum(remoteRow?.globalFullListenCount)),
    firstPlayedAt: minPositive(localRow?.firstPlayedAt, remoteRow?.firstPlayedAt),
    lastPlayedAt: Math.max(toNum(localRow?.lastPlayedAt), toNum(remoteRow?.lastPlayedAt)),
    featuresUsed: mergeNumericMapMax(localRow?.featuresUsed || {}, remoteRow?.featuresUsed || {})
  };
  const byHour = mergeNumArrayMax(localRow?.byHour, remoteRow?.byHour, 24);
  const byWeekday = mergeNumArrayMax(localRow?.byWeekday, remoteRow?.byWeekday, 7);
  if (byHour.some(Boolean)) merged.byHour = byHour;
  if (byWeekday.some(Boolean)) merged.byWeekday = byWeekday;
  return merged;
};

export const mergeAchievementsSafe = (localMap = {}, remoteMap = {}) => {
  const out = { ...localMap };
  Object.entries(remoteMap || {}).forEach(([key, value]) => {
    const lv = toNum(out[key]), rv = toNum(value);
    out[key] = lv > 0 && rv > 0 ? Math.min(lv, rv) : (rv || lv || Date.now());
  });
  return out;
};

const parseJsonSafe = (raw, fb) => { try { return JSON.parse(raw); } catch { return fb; } };
const uniq = arr => [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];

export const mergeFavoritesStorageSafe = (localRaw, remoteRaw) => {
  const local = Array.isArray(parseJsonSafe(localRaw, [])) ? parseJsonSafe(localRaw, []) : [];
  const remote = Array.isArray(parseJsonSafe(remoteRaw, [])) ? parseJsonSafe(remoteRaw, []) : [];
  const map = new Map();
  [...local, ...remote].forEach(item => {
    const uid = String(item?.uid || '').trim();
    if (!uid) return;
    const prev = map.get(uid) || null;
    const prevActive = prev && !prev.inactiveAt, curActive = !item?.inactiveAt;
    if (!prev) { map.set(uid, { ...item, uid }); return; }
    if (prevActive || curActive) {
      map.set(uid, { ...prev, ...item, uid, inactiveAt: null,
        addedAt: minPositive(prev.addedAt, item.addedAt) || Date.now(),
        sourceAlbum: prev.sourceAlbum || item.sourceAlbum || prev.albumKey || item.albumKey || null,
        albumKey: prev.albumKey || item.albumKey || prev.sourceAlbum || item.sourceAlbum || null });
      return;
    }
    map.set(uid, { ...prev, ...item, uid, inactiveAt: Math.max(toNum(prev.inactiveAt), toNum(item.inactiveAt)) });
  });
  return JSON.stringify([...map.values()]);
};

export const mergePlaylistsStorageSafe = (localRaw, remoteRaw) => {
  const local = Array.isArray(parseJsonSafe(localRaw, [])) ? parseJsonSafe(localRaw, []) : [];
  const remote = Array.isArray(parseJsonSafe(remoteRaw, [])) ? parseJsonSafe(remoteRaw, []) : [];
  const map = new Map();
  [...local, ...remote].forEach(pl => {
    const id = String(pl?.id || '').trim();
    if (!id) return;
    const prev = map.get(id);
    if (!prev) { map.set(id, { ...pl, id, order: uniq(pl?.order), hidden: uniq(pl?.hidden), ops: pl.ops || [] }); return; }
    
    let order = [];
    let ops = [];
    if (prev.ops && pl.ops && (prev.ops.length || pl.ops.length)) {
      const opsMap = new Map();
      [...prev.ops, ...pl.ops].forEach(op => opsMap.set(`${op.t}:${op.u}:${op.ts}`, op));
      ops = [...opsMap.values()].sort((a, b) => a.ts - b.ts);
      const state = new Set();
      ops.forEach(op => op.t === 'add' ? state.add(op.u) : state.delete(op.u));
      order = [...state];
    } else {
      order = uniq([...(prev.order || []), ...(pl.order || [])]);
    }
    
    const hidden = uniq([...(prev.hidden || []), ...(pl.hidden || [])]).filter(uid => order.includes(uid));
    map.set(id, { ...prev, ...pl, id, name: prev.name || pl.name || 'Плейлист',
      color: prev.color || pl.color || '',
      createdAt: minPositive(prev.createdAt, pl.createdAt) || Date.now(), order, hidden, ops });
  });
  return JSON.stringify([...map.values()]);
};

export const mergeProfileStorageValueSafe = (key, localVal, remoteVal) => {
  if (remoteVal == null) return localVal;
  if (localVal == null) return remoteVal;
  if (key === '__favorites_v2__') return mergeFavoritesStorageSafe(localVal, remoteVal);
  if (key === 'sc3:playlists') return mergePlaylistsStorageSafe(localVal, remoteVal);
  return remoteVal;
};

export default {
  toNum, minPositive, maxDateStr,
  mergeNumArrayMax, mergeNumericMapMax, mergeStatRowSafe,
  mergeAchievementsSafe, mergeFavoritesStorageSafe,
  mergePlaylistsStorageSafe, mergeProfileStorageValueSafe
};

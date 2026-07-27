// Канонический pure-контракт Избранного.
// Не читает storage, не управляет playback и не выполняет сеть.
export const FAVORITE_STATUSES = Object.freeze(['active', 'inactive', 'deleted']);
const safe = value => String(value == null ? '' : value).trim();
const num = value => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);
const minPositive = (...values) => {
  const rows = values.map(num).filter(value => value > 0);
  return rows.length ? Math.min(...rows) : 0;
};
export const favoriteStatus = item => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return '';
  }
  const explicit = safe(item.status);
  if (FAVORITE_STATUSES.includes(explicit)) {
    return explicit;
  }
  if (num(item?.deletedAt) > 0) return 'deleted';
  if (num(item?.inactiveAt) > 0) return 'inactive';
  return 'active';
};
export const favoriteClock = item => Math.max(num(item?.updatedAt), num(item?.deletedAt), num(item?.inactiveAt), num(item?.addedAt));
export const normalizeFavoriteItem = (raw = {}, { fallbackNow = Date.now(), keepUnknown = true } = {}) => {
  const uid = safe(raw?.uid);
  if (!uid) return null;
  const status = favoriteStatus(raw);
  const clock = favoriteClock(raw) || num(fallbackNow);
  const album = safe(raw?.sourceAlbum || raw?.albumKey || raw?.album) || null;
  return { ...(keepUnknown ? raw : {}), uid, status, liked: status === 'active', addedAt: num(raw?.addedAt) || clock, updatedAt: clock, inactiveAt: status === 'inactive' ? num(raw?.inactiveAt) || clock : 0, deletedAt: status === 'deleted' ? num(raw?.deletedAt) || clock : 0, sourceAlbum: album, albumKey: album };
};
export const normalizeFavoriteList = (rows, options = {}) => {
  const items = new Map();
  (Array.isArray(rows) ? rows : [])
    .map(item => normalizeFavoriteItem(item, options))
    .filter(Boolean)
    .forEach(item => items.set(item.uid, item));
  return [...items.values()];
};
export const localToRemote = item => {
  const normalized = normalizeFavoriteItem(item);
  if (!normalized) return null;
  return { uid: normalized.uid, album: normalized.sourceAlbum || normalized.albumKey || '', status: normalized.status, addedAt: normalized.addedAt, updatedAt: normalized.updatedAt, inactiveAt: normalized.inactiveAt, deletedAt: normalized.deletedAt };
};
export const remoteToLocal = state => {
  const rows = Array.isArray(state) ? state : Array.isArray(state?.items) ? state.items : [];
  return normalizeFavoriteList(rows.map(item => ({ ...item, sourceAlbum: item?.sourceAlbum || item?.albumKey || item?.album || null, albumKey: item?.albumKey || item?.sourceAlbum || item?.album || null })));
};
export const favoriteSignature = item => {
  const normalized = localToRemote(item);
  return normalized ? JSON.stringify({ uid: normalized.uid, status: normalized.status, album: normalized.album }) : '';
};
export const mergeFavoritePair = (leftRaw, rightRaw, policy = 'ask') => {
  const fallbackNow = Math.max(favoriteClock(leftRaw), favoriteClock(rightRaw), Date.now());
  const left = normalizeFavoriteItem(leftRaw, { fallbackNow });
  const right = normalizeFavoriteItem(rightRaw, { fallbackNow });
  if (!left) return right;
  if (!right) return left;
  const newest = favoriteClock(right) >= favoriteClock(left) ? right : left;
  const oldest = newest === right ? left : right;
  if (policy === 'latest') return newest;
  if (policy === 'trash' && (left.deletedAt || right.deletedAt)) {
    const deleted = left.deletedAt >= right.deletedAt ? left : right;
    const live = deleted === left ? right : left;
    return deleted.deletedAt >= favoriteClock(live) ? normalizeFavoriteItem({ ...live, ...deleted, inactiveAt: 0 }) : normalizeFavoriteItem({ ...oldest, ...newest, status: 'active', inactiveAt: 0, deletedAt: 0 });
  }
  const active = left.status === 'active' || right.status === 'active';
  if (newest.status === 'deleted' && (!active || favoriteClock(newest) >= favoriteClock(oldest))) {
    return normalizeFavoriteItem({ ...oldest, ...newest, status: 'deleted', inactiveAt: 0 });
  }
  if (active) {
    return normalizeFavoriteItem({ ...oldest, ...newest, status: 'active', addedAt: minPositive(left.addedAt, right.addedAt) || fallbackNow, updatedAt: Math.max(favoriteClock(left), favoriteClock(right)), inactiveAt: 0, deletedAt: 0 });
  }
  return normalizeFavoriteItem({ ...oldest, ...newest, status: 'inactive', inactiveAt: Math.max(num(left.inactiveAt), num(right.inactiveAt)) || fallbackNow, deletedAt: 0, updatedAt: Math.max(favoriteClock(left), favoriteClock(right)) });
};
export default { FAVORITE_STATUSES, favoriteStatus, favoriteClock, normalizeFavoriteItem, normalizeFavoriteList, localToRemote, remoteToLocal, favoriteSignature, mergeFavoritePair };

// UID.003_(Event log truth)_(удаления должны быть восстанавливаемыми и merge-safe)_(hard-delete заменяем tombstones) UID.099_(Multi-device sync model)_(latest-write/delete semantics)_(удалённые сущности не должны воскресать от старого backup) UID.100_(Backup snapshot as life capsule)_(backup хранит историю удаления)_(корзина и restore policy получают понятный deletedAt)
export const TOMBSTONE_SCHEMA_VERSION = 1;
const sS = v => String(v == null ? '' : v).trim(), sN = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const normalizeEntityClock = r => ({ createdAt: sN(r?.createdAt), updatedAt: sN(r?.updatedAt), deletedAt: sN(r?.deletedAt) });
export const isDeletedRow = r => sN(r?.deletedAt) > 0;
export const activeRows = r => (Array.isArray(r) ? r : []).filter(x => !isDeletedRow(x));
export const markDeletedRow = (r = {}, ts = Date.now()) => ({ ...r, deletedAt: sN(ts) || Date.now(), updatedAt: Math.max(sN(r?.updatedAt), sN(ts) || Date.now()) });
export const restoreDeletedRow = (r = {}, ts = Date.now()) => ({ ...r, deletedAt: 0, updatedAt: Math.max(sN(r?.updatedAt), sN(ts) || Date.now()) });
export const normalizeTombstone = r => ({ v: TOMBSTONE_SCHEMA_VERSION, entity: sS(r?.entity), id: sS(r?.id), deletedAt: sN(r?.deletedAt), deviceStableId: sS(r?.deviceStableId || localStorage.getItem('deviceStableId')), reason: sS(r?.reason) });
export default { TOMBSTONE_SCHEMA_VERSION, normalizeEntityClock, isDeletedRow, activeRows, markDeletedRow, restoreDeletedRow, normalizeTombstone };

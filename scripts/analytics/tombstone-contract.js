// UID.003_(Event log truth)_(удаления должны быть восстанавливаемыми и merge-safe)_(hard-delete заменяем tombstones)
// UID.099_(Multi-device sync model)_(latest-write/delete semantics)_(удалённые сущности не должны воскресать от старого backup)
// UID.100_(Backup snapshot as life capsule)_(backup хранит историю удаления)_(корзина и restore policy получают понятный deletedAt)

export const TOMBSTONE_SCHEMA_VERSION = 1;

const sS = v => String(v == null ? '' : v).trim();
const sN = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const normalizeEntityClock = row => ({
  createdAt: sN(row?.createdAt),
  updatedAt: sN(row?.updatedAt),
  deletedAt: sN(row?.deletedAt)
});

export const isDeletedRow = row => sN(row?.deletedAt) > 0;

export const activeRows = rows => (Array.isArray(rows) ? rows : []).filter(x => !isDeletedRow(x));

export const markDeletedRow = (row = {}, ts = Date.now()) => ({
  ...row,
  deletedAt: sN(ts) || Date.now(),
  updatedAt: Math.max(sN(row?.updatedAt), sN(ts) || Date.now())
});

export const restoreDeletedRow = (row = {}, ts = Date.now()) => ({
  ...row,
  deletedAt: 0,
  updatedAt: Math.max(sN(row?.updatedAt), sN(ts) || Date.now())
});

export const normalizeTombstone = raw => ({
  v: TOMBSTONE_SCHEMA_VERSION,
  entity: sS(raw?.entity || ''),
  id: sS(raw?.id || ''),
  deletedAt: sN(raw?.deletedAt),
  deviceStableId: sS(raw?.deviceStableId || localStorage.getItem('deviceStableId') || ''),
  reason: sS(raw?.reason || '')
});

export default {
  TOMBSTONE_SCHEMA_VERSION,
  normalizeEntityClock,
  isDeletedRow,
  activeRows,
  markDeletedRow,
  restoreDeletedRow,
  normalizeTombstone
};

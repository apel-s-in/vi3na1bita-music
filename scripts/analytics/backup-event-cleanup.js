// UID.003_(Event log truth)_(единая очистка event log перед backup/restore/rebuild)_(dedupe/filter/trim должны быть одинаковыми во всех местах) UID.099_(Multi-device sync model)_(merge по eventId)_(не раздувать backup дублями событий) UID.096_(Helper-first anti-duplication policy)_(убрать копипасту cleanup из builders/importers/app)
import { isBackupSemanticNoiseEvent } from './event-contract.js';

export const WARM_EVENT_LIMIT = 10000;
const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const normalizeEventList = (events = [], { limit = WARM_EVENT_LIMIT, dropNoise = true, sort = true, dedupeAchievementUnlocks = true } = {}) => {
  const seen = new Set(), achSeen = new Set();
  let out = (Array.isArray(events) ? events : []).filter(ev => ev?.eventId && !seen.has(ev.eventId) && seen.add(ev.eventId)).filter(ev => !dropNoise || !isBackupSemanticNoiseEvent(ev));
  if (sort) out.sort((a, b) => toNum(a?.timestamp) - toNum(b?.timestamp));
  if (dedupeAchievementUnlocks) out = out.filter(ev => { if (String(ev?.type || '') !== 'ACHIEVEMENT_UNLOCK') return true; const id = String(ev?.data?.id || '').trim(); return id ? !achSeen.has(id) && !!achSeen.add(id) : true; });
  return limit > 0 && out.length > limit ? out.slice(-limit) : out;
};

export const cleanupWarmEventsStore = async (metaDB, { limit = WARM_EVENT_LIMIT, migrationLabel = 'EventCleanup' } = {}) => {
  if (!metaDB) return { changed: false, before: 0, after: 0 };
  const b = await metaDB.getEvents('events_warm').catch(() => []), c = normalizeEventList(b, { limit });
  if (!Array.isArray(b) || b.length === c.length) return { changed: false, before: b?.length || 0, after: c.length };
  await metaDB.clearEvents('events_warm'); if (c.length) await metaDB.addEvents(c, 'events_warm');
  return { changed: true, before: b.length, after: c.length };
};

export default { WARM_EVENT_LIMIT, normalizeEventList, cleanupWarmEventsStore };

// UID.003_(Event log truth)_(единая очистка event log перед backup/restore/rebuild)_(dedupe/filter/trim должны быть одинаковыми во всех местах)
// UID.099_(Multi-device sync model)_(merge по eventId)_(не раздувать backup дублями событий)
// UID.096_(Helper-first anti-duplication policy)_(убрать копипасту cleanup из builders/importers/app)

import { isBackupSemanticNoiseEvent } from './event-contract.js';

export const WARM_EVENT_LIMIT = 10000;

const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const normalizeEventList = (events = [], { limit = WARM_EVENT_LIMIT, dropNoise = true, sort = true } = {}) => {
  const seen = new Set();
  let out = (Array.isArray(events) ? events : [])
    .filter(ev => ev?.eventId && !seen.has(ev.eventId) && seen.add(ev.eventId))
    .filter(ev => !dropNoise || !isBackupSemanticNoiseEvent(ev));

  if (sort) out = out.sort((a, b) => toNum(a?.timestamp) - toNum(b?.timestamp));
  if (limit > 0 && out.length > limit) out = out.slice(-limit);
  return out;
};

export const cleanupWarmEventsStore = async (metaDB, { limit = WARM_EVENT_LIMIT, migrationLabel = 'EventCleanup' } = {}) => {
  if (!metaDB) return { changed: false, before: 0, after: 0 };
  const beforeRows = await metaDB.getEvents('events_warm').catch(() => []);
  const cleaned = normalizeEventList(beforeRows, { limit });
  if (!Array.isArray(beforeRows) || beforeRows.length === cleaned.length) return { changed: false, before: beforeRows?.length || 0, after: cleaned.length };
  await metaDB.clearEvents('events_warm');
  if (cleaned.length) await metaDB.addEvents(cleaned, 'events_warm');
  console.debug(`[${migrationLabel}] warm events cleaned: ${beforeRows.length} → ${cleaned.length}`);
  return { changed: true, before: beforeRows.length, after: cleaned.length };
};

export default {
  WARM_EVENT_LIMIT,
  normalizeEventList,
  cleanupWarmEventsStore
};

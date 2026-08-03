// Pure event-list normalization для ledger/trust diagnostics.
// Local spool сам удаляет успешно упакованные события.
import { isBackupSemanticNoiseEvent } from './event-contract.js';

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export const normalizeEventList = (events = [], {
  limit = 0,
  dropNoise = true,
  sort = true,
  dedupeAchievementUnlocks = true
} = {}) => {
  const seen = new Set();
  const achievementIds = new Set();
  let rows = (Array.isArray(events) ? events : [])
    .filter(event => event?.eventId && !seen.has(event.eventId) && seen.add(event.eventId))
    .filter(event => !dropNoise || !isBackupSemanticNoiseEvent(event));

  if (sort) {
    rows.sort((left, right) => num(left?.timestamp) - num(right?.timestamp));
  }

  if (dedupeAchievementUnlocks) {
    rows = rows.filter(event => {
      if (String(event?.type || '') !== 'ACHIEVEMENT_UNLOCK') return true;
      const id = String(event?.data?.id || '').trim();
      if (!id || achievementIds.has(id)) return !id;
      achievementIds.add(id);
      return true;
    });
  }

  return limit > 0 && rows.length > limit ? rows.slice(-limit) : rows;
};

export default { normalizeEventList };

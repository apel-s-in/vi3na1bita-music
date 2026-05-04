// UID.003_(Event log truth)_(branch compare должен работать по eventId)_(restore UI показывает реальные ветки)
// UID.099_(Multi-device sync model)_(local/cloud divergence видна до restore)_(localOnly/cloudOnly/overlap/watermarks)

import { metaDB as defaultMetaDB } from './meta-db.js';
import { readLocalEventLog } from './stats-state.js';
import { normalizeEventList } from './backup-event-cleanup.js';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const compareEventBranches = ({ localEvents = [], cloudEvents = [] } = {}) => {
  const l = normalizeEventList(localEvents, { limit: 10000 }), c = normalizeEventList(cloudEvents, { limit: 10000 });
  const lIds = new Set(l.map(e => e.eventId).filter(Boolean)), cIds = new Set(c.map(e => e.eventId).filter(Boolean));
  const localOnlyEvents = l.filter(e => !cIds.has(e.eventId));
  const cloudOnlyEvents = c.filter(e => !lIds.has(e.eventId));
  const overlapCount = l.filter(e => cIds.has(e.eventId)).length;
  const localEventWatermark = Math.max(0, ...l.map(e => n(e.timestamp)));
  const cloudEventWatermark = Math.max(0, ...c.map(e => n(e.timestamp)));
  return {
    localCount: l.length,
    cloudCount: c.length,
    localOnlyCount: localOnlyEvents.length,
    cloudOnlyCount: cloudOnlyEvents.length,
    overlapCount,
    localEventWatermark,
    cloudEventWatermark,
    state: localOnlyEvents.length && cloudOnlyEvents.length ? 'diverged' : (cloudOnlyEvents.length ? 'cloud_ahead' : (localOnlyEvents.length ? 'local_ahead' : 'same')),
    localOnlyEvents,
    cloudOnlyEvents
  };
};

export const compareBackupBranches = async ({ backup, metaDB = defaultMetaDB } = {}) =>
  compareEventBranches({
    localEvents: await readLocalEventLog(metaDB, { forceFlush: true }),
    cloudEvents: Array.isArray(backup?.data?.eventLog?.warm) ? backup.data.eventLog.warm : []
  });

export default { compareEventBranches, compareBackupBranches };

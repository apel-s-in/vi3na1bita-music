// Backup v7 delta contract.
// Pure helper: не читает storage, не выполняет сеть и не управляет playback.
export const BACKUP_DELTA_VERSION = '7.0';
export const BACKUP_DELTA_ROOT = 'app:/Backup/v7';
export const BACKUP_DELTA_SHARED_PATH = `${BACKUP_DELTA_ROOT}/shared.json`;
export const BACKUP_DELTA_DEVICES_DIR = `${BACKUP_DELTA_ROOT}/devices`;
export const BACKUP_DELTA_EVENTS_DIR = `${BACKUP_DELTA_ROOT}/events`;
export const BACKUP_DELTA_STATS_DIR = `${BACKUP_DELTA_ROOT}/stats`;
export const BACKUP_DELTA_MAX_EVENTS = 500;
export const BACKUP_DELTA_MAX_RANGES = 5000;

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
export const safeDeltaId = value => safe(value).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 160);

export const buildDeltaBranchId = ({ deviceStableId = '', chainId = '' } = {}) => {
  const device = safeDeltaId(deviceStableId) || 'unknown';
  const chain = safeDeltaId(safe(chainId).replace(/^chain_/, '')) || 'legacy';
  return `${device}_${chain.slice(0, 36)}`;
};

export const buildDeltaRangeKey = ({ branchId = '', fromSeq = 0, toSeq = 0, hash = '' } = {}) =>
  `${safeDeltaId(branchId)}:${num(fromSeq)}:${num(toSeq)}:${safeDeltaId(hash).slice(0, 32)}`;

export const buildDeltaManifestPath = deviceStableId => {
  const device = safeDeltaId(deviceStableId);
  return device ? `${BACKUP_DELTA_DEVICES_DIR}/${device}.json` : '';
};

export const buildDeltaEventPath = ({ deviceStableId = '', branchId = '', fromSeq = 0, toSeq = 0, hash = '' } = {}) => {
  const device = safeDeltaId(deviceStableId);
  const branch = safeDeltaId(branchId);
  return device && branch && num(fromSeq) > 0 && num(toSeq) >= num(fromSeq) && safeDeltaId(hash)
    ? `${BACKUP_DELTA_EVENTS_DIR}/${device}_${branch}_${num(fromSeq)}_${num(toSeq)}_${safeDeltaId(hash).slice(0, 16)}.json`
    : '';
};

export const buildDeltaStatsPath = ({ deviceStableId = '', branchId = '', fromSeq = 0, toSeq = 0, hash = '' } = {}) => {
  const device = safeDeltaId(deviceStableId);
  const branch = safeDeltaId(branchId);
  return device && branch && num(fromSeq) > 0 && num(toSeq) >= num(fromSeq) && safeDeltaId(hash)
    ? `${BACKUP_DELTA_STATS_DIR}/${device}_${branch}_${num(fromSeq)}_${num(toSeq)}_${safeDeltaId(hash).slice(0, 16)}.json`
    : '';
};

export const normalizeDeltaRangeRef = raw => {
  const branchId = safeDeltaId(raw?.branchId);
  const fromSeq = num(raw?.fromSeq);
  const toSeq = num(raw?.toSeq);
  const hash = safeDeltaId(raw?.hash).slice(0, 64);
  const rangeKey = safe(raw?.rangeKey) || buildDeltaRangeKey({ branchId, fromSeq, toSeq, hash });
  if (!branchId || !fromSeq || toSeq < fromSeq || !hash || !rangeKey) return null;
  return {
    rangeKey,
    branchId,
    chainId: safe(raw?.chainId).slice(0, 160),
    deviceStableId: safeDeltaId(raw?.deviceStableId),
    fromSeq,
    toSeq,
    eventCount: num(raw?.eventCount),
    hash,
    path: safe(raw?.path),
    createdAt: num(raw?.createdAt)
  };
};

const normalizeRefs = rows => [...new Map((Array.isArray(rows) ? rows : [])
  .map(normalizeDeltaRangeRef)
  .filter(Boolean)
  .map(item => [item.rangeKey, item])).values()]
  .sort((left, right) => left.branchId.localeCompare(right.branchId) || left.fromSeq - right.fromSeq)
  .slice(-BACKUP_DELTA_MAX_RANGES);

export const normalizeDeltaManifest = raw => ({
  version: BACKUP_DELTA_VERSION,
  deviceStableId: safeDeltaId(raw?.deviceStableId),
  deviceHash: safeDeltaId(raw?.deviceHash),
  label: safe(raw?.label).slice(0, 80),
  deviceClass: safe(raw?.deviceClass).slice(0, 40),
  platform: safeDeltaId(raw?.platform),
  pwa: raw?.pwa === true,
  currentBranchId: safeDeltaId(raw?.currentBranchId),
  currentChainId: safe(raw?.currentChainId).slice(0, 160),
  lastSeq: num(raw?.lastSeq),
  settingsHash: safeDeltaId(raw?.settingsHash).slice(0, 64),
  eventRanges: normalizeRefs(raw?.eventRanges),
  statsRanges: normalizeRefs(raw?.statsRanges),
  createdAt: num(raw?.createdAt) || Date.now(),
  updatedAt: num(raw?.updatedAt) || Date.now()
});

export const mergeDeltaManifests = (leftRaw, rightRaw) => {
  const left = normalizeDeltaManifest(leftRaw);
  const right = normalizeDeltaManifest(rightRaw);
  return normalizeDeltaManifest({
    ...left,
    ...right,
    deviceStableId: right.deviceStableId || left.deviceStableId,
    createdAt: Math.min(...[left.createdAt, right.createdAt].filter(Boolean)) || Date.now(),
    lastSeq: Math.max(left.lastSeq, right.lastSeq),
    eventRanges: [...left.eventRanges, ...right.eventRanges],
    statsRanges: [...left.statsRanges, ...right.statsRanges],
    updatedAt: Math.max(left.updatedAt, right.updatedAt, Date.now())
  });
};

export const normalizeDeltaKnownState = raw => ({
  version: BACKUP_DELTA_VERSION,
  sharedHash: safeDeltaId(raw?.sharedHash).slice(0, 64),
  eventRangeKeys: [...new Set((Array.isArray(raw?.eventRangeKeys) ? raw.eventRangeKeys : []).map(safe).filter(Boolean))].slice(-BACKUP_DELTA_MAX_RANGES),
  statsRangeKeys: [...new Set((Array.isArray(raw?.statsRangeKeys) ? raw.statsRangeKeys : []).map(safe).filter(Boolean))].slice(-BACKUP_DELTA_MAX_RANGES),
  updatedAt: num(raw?.updatedAt)
});

export default {
  BACKUP_DELTA_VERSION,
  BACKUP_DELTA_ROOT,
  BACKUP_DELTA_SHARED_PATH,
  BACKUP_DELTA_DEVICES_DIR,
  BACKUP_DELTA_EVENTS_DIR,
  BACKUP_DELTA_STATS_DIR,
  BACKUP_DELTA_MAX_EVENTS,
  BACKUP_DELTA_MAX_RANGES,
  safeDeltaId,
  buildDeltaBranchId,
  buildDeltaRangeKey,
  buildDeltaManifestPath,
  buildDeltaEventPath,
  buildDeltaStatsPath,
  normalizeDeltaRangeRef,
  normalizeDeltaManifest,
  mergeDeltaManifests,
  normalizeDeltaKnownState
};

export const validateBackupAnalytics = ({ contains, excludes, assertNoMatch, listFiles }) => {
  const range = 'scripts/analytics/backup-v7-range.js';
  const sync = 'scripts/analytics/backup-v7-sync.js';
  const scheduler = 'scripts/analytics/backup-sync-engine.js';
  const stats = 'scripts/analytics/stats-shard-contract.js';
  const statsV5 = 'scripts/analytics/stats-v4-projection.js';
  const meta = 'scripts/analytics/meta-db.js';
  const proxy = 'cloud-functions/vi3na1bita-backup-proxy/index.js';

  [
    "BACKUP_V7_VERSION = '7.1'",
    'packLocalBackupV7Ranges',
    'localPacked: true',
    'cloudUploadedAt: 0',
    'packedSeq',
    'packedRangeHash',
    'uploadedSeq',
    'uploadedRangeHash'
  ].forEach(marker => contains(range, marker));

  [
    'backup_event_ranges',
    'backup_chain_watermarks',
    'rebuildBackupV7LocalAnalytics',
    'streamStatsRollups',
    'writeProjectionAtomic',
    'compactOldRawRanges',
    'pullBackupV7Pages',
    'MAX_PULL_PAGES_PER_SLOT = 4',
    'no_watermark_progress',
    'quarantinedKeys'
  ].forEach(marker => contains(sync, marker));

  [
    'scheduleLocalPack',
    'PLAYBACK_DEFER_MS',
    'disk_access_unavailable',
    'disk_space_exhausted',
    'DISK_FULL_RETRY_MS',
    'getBackupV7Availability'
  ].forEach(marker => contains(scheduler, marker));

  [
    'STATS_SHARD_VERSION = 5',
    'uniqueCoveredMs',
    'completionBasisPointsSum',
    'analysisEligibleSessions',
    'microSkips',
    'earlySkips',
    'validSkips',
    'partialEnds',
    'transitions',
    'chainSeq',
    'mergeProjectedStatsRow'
  ].forEach(marker => contains(stats, marker));

  [
    'REPEAT_GAP_MS = 60000',
    'chainKey',
    "data.skipClass === 'full'",
    'completionsInRuns3',
    'cubeKey'
  ].forEach(marker => contains(statsV5, marker));

  contains(meta, "this.dbName = 'MetaDB_v6'");
  contains(meta, "createIndex('chainSeq'");
  contains(proxy, "ALLOWED_MODES = new Set(['ping', 'v7_sync'])");
  contains(proxy, "domains: ['playlists']");

  excludes(range, /PENDING_KEY|v71_batch|savePendingBackupV7Batch|clearPendingBackupV7Batch/, 'Одиночный pending batch снова добавлен');
  excludes(sync, /cleanupLegacyBackupV6|legacyCleanup|DELETE_LEGACY_V6|knownRangeKeys|projectedAt/, 'Legacy Backup state снова добавлен');
  excludes(meta, /backup_known_ranges|backup_pending_ranges|backup_mutations/, 'Мёртвый Backup store снова добавлен');
  excludes(stats, /backup-delta-contract/, 'Stats shard снова зависит от V7.0 delta contract');
  excludes(sync, /ranges\.flatMap\(|readCompleteEventTruth/, 'Full raw rebuild снова добавлен');
  excludes('scripts/analytics/stats-state.js', /readLocalEventLog|rebuildStatsFromEvents|migrateLocalTemporalV2/, 'Legacy stats rebuild снова добавлен');
  excludes('scripts/app.js', /migration:cleanup_duplicates:v3|cleanupWarmEventsStore|migrateLocalTemporalV2/, 'Boot снова запускает старую analytics migration');

  assertNoMatch(
    listFiles('scripts/analytics'),
    /LISTEN_SKIP/g,
    'Obsolete LISTEN_SKIP отсутствует в analytics runtime'
  );
};

export default { validateBackupAnalytics };

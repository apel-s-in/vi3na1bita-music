export const validateBackupAnalytics = ({ contains, excludes, assertNoMatch, listFiles }) => {
  const range = 'scripts/analytics/backup-v7-range.js';
  const sync = 'scripts/analytics/backup-v7-sync.js';
  const scheduler = 'scripts/analytics/backup-sync-engine.js';
  const stats = 'scripts/analytics/stats-shard-contract.js';
  const statsV5 = 'scripts/analytics/stats-v4-projection.js';
  const meta = 'scripts/analytics/meta-db.js';
  const proxy = 'cloud-functions/vi3na1bita-backup-proxy/index.js';
  const signaling = 'cloud-functions/vi3-signaling/index.js';
  const coordinator = 'cloud-functions/vi3-signaling/backup-coordinator.js';
  const coordinatorClient = 'scripts/analytics/backup-coordinator-client.js';
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
    'quarantinedKeys',
    'pullEnabled',
    'sharedReadEnabled',
    'sharedWriteEnabled',
    'settingsReadEnabled',
    'transport_only_push',
    'getBackupV7BacklogStatus',
    'domainEvents',
    'prepareStatsRollupMigration',
    'stats_rollup_cloud_repair_required',
    'backup_stats_rollup_migration',
    'allowWatermarkRewind'
  ].forEach(marker => contains(sync, marker));

  [
    'scheduleLocalPack',
    'BACKUP_PLAYBACK_DEFER_MS',
    'disk_access_unavailable',
    'disk_space_exhausted',
    'DISK_FULL_RETRY_MS',
    'getBackupV7Availability',
    'STATE_KEY',
    'scheduler:v1',
    'BACKUP_DAILY_MS',
    'backupNeedsContinuation',
    'dirtyDomainsAfterSync',
    'sharedReadEnabled: true',
    'sharedWriteEnabled: sharedWriteRequired',
    'settingsReadEnabled: false',
    'local_backlog_continue',
    'activity_resumed'
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
  
  contains('scripts/analytics/event-logger.js', "metaDB.db.transaction(['events_hot', 'global'], 'readwrite')");
  contains('scripts/analytics/event-logger.js', 'LEDGER_CHECKPOINT_KEY');
  contains('scripts/analytics/backup-v7-recovery.js', "readRows('events_warm')");
  contains('scripts/analytics/backup-v7-recovery.js', 'captureStorage(DEVICE_STORAGE_KEYS)');
  excludes('scripts/analytics/backup-v7-recovery.js', /replaceRows\(['"]backup_chain_watermarks['"]/, 'Checkpoint снова откатывает уже подтверждённые cloud watermarks');
  [
    'normalizeCoordinatorState',
    'claimCoordinatorLease',
    'authorizeCoordinatorLease',
    'renewCoordinatorLease',
    'completeCoordinatorLease',
    'releaseCoordinatorLease',
    'publicCoordinatorState',
    'existingTokenHash',
    'manual: 100',
    'continuation: 50',
    'initial_device: 40',
    'daily: 10'
  ].forEach(marker => contains(coordinator, marker));

  [
    'backup_sync_claim',
    'backup_sync_authorize',
    'backup_sync_renew',
    'backup_sync_complete',
    'backup_sync_release',
    'backup_sync_status',
    'backupCoordinatorKey',
    'mutateBackupCoordinator',
    'BACKUP_COORDINATOR_DISK_BLOCK_MS'
  ].forEach(marker => contains(signaling, marker));

  excludes(coordinator, /require\(['"]ydb-sdk['"]\)|fetch\(|process\.env|playerCore|localStorage|sessionStorage/, 'Pure Backup coordinator получил runtime-зависимость');
  excludes(coordinator, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Backup coordinator управляет playback');
  [
    'withBackupCoordinatorLease',
    'backupCoordinatorSchedulerPatch',
    'coordinator_local_busy',
    'coordinator_queued',
    'coordinator_blocked',
    'navigator.locks',
    'backup_sync_claim',
    'backup_sync_renew',
    'backup_sync_complete',
    'backup_sync_release',
    'voice_call_active',
    'game_active',
    'playback_active'
  ].forEach(marker => contains(coordinatorClient, marker));

  contains(sync, 'coordinatorLease');
  contains(sync, 'renewCoordinatorLease');
  contains(scheduler, 'withBackupCoordinatorLease');
  contains(scheduler, 'backupCoordinatorSchedulerPatch');
  contains(proxy, 'BACKUP_COORDINATOR_REQUIRED');
  contains(proxy, 'backup_sync_authorize');
  contains(proxy, 'accountChainCatalog');
  contains(proxy, 'catalogEnabled');
  excludes(coordinatorClient, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Coordinator client управляет playback');
  contains('scripts/app/games/bridge-host.js', "publishGameActivity(false, 'closed_by_user'");
  contains('scripts/app/games/host.js', 'bridge?.destroy?.()');
  contains('scripts/app/profile/account-cloud-renderers.js', 'coordinator_queued');
  contains('scripts/app/profile/account-cloud-renderers.js', 'activeLease?.holderLabel');
  contains(proxy, 'Array.isArray(catalogHeads) ? catalogHeads : await listChainHeads(auth)');
  contains(sync, "metaDB.db.transaction(['backup_stats_rollups', 'backup_chain_watermarks', 'global'], 'readwrite')");
  contains(sync, 'watermarkStore.delete(row.key)');
  contains(sync, 'requiresCloudRepair');
  contains(meta, "this.dbName = 'MetaDB_v6'");
  contains(meta, "createIndex('chainSeq'");
  contains(proxy, "ALLOWED_MODES = new Set(['ping', 'v7_sync'])");
  contains(proxy, "domains: ['playlists']");
  contains(proxy, 'body.includePull === false');
  contains(proxy, 'includeSharedRead');
  contains(proxy, 'includeSharedWrite');
  contains(proxy, 'sharedReadEnabled');
  contains(proxy, 'sharedWriteEnabled');
  contains(proxy, 'body.includeSettingsRead === false');
  contains(proxy, 'pushWatermarks');
  contains(proxy, 'BACKUP_CATALOG_ENABLED');
  contains(proxy, 'CATALOG_PATH');
  contains(proxy, 'catalog.json');
  contains(proxy, 'readOrRebuildCatalog');
  contains(proxy, 'rebuildCatalogDocument');
  contains(proxy, 'updateCatalogHead');
  contains(proxy, 'catalogHeads');
  contains(proxy, 'backup_catalog_requires_mandatory_coordinator');

  contains('scripts/analytics/backup-scheduler-policy.js', 'BACKUP_DAILY_MS');
  contains('scripts/analytics/backup-scheduler-policy.js', 'dirtyDomainsAfterSync');
  contains('scripts/analytics/backup-v7-recovery.js', "readRows('recommendation_state')");
  contains('scripts/analytics/backup-v7-recovery.js', "readRows('intel_runtime')");
  contains('scripts/analytics/backup-v7-recovery.js', 'domainState');
  excludes(scheduler, /LS_PHASE|readPhase\(|setPhase\(|phase !== 'pull'|phase !== 'push'/, 'Alternating push/pull scheduler снова добавлен');
  excludes(scheduler, /localStorage\.setItem\(['"]backup:v71:(?:next-phase|next-sync-at|dirty|block-reason|block-until)['"]/, 'Scheduler снова записывает legacy localStorage runtime state');
  excludes(range, /PENDING_KEY|v71_batch|savePendingBackupV7Batch|clearPendingBackupV7Batch/, 'Одиночный pending batch снова добавлен');
  excludes(sync, /cleanupLegacyBackupV6|legacyCleanup|DELETE_LEGACY_V6|knownRangeKeys|projectedAt/, 'Legacy Backup state снова добавлен');
  excludes(meta, /createObjectStore\(\s*['"]backup_known_ranges['"]|['"]backup_pending_ranges['"]|['"]backup_mutations['"]/, 'Мёртвый Backup store снова добавлен');
  excludes(stats, /backup-delta-contract/, 'Stats shard снова зависит от V7.0 delta contract');
  excludes(sync, /ranges\.flatMap\(|readCompleteEventTruth/, 'Full raw rebuild снова добавлен');
  excludes('scripts/analytics/stats-state.js', /readLocalEventLog|rebuildStatsFromEvents|migrateLocalTemporalV2/, 'Legacy stats rebuild снова добавлен');
  excludes('scripts/app.js', /migration:cleanup_duplicates:v3|cleanupWarmEventsStore|migrateLocalTemporalV2/, 'Boot снова запускает старую analytics migration');
  excludes('service-worker.js', /sync-domains\.js|storage-merge\.js|storage-merge-utils\.js|playlists-storage-merge\.js|tombstone-contract\.js|trust-state\.js|settings-conflict-section\.js/, 'Удалённый legacy helper снова добавлен в precache');
  assertNoMatch(
    listFiles('scripts/analytics'),
    /LISTEN_SKIP/g,
    'Obsolete LISTEN_SKIP отсутствует в analytics runtime'
  );
};

export default { validateBackupAnalytics };

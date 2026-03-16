/* HYBRID SYNC — future orchestrator for primary backup + secondary mirror + linked provider roles. */
// UID.127_hybrid_sync_core_(ввести hybrid sync orchestrator)_(для одного профиля и нескольких провайдеров)_(this module owns sync policy)
// UID.128_primary_secondary_restore_policy_(ввести restore priority)_(для предсказуемого восстановления)_(primary->secondary->local merge)
// UID.129_merge_via_events_(мержить через events)_(для честной статистики)_(backup merge uses event logs)
// UID.130_sync_health_state_(держать sync health)_(для прозрачности linked providers)_(status+errors+lastSyncAt)

const noopAsync = async () => null;

export const hybridSync = {
  id: 'hybrid-sync',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async getState() { return null; },
  async setPrimaryBackupProvider() { return null; },
  async setSecondaryBackupProvider() { return null; },
  async syncNow() { return null; },
  async restoreNow() { return null; },
  teardown: noopAsync
};

export default hybridSync;

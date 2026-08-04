#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { validateBackupAnalytics } from './contracts/backup-analytics.mjs';
const root = process.cwd();
const failures = [];
let checks = 0;
const read = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: файл не найден`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};
const assert = (condition, message) => {
  checks++;
  if (!condition) failures.push(message);
};
const contains = (relative, marker) => {
  checks++;
  if (!read(relative).includes(marker)) {
    failures.push(`${relative}: отсутствует ${marker}`);
  }
};
const excludes = (relative, pattern, message) => {
  checks++;
  const source = read(relative);
  pattern.lastIndex = 0;
  if (pattern.test(source)) failures.push(`${relative}: ${message}`);
};
const listFiles = directory => {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];
  const files = [];
  const stack = [base];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'vendor') {
        continue;
      }
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute).replace(/\\/g, '/'));
      }
    }
  }
  return files.sort();
};
const assertNoMatch = (files, pattern, message) => {
  const matches = [];
  files.forEach(relative => {
    const source = read(relative);
    pattern.lastIndex = 0;
    if (pattern.test(source)) matches.push(relative);
  });
  assert(matches.length === 0, matches.length ? `${message}: ${matches.join(', ')}` : message);
};
const importAchievementDictionary = async () => {
  const source = read('scripts/analytics/achievements-dict.js');
  const url = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  const module = await import(url);
  return module.AchievementDictionary;
};
const validateAchievements = async () => {
  const dictionary = await importAchievementDictionary();
  const play = dictionary?.play_total;
  const full = dictionary?.full_total;
  const time = dictionary?.time_total;
  assert(JSON.stringify(play?.scaling?.steps) === JSON.stringify([1, 10, 25, 50, 70, 100, 250, 500, 1000, 5000, 10000, 15000, 20000]), 'В потоке: последовательность уровней');
  assert(JSON.stringify(play?.reward?.steps) === JSON.stringify([10, 15, 20, 25, 35, 50, 75, 100, 150, 200, 300, 400, 500]), 'В потоке: таблица наград');
  assert(play?.scaling?.resetEachLevel === true, 'В потоке: последовательный progress');
  assert(JSON.stringify(full?.scaling?.steps) === JSON.stringify([1, 2, 5, 10, 50, 100, 150, 200, 250, 300, 400, 500, 1000, 1500, 2000, 2500]), 'Верное ухо: последовательность уровней');
  assert(JSON.stringify(full?.reward?.steps) === JSON.stringify([5, 10, 15, 30, 50, 75, 85, 100, 125, 150, 200, 250, 500, 250, 250, 250]), 'Верное ухо: таблица наград');
  assert(full?.scaling?.resetEachLevel === true && full?.scaling?.cumulativeSteps === true && full?.scaling?.repeatAfterLevel === 16 && full?.scaling?.repeatStep === 500 && full?.reward?.repeatAmount === 250, 'Верное ухо: последовательное продолжение после 2500');
  assert(time?.scaling?.resetEachLevel === true && time?.scaling?.cumulativeSteps === true && time?.scaling?.repeatAfterLevel === 14 && time?.scaling?.repeatStep === 3600000, 'Хранитель времени: динамические уровни');
  assert(time?.reward?.repeatAmount === 500, 'Хранитель времени: повторная награда');
};
const validateListening = () => {
  const receipts = 'scripts/analytics/listening-receipts.js';
  const server = 'cloud-functions/vi3-signaling/index.js';
  ['listen_session_start', 'listen_session_heartbeat', 'listen_session_complete', 'achievement_reward_status', 'listeningReceipts:completionOutbox:v1', 'flushCompletionOutbox', 'applyShardRewardResult'].forEach(marker => contains(receipts, marker));
  assert(/const\s+HEARTBEAT_MS\s*=\s*20000\s*;/.test(read(receipts)), 'Listening heartbeat: 20 секунд');
  contains(receipts, 'heartbeatPending');
  contains(receipts, 'scheduleHeartbeat');
  contains(receipts, 'getSocialServerBackoffState');
  contains(receipts, 'deviceId: this.session.deviceId');
  contains(server, 'const LISTEN_PROGRESS_RECEIPT_LIMIT = 500');
  contains(server, 'LISTEN_ACTIVE_RETENTION_MS');
  contains(server, "receiptKind: 'device_segment'");
  contains(server, 'persisted: false');
  contains(server, 'logical_listen_session_required');
  excludes(server, /receiptKind:\s*data\.logicalSessionId\s*\?\s*['"]device_segment['"]\s*:\s*['"]legacy_session['"]/, 'Legacy listening receipt contour снова добавлен');
  excludes(server, /type:\s*['"]listenReceipt['"][\s\S]{0,180}receiptKind:\s*['"]device_segment['"]/, 'Device segment снова сохраняется как отдельный постоянный receipt');
  contains(server, 'const LISTEN_TIME_SESSION_LIMIT = 64');
  contains(server, 'const LISTEN_CREDIT_SEGMENT_LIMIT = 64');
  contains(server, 'listenByHourMs');
  contains(server, 'listenByWeekdayMs');
  contains(server, 'listenMsByTrack');
  contains(server, 'classifiedListenMs');
  contains(server, 'legacyUnclassifiedMs');
  contains(server, 'splitListenInterval');
  contains(server, 'assertConfirmedListeningInvariants');
  contains(server, 'publicConfirmedListeningStats');
  contains(server, 'timeConsistent');
  excludes(server, /function publicConfirmedListeningStats[\s\S]{0,300}assertConfirmedListeningInvariants\(progress\)/, 'Read-only server statistics снова падает на legacy invariant');
  contains('scripts/analytics/confirmed-listening-stats.js', 'resolveListeningStatsViewModel');
  contains('scripts/analytics/temporal-buckets.js', 'splitTemporalInterval');
  contains('scripts/analytics/session-tracker.js', 'creditedSegments');
  assertNoMatch(['scripts/app/profile/model.js', 'scripts/app/profile/stats-view.js', 'scripts/app/profile/live-bindings.js', 'scripts/ui/statistics-modal.js'], /getCanonicalFullListenCount/g, 'Legacy local/server full-count selector удалён');
  assert(/resolveListenSessionRow\(\s*playerId,\s*sessionId,\s*body\.deviceId\s*\)/.test(read(server)), 'Listening heartbeat использует direct per-device lookup');
  const serverSource = read(server);
  const logicalFinalizeStart = serverSource.indexOf('async function finalizeLogicalListen(logicalRaw)');
  const logicalDuplicateCheck = serverSource.indexOf('if (oldReceipt.progressApplied === true)', logicalFinalizeStart);
  const segmentFinalizeStart = serverSource.indexOf('async function finalizeListenSession(session)');
  const timeApply = serverSource.indexOf('await applyVerifiedListenTimeProgress(data);', segmentFinalizeStart);
  assert(logicalFinalizeStart >= 0 && logicalDuplicateCheck > logicalFinalizeStart, 'Logical completion проверяет постоянный receipt до повторного применения progress');
  assert(segmentFinalizeStart >= 0 && timeApply > segmentFinalizeStart, 'Device segment применяет подтверждённое время через session idempotency');
  assert(/listenedSeconds\s*>=\s*25/.test(read('scripts/analytics/session-tracker.js')), 'Valid listen: 25 секунд');
  assert(/liveAccumulatedMs\s*\/\s*1000\)\s*>=\s*25/.test(read('scripts/analytics/live-stats.js')), 'Live streak: 25 секунд');
  ['const LISTEN_VALID_MIN_SEC = 25', 'totalListenMs', 'listenTimeBySession', 'applyVerifiedListenTimeProgress', 'buildFullListenRewards', 'buildTimeRewards', 'logical.invalidated', 'LOGICAL_COVERAGE_REQUIRED_RATIO', 'LOGICAL_COVERAGE_MAX_GAP_MS'].forEach(marker => contains(server, marker));
  assertNoMatch([...listFiles('scripts/analytics'), server], /listenedSeconds\s*>=\s*13|Засчитывается\s*≥13\s*сек|Math\.max\(\s*13\s*,/g, 'Старый порог 13 секунд отсутствует');
  excludes(receipts, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'listening receipts управляет playback');
};
const validateRewards = () => {
  const engine = 'scripts/analytics/achievement-engine.js';
  ['_requiresServerVerification', 'isAuthorized', 'server_catalog_pending', 'getCompletedCount', '_hasScalableLevel', 'server_wallet'].forEach(marker => contains(engine, marker));
  contains('scripts/app.js', 'await W.achievementEngine._initBoot()');
  contains(engine, "reason || 'server_overlay'");
  excludes(engine, /const statsArr = await metaDB\.getAllStats\(\)/, 'Server-only Achievement Engine снова строит полный локальный aggregate');
  contains(engine, 'return true;');
  excludes(engine, /completed\s*=\s*.*localUnlocked/, 'Локальный unlock участвует в completion достижения');
  excludes(engine, /reward\?\.current\s*\?\?\s*localCurrent/, 'Локальный progress подменяет серверный');
  excludes('scripts/analytics/achievements-dict.js', /metric:\s*["'](?:playlist|playlists|playlistCount|playlistTracks)["']/, 'Плейлисты участвуют в локальном achievement catalog');
  excludes('cloud-functions/vi3-signaling/index.js', /metric:\s*['"](?:playlist|playlists|playlistCount|playlistTracks)['"]/, 'Плейлисты участвуют в серверном reward catalog');
  contains('scripts/app/profile/achievements-view.js', 'achievement-auth-gate');
  contains('scripts/app/profile/achievements-view.js', 'data-achievement-login');
  contains('scripts/app/profile/achievements-view.js', 'rewardAwarded');
  contains('scripts/app/shards/view.js', 'getRewardCatalog');
  contains('scripts/app/shards/view.js', 'serverRewardMap');
  contains('scripts/app/shards/reward-notifier.js', 'applyShardRewardResult');
  excludes(engine, /projectedTotalSec\s*\|\|\s*rawCurrent/, 'локальное время подменяет серверное');
  excludes(engine, /toggleableTimer\s*:\s*true/, 'найден переключаемый time timer');
  excludes('scripts/app/shards/reward-notifier.js', /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'reward notifier управляет playback');
};
const validatePwaAndLegacy = () => {
  const pwa = 'scripts/app/pwa-install.js';
  ['pwa_install_intent', 'pwa_launch_verify', 'isDevicePwa'].forEach(marker => contains(pwa, marker));
  contains('scripts/core/device-context.js', 'display-mode: standalone');
  contains('scripts/app/promocode.js', 'W.PromocodeGate');
  contains('scripts/app/promocode.js', 'refresh:bind');
  contains('scripts/e2e/utils.js', "typeof window.PromocodeGate?.refresh==='function'");
  assert(/window\.PromocodeGate\.refresh\(\)/.test(read('scripts/e2e/utils.js')), 'E2E явно запускает PromocodeGate.refresh()');
  excludes(pwa, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'PWA bridge управляет playback');
  const applicationFiles = [...listFiles('scripts').filter(file => !file.startsWith('scripts/ci/') && !file.startsWith('scripts/e2e/')), ...listFiles('data')];
  assertNoMatch(applicationFiles, /socials_all_visited|socialVisitAll|social_visit_all|Подписчик всего/g, 'Удалённое социальное достижение отсутствует');
  assertNoMatch([...listFiles('scripts').filter(file => !file.startsWith('scripts/ci/')), 'service-worker.js'], /verified-achievement-state|verified-achievements-view|claim_prepare|claim_validate|claim_index|achievement_verify/g, 'Удалённый backup claim contour отсутствует');
  assertNoMatch(['scripts/app/profile/yandex-actions.js', 'scripts/app/profile/yandex-auth-view.js', 'scripts/app/profile/account-cloud-renderers.js'], /YandexDisk|BackupVault|restore-backup|ya-restore-progress|ya-restore-bar|ya-restore-status|backup-import-manual|backup-export-manual|delete-old-backups|check-backup|archive-maintenance|recovery-snapshot|ledger-health|trust-check/g, 'V6 restore UI или actions снова подключены к account runtime');
  assertNoMatch(['service-worker.js'], /yandex-backup-disk|yandex-device-settings-disk|yandex-event-archive-disk|yandex-ledger-disk|event-archive-sync|event-archive-restore|archive-maintenance|backup-upload-runner|backup-importers|backup-vault|fresh-restore-modal|restore-backup-runner/g, 'V6 или legacy restore снова добавлены в SW precache');
};
const validateDataBoundaries = () => {
  const account = 'scripts/analytics/account-data-boundary.js';
  const favorite = 'scripts/analytics/favorite-state-contract.js';
  const mirror = 'scripts/analytics/favorite-mirror.js';
  ['Vi3AccountVault_v2', 'eventLedger:chainId:v1', 'favoriteMirror:outbox:v1', 'listeningReceipts:completionOutbox:v1', 'adoptLocalData'].forEach(marker => contains(account, marker));
  ['normalizeFavoriteItem', 'favoriteClock', 'favoriteStatus', 'mergeFavoritePair', 'remoteToLocal', 'localToRemote', 'favoriteSignature'].forEach(marker => contains(favorite, marker));
  ['favorite_state_get', 'favorite_state_mutate', 'favorite_state_reconcile'].forEach(marker => contains(mirror, marker));
  excludes('scripts/analytics/snapshot-contract.js', /SHARED_STORAGE_KEYS\s*=\s*\[[^\]]*__favorites_v2__/, 'Избранное осталось в shared backup');
  contains('scripts/analytics/snapshot-contract.js', 'sc3:playlists');
  excludes('scripts/analytics/snapshot-contract.js', /SHARED_STORAGE_KEYS\s*=\s*\[[^\]]*sc3:default/, 'Оформление default Showcase осталось в shared backup');
  excludes('scripts/analytics/snapshot-contract.js', /SHARED_STORAGE_KEYS\s*=\s*\[[^\]]*sc3:albumColors/, 'Цвета альбомов остались в shared backup');
  excludes(account, /\.(play|pause|stop|seek|setVolume|setMuted)\s*\(/, 'Account vault управляет playback');
  assertNoMatch([favorite, mirror], /\.(play|pause|stop|seek|next|prev|setVolume|setMuted|applyFavoritesOnlyFilter)\s*\(/g, 'Favorite contract или mirror управляет playback');
};
const validateRecommendationsAndStats = () => {
  const aggregator = 'scripts/analytics/stats-aggregator.js';
  contains('scripts/intel/recs/recommendation-engine.js', 'scoreUid');
  contains('scripts/intel/recs/recommendation-engine.js', 'resolveRecommendationDataSource');
  contains('scripts/intel/recs/recommendation-engine.js', 'confirmedAffinity');
  contains('scripts/intel/recs/recommendation-engine.js', 'source.canonicalByUid');
  contains('scripts/intel/recs/recommendation-data-source.js', "'account_hybrid'");
  contains('scripts/intel/recs/recommendation-data-source.js', "'local_compatible'");
  contains('scripts/intel/recs/recommendation-data-source.js', "'account_server_pending'");
  contains('scripts/intel/recs/recommendation-data-source.js', 'getConfirmedListeningStats');
  contains('scripts/intel/track/track-profiles.js', 'profilePath');
  contains('scripts/intel/track/track-profiles.js', 'relativePath');
  contains('scripts/intel/track/track-similarity.js', 'scoreTrackSimilarity');
  contains('scripts/intel/track/track-similarity.js', 'getSimilar');
  contains('scripts/app/gallery-recommendation-cards.js', 'buildGalleryRecommendationCards');
  contains('scripts/app/gallery-recommendation-cards.js', "'forgotten-hits'");
  contains('scripts/app/gallery-recommendation-cards.js', "'evening'");
  contains('scripts/app/gallery-recommendation-cards.js', "'walking'");
  contains('scripts/app/gallery-recommendation-cards.js', "'favorite-mood'");
  contains('scripts/app/gallery-recommendation-cards.js', "'unfinished'");
  contains('scripts/app/gallery-recommendation-cards.js', "'unusual'");
  contains('scripts/app/gallery-recommendation-cards.js', "'similar-current'");
  contains('scripts/app/gallery-recommendation-cards.js', "'album-week'");
  contains('scripts/app/gallery.js', 'renderGalleryRecommendationCard');
  contains('scripts/app/gallery.js', 'recordGalleryRecommendationShown');
  contains('scripts/app/gallery.js', 'recordGalleryRecommendationClicked');
  contains('scripts/app/gallery.js', 'getItemsSnapshot');
  contains('scripts/app/recommendation-playback.js', 'playRecommendedTrack');
  contains('scripts/app/recommendation-playback.js', 'openRecommendedTrack');
  contains('scripts/intel/recs/recommendation-engine.js', 'profileCoverage');
  contains('scripts/intel/roadmap.js', 'Transient queue и действие «Играть следующей» не реализуются');
  contains('scripts/intel/roadmap.js', 'Никаких праздничных, календарных или сезонных подборок');
  contains('scripts/ci/validate-intel-profiles.mjs', 'track-profile.template.json');
  contains('scripts/ci/validate-intel-profiles.mjs', 'profilePath должен быть');
  excludes('scripts/app/profile/recs-view.js', /stableScore|scoreUid/, 'Recommendation ranking снова добавлен в UI renderer');
  excludes('scripts/app/profile/recs-view.js', /sort\(\s*\(\)\s*=>\s*Math\.random/, 'случайный comparator рекомендаций');
  excludes('scripts/intel/recs/recommendation-data-source.js', /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Recommendation data source управляет playback');
  excludes('scripts/intel/recs/recommendation-engine.js', /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Recommendation Engine управляет playback');
  excludes('scripts/app/recommendation-playback.js', /\.(stop|seek|next|prev|setVolume|setMuted|setPlaylist)\s*\(/, 'Recommendation action helper обходит безопасный playback contract');
  excludes('scripts/app/gallery-recommendation-cards.js', /\.(play|pause|stop|seek|next|prev|setVolume|setMuted|load|setPlaylist)\s*\(/, 'Gallery recommendation scorer управляет playback');
  excludes('scripts/app/gallery-recommendation-cards.js', /Играть следующей|enqueueNext|addToQueue|transientQueue/, 'Преждевременная очередь добавлена в Gallery recommendations');
  excludes('scripts/app/gallery-recommendation-cards.js', /new-year|new_year|christmas|festive|recommendation-calendar|seasonality/, 'Праздничная или сезонная рекомендация снова добавлена');
  excludes('scripts/ci/generate-intel-test-profiles.mjs', /similar_tracks|relation_types|relations:/, 'Генератор снова записывает производные UID-связи');
  excludes('data/track-profiles/track-profile.template.json', /"relations"|"embedding"|"updatedAt"/, 'Постоянный TrackProfile снова содержит изменяемые или model-specific поля');
  excludes('scripts/ci/generate-intel-test-profiles.mjs', /\bevents\b|\bseasonality\b/, 'Генератор снова создаёт календарные TrackProfile поля');
  assert(!fs.existsSync(path.join(root, 'data/recommendation-calendar.json')), 'Праздничный recommendation-calendar удалён');
  excludes('src/PlayerCore.js', /enqueueNext|transientQueue|playNextQueue/, 'Transient queue внедрена до отдельного безопасного этапа');
  excludes('scripts/app/profile/carousel-flat.js', /oldTabs/, 'legacy oldTabs');
  ['buildStatsProjection', 'mergeProjectedStatsRow', 'projectionToStatsRows', 'commitDelta', "'events_hot'", "'events_warm'", 'schemaVersion: 5'].forEach(marker => contains(aggregator, marker));
  contains(aggregator, "metaDB.db.transaction(['stats', 'global', 'events_hot', 'events_warm'], 'readwrite')");
  excludes(aggregator, /updateStat\(|setGlobal\([^)]*\)[\s\S]{0,100}deleteEvents\(/, 'StatsAggregator снова выполняет неатомарную per-store materialization');
};
const validatePlaybackOwnershipFoundation = () => {
  const server = 'cloud-functions/vi3-signaling/index.js';
  const timezone = 'scripts/core/timezone-policy.js';
  [
    'timezone_policy_get',
    'timezone_policy_set',
    'account_device_list',
    'account_device_update',
    'account_device_initialize',
    'accountDeviceWasKnown',
    'accountDeviceInitializationRequired',
    'initializationPending',
    'inheritedFromDeviceId',
    'playback_state_get',
    'playback_claim',
    'playback_transfer_prepare',
    'playback_transfer_commit',
    'timezonePolicyKey',
    'accountDeviceKey',
    'playbackStateKey',
    'playbackTransferKey',
    'fencingTokenHash',
    'ownerEpoch',
    'alwaysConfirm'
  ].forEach(marker => contains(server, marker));
  ['getDeviceTimezoneContext', 'refreshTimezonePolicy', 'changeAccountTimezone', 'browser_confirmed'].forEach(marker => contains(timezone, marker));
  const deviceContext = 'scripts/core/device-context.js';
  ['getDeviceId', 'getDevicePlatform', 'isDevicePwa', 'getDeviceTimezone', 'getDeviceContextForServer'].forEach(marker => contains(deviceContext, marker));
  contains('scripts/core/social-session.js', 'getDeviceContextForServer');
  contains('scripts/core/social-session.js', 'playback_state_get');
  contains('scripts/analytics/listening-receipts.js', 'getDeviceContext');
  contains('scripts/app/pwa-install.js', 'getDevicePlatform');
  contains('scripts/app/push/loyalty-reminders.js', 'getDeviceId');
  contains(server, 'did: sessionDeviceId');
  const ownership = 'scripts/analytics/playback-ownership.js';
  const fence = 'scripts/analytics/playback-fence.js';
  ['claimPlaybackOwnership', 'claimPlaybackOwnershipInBackground', 'playback_transfer_prepare', 'playback_transfer_commit', 'single_device_fast_path', 'readOwnershipGrant'].forEach(marker => contains(ownership, marker));
  ['normalizePlaybackFenceGrant', 'buildPlaybackFencePayload', 'hasPlaybackFence'].forEach(marker => contains(fence, marker));
  excludes(fence, /window\.|localStorage|sessionStorage|fetch\(|requestSocialAction|playerCore/, 'Playback fence helper перестал быть pure');
  excludes(ownership, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted|load|setPlaylist|applyFavoritesOnlyFilter)\s*\(/, 'Ownership service обходит узкий PlayerCore API');
  contains(ownership, 'pauseForOwnershipTransfer');
  contains(ownership, 'authorizePlaybackStart');
  contains('src/PlayerCore.js', 'pauseForOwnershipTransfer');
  contains('src/PlayerCore.js', '_authorizePlaybackStart');
  excludes(timezone, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Timezone policy управляет playback');
  excludes('scripts/core/device-identity.js', /resolvedOptions\(\)\.timeZone|hardwareConcurrency|screen\.width|navigator\.platform/, 'Device ID зависит от fingerprint');
  assertNoMatch(['scripts/core/social-session.js', 'scripts/analytics/listening-receipts.js', 'scripts/app/pwa-install.js', 'scripts/app/push/loyalty-reminders.js', 'scripts/analytics/playback-ownership.js'], /localStorage\.getItem\(['"]deviceStableId['"]\)\s*\|\|\s*localStorage\.getItem\(['"]deviceHash['"]\)/g, 'Device context не дублируется вне канонического helper');
  contains('scripts/intel/roadmap.js', 'Single active playback owner');
  contains('scripts/intel/roadmap.js', 'No PIN transfer policy');
  contains('service-worker.js', 'PLAYBACK_OWNERSHIP_TRANSFERRED');
  contains('cloud-functions/vi3-webpush/index.js', 'targetDeviceId');
  contains(server, 'WEB_PUSH_LEASE_MS');
  contains(server, 'webPushEndpointKey');
  contains(server, 'removeDeviceWebPushSubscriptions');
  contains(server, 'transferredEndpoint');
  contains(server, 'kvDeleteIfPayload');
  contains(server, 'expected_payload_json');
  contains(server, 'sameGeneration');
  contains(server, 'RETURNING pk');
  excludes(server, /async function deleteWebPushSubscriptionRow[\s\S]{0,500}await kvDelete\(row\.pk\)/, 'Signaling Web Push cleanup снова использует unconditional delete');
  excludes(server, /previousSubscriptionKey[\s\S]{0,180}kvDelete\(previousSubscriptionKey\)/, 'Endpoint transfer снова удаляет старую подписку без payload fencing');
  contains('cloud-functions/vi3-webpush/index.js', 'subscriptionLeaseExpiresAt');
  contains('cloud-functions/vi3-webpush/index.js', 'expiredSubscriptionsDeleted');
  contains('cloud-functions/vi3-webpush/index.js', 'kvDeleteIfPayload');
  contains('cloud-functions/vi3-webpush/index.js', 'expected_payload_json');
  contains('cloud-functions/vi3-webpush/index.js', 'safe(index.subscriptionKey) === safe(row.pk)');
  excludes('cloud-functions/vi3-webpush/index.js', /async function kvDelete\(pk\)/, 'Web Push снова использует unconditional delete');
  contains('scripts/app/push/web-push.js', 'refreshExistingWebPushLease');
  contains('scripts/app/push/web-push.js', 'LEASE_REFRESH_MS');
  contains('cloud-functions/vi3-signaling/index.js', "kind: 'PLAYBACK_TRANSFERRED'");
  contains('scripts/ci/generate-listen-catalog.mjs', 'trackVersion');
  contains('scripts/ci/generate-listen-catalog.mjs', "createHash('sha256')");
  contains('scripts/ci/generate-listen-catalog.mjs', "trackLines.join('\\n')");
  contains('scripts/ci/generate-listen-catalog.mjs', 'listen-track-catalog.function-env.json');
  contains(server, 'LISTEN_TRACK_CATALOG_ALBUM_');
  contains(server, 'playbackTrackFromCatalog');
  contains(server, 'catalogSourceStats');
  contains(server, 'catalogReady');
  contains(server, 'rateLimitBucket');
  contains(server, 'getPlaybackCoordinationState');
  contains(server, 'getActiveAccountPeerDevices');
  contains(server, 'ACCOUNT_DEVICE_ACTIVE_MS');
  excludes(server, /PLAYBACK_DEVICE_ACTIVE_MS/, 'Playback снова получил отдельную копию active-device window');
  excludes(server, /const prefix = `rate:\$\{cleanScope\}:\$\{actorHash\}:\$\{bucket\}:`/, 'Rate limiter снова использует row-per-hit prefix');
  contains(ownership, 'isPlaybackCoordinationRequired');
  contains('scripts/core/social-session.js', 'playbackCoordination');
  contains('scripts/core/social-session.js', 'markPlaybackCoordinationRequired');
  contains('scripts/core/social-session.js', 'serializedPlaybackActions');
  contains('scripts/core/social-session.js', 'playbackWriteQueue');
  contains('scripts/analytics/playback-ownership.js', 'passiveClaimGeneration');
  contains('scripts/analytics/playback-ownership.js', 'passiveClaimIntents');
  contains('scripts/analytics/playback-ownership.js', '4500 : 1800');
  excludes(ownership, /listen-track-catalog\.env\.json|getTrackVersion|catalogPromise/, 'Ownership снова содержит клиентский trackVersion catalog');
  excludes(server, /requestedVersion\s*&&\s*requestedVersion\s*!==\s*track\.trackVersion/, 'Playback claim снова блокируется устаревшей клиентской версией каталога');
  excludes(ownership, /const version = safe\(trackVersion\) \|\| await getTrackVersion\(uid\)/, 'Ownership claim снова зависит от клиентского trackVersion');
  contains('service-worker.js', './scripts/analytics/playback-fence.js');
  excludes(server, /expectedRevision:\s*state\.revision/, 'Неиспользуемый expectedRevision остался в transfer record');
  excludes(server, /const fencingToken = base64url\(crypto\.randomBytes\(32\)\);\s*const suppliedFencingToken[\s\S]{0,300}const fencingToken =/, 'Повторное объявление fencingToken');
  ['buildPlaybackFencePayload', 'ownershipFields'].forEach(marker => contains('scripts/analytics/listening-receipts.js', marker));
  contains('scripts/analytics/playback-ownership.js', 'buildPlaybackFencePayload');
  contains('scripts/analytics/playback-ownership.js', 'releasePlaybackOwnership');
  contains('scripts/analytics/playback-ownership.js', 'getLogicalListenDiagnostics');
  ['account_device_list', 'account_device_update', 'takeoverEnabled', 'remotePauseEnabled', 'alwaysConfirm', 'initializationPending', 'inheritedFromDeviceId', 'retryAt'].forEach(marker => contains('scripts/app/profile/account-devices-view.js', marker));
  excludes('scripts/app/profile/account-devices-view.js', /\.catch\(\(\)\s*=>\s*rerender\?\.\(\)\)/, 'Ошибка account_device_list снова создаёт бесконечный rerender/request loop');
  ['resolveAccountDeviceInitialization', 'account_device_initialize', 'account_device_list', 'accountDevicesAreCompatible', "mode: 'new'", "mode: 'inherit'"].forEach(marker => contains('scripts/app/profile/account-device-initialization.js', marker));
  excludes('scripts/core/yandex-auth.js', /auth-onboarding-orchestrator|startPreload|runOnboardingFlow|NEW_DEVICE_CONFIRMED_KEY/, 'Yandex Auth продолжает запускать legacy restore onboarding');
  excludes('scripts/core/yandex-auth.js', /yandexId\s*:\s*yandexId|yandexId\s*:\s*yId/, 'Raw Yandex ID записывается в AUTH_EVENT');
  contains('service-worker.js', './scripts/app/profile/account-device-initialization.js');
  contains('scripts/app/playback-return-ui.js', 'Вернуть сюда');
  contains('scripts/app/playback-return-ui.js', 'window.playerCore?.play?.()');
  excludes('scripts/app/playback-return-ui.js', /\.(pause|stop|seek|next|prev|setVolume|setMuted|load|setPlaylist)\s*\(/, 'Return UI управляет playback помимо явного Play');
  contains('service-worker.js', './scripts/app/playback-return-ui.js');
  contains('src/PlayerCore.js', "releaseOwnership: false");
  assertNoMatch([...listFiles('scripts').filter(file => !file.startsWith('scripts/ci/')), ...listFiles('src')], /dormant playback ownership|Dormant ownership service/g, 'Устаревшие комментарии пассивного ownership удалены');
  ['requirePlaybackFence', 'renewPlaybackFence', 'closeActiveListenSegment', 'playback_owner_changed', 'playback_release', 'logical_listen_get', 'account_device_current_revoke_forbidden', 'logicalListenKey', 'syncLogicalListenSession', 'finalizeLogicalListen', 'mergeLogicalCoverageIntervals', 'fromPositionMs', 'toPositionMs', "receiptKind: 'logical_full'", 'accountTimezoneRevision', 'listenZonedParts'].forEach(marker => contains(server, marker));
  excludes(server, /const legacyKey = listenActiveKey\(playerId\)/, 'Legacy listenActive:<playerId> lookup остался');
  excludes(server, /activeSessions:\s*activeSessions\.map/, 'Legacy activeSessions остался в reward status');
  excludes(server, /history\.deviceId[\s\S]{0,300}listenActiveKey\(playerId,\s*history\.deviceId\)/, 'History-device fallback остался');
  excludes(server, /!data\.logicalSessionId\s*&&\s*data\.completionReason\s*===\s*['"]ended['"]/, 'Per-device full calculation остался');
};
const validatePlaybackBoundaries = () => {
  const protectedFiles = [...listFiles('scripts/app/games'), ...listFiles('scripts/app/friends'), ...listFiles('scripts/intel')];
  assertNoMatch(protectedFiles, /playerCore(?:\?\.|\.)\s*(play|pause|stop|seek|next|prev|setVolume|setMuted|load|setPlaylist|applyFavoritesOnlyFilter)\s*\(/g, 'Games, Friends или Intel мутируют PlayerCore');
  assertNoMatch([...protectedFiles, ...listFiles('scripts/analytics')], /new\s+Howl\s*\(/g, 'Найден вторичный владелец Howl');
  ['player:transportReloaded', 'previousUid', '_loadReq'].forEach(marker => contains('src/PlayerCore.js', marker));
  contains('scripts/analytics/playback-ownership.js', 'single_device_fast_path');
  contains('scripts/analytics/playback-ownership.js', 'claimPlaybackOwnershipInBackground');
};
const validateLoyaltyReleaseD = () => {
  const server = 'cloud-functions/vi3-signaling/index.js';
  const scheduler = 'cloud-functions/vi3-loyalty-reminder/index.js';
  const webpush = 'cloud-functions/vi3-webpush/index.js';
  [
    'const LOYALTY_VERSION = 2',
    'LOYALTY_VACATION_ALLOWANCE_MS',
    'LOYALTY_VACATION_WINDOW_MS',
    'LOYALTY_DUE_BUCKET_MS',
    'LOYALTY_REMINDER_BEFORE_MS',
    'loyaltyWindowIndex',
    'loyaltyWindowSnapshot',
    'activityAccounted',
    'nextBoundaryAt',
    'nextMilestoneAt',
    'currentDayRewardAmount',
    'materializeLoyaltyVacation',
    'syncLoyaltyDueIndex',
    'actionLoyaltyPreferenceSet',
    'actionLoyaltyVacationSet',
    'actionLoyaltyDueRun',
    'loyalty_preference_set',
    'loyalty_vacation_set',
    'loyalty_due_run'
  ].forEach(marker => contains(server, marker));
  assert(/kvPrefixOrdered\(\s*['"]loyaltyDue:['"]\s*,/.test(read(server)), 'Release D scheduler читает ordered loyalty due-index');
  assert(/const\s+LOYALTY_REMINDER_BEFORE_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/.test(read(server)), 'Преданность: напоминание за один час');
  assertNoMatch([server], /deadlineAt:\s*at\s*\+\s*LOYALTY_WINDOW_MS/g, 'Преданность не сдвигает дедлайн каждой активностью');
  assertNoMatch([server], /LOYALTY_ADVANCE_MIN_MS|LOYALTY_NORMAL_REMINDER_BEFORE_MS/g, 'Удалена старая плавающая loyalty-логика');
  contains('scripts/app/profile/loyalty-card.js', 'data-ach="loyalty"');
  contains('scripts/app/profile/loyalty-card.js', 'activityAccounted');
  contains('scripts/app/profile/loyalty-card.js', 'за один час');
  ['LOYALTY_REMINDER', 'LOYALTY_VACATION_ENDING', 'LOYALTY_VACATION_ENDED'].forEach(marker => contains(server, marker));
  ['notificationTtl', 'notificationUrgency', "kind: safe(body.kind || '')"].forEach(marker => contains(webpush, marker));
  ["action: 'loyalty_due_run'", "'X-Vi3-Scheduler': SCHEDULER_SECRET", 'limit: 50'].forEach(marker => contains(scheduler, marker));
  ['setLoyaltyReminderEnabled', 'setLoyaltyVacationEnabled'].forEach(marker => contains('scripts/app/push/loyalty-reminders.js', marker));
  contains('scripts/app/profile/loyalty-card.js', 'renderLoyaltyCard');
  contains('service-worker.js', "target.searchParams.set('openLoyalty', '1')");
  assert(/p\.get\(['"]openLoyalty['"]\)\s*===\s*['"]1['"]/.test(read('scripts/app.js')), 'App обрабатывает openLoyalty=1');
  assertNoMatch(['scripts/app/push/loyalty-reminders.js', 'scripts/app/profile/loyalty-card.js', scheduler], /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/g, 'Release D не управляет playback');
};
const validateBackupProxy = () => {
  const proxy = 'cloud-functions/vi3na1bita-backup-proxy/index.js';
  const signaling = 'cloud-functions/vi3-signaling/index.js';

  ['backup_device_authorize', 'actionBackupDeviceAuthorize', 'account_device_initialize', 'actionAccountDeviceInitialize', 'account_device_initialization_class_mismatch', 'accountDeviceWasKnown', 'accountDevicePreviousLastSeenAt', 'initializationPending', 'inheritedFromDeviceId', 'backup_device_session_required', 'backup_device_identity_mismatch', 'backup_device_not_registered', 'backup_device_revoked', 'backup_owner_identity_mismatch', 'ownerYandexIdHash', 'server_account_device'].forEach(marker => contains(signaling, marker));

  [
    'BACKUP_AUTHORITY_URL',
    'X-Vi3-Session',
    'x-yandex-auth',
    'backup_device_authorize',
    'v7_sync',
    'watermarks',
    'pushRanges',
    'settingsTemplateDeviceId',
    'backup_device_initialization_required',
    'overwrite=false',
    'immutable_range_conflict',
    'range_sequence_not_contiguous',
    'range_event_hash_mismatch',
    'backup_oauth_social_owner_mismatch',
    'ownerYandexIdHash',
    'legacyEnabled: false'
  ].forEach(marker => contains(proxy, marker));
  ['usageStorage', 'authorityCalls', 'diskApiCalls', 'diskOperations', 'networkCalls', 'requestBytes', 'responseBytes', 'redirects', 'responseBytesFinal', 'disk_space_exhausted'].forEach(marker => contains(proxy, marker));
  contains('scripts/analytics/backup-sync-engine.js', 'disk_access_unavailable');
  contains('scripts/analytics/backup-sync-engine.js', 'disk_space_exhausted');
  contains('scripts/analytics/backup-sync-engine.js', 'DISK_FULL_RETRY_MS');
  contains('scripts/analytics/backup-sync-engine.js', 'getBackupV7Availability');
  assertNoMatch([proxy], /upload_backup|upload_meta|upload_event_segment|archive_delete_segments|archive_inspect|ledger_verify|lease_acquire|lease_release/g, 'Backup proxy не содержит v6, archive, ledger или lease modes');
  assertNoMatch([proxy], /['"]v7_authorize['"]|['"]v7_push_range['"]|['"]v7_pull_ranges['"]|['"]v7_put_settings['"]|['"]v7_get_settings['"]/g, 'Раздельные v7 proxy modes удалены');
  contains(proxy, "ALLOWED_MODES = new Set(['ping', 'v7_sync'])");
  contains('scripts/analytics/backup-v7-sync.js', 'readBackupV7JournalEvents');
  contains('scripts/app/profile/logs-view.js', 'JOURNAL_DAY_COUNT = 30');
  contains('scripts/app/profile/logs-view.js', 'getJournalDayWindow');
  contains('scripts/app/profile/logs-view.js', 'analytics:eventQueued');
  contains('scripts/app/profile/logs-view.js', 'data-log-top');
  contains('scripts/app/profile/logs-formatters.js', 'journalTimezone');
  contains('scripts/app/profile/logs-formatters.js', '30 полных календарных дней');
  contains('scripts/app/profile/logs-formatters.js', 'data-log-domain');
  contains('scripts/app/profile/logs-formatters.js', 'activity-filter-row');
  excludes('scripts/app/profile/logs-formatters.js', /ach-classic-tabs/, 'Журнал снова использует неудобную карусель вкладок');
  contains('cloud-functions/vi3-signaling/index.js', 'LISTEN_SHORT_COMPLETION_MS');
  contains('cloud-functions/vi3-signaling/index.js', 'shouldFinalizeLogical');
  contains('cloud-functions/vi3-signaling/index.js', 'publicAchievementProgressCompact');
  contains('scripts/analytics/listening-receipts.js', 'STATUS_MAX_AGE_MS = 6 * 60 * 60 * 1000');
  contains('scripts/analytics/backup-sync-engine.js', 'clearBackupV7Dirty');
  assertNoMatch([proxy], /searchParams\.set\(\s*['"]token['"]/g, 'OAuth token не помещается в query string');
  assertNoMatch([proxy], /overwrite=true[^'"]*range_|range_[^'"]*overwrite=true/g, 'Immutable range не загружается с overwrite=true');
  assertNoMatch([proxy], /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/g, 'Backup proxy управляет playback');
};
const validateCloudFunctionFiles = () => {
  ['vi3-signaling', 'vi3na1bita-backup-proxy', 'vi3-webpush', 'vi3-loyalty-reminder'].forEach(name => {
    const indexPath = `cloud-functions/${name}/index.js`;
    const packagePath = `cloud-functions/${name}/package.json`;
    const source = read(indexPath);
    assert(!source.includes('FILE: /package.json'), `${indexPath}: package.json не склеен с index.js`);
    try {
      const value = JSON.parse(read(packagePath));
      assert(value && typeof value === 'object' && !Array.isArray(value), `${packagePath}: корректный JSON object`);
      assert(!value.main || value.main === 'index.js', `${packagePath}: main=index.js`);
      if (['vi3-signaling', 'vi3-webpush'].includes(name)) {
        assert(value.dependencies?.['@yandex-cloud/nodejs-sdk'] === '2.6.0', `${packagePath}: установлен metadata auth SDK для ydb-sdk 5.9.0`);
        assert(source.includes('YDB_METADATA_AUTH_MODULE'), `${indexPath}: объявлен metadata auth runtime probe`);
        assert(source.includes('ydbMetadataAuthAvailable'), `${indexPath}: metadata auth health опубликован в ping`);
        assert(source.includes('ydb_metadata_auth_dependency_missing'), `${indexPath}: отсутствующая metadata dependency даёт понятную ошибку`);
      }
    } catch (error) {
      failures.push(`${packagePath}: ${error.message}`);
    }
  });
};
const validateRemovedRuntimeFiles = () => {
  [
    'scripts/analytics/playlists-storage-merge.js',
    'scripts/analytics/storage-merge-utils.js',
    'scripts/analytics/tombstone-contract.js',
    'scripts/analytics/trust-state.js',
    'scripts/app/profile/settings-conflict-section.js',
    'scripts/app/profile/trust-check-modal.js',
    'scripts/intel/recs/rediscovery.js',
    'scripts/intel/track/track-relations.js'
  ].forEach(relative => {
    assert(!fs.existsSync(path.join(root, relative)), `${relative}: удалённый runtime-файл не возвращён`);
  });
};

const validateWorkflows = () => {
  const workflows = listFiles('.github/workflows');
  assertNoMatch(workflows, /node-version:\s*['"]?20['"]?/g, 'Workflow с Node.js 20 отсутствуют');
  assertNoMatch(workflows, /actions\/(checkout|setup-node)@v4/g, 'Legacy GitHub Actions v4 отсутствуют');
  ["node-version: '24'", 'npm install --no-save @playwright/test@1.55.0', 'playwright.config.js --grep-invert "@remote"', 'playwright.config.js --grep "@remote"', 'continue-on-error: true', 'cancel-in-progress: true'].forEach(marker => contains('.github/workflows/e2e.yml', marker));
  [
    "require.resolve('ydb-sdk')",
    'findPackageRoot',
    'transaction-contract.json',
    'transaction-signatures.txt',
    'transaction-sources',
    'beginTransaction',
    'commitTransaction',
    'rollbackTransaction',
    'serializableReadWrite',
    'if: always()'
  ].forEach(marker => contains('.github/workflows/probe-ydb-sdk.yml', marker));
  excludes('.github/workflows/probe-ydb-sdk.yml', /require\.resolve\(['"]ydb-sdk\/package\.json['"]\)/, 'YDB probe снова обращается к запрещённому package subpath');
};
const main = async () => {
  const server = 'cloud-functions/vi3-signaling/index.js';
  await validateAchievements();
  validateListening();
  contains(server, "const TABLE = `${CFG.prefix}kv_v2`");
  assert(/\\?`expires_at\\?`\s+Timestamp\b/.test(read(server)), 'YDB schema: expires_at имеет тип Timestamp');
  contains(server, 'TTL = Interval("PT0S") ON expires_at');
  contains(server, 'DateTime::FromMilliseconds');
  contains(server, 'DateTime::ToMilliseconds');
  excludes(server, /`expires_at`\s+Uint64/, 'Новая YDB schema снова использует Uint64 expires_at');
  contains('cloud-functions/vi3-webpush/index.js', "const TABLE = `${CFG.prefix}kv_v2`");
  validateRewards();
  excludes('scripts/analytics/achievements-dict.js', /["']backup_saves["']/, 'Достижение за технический backup осталось в словаре');
  excludes('cloud-functions/vi3-signaling/index.js', /backup_achievement_receipt|actionBackupAchievementReceipt|backupReceiptIds|backupSaves|CFG\.backupRewardsShadow|CFG\.backupReceiptSecret/, 'Legacy backup achievement contour остался в signaling');
  validatePwaAndLegacy();
  validateDataBoundaries();
  contains('scripts/app/profile/account-bindings.js', "'😎'");
  contains('scripts/app/profile/account-bindings.js', "'🎧'");
  contains('scripts/app/profile/account-bindings.js', "'💔'");
  assertNoMatch(['scripts/app/profile/account-bindings.js'], /'🎸'|'🦄'|'🦇'|'👽'|'🤖'|'🐱'|'🦊'|'🐼'|'🔥'|'💎'|'🎵'|'🌟'|'🦁'|'🐯'|'🎮'|'🎤'|'🎹'|'🥁'|'🎺'/g, 'Удалённые бесплатные аватары отсутствуют в picker');
  contains('scripts/app/profile/account-bindings.js', 'purchased.map(item => item.avatar)');
  contains('scripts/app/profile/account-bindings.js', "import('../shards/wallet-service.js')");
  contains('scripts/app/profile/account-bindings.js', 'shardWallet.refresh()');
  validateRecommendationsAndStats();
  validatePlaybackOwnershipFoundation();
  validatePlaybackBoundaries();
  excludes('scripts/app.js', /armRestorePlaybackGesture|restore-gesture\.js/, 'App снова запускает playback по произвольному жесту');
  assert(!fs.existsSync(path.join(root, 'scripts/app/player/restore-gesture.js')), 'Generic restore gesture удалён');
  validateLoyaltyReleaseD();
  validateBackupProxy();
  validateBackupAnalytics({ contains, excludes, assertNoMatch, listFiles });
  contains('scripts/app/profile/settings-console-section.js', 'data-cloud-console-export');
  contains('scripts/app/profile/settings-console-section.js', 'data-cloud-console-copy');
  contains('scripts/core/social-session.js', 'single_flight_join');
  contains('scripts/core/social-session.js', 'server_backoff');
  contains('scripts/app/profile/settings-console-section.js', 'cloud-usage-console');
  contains('scripts/app/profile/settings-view.js', 'data-set-tab="console"');
  contains('scripts/analytics/favorite-mirror.js', 'scheduleFlush');
  contains('scripts/analytics/favorite-mirror.js', 'DIRTY_FLUSH_MS');
  contains('scripts/analytics/favorite-mirror.js', 'REMOTE_MAX_AGE_MS');
  contains('scripts/analytics/favorite-mirror.js', 'remoteIsFresh');
  excludes('scripts/analytics/favorite-mirror.js', /setInterval\([\s\S]{0,160}(?:favorite|sync)/, 'Favorite Mirror снова содержит постоянный poll');
  excludes('scripts/analytics/favorite-mirror.js', /startPolling\s*\(/, 'Мёртвый Favorite Mirror polling facade снова добавлен');
  contains('scripts/offline/update-checker.js', 'isAppQuiet');
  contains('scripts/analytics/backup-sync-engine.js', 'isAppQuiet');
  contains('scripts/core/config.js', 'OFFLINE_UPDATE_CHECKER_ENABLED: false');
  contains('scripts/core/config.js', 'OFFLINE_RECACHE_ENABLED: false');
  contains('scripts/app/friends/friends-block.js', 'recoverPendingPushes');
  contains('scripts/app/friends/friends-block.js', 'invalidateFriendsSnapshot');
  contains('service-worker.js', 'PUSH_NOTIFICATION_RECEIVED');
  contains('cloud-functions/vi3-signaling/index.js', 'friends_snapshot');
  contains('cloud-functions/vi3-signaling/index.js', 'actionFriendsSnapshot');
  contains('cloud-functions/vi3-signaling/index.js', 'readFriendItems');
  contains('cloud-functions/vi3-signaling/index.js', 'readPresenceForFriendIds');
  contains('cloud-functions/vi3-signaling/index.js', 'usageStorage');
  contains('cloud-functions/vi3-signaling/index.js', 'queryCount');
  contains('cloud-functions/vi3-signaling/index.js', 'casAttempts');
  contains('cloud-functions/vi3-signaling/index.js', 'casConflicts');
  contains('cloud-functions/vi3-signaling/index.js', 'internalWebPushCalls');
  contains('scripts/core/cloud-usage-meter.js', 'serverUsage');
  contains('scripts/core/cloud-usage-meter.js', 'serverDurationMs');
  excludes('scripts/core/app-activity.js', /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Activity controller управляет playback');
  excludes('scripts/core/cloud-usage-meter.js', /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Cloud usage meter управляет playback');
  validateRemovedRuntimeFiles();
  validateCloudFunctionFiles();
  validateWorkflows();
  if (failures.length) {
    console.error('\n❌ Нарушения контрактов:\n');
    failures.forEach((failure, index) => {
      console.error(`${index + 1}. ${failure}`);
    });
    process.exit(2);
  }
  console.log(`\n✅ Все application contracts прошли: ${checks} проверок`);
};
main().catch(error => {
  console.error('\n❌ validate-contracts crashed:', error?.stack || error);
  process.exit(2);
});

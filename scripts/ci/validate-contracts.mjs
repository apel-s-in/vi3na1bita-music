#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const failures = [];
const read = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: файл не найден`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};
const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ ${message}`);
  } else {
    failures.push(message);
  }
};
const contains = (relative, marker) => {
  const found = read(relative).includes(marker);
  if (found) {
    console.log(`✅ ${relative}: найден ${marker}`);
  } else {
    failures.push(`${relative}: отсутствует ${marker}`);
  }
};
const excludes = (relative, pattern, message) => {
  const source = read(relative);
  pattern.lastIndex = 0;
  const found = pattern.test(source);
  if (!found) {
    console.log(`✅ ${relative}: нарушение отсутствует — ${message}`);
  } else {
    failures.push(`${relative}: ${message}`);
  }
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
  contains('scripts/analytics/confirmed-listening-stats.js', 'resolveListeningStatsViewModel');
  contains('scripts/analytics/temporal-buckets.js', 'splitTemporalInterval');
  contains('scripts/analytics/session-tracker.js', 'creditedSegments');
  assertNoMatch(['scripts/app/profile/model.js', 'scripts/app/profile/stats-view.js', 'scripts/app/profile/live-bindings.js', 'scripts/ui/statistics-modal.js'], /getCanonicalFullListenCount/g, 'Legacy local/server full-count selector удалён');
  assert(/resolveListenSessionRow\(\s*playerId,\s*sessionId,\s*body\.deviceId\s*\)/.test(read(server)), 'Listening heartbeat использует direct per-device lookup');
  const finalizeStart = read(server).indexOf('async function finalizeListenSession(session)');
  const duplicateCheck = read(server).indexOf('if (oldReceipt.progressApplied === true)', finalizeStart);
  const timeApply = read(server).indexOf('await applyVerifiedListenTimeProgress(data);', finalizeStart);
  assert(finalizeStart >= 0 && duplicateCheck > finalizeStart && timeApply > duplicateCheck, 'Completion проверяет постоянный receipt до применения времени');
  assert(/listenedSeconds\s*>=\s*25/.test(read('scripts/analytics/session-tracker.js')), 'Valid listen: 25 секунд');
  assert(/liveAccumulatedMs\s*\/\s*1000\)\s*>=\s*25/.test(read('scripts/analytics/live-stats.js')), 'Live streak: 25 секунд');
  ['const LISTEN_VALID_MIN_SEC = 25', 'totalListenMs', 'listenTimeBySession', 'applyVerifiedListenTimeProgress', 'buildFullListenRewards', 'buildTimeRewards', 'data.continuityBroken !== true', 'Math.floor(data.duration * 0.95)'].forEach(marker => contains(server, marker));
  assertNoMatch([...listFiles('scripts/analytics'), server], /listenedSeconds\s*>=\s*13|Засчитывается\s*≥13\s*сек|Math\.max\(\s*13\s*,/g, 'Старый порог 13 секунд отсутствует');
  excludes(receipts, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'listening receipts управляет playback');
};
const validateRewards = () => {
  const engine = 'scripts/analytics/achievement-engine.js';
  ['_requiresServerVerification', 'legacy_local_unverified', 'getCompletedCount', '_hasScalableLevel', 'server_wallet'].forEach(marker => contains(engine, marker));
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
  ['pwa_install_intent', 'pwa_launch_verify', 'display-mode: standalone'].forEach(marker => contains(pwa, marker));
  excludes(pwa, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'PWA bridge управляет playback');
  const applicationFiles = [...listFiles('scripts').filter(file => !file.startsWith('scripts/ci/') && !file.startsWith('scripts/e2e/')), ...listFiles('data')];
  assertNoMatch(applicationFiles, /socials_all_visited|socialVisitAll|social_visit_all|Подписчик всего/g, 'Удалённое социальное достижение отсутствует');
  assertNoMatch([...listFiles('scripts').filter(file => !file.startsWith('scripts/ci/')), 'service-worker.js'], /verified-achievement-state|verified-achievements-view|claim_prepare|claim_validate|claim_index|achievement_verify/g, 'Удалённый backup claim contour отсутствует');
};
const validateDataBoundaries = () => {
  const account = 'scripts/analytics/account-data-boundary.js';
  const favorite = 'scripts/analytics/favorite-state-contract.js';
  const mirror = 'scripts/analytics/favorite-mirror.js';
  ['Vi3AccountVault_v1', 'eventLedger:chainId:v1', 'favoriteMirror:outbox:v1', 'listeningReceipts:completionOutbox:v1', 'adoptLocalData'].forEach(marker => contains(account, marker));
  ['normalizeFavoriteItem', 'favoriteClock', 'favoriteStatus', 'mergeFavoritePair', 'remoteToLocal', 'localToRemote', 'favoriteSignature'].forEach(marker => contains(favorite, marker));
  ['favorite_state_get', 'favorite_state_mutate', 'favorite_state_reconcile'].forEach(marker => contains(mirror, marker));
  excludes(account, /\.(play|pause|stop|seek|setVolume|setMuted)\s*\(/, 'Account vault управляет playback');
  assertNoMatch([favorite, mirror], /\.(play|pause|stop|seek|next|prev|setVolume|setMuted|applyFavoritesOnlyFilter)\s*\(/g, 'Favorite contract или mirror управляет playback');
};
const validateRecommendationsAndStats = () => {
  contains('scripts/app/profile/recs-view.js', 'stableScore');
  excludes('scripts/app/profile/recs-view.js', /sort\(\s*\(\)\s*=>\s*Math\.random/, 'случайный comparator рекомендаций');
  excludes('scripts/app/profile/carousel-flat.js', /oldTabs/, 'legacy oldTabs');
  ['const activeDays = new Set', 'if (lSec > 0)', 's.globalListenSeconds += lSec', 'calculateStreakSummary'].forEach(marker => contains('scripts/analytics/stats-aggregator.js', marker));
};
const validatePlaybackOwnershipFoundation = () => {
  const server = 'cloud-functions/vi3-signaling/index.js';
  const timezone = 'scripts/core/timezone-policy.js';
  [
    'timezone_policy_get',
    'timezone_policy_set',
    'account_device_list',
    'account_device_update',
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
  ['claimPlaybackOwnership', 'playback_transfer_prepare', 'playback_transfer_commit', 'getTrackVersion', 'readOwnershipGrant'].forEach(marker => contains(ownership, marker));
  excludes(ownership, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted|load|setPlaylist|applyFavoritesOnlyFilter)\s*\(/, 'Dormant ownership service управляет playback');
  excludes(timezone, /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/, 'Timezone policy управляет playback');
  excludes('scripts/core/device-identity.js', /resolvedOptions\(\)\.timeZone|hardwareConcurrency|screen\.width|navigator\.platform/, 'Device ID зависит от fingerprint');
  assertNoMatch(['scripts/core/social-session.js', 'scripts/analytics/listening-receipts.js', 'scripts/app/pwa-install.js', 'scripts/app/push/loyalty-reminders.js', 'scripts/analytics/playback-ownership.js'], /localStorage\.getItem\(['"]deviceStableId['"]\)\s*\|\|\s*localStorage\.getItem\(['"]deviceHash['"]\)/g, 'Device context не дублируется вне канонического helper');
  contains('scripts/intel/roadmap.js', 'Single active playback owner');
  contains('scripts/intel/roadmap.js', 'No PIN transfer policy');
  contains('service-worker.js', 'PLAYBACK_OWNERSHIP_TRANSFERRED');
  contains('cloud-functions/vi3-webpush/index.js', 'targetDeviceId');
  contains('cloud-functions/vi3-signaling/index.js', "kind: 'PLAYBACK_TRANSFERRED'");
  contains('scripts/ci/generate-listen-catalog.mjs', 'trackVersion');
  contains('scripts/ci/generate-listen-catalog.mjs', "createHash('sha256')");
};
const validatePlaybackBoundaries = () => {
  const protectedFiles = [...listFiles('scripts/app/games'), ...listFiles('scripts/app/friends'), ...listFiles('scripts/intel')];
  assertNoMatch(protectedFiles, /playerCore(?:\?\.|\.)\s*(play|pause|stop|seek|next|prev|setVolume|setMuted|load|setPlaylist|applyFavoritesOnlyFilter)\s*\(/g, 'Games, Friends или Intel мутируют PlayerCore');
  assertNoMatch([...protectedFiles, ...listFiles('scripts/analytics')], /new\s+Howl\s*\(/g, 'Найден вторичный владелец Howl');
  ['player:transportReloaded', 'previousUid', '_loadReq'].forEach(marker => contains('src/PlayerCore.js', marker));
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
  ['LOYALTY_REMINDER', 'LOYALTY_VACATION_ENDING', 'LOYALTY_VACATION_ENDED', 'notificationTtl', 'notificationUrgency'].forEach(marker => contains(webpush, marker));
  ["action: 'loyalty_due_run'", "'X-Vi3-Scheduler': SCHEDULER_SECRET", 'limit: 50'].forEach(marker => contains(scheduler, marker));
  ['setLoyaltyReminderEnabled', 'setLoyaltyVacationEnabled'].forEach(marker => contains('scripts/app/push/loyalty-reminders.js', marker));
  contains('scripts/app/profile/loyalty-card.js', 'renderLoyaltyCard');
  contains('service-worker.js', "target.searchParams.set('openLoyalty', '1')");
  contains('scripts/app.js', "p.get('openLoyalty')==='1'");
  assertNoMatch(['scripts/app/push/loyalty-reminders.js', 'scripts/app/profile/loyalty-card.js', scheduler], /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/g, 'Release D не управляет playback');
};
const validateBackupProxy = () => {
  const proxy = 'cloud-functions/vi3na1bita-backup-proxy/index.js';
  const transport = 'scripts/core/yandex-disk-transport.js';
  const archiveTransport = 'scripts/core/yandex-event-archive-disk.js';
  ['requestContext?.http?.method', 'requestContext?.httpMethod', "method === 'OPTIONS'", 'x-yandex-auth', 'upload_backup', 'upload_event_segment', 'archive_delete_segments', 'backup_achievement_receipt'].forEach(marker => contains(proxy, marker));
  assert(/const\s+mode\s*=\s*requestedMode\s*\|\|\s*['"]ping['"]/.test(read(proxy)), 'Backup proxy: корневой вызов является ping');
  contains(transport, "'X-Yandex-Auth':token");
  contains(archiveTransport, "'X-Yandex-Auth':token");
  contains(transport, 'PROXY_UPLOAD_MAX_BYTES');
  contains(transport, 'upload_proxy_payload_too_large');
  contains('scripts/analytics/backup-upload-runner.js', 'proxyUploadBodyBytes');
  contains('scripts/analytics/backup-upload-runner.js', 'CLOUD_UPLOAD_BODY_BUDGET_BYTES');
  contains('scripts/analytics/backup-upload-runner.js', 'requiredEvents');
  contains('scripts/analytics/backup-upload-runner.js', 'tailCandidates');
  assertNoMatch([transport, archiveTransport], /searchParams\.set\(\s*['"]token['"]/g, 'OAuth token не помещается в proxy query string');
  assert(/export\s+const\s+authHeaders\s*=\s*t\s*=>\s*\(\{\s*Authorization:/.test(read(transport)), 'Authorization сохранён только для прямого Yandex Disk API');
  assertNoMatch([proxy], /event\.httpMethod\s*!==\s*['"]POST['"]/g, 'Backup proxy использует нормализованный HTTP method');
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
    } catch (error) {
      failures.push(`${packagePath}: ${error.message}`);
    }
  });
};
const validateWorkflows = () => {
  const workflows = listFiles('.github/workflows');
  assertNoMatch(workflows, /node-version:\s*['"]?20['"]?/g, 'Workflow с Node.js 20 отсутствуют');
  assertNoMatch(workflows, /actions\/(checkout|setup-node)@v4/g, 'Legacy GitHub Actions v4 отсутствуют');
  ["node-version: '24'", 'npm install --no-save @playwright/test@1.55.0', 'playwright.config.js --grep-invert "@remote"', 'playwright.config.js --grep "@remote"', 'continue-on-error: true', 'cancel-in-progress: true'].forEach(marker => contains('.github/workflows/e2e.yml', marker));
};
const main = async () => {
  await validateAchievements();
  validateListening();
  validateRewards();
  validatePwaAndLegacy();
  validateDataBoundaries();
  validateRecommendationsAndStats();
  validatePlaybackOwnershipFoundation();
  validatePlaybackBoundaries();
  validateLoyaltyReleaseD();
  validateBackupProxy();
  validateCloudFunctionFiles();
  validateWorkflows();
  if (failures.length) {
    console.error('\n❌ Нарушения контрактов:\n');
    failures.forEach((failure, index) => {
      console.error(`${index + 1}. ${failure}`);
    });
    process.exit(2);
  }
  console.log('\n✅ Все application contracts прошли');
};
main().catch(error => {
  console.error('\n❌ validate-contracts crashed:', error?.stack || error);
  process.exit(2);
});

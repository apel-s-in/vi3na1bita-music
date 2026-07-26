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
  assert(
    read(relative).includes(marker),
    `${relative}: отсутствует ${marker}`
  );
};

const excludes = (relative, pattern, message) => {
  assert(!pattern.test(read(relative)), `${relative}: ${message}`);
};

const listFiles = directory => {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];

  const files = [];
  const stack = [base];

  while (stack.length) {
    const current = stack.pop();

    for (const entry of fs.readdirSync(current, {
      withFileTypes: true
    })) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'vendor'
      ) {
        continue;
      }

      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(
          path.relative(root, absolute).replace(/\\/g, '/')
        );
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

  assert(
    matches.length === 0,
    matches.length
      ? `${message}: ${matches.join(', ')}`
      : message
  );
};

const importAchievementDictionary = async () => {
  const source = read(
    'scripts/analytics/achievements-dict.js'
  );
  const url = `data:text/javascript;base64,${
    Buffer.from(source, 'utf8').toString('base64')
  }`;
  const module = await import(url);
  return module.AchievementDictionary;
};

const validateAchievements = async () => {
  const dictionary = await importAchievementDictionary();
  const play = dictionary?.play_total;
  const full = dictionary?.full_total;
  const time = dictionary?.time_total;

  assert(
    JSON.stringify(play?.scaling?.steps) ===
      JSON.stringify([
        1, 10, 25, 50, 70, 100, 250,
        500, 1000, 5000, 10000, 15000, 20000
      ]),
    'В потоке: последовательность уровней'
  );

  assert(
    JSON.stringify(play?.reward?.steps) ===
      JSON.stringify([
        10, 15, 20, 25, 35, 50, 75,
        100, 150, 200, 300, 400, 500
      ]),
    'В потоке: таблица наград'
  );

  assert(
    play?.scaling?.resetEachLevel === true,
    'В потоке: последовательный progress'
  );
  assert(
    JSON.stringify(full?.scaling?.steps) ===
      JSON.stringify([
        1, 2, 5, 10, 50, 100, 150, 200,
        250, 300, 400, 500, 1000, 1500,
        2000, 2500
      ]),
    'Верное ухо: последовательность уровней'
  );

  assert(
    JSON.stringify(full?.reward?.steps) ===
      JSON.stringify([
        5, 10, 15, 30, 50, 75, 85, 100,
        125, 150, 200, 250, 500, 250,
        250, 250
      ]),
    'Верное ухо: таблица наград'
  );

  assert(
    full?.scaling?.resetEachLevel === true &&
      full?.scaling?.cumulativeSteps === true &&
      full?.scaling?.repeatAfterLevel === 16 &&
      full?.scaling?.repeatStep === 500 &&
      full?.reward?.repeatAmount === 250,
    'Верное ухо: последовательное продолжение после 2500'
  );
  assert(
    time?.scaling?.resetEachLevel === true &&
      time?.scaling?.cumulativeSteps === true &&
      time?.scaling?.repeatAfterLevel === 14 &&
      time?.scaling?.repeatStep === 3600000,
    'Хранитель времени: динамические уровни'
  );

  assert(
    time?.reward?.repeatAmount === 500,
    'Хранитель времени: повторная награда'
  );
};

const validateListening = () => {
  const receipts =
    'scripts/analytics/listening-receipts.js';
  const server =
    'cloud-functions/vi3-signaling/index.js';

  [
    'listen_session_start',
    'listen_session_heartbeat',
    'listen_session_complete',
    'achievement_reward_status',
    'listeningReceipts:completionOutbox:v1',
    'flushCompletionOutbox',
    'applyShardRewardResult'
  ].forEach(marker => contains(receipts, marker));

  assert(
    /const\s+HEARTBEAT_MS\s*=\s*10000\s*;/
      .test(read(receipts)),
    'Listening heartbeat: 10 секунд'
  );

  assert(
    /listenedSeconds\s*>=\s*25/
      .test(read('scripts/analytics/session-tracker.js')),
    'Valid listen: 25 секунд'
  );

  assert(
    /liveAccumulatedMs\s*\/\s*1000\)\s*>=\s*25/
      .test(read('scripts/analytics/live-stats.js')),
    'Live streak: 25 секунд'
  );

  [
    'const LISTEN_VALID_MIN_SEC = 25',
    'totalListenMs',
    'listenTimeBySession',
    'applyVerifiedListenTimeProgress',
    'buildFullListenRewards',
    'buildTimeRewards',
    'data.continuityBroken !== true',
    'Math.floor(data.duration * 0.95)'
  ].forEach(marker => contains(server, marker));

  assertNoMatch(
    [
      ...listFiles('scripts/analytics'),
      server
    ],
    /listenedSeconds\s*>=\s*13|Засчитывается\s*≥13\s*сек|Math\.max\(\s*13\s*,/g,
    'Старый порог 13 секунд отсутствует'
  );

  excludes(
    receipts,
    /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/,
    'listening receipts управляет playback'
  );
};

const validateRewards = () => {
  const engine =
    'scripts/analytics/achievement-engine.js';

  [
    '_requiresServerVerification',
    'legacy_local_unverified',
    'getCompletedCount',
    '_hasScalableLevel',
    'server_wallet'
  ].forEach(marker => contains(engine, marker));

  contains(
    'scripts/app/profile/achievements-view.js',
    'rewardAwarded'
  );
  contains(
    'scripts/app/shards/view.js',
    'getRewardCatalog'
  );
  contains(
    'scripts/app/shards/view.js',
    'serverRewardMap'
  );
  contains(
    'scripts/app/shards/reward-notifier.js',
    'applyShardRewardResult'
  );

  excludes(
    engine,
    /projectedTotalSec\s*\|\|\s*rawCurrent/,
    'локальное время подменяет серверное'
  );

  excludes(
    engine,
    /toggleableTimer\s*:\s*true/,
    'найден переключаемый time timer'
  );

  excludes(
    'scripts/app/shards/reward-notifier.js',
    /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/,
    'reward notifier управляет playback'
  );
};

const validatePwaAndLegacy = () => {
  const pwa = 'scripts/app/pwa-install.js';

  [
    'pwa_install_intent',
    'pwa_launch_verify',
    'display-mode: standalone'
  ].forEach(marker => contains(pwa, marker));

  excludes(
    pwa,
    /\.(play|pause|stop|seek|next|prev|setVolume|setMuted)\s*\(/,
    'PWA bridge управляет playback'
  );

  const applicationFiles = [
    ...listFiles('scripts')
      .filter(file =>
        !file.startsWith('scripts/ci/') &&
        !file.startsWith('scripts/e2e/')
      ),
    ...listFiles('data')
  ];

  assertNoMatch(
    applicationFiles,
    /socials_all_visited|socialVisitAll|social_visit_all|Подписчик всего/g,
    'Удалённое социальное достижение отсутствует'
  );

  assertNoMatch(
    [
      ...listFiles('scripts')
        .filter(file => !file.startsWith('scripts/ci/')),
      'service-worker.js'
    ],
    /verified-achievement-state|verified-achievements-view|claim_prepare|claim_validate|claim_index|achievement_verify/g,
    'Удалённый backup claim contour отсутствует'
  );
};

const validateDataBoundaries = () => {
  const account =
    'scripts/analytics/account-data-boundary.js';
  const favorite =
    'scripts/analytics/favorite-state-contract.js';
  const mirror =
    'scripts/analytics/favorite-mirror.js';

  [
    'Vi3AccountVault_v1',
    'eventLedger:chainId:v1',
    'favoriteMirror:outbox:v1',
    'listeningReceipts:completionOutbox:v1',
    'adoptLocalData'
  ].forEach(marker => contains(account, marker));

  [
    'normalizeFavoriteItem',
    'favoriteClock',
    'favoriteStatus',
    'mergeFavoritePair',
    'remoteToLocal',
    'localToRemote',
    'favoriteSignature'
  ].forEach(marker => contains(favorite, marker));

  [
    'favorite_state_get',
    'favorite_state_mutate',
    'favorite_state_reconcile'
  ].forEach(marker => contains(mirror, marker));

  excludes(
    account,
    /\.(play|pause|stop|seek|setVolume|setMuted)\s*\(/,
    'Account vault управляет playback'
  );

  assertNoMatch(
    [favorite, mirror],
    /\.(play|pause|stop|seek|next|prev|setVolume|setMuted|applyFavoritesOnlyFilter)\s*\(/g,
    'Favorite contract или mirror управляет playback'
  );
};

const validateRecommendationsAndStats = () => {
  contains(
    'scripts/app/profile/recs-view.js',
    'stableScore'
  );

  excludes(
    'scripts/app/profile/recs-view.js',
    /sort\(\s*\(\)\s*=>\s*Math\.random/,
    'случайный comparator рекомендаций'
  );

  excludes(
    'scripts/app/profile/carousel-flat.js',
    /oldTabs/,
    'legacy oldTabs'
  );

  [
    'const activeDays = new Set',
    'if (lSec > 0)',
    's.globalListenSeconds += lSec',
    'calculateStreakSummary'
  ].forEach(marker =>
    contains(
      'scripts/analytics/stats-aggregator.js',
      marker
    )
  );
};

const validatePlaybackBoundaries = () => {
  const protectedFiles = [
    ...listFiles('scripts/app/games'),
    ...listFiles('scripts/app/friends'),
    ...listFiles('scripts/intel')
  ];

  assertNoMatch(
    protectedFiles,
    /playerCore(?:\?\.|\.)\s*(play|pause|stop|seek|next|prev|setVolume|setMuted|load|setPlaylist|applyFavoritesOnlyFilter)\s*\(/g,
    'Games, Friends или Intel мутируют PlayerCore'
  );

  assertNoMatch(
    [
      ...protectedFiles,
      ...listFiles('scripts/analytics')
    ],
    /new\s+Howl\s*\(/g,
    'Найден вторичный владелец Howl'
  );

  [
    'player:transportReloaded',
    'previousUid',
    '_loadReq'
  ].forEach(marker => contains('src/PlayerCore.js', marker));
};

const validateCloudFunctionFiles = () => {
  [
    'vi3-signaling',
    'vi3na1bita-backup-proxy',
    'vi3-webpush'
  ].forEach(name => {
    const indexPath =
      `cloud-functions/${name}/index.js`;
    const packagePath =
      `cloud-functions/${name}/package.json`;
    const source = read(indexPath);

    assert(
      !source.includes('FILE: /package.json'),
      `${indexPath}: package.json не склеен с index.js`
    );

    try {
      const value = JSON.parse(read(packagePath));

      assert(
        value &&
          typeof value === 'object' &&
          !Array.isArray(value),
        `${packagePath}: корректный JSON object`
      );

      assert(
        !value.main || value.main === 'index.js',
        `${packagePath}: main=index.js`
      );
    } catch (error) {
      failures.push(
        `${packagePath}: ${error.message}`
      );
    }
  });
};

const validateWorkflows = () => {
  const workflows = listFiles('.github/workflows');

  assertNoMatch(
    workflows,
    /node-version:\s*['"]?20['"]?/g,
    'Workflow с Node.js 20 отсутствуют'
  );

  assertNoMatch(
    workflows,
    /actions\/(checkout|setup-node)@v4/g,
    'Legacy GitHub Actions v4 отсутствуют'
  );

  [
    "node-version: '24'",
    'npm install --no-save @playwright/test@1.55.0',
    'playwright.config.js --grep-invert "@remote"',
    'playwright.config.js --grep "@remote"',
    'continue-on-error: true',
    'cancel-in-progress: true'
  ].forEach(marker =>
    contains('.github/workflows/e2e.yml', marker)
  );
};

const main = async () => {
  await validateAchievements();
  validateListening();
  validateRewards();
  validatePwaAndLegacy();
  validateDataBoundaries();
  validateRecommendationsAndStats();
  validatePlaybackBoundaries();
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
  console.error(
    '\n❌ validate-contracts crashed:',
    error?.stack || error
  );
  process.exit(2);
});

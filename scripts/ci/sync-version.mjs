#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  })
);

const musicRoot = path.resolve(args['music-root'] || process.cwd());
const friendsRoot = args['friends-root']
  ? path.resolve(args['friends-root'])
  : null;
const gamesRoot = args['games-root']
  ? path.resolve(args['games-root'])
  : null;
const warHeartsRoot = args['war-hearts-root']
  ? path.resolve(args['war-hearts-root'])
  : null;
const manifestPath = path.join(musicRoot, '.release/version.json');
const checkOnly = args.check === true || args.check === 'true';

const fail = message => {
  console.error(`❌ ${message}`);
  process.exit(2);
};

const read = file => {
  if (!fs.existsSync(file)) fail(`Файл не найден: ${file}`);
  return fs.readFileSync(file, 'utf8');
};

const write = (file, value) => {
  fs.writeFileSync(file, value, 'utf8');
  console.log(`✅ ${path.relative(process.cwd(), file)}`);
};

const readManifest = () => {
  try {
    return JSON.parse(read(manifestPath));
  } catch (error) {
    fail(`Некорректный ${manifestPath}: ${error.message}`);
  }
};

const currentManifest = readManifest();
const version = String(args.version || currentManifest.appVersion || '').trim();
const buildDate = String(
  args.date ||
  (checkOnly ? currentManifest.buildDate : new Date().toISOString().slice(0, 10))
).trim();
const friendsBuild = String(
  args['friends-build'] ||
  version
).trim();
const gamesBuild = String(
  args['games-build'] ||
  version
).trim();
const warHeartsBuild = String(
  args['war-hearts-build'] ||
  version
).trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`Версия должна иметь формат X.Y.Z, получено: ${version}`);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(buildDate)) {
  fail(`Дата должна иметь формат YYYY-MM-DD, получено: ${buildDate}`);
}

[
  ['Friends', friendsBuild],
  ['Games', gamesBuild],
  ['War Hearts', warHeartsBuild]
].forEach(([label, value]) => {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    fail(
      `${label} build должен иметь формат X.Y.Z, получено: ${value}`
    );
  }
});

const replaceOne = (file, pattern, replacement, label) => {
  const source = read(file);
  const matches = [...source.matchAll(pattern)];

  if (matches.length !== 1) {
    fail(`${label}: ожидалось 1 совпадение, найдено ${matches.length} в ${file}`);
  }

  const next = source.replace(pattern, replacement);

  if (checkOnly) {
    if (source !== next) {
      fail(`${label}: версия не синхронизирована в ${file}`);
    }
    return;
  }

  if (source !== next) write(file, next);
};

const musicFile = relative => path.join(musicRoot, relative);
const friendsFile = relative => {
  if (!friendsRoot) {
    fail('Для Friends-файла требуется --friends-root');
  }
  return path.join(friendsRoot, relative);
};

const gamesFile = relative => {
  if (!gamesRoot) {
    fail('Для Games-файла требуется --games-root');
  }
  return path.join(gamesRoot, relative);
};

const warHeartsFile = relative => {
  if (!warHeartsRoot) {
    fail('Для War Hearts-файла требуется --war-hearts-root');
  }
  return path.join(warHeartsRoot, relative);
};

const updateMusic = () => {
  replaceOne(
    musicFile('scripts/core/config.js'),
    /APP_VERSION:\s*'[^']+',/g,
    `APP_VERSION: '${version}',`,
    'APP_CONFIG.APP_VERSION'
  );

  replaceOne(
    musicFile('scripts/core/config.js'),
    /BUILD_DATE:\s*'[^']+',/g,
    `BUILD_DATE: '${buildDate}',`,
    'APP_CONFIG.BUILD_DATE'
  );

  replaceOne(
    musicFile('service-worker.js'),
    /const SW_VERSION = '[^']+';/g,
    `const SW_VERSION = '${version}';`,
    'SW_VERSION'
  );

  replaceOne(
    musicFile('index.html'),
    /Friends\/styles\.css\?v=[^"']+/g,
    `Friends/styles.css?v=${friendsBuild}`,
    'Friends CSS build'
  );

  replaceOne(
    musicFile('index.html'),
    /const VERSION = String\(window\.APP_CONFIG\?\.APP_VERSION \|\| '[^']+'\), BUILD_DATE = String\(window\.APP_CONFIG\?\.BUILD_DATE \|\| '[^']+'\);/g,
    `const VERSION = String(window.APP_CONFIG?.APP_VERSION || '${version}'), BUILD_DATE = String(window.APP_CONFIG?.BUILD_DATE || '${buildDate}');`,
    'index.html fallback version'
  );

  replaceOne(
    musicFile('scripts/app/friends/friends-block.js'),
    /const FRIENDS_BUILD = '[^']+';/g,
    `const FRIENDS_BUILD = '${friendsBuild}';`,
    'FRIENDS_BUILD'
  );
  replaceOne(
    musicFile('scripts/app/games/bridge-host.js'),
    /Friends\/embedded-rpc-contract\.js\?v=[^"']+/g,
    `Friends/embedded-rpc-contract.js?v=${friendsBuild}`,
    'Music embedded Friends RPC contract'
  );
};

const updateFriends = () => {
  replaceOne(
    friendsFile('friends-core.js'),
    /\.\/friends-crypto\.js\?v=[^"']+/g,
    `./friends-crypto.js?v=${friendsBuild}`,
    'Friends crypto module'
  );

  replaceOne(
    friendsFile('chat-text-ui.js'),
    /\.\/crypto-devices-ui\.js\?v=[^"']+/g,
    `./crypto-devices-ui.js?v=${friendsBuild}`,
    'Friends crypto devices UI'
  );
  
  replaceOne(
    friendsFile('index.html'),
    /\.\/styles\.css\?v=[^"']+/g,
    `./styles.css?v=${friendsBuild}`,
    'Friends standalone CSS'
  );

  replaceOne(
    friendsFile('index.html'),
    /\.\/friends-core\.js\?v=[^"']+/g,
    `./friends-core.js?v=${friendsBuild}`,
    'Friends standalone core'
  );

  replaceOne(
    friendsFile('index.html'),
    /\.\/friends-ui\.js\?v=[^"']+/g,
    `./friends-ui.js?v=${friendsBuild}`,
    'Friends standalone UI'
  );

  replaceOne(
    friendsFile('friends-ui.js'),
    /\.\/games-registry\.js\?v=[^"']+/g,
    `./games-registry.js?v=${friendsBuild}`,
    'Friends games registry'
  );

  replaceOne(
    friendsFile('friends-ui.js'),
    /\.\/chat-text-ui\.js\?v=[^"']+/g,
    `./chat-text-ui.js?v=${friendsBuild}`,
    'Friends chat UI'
  );

  replaceOne(
    friendsFile('friends-ui.js'),
    /\.\/voice-call-ui\.js\?v=[^"']+/g,
    `./voice-call-ui.js?v=${friendsBuild}`,
    'Friends voice UI'
  );
};

const updateGames = () => {
  replaceOne(
    gamesFile('common/friends-embed.js'),
    /Friends\/embedded-rpc-contract\.js\?v=[^"']+/g,
    `Friends/embedded-rpc-contract.js?v=${friendsBuild}`,
    'Games embedded Friends RPC contract'
  );

  replaceOne(
    gamesFile('common/friends-embed.js'),
    /const DEFAULT_BUILD = '[^']+';/g,
    `const DEFAULT_BUILD = '${friendsBuild}';`,
    'Games default Friends build'
  );

  replaceOne(
    gamesFile('src/app.js'),
    /common\/friends-embed\.js\?v=[^"']+/g,
    `common/friends-embed.js?v=${gamesBuild}`,
    'Games Friends embed module'
  );

  replaceOne(
    gamesFile('src/app.js'),
    /build: '\d+\.\d+\.\d+',/g,
    `build: '${friendsBuild}',`,
    'Games embedded Friends UI build'
  );
};

const updateWarHearts = () => {
  replaceOne(
    warHeartsFile('src/app.js'),
    /\/Games\/common\/friends-embed\.js\?v=[^"']+/g,
    `/Games/common/friends-embed.js?v=${gamesBuild}`,
    'War Hearts Friends embed module'
  );

  replaceOne(
    warHeartsFile('src/app.js'),
    /build: '\d+\.\d+\.\d+',/g,
    `build: '${friendsBuild}',`,
    'War Hearts embedded Friends UI build'
  );
};

updateMusic();

if (friendsRoot) {
  updateFriends();
}

if (gamesRoot) {
  updateGames();
}

if (warHeartsRoot) {
  updateWarHearts();
}

if (!checkOnly) {
  write(
    manifestPath,
    `${JSON.stringify({
      appVersion: version,
      buildDate,
      friendsBuild,
      gamesBuild,
      warHeartsBuild
    }, null, 2)}\n`
  );
}

console.log(
  checkOnly
    ? `✅ Версии согласованы: app=${version}, friends=${friendsBuild}, games=${gamesBuild}, warHearts=${warHeartsBuild}, date=${buildDate}`
    : `✅ Версии обновлены: app=${version}, friends=${friendsBuild}, games=${gamesBuild}, warHearts=${warHeartsBuild}, date=${buildDate}`
);

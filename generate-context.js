/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

const argv = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...r] = a.replace(/^--/, '').split('=');
  return [k, r.join('=') === '' ? true : r.join('=')];
}));

const ROOT = path.resolve(argv.root || __dirname);
const META_DIR = path.resolve(argv['out-dir'] || path.join(ROOT, '.meta'));
const FUNCTIONS_META_DIR = path.join(META_DIR, 'functions');
const CLOUD_FUNCTIONS_DIR = path.join(ROOT, 'cloud-functions');
const MODE = String(argv.mode || 'both').toLowerCase();
const CLOUD_FUNCTIONS = Object.freeze([
  'vi3-signaling',
  'vi3na1bita-backup-proxy',
  'vi3-webpush',
  'vi3-loyalty-reminder'
]);

if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });
if (!fs.existsSync(FUNCTIONS_META_DIR)) fs.mkdirSync(FUNCTIONS_META_DIR, { recursive: true });

const FULL_FILE = path.join(META_DIR, 'project-full.txt');
const MUSIC_GAMES_FILE = path.join(META_DIR, 'project-music-games.txt');
const STALE_META_FILES = [
  path.join(META_DIR, 'project-adaptive.txt'),
  ...CLOUD_FUNCTIONS.map(name => path.join(META_DIR, `${name}.txt`))
];

const toUnix = p => String(p || '').replace(/\\/g, '/');
const SELF_FULL_REL = toUnix(path.relative(ROOT, FULL_FILE));
const SELF_MUSIC_GAMES_REL = toUnix(path.relative(ROOT, MUSIC_GAMES_FILE));

const TEXT_EXTS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx',
  '.json', '.webmanifest', '.md', '.txt', '.yml', '.yaml'
]);

const EXCLUDE_FILES_RAW = [
  'node_modules',
  '.git',
  '.meta',
  'cloud-functions',
  'scripts/vendor',
  'assets',
  '.next/**',
  'dist/**',
  'build/**',
  'out/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '.husky/**',
  '**/*.log',
  '.DS_Store',
  'ai-rules.txt',
  '**/ai-rules.txt',
  'data/lyrics-index-v1.json',
  'qwen-code-*',
  '**/qwen-code-*',
  '.aider*',
  '**/.aider*',
  '.continue/**',
  '.copilot/**',
  '**/*.orig',
  '**/*.rej',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
];

const EXCLUDE_TREE_RAW = [
  'node_modules/**',
  '.git/**',
  '.meta/**',
  '.next/**',
  'dist/**',
  'build/**',
  'out/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '.husky/**',
  '**/*.log',
  '.DS_Store',
  'data/lyrics-index-v1.json',
  'qwen-code-*',
  '**/qwen-code-*',
  '.aider*',
  '**/.aider*',
  '.continue/**',
  '.copilot/**',
  '**/*.orig',
  '**/*.rej',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
];

const MUSIC_GAMES_FILES = [
  '.github/workflows/deploy.yml',
  '.github/workflows/generate-context.yml',
  'index.html',
  'manifest.json',
  'service-worker.js',
  'generate-context.js',
  'scripts/app.js',
  'scripts/app/albums.js',
  'scripts/app/albums/specials.js',
  'scripts/app/games/host.js',
  'scripts/app/games/bridge-host.js',
  'scripts/app/games/config.js',
  'scripts/app/friends/friends-block.js',
  'scripts/app/push/web-push.js',
  'scripts/core/config.js',
  'scripts/utils/sw-manager.js',
  'styles/games.css',
  'styles/main.css'
];

const PRIORITY = {
  critical: [
    /^index\.html?$/i,
    /^service-worker\.js$/i,
    /^manifest\.json$/i,
    /^albums\.json$/i,
    /^news\.html?$/i,
    /^generate-index\.(js|mjs|cjs)$/i,
    /^albums\/gallery\/[^/]+\/index\.json$/i,
    /^\.github\/workflows\/.*\.ya?ml$/i
  ],
  high: [
    /^AudioController\.(js|mjs|cjs|ts)$/i,
    /^GlobalState\.(js|mjs|cjs|ts)$/i,
    /^scripts\/.*\.(mjs|js|ts)$/i,
    /^performance\/.*\.(js|ts)$/i,
    /^.*\.(ya?ml)$/i
  ],
  medium: [
    /^.*\.(js|mjs|cjs|ts|tsx|json|html?|css)$/i
  ]
};

const globToRegExp = p => {
  const hasPath = p.includes('/') || p.includes('**');
  const esc = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___GLOBSTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOBSTAR___/g, '.*');
  return hasPath ? new RegExp(`^${esc}$`) : new RegExp(`(^|/)${esc}(/|$)`);
};

const EXCLUDE_FILES_PATTERNS = EXCLUDE_FILES_RAW.map(globToRegExp);
const EXCLUDE_TREE_PATTERNS = EXCLUDE_TREE_RAW.map(globToRegExp);
const ALWAYS_EXCLUDE = new Set(['ai-rules.txt']);

const isExcluded = (rel, patterns) => {
  const u = toUnix(rel);

  if (
    !u ||
    u === 'cloud-functions' ||
    u.startsWith('cloud-functions/') ||
    u === SELF_FULL_REL ||
    u === SELF_MUSIC_GAMES_REL ||
    ALWAYS_EXCLUDE.has(u) ||
    ALWAYS_EXCLUDE.has(path.basename(u))
  ) {
    return true;
  }

  return patterns.some(re => re.test(u));
};

const isTextFile = rel => TEXT_EXTS.has(path.extname(rel).toLowerCase());

const readText = rel => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch (e) {
    return `// read error: ${e.message}`;
  }
};

const listAllEntries = (includeFiles = true, forTree = false) => {
  const out = [];
  const stack = [ROOT];

  while (stack.length) {
    const dir = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const item of entries) {
      const full = path.join(dir, item.name);
      const rel = toUnix(path.relative(ROOT, full)) || '.';
      if (isExcluded(rel, forTree ? EXCLUDE_TREE_PATTERNS : EXCLUDE_FILES_PATTERNS)) continue;

      if (item.isDirectory()) {
        out.push({ rel, full, dir: true });
        stack.push(full);
      } else if (item.isFile() && includeFiles) {
        out.push({ rel, full, dir: false });
      }
    }
  }

  return out.sort((a, b) => a.dir !== b.dir ? (a.dir ? -1 : 1) : a.rel.localeCompare(b.rel));
};

const getPriority = rel => {
  const u = toUnix(rel);
  return Object.keys(PRIORITY).find(level => PRIORITY[level].some(re => re.test(u))) || 'low';
};

const readRepoUrl = () => {
  try {
    const cfg = path.join(ROOT, '.git', 'config');
    if (!fs.existsSync(cfg)) return '';
    return (fs.readFileSync(cfg, 'utf8').match(/url\s*=\s*(.+)\n/) || [])[1]?.trim() || '';
  } catch {
    return '';
  }
};

const renderTree = () => {
  const lines = ['СТРУКТУРА ПРОЕКТА (компактная):'];
  const walk = (dir, relDir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const visible = entries.filter(x => !isExcluded(toUnix(path.relative(ROOT, path.join(dir, x.name))), EXCLUDE_TREE_PATTERNS)).sort((a, b) => a.name.localeCompare(b.name));
    const files = visible.filter(x => !x.isDirectory()).map(x => x.name), subdirs = visible.filter(x => x.isDirectory());
    const p = relDir ? `/${relDir}/` : '/';
    if (files.length) lines.push(`[${p}] ${files.join(', ')}`);
    else if (!subdirs.length) lines.push(`[${p}] (пусто)`);
    subdirs.forEach(x => walk(path.join(dir, x.name), relDir ? `${relDir}/${x.name}` : x.name));
  };
  walk(ROOT, '');
  return lines.join('\n');
};

const headerBlock = ({ purpose = '' } = {}) => {
  const rulesPath = path.join(ROOT, 'ai-rules.txt');
  const rules = fs.existsSync(rulesPath) ? `${fs.readFileSync(rulesPath, 'utf8').trim()}\n\n` : '';
  const repoName = String(argv['repo-name'] || path.basename(ROOT));
  const repoUrl = String(argv['repo-url'] || readRepoUrl() || 'https://github.com/apel-s-in/vi3na1bita-music');

  return `${rules}Название репозитория: ${repoName}
Адрес репозитория: ${repoUrl}
Назначение: основное музыкальное приложение vi3na1bita-music.
${purpose ? `Контекст: ${purpose}\n` : ''}Проект делается и обслуживается средствами https://github.com/ (GitHub Pages + GitHub Actions).

${renderTree()}

`;
};

const fileBlock = rel => `//=================================================
// FILE: /${toUnix(rel)}
${readText(rel)}
`;

const generateFull = () => {
  let out = headerBlock();

  const groups = listAllEntries(true, false)
    .filter(entry => !entry.dir && isTextFile(entry.rel))
    .reduce((acc, entry) => {
      acc[getPriority(entry.rel)].push(entry.rel);
      return acc;
    }, { critical: [], high: [], medium: [], low: [] });

  for (const level of ['critical', 'high', 'medium', 'low']) {
    for (const rel of groups[level]) out += fileBlock(rel);
  }

  return out;
};

const generateMusicGames = () => {
  let out = headerBlock({
    purpose: 'точечный контекст Game Center / iframe host / postMessage bridge / service worker / запуск /Games/'
  });

  out += `ВАЖНЫЕ ФАЙЛЫ ЭТОГО КОНТЕКСТА:
${MUSIC_GAMES_FILES.map(x => `- /${x}`).join('\n')}

`;

  MUSIC_GAMES_FILES.forEach(rel => {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full) && isTextFile(rel)) out += fileBlock(rel);
    else out += `//=================================================
// FILE: /${toUnix(rel)}
// missing or non-text file
`;
  });

  return out;
};

const listFunctionEntries = functionName => {
  const functionRoot = path.join(CLOUD_FUNCTIONS_DIR, functionName);
  const entries = [];
  const stack = [functionRoot];

  while (stack.length) {
    const dir = stack.pop();
    let rows = [];

    try {
      rows = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    rows
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(item => {
        if (item.name === 'node_modules') return;

        const full = path.join(dir, item.name);
        const rel = toUnix(path.relative(functionRoot, full));

        if (item.isDirectory()) {
          entries.push({ rel, full, dir: true });
          stack.push(full);
        } else if (item.isFile()) {
          entries.push({ rel, full, dir: false });
        }
      });
  }

  return [...new Map(
    entries.map(entry => [
      `${entry.dir ? 'dir' : 'file'}:${entry.rel}`,
      entry
    ])
  ).values()].sort((a, b) =>
    a.dir !== b.dir
      ? a.dir ? -1 : 1
      : a.rel.localeCompare(b.rel)
  );
};

const renderFunctionTree = functionName => {
  const functionRoot = path.join(CLOUD_FUNCTIONS_DIR, functionName);
  const lines = [`СТРУКТУРА CLOUD FUNCTION ${functionName}:`];

  const walk = (dir, relDir = '') => {
    let entries = [];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const visible = entries
      .filter(item => item.name !== 'node_modules')
      .sort((a, b) => a.name.localeCompare(b.name));
    const files = visible
      .filter(item => item.isFile())
      .map(item => item.name);
    const directories = visible
      .filter(item => item.isDirectory());

    const displayPath = relDir ? `/${relDir}/` : '/';

    if (files.length) {
      lines.push(`[${displayPath}] ${files.join(', ')}`);
    } else if (!directories.length) {
      lines.push(`[${displayPath}] (пусто)`);
    }

    directories.forEach(item =>
      walk(
        path.join(dir, item.name),
        relDir ? `${relDir}/${item.name}` : item.name
      )
    );
  };

  walk(functionRoot);
  return lines.join('\n');
};

const functionHeaderBlock = functionName => {
  const repoName = String(argv['repo-name'] || path.basename(ROOT));
  const repoUrl = String(
    argv['repo-url'] ||
    readRepoUrl() ||
    'https://github.com/apel-s-in/vi3na1bita-music'
  );

  return `Название репозитория: ${repoName}
Адрес репозитория: ${repoUrl}
Контекст: Yandex Cloud Function ${functionName}.
Публикация функции выполняется вручную. Переменные окружения и секреты в этот контекст не входят.

${renderFunctionTree(functionName)}

`;
};

const functionFileBlock = (functionRoot, rel) => {
  let content;

  try {
    content = fs.readFileSync(path.join(functionRoot, rel), 'utf8');
  } catch (error) {
    content = `// read error: ${error.message}`;
  }

  return `//=================================================
// FILE: /${toUnix(rel)}
${content}
`;
};

const generateFunctionContext = functionName => {
  const functionRoot = path.join(CLOUD_FUNCTIONS_DIR, functionName);

  if (!fs.existsSync(functionRoot)) {
    throw new Error(`Cloud Function directory not found: ${functionName}`);
  }

  ['index.js', 'package.json'].forEach(requiredFile => {
    if (!fs.existsSync(path.join(functionRoot, requiredFile))) {
      throw new Error(
        `Cloud Function file not found: ${functionName}/${requiredFile}`
      );
    }
  });

  let out = functionHeaderBlock(functionName);

  listFunctionEntries(functionName)
    .filter(entry => !entry.dir && isTextFile(entry.rel))
    .forEach(entry => {
      out += functionFileBlock(functionRoot, entry.rel);
    });

  return out;
};

const writeFunctionContexts = () => {
  fs.mkdirSync(FUNCTIONS_META_DIR, { recursive: true });

  CLOUD_FUNCTIONS.forEach(functionName => {
    const outputFile = path.join(
      FUNCTIONS_META_DIR,
      `${functionName}.txt`
    );

    fs.writeFileSync(
      outputFile,
      generateFunctionContext(functionName),
      'utf8'
    );

    console.log(`✅ ${outputFile}`);
  });
};

try {
  STALE_META_FILES.forEach(file => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  if (MODE === 'full' || MODE === 'both' || MODE === 'all') {
    fs.writeFileSync(FULL_FILE, generateFull(), 'utf8');
    console.log(`✅ ${FULL_FILE}`);
  }

  if (
    MODE === 'music-games' ||
    MODE === 'games' ||
    MODE === 'both' ||
    MODE === 'all'
  ) {
    fs.writeFileSync(MUSIC_GAMES_FILE, generateMusicGames(), 'utf8');
    console.log(`✅ ${MUSIC_GAMES_FILE}`);
  }

  if (
    MODE === 'functions' ||
    MODE === 'cloud-functions' ||
    MODE === 'both' ||
    MODE === 'all'
  ) {
    writeFunctionContexts();
  }
} catch (error) {
  console.error('❌', error);
  process.exit(1);
}

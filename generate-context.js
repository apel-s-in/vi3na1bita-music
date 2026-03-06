/* eslint-disable no-console */
"use strict";
const fs = require("fs"), path = require("path");
const argv = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...r] = a.replace(/^--/, "").split("="); return [k, r.join("=") === "" ? true : r.join("=")]; }));
const ROOT = path.resolve(argv.root || __dirname), META_DIR = path.resolve(argv["out-dir"] || path.join(ROOT, ".meta"));
const MODE = (argv.mode || "both").toLowerCase(), MAX_LINES = Number(argv["max-lines"] || 20000);
if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });
const FULL_FILE = path.join(META_DIR, "project-full.txt"), ADAPTIVE_FILE = path.join(META_DIR, "project-adaptive.txt");
const toUnix = p => String(p).replace(/\\/g, "/");
const SELF_FULL_REL = toUnix(path.relative(ROOT, FULL_FILE)), SELF_ADAPT_REL = toUnix(path.relative(ROOT, ADAPTIVE_FILE));
const TEXT_EXTS = new Set([".html",".htm",".css",".js",".mjs",".cjs",".ts",".tsx",".json",".webmanifest",".md",".txt",".yml",".yaml"]);
const globToRegExp = pat => new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$").replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/___GLOBSTAR___/g, ".*") + "$");
const EXCLUDE_FILES_PATTERNS = ["node_modules/**",".git/**",".meta/**","assets/**",".next/**","dist/**","build/**","out/**","coverage/**",".cache/**",".vscode/**",".idea/**",".husky/**","**/*.log",".DS_Store","ai-rules.txt"].map(globToRegExp);
const EXCLUDE_TREE_PATTERNS = ["node_modules/**",".git/**",".meta/**",".next/**","dist/**","build/**","out/**","coverage/**",".cache/**",".vscode/**",".idea/**",".husky/**","**/*.log",".DS_Store"].map(globToRegExp);
const PRIORITY = { critical: [/^index\.html?$/i,/^service-worker\.js$/i,/^manifest\.json$/i,/^albums\.json$/i,/^news\.html?$/i,/^generate-index\.(js|mjs|cjs)$/i,/^albums\/gallery\/[^/]+\/index\.json$/i,/^\.github\/workflows\/.*\.ya?ml$/i], high: [/^AudioController\.(js|mjs|cjs|ts)$/i,/^GlobalState\.(js|mjs|cjs|ts)$/i,/^scripts\/.*\.(mjs|js|ts)$/i,/^performance\/.*\.(js|ts)$/i,/^.*\.(ya?ml)$/i], medium: [/^.*\.(js|mjs|cjs|ts|tsx|json|html?|css)$/i] };
const isTextFile = rel => TEXT_EXTS.has(path.extname(rel).toLowerCase());
const readText = rel => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (e) { return `// read error: ${e.message}`; } };
const countLines = s => (s.match(/\n/g) || []).length + (s.length ? 1 : 0);
const isExcluded = (rel, arr) => { const u = toUnix(rel); return !u || u === SELF_FULL_REL || u === SELF_ADAPT_REL || arr.some(re => re.test(u)); };
const listAllEntries = (includeFiles = true, forTree = false) => {
  const res = [], stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop(); let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name), rel = toUnix(path.relative(ROOT, full)) || ".";
      if (isExcluded(rel, forTree ? EXCLUDE_TREE_PATTERNS : EXCLUDE_FILES_PATTERNS)) continue;
      if (e.isDirectory()) { res.push({ rel, full, dir: true }); stack.push(full); }
      else if (e.isFile() && includeFiles) res.push({ rel, full, dir: false });
    }
  }
  return res.sort((a, b) => a.dir !== b.dir ? (a.dir ? -1 : 1) : a.rel.localeCompare(b.rel));
};
const getPriority = rel => { const u = toUnix(rel); return Object.keys(PRIORITY).find(lvl => PRIORITY[lvl].some(re => re.test(u))) || "low"; };
const fileBlock = rel => `//=================================================\n// FILE: /${toUnix(rel)}\n${readText(rel)}\n`;
function headerBlock() {
  let url = "";
  try { const cfg = path.join(ROOT, ".git", "config"); if (fs.existsSync(cfg)) url = (fs.readFileSync(cfg, "utf8").match(/url\s*=\s*(.+)\n/) || [])[1]?.trim() || ""; } catch {}
  const m = { name: path.basename(ROOT), url: url || "(URL репозитория не обнаружен; укажите в .git/config)", madeWith: "Проект делается и обслуживается средствами https://github.com/ (GitHub Pages + GitHub Actions)." };
  const rulesPath = path.join(ROOT, "ai-rules.txt"), rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, "utf8") + "\n\n" : "";
  const tree = ["СТРУКТУРА ПРОЕКТА:", path.basename(ROOT) + "/"];
  const walk = (dir, prefix = "") => {
    let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const visible = entries.filter(e => !isExcluded(toUnix(path.relative(ROOT, path.join(dir, e.name))), EXCLUDE_TREE_PATTERNS)).sort((a, b) => a.isDirectory() !== b.isDirectory() ? (a.isDirectory() ? -1 : 1) : a.name.localeCompare(b.name));
    visible.forEach((e, i) => {
      const isLast = i === visible.length - 1; tree.push(prefix + (isLast ? "└── " : "├── ") + e.name + (e.isDirectory() ? "/" : ""));
      if (e.isDirectory()) walk(path.join(dir, e.name), prefix + (isLast ? "    " : "│   "));
    });
  };
  walk(ROOT);
  return `${rules}Название репозитория: ${m.name}\nАдрес репозитория: ${m.url}\n${m.madeWith}\n\n${tree.join("\n")}\n\nСгенерировано: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC\n\n`;
}
function generate(mode) {
  let out = headerBlock(), cur = countLines(out);
  const groups = listAllEntries(true, false).filter(e => !e.dir && isTextFile(e.rel)).reduce((acc, e) => { acc[getPriority(e.rel)].push(e.rel); return acc; }, { critical: [], high: [], medium: [], low: [] });
  for (const lvl of (mode === "adaptive" ? ["critical", "high", "medium"] : ["critical", "high", "medium", "low"])) {
    for (const f of groups[lvl]) {
      const block = fileBlock(f), L = countLines(block);
      if (mode === "adaptive" && cur + L > MAX_LINES) return out + "\n// ... (truncate)\n";
      out += block; cur += L;
    }
  }
  return out;
}
try {
  if (MODE === "full" || MODE === "both") { fs.writeFileSync(FULL_FILE, generate("full"), "utf8"); console.log(`✅ ${FULL_FILE}`); }
  if (MODE === "adaptive" || MODE === "both") { fs.writeFileSync(ADAPTIVE_FILE, generate("adaptive"), "utf8"); console.log(`✅ ${ADAPTIVE_FILE}`); }
} catch (e) { console.error("❌", e); process.exit(1); }

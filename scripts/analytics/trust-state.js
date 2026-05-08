// UID.104_(Trust and eligibility state)_(локальная проверка доверия без блокировки прогресса)_(bursts/future/restore-loops/duplicate-unlocks)
// UID.111_(Prize/global achievements distinction)_(local achievements != verified achievements)_(trust-state только предупреждает, verified слой позже)
// UID.094_(No-paralysis rule)_(trust diagnostics не влияет на playback)_(только чтение events/metaDB и сохранение summary)

import { metaDB as defaultMetaDB } from './meta-db.js';
import { normalizeEventList } from './backup-event-cleanup.js';

export const TRUST_STATE_KEY = 'trust_state_summary';
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const s = v => String(v == null ? '' : v).trim();
const DAY = 86400000, TEN_MIN = 600000;

const severityPenalty = x => ({ low: 4, medium: 10, high: 20 }[x] || 0);
const labelByStatus = st => ({ ok: 'Доверие высокое', review: 'Нужна проверка', suspicious: 'Есть подозрительные признаки' }[st] || 'Неизвестно');

const addFlag = (arr, { code, severity = 'low', count = 1, title = '', desc = '', examples = [] } = {}) => {
  if (!code || count <= 0) return;
  arr.push({ code, severity, count, title, desc, examples: examples.slice(0, 5).map(e => ({ eventId: s(e?.eventId), type: s(e?.type), uid: s(e?.uid), timestamp: n(e?.timestamp) })) });
};

const maxInWindow = (rows, ms) => {
  const a = rows.map(x => n(x.timestamp)).filter(Boolean).sort((x, y) => x - y);
  let best = 0, l = 0;
  for (let r = 0; r < a.length; r++) { while (a[r] - a[l] > ms) l++; best = Math.max(best, r - l + 1); }
  return best;
};

const detectFullListenBursts = (events, flags) => {
  const full = events.filter(e => e.type === 'LISTEN_COMPLETE' && e.data?.isFullListen);
  const burst = maxInWindow(full, TEN_MIN);
  addFlag(flags, { code: 'listen_burst_10m', severity: burst >= 12 ? 'high' : burst >= 8 ? 'medium' : 'low', count: burst >= 8 ? burst : 0, title: 'Слишком плотные полные прослушивания', desc: 'За 10 минут найдено необычно много full-listen событий.', examples: full.slice(-5).reverse() });

  const byUid = new Map();
  full.forEach(e => { const u = s(e.uid); if (u) (byUid.get(u) || byUid.set(u, []).get(u)).push(e); });
  let fast = [];
  byUid.forEach(list => {
    list.sort((a, b) => n(a.timestamp) - n(b.timestamp));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i], dur = Math.max(30, n(cur.data?.trackDuration || prev.data?.trackDuration || 0));
      if (n(cur.timestamp) - n(prev.timestamp) < dur * 700) fast.push(cur);
    }
  });
  addFlag(flags, { code: 'same_track_full_too_fast', severity: fast.length >= 5 ? 'high' : 'medium', count: fast.length, title: 'Повторы full-listen слишком быстро', desc: 'Один и тот же трек засчитывался полностью быстрее ожидаемой длительности.', examples: fast.slice(-5).reverse() });
};

const detectFutureTimestamps = (events, flags) => {
  const now = Date.now(), bad = events.filter(e => n(e.timestamp) > now + 300000 || n(e.sourceClock?.clientTs) > now + 300000);
  addFlag(flags, { code: 'future_timestamps', severity: bad.length >= 3 ? 'high' : 'medium', count: bad.length, title: 'События из будущего', desc: 'Найдены события с timestamp/clientTs заметно позже текущего времени.', examples: bad.slice(-5).reverse() });
};

const detectRestoreLoops = (events, flags) => {
  const cut = Date.now() - DAY, rows = events.filter(e => e.type === 'RESTORE_APPLIED' && n(e.timestamp) >= cut);
  addFlag(flags, { code: 'restore_loop_24h', severity: rows.length >= 6 ? 'high' : 'medium', count: rows.length >= 3 ? rows.length : 0, title: 'Много restore за 24 часа', desc: 'Частые восстановления могут исказить ветки событий и требуют внимания.', examples: rows.slice(-5).reverse() });
};

const detectDuplicateUnlocks = (events, flags) => {
  const a = events.filter(e => e.type === 'ACHIEVEMENT_UNLOCK'), byId = new Map();
  a.forEach(e => { const id = s(e.data?.id); if (id) (byId.get(id) || byId.set(id, []).get(id)).push(e); });
  const dup = [...byId.values()].filter(x => x.length > 1).flatMap(x => x.slice(1));
  const burst = maxInWindow(a, TEN_MIN);
  const noHash = a.filter(e => !e.eventHash);
  addFlag(flags, { code: 'duplicate_achievement_unlocks', severity: dup.length >= 4 ? 'high' : 'medium', count: dup.length, title: 'Повторные unlock одного достижения', desc: 'Одинаковые достижения открывались больше одного раза.', examples: dup.slice(-5).reverse() });
  addFlag(flags, { code: 'achievement_unlock_burst', severity: burst >= 10 ? 'high' : 'medium', count: burst >= 5 ? burst : 0, title: 'Слишком много достижений за короткое время', desc: 'Найден необычный всплеск ACHIEVEMENT_UNLOCK.', examples: a.slice(-5).reverse() });
  addFlag(flags, { code: 'legacy_unlocks_without_hash', severity: 'low', count: noHash.length, title: 'Unlock без ledger hash', desc: 'Часть unlock-событий создана до ledger v2 или без eventHash.', examples: noHash.slice(-5).reverse() });
};

export const computeTrustState = async ({ db = defaultMetaDB } = {}) => {
  const [hot, warm] = await Promise.all([db.getEvents('events_hot').catch(() => []), db.getEvents('events_warm').catch(() => [])]);
  const events = normalizeEventList([...(warm || []), ...(hot || [])], { limit: 10000, sort: true, dedupeAchievementUnlocks: false });
  const flags = [];
  detectFullListenBursts(events, flags);
  detectFutureTimestamps(events, flags);
  detectRestoreLoops(events, flags);
  detectDuplicateUnlocks(events, flags);

  const penalty = flags.reduce((a, f) => a + severityPenalty(f.severity) * Math.min(3, Math.max(1, n(f.count))), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const highCount = flags.filter(f => f.severity === 'high').length;
  const mediumCount = flags.filter(f => f.severity === 'medium').length;
  const status = score >= 85 && !highCount ? 'ok' : (score >= 60 && highCount < 2 ? 'review' : 'suspicious');
  return { version: 'trust-state-v1', updatedAt: Date.now(), status, label: labelByStatus(status), score, eventsChecked: events.length, flags, highCount, mediumCount, lowCount: flags.filter(f => f.severity === 'low').length };
};

export const refreshTrustState = async ({ db = defaultMetaDB, reason = 'manual' } = {}) => {
  const st = { ...(await computeTrustState({ db })), reason };
  await db.setGlobal(TRUST_STATE_KEY, st).catch(() => {});
  try { window.dispatchEvent(new CustomEvent('trust-state:updated', { detail: st })); } catch {}
  return st;
};

export const readTrustState = async ({ db = defaultMetaDB, maxAgeMs = 300000 } = {}) => {
  const row = (await db.getGlobal(TRUST_STATE_KEY).catch(() => null))?.value;
  if (row?.updatedAt && Date.now() - n(row.updatedAt) <= maxAgeMs) return row;
  return refreshTrustState({ db, reason: 'auto_refresh' });
};

export default { TRUST_STATE_KEY, computeTrustState, refreshTrustState, readTrustState };

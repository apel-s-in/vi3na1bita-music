// UID.104_(Trust and eligibility state)_(verified achievement state читает local unlock + server status)_(ничего не блокирует)
// UID.111_(Prize/global achievements distinction)_(localUnlocked/synced/verified/claimable/suspicious)_(локальные достижения остаются локальными)
// UID.112_(Profile command center)_(профиль показывает claim readiness)_(server validation нужна только для внешних призов)

import { metaDB as defaultMetaDB } from './meta-db.js';
import { readTrustState } from './trust-state.js';

export const VERIFIED_ACHIEVEMENT_STATE_KEY = 'verified_achievement_state_v1';
const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const localRows = async (db = defaultMetaDB) => {
  const eng = window.achievementEngine, u = eng?.unlocked || (await db.getGlobal('unlocked_achievements').catch(() => null))?.value || {}, meta = eng?.unlockMeta || (await db.getGlobal('achievement_unlock_meta').catch(() => null))?.value || {};
  return Object.keys(u || {}).map(id => ({ id, localUnlocked: true, unlockedAt: n(u[id]), localEventId: s(meta?.[id]?.eventId || ''), localDeviceStableId: s(meta?.[id]?.deviceStableId || '') }));
};

export const normalizeVerifiedAchievementRow = raw => ({
  id: s(raw?.id),
  localUnlocked: !!raw?.localUnlocked,
  synced: !!raw?.synced,
  verified: !!raw?.verified,
  claimable: !!raw?.claimable,
  suspicious: !!raw?.suspicious,
  status: s(raw?.status || (raw?.claimable ? 'claimable' : raw?.verified ? 'verified' : raw?.synced ? 'synced' : raw?.localUnlocked ? 'localUnlocked' : 'unknown')),
  reason: s(raw?.reason || ''),
  unlockedAt: n(raw?.unlockedAt),
  eventId: s(raw?.eventId || raw?.localEventId || ''),
  claimId: s(raw?.claimId || '')
});

export const buildVerifiedAchievementState = async ({ db = defaultMetaDB, disk = window.YandexDisk, token = window.YandexAuth?.getToken?.() } = {}) => {
  const [local, trust] = await Promise.all([localRows(db), readTrustState({ db }).catch(() => null)]);
  let remote = null;
  if (disk?.verifyAchievements && token && window.YandexAuth?.isTokenAlive?.()) remote = await disk.verifyAchievements(token, 'all').catch(e => ({ ok: false, error: e?.message || 'verify_failed', items: [] }));

  const byId = new Map(local.map(x => [x.id, x]));
  (remote?.items || []).forEach(x => byId.set(x.id, { ...(byId.get(x.id) || { id: x.id }), ...x }));
  const trustSuspicious = trust?.status === 'suspicious';
  const items = [...byId.values()].map(x => normalizeVerifiedAchievementRow({ ...x, suspicious: !!x.suspicious || trustSuspicious, claimable: !!x.claimable && !trustSuspicious }));
  const summary = {
    totalLocalUnlocked: local.length,
    synced: items.filter(x => x.synced).length,
    verified: items.filter(x => x.verified).length,
    claimable: items.filter(x => x.claimable).length,
    suspicious: items.filter(x => x.suspicious).length,
    needsSync: items.filter(x => x.localUnlocked && !x.synced).length
  };
  return { version: 'verified-achievements-v1', updatedAt: Date.now(), trustStatus: trust?.status || 'unknown', serverOk: !!remote?.ok, serverStatus: s(remote?.status || ''), serverError: s(remote?.error || ''), summary, items: items.sort((a, b) => Number(b.claimable) - Number(a.claimable) || Number(b.verified) - Number(a.verified) || n(b.unlockedAt) - n(a.unlockedAt)) };
};

export const refreshVerifiedAchievementState = async (opts = {}) => {
  const st = await buildVerifiedAchievementState(opts);
  await (opts.db || defaultMetaDB).setGlobal(VERIFIED_ACHIEVEMENT_STATE_KEY, st).catch(() => {});
  try { window.dispatchEvent(new CustomEvent('verified-achievements:updated', { detail: st })); } catch {}
  return st;
};

export const readVerifiedAchievementState = async ({ db = defaultMetaDB, maxAgeMs = 300000, ...opts } = {}) => {
  const row = (await db.getGlobal(VERIFIED_ACHIEVEMENT_STATE_KEY).catch(() => null))?.value;
  if (row?.updatedAt && Date.now() - n(row.updatedAt) <= maxAgeMs) return row;
  return refreshVerifiedAchievementState({ db, ...opts });
};

export default { VERIFIED_ACHIEVEMENT_STATE_KEY, normalizeVerifiedAchievementRow, buildVerifiedAchievementState, refreshVerifiedAchievementState, readVerifiedAchievementState };

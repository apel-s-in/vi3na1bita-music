// UID.003_(Event log truth)_(achievement state должен быть merge-safe и rebuildable)_(unlock provenance восстанавливается из ACHIEVEMENT_UNLOCK events)
// UID.004_(Stats as cache)_(progress projection выводится из stats/event log)_(unlock/RPG/streak snapshot — компактный индекс поверх событий)
// UID.099_(Multi-device sync model)_(achievements merge без дублей XP и потерь unlock)_(earliest unlock, max XP/level, max streak, device provenance)

export const ACHIEVEMENT_STATE_VERSION = '1.1';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const s = v => String(v == null ? '' : v).trim();
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export const normalizeUnlockedAchievements = raw =>
  Object.fromEntries(Object.entries(isObj(raw) ? raw : {}).map(([k, v]) => {
    const ts = n(isObj(v) ? (v.unlockedAt || v.timestamp || v.ts) : v);
    return [s(k), ts || Date.now()];
  }).filter(([k]) => k));

export const normalizeAchievementProfile = raw => ({
  xp: Math.max(0, n(raw?.xp)),
  level: Math.max(1, n(raw?.level || 1))
});

export const normalizeAchievementStreaks = raw => ({
  ...(isObj(raw) ? raw : {}),
  current: Math.max(0, n(raw?.current)),
  longest: Math.max(0, n(raw?.longest)),
  lastActiveDate: s(raw?.lastActiveDate || '')
});

export const normalizeAchievementUnlockMetaRow = (id, raw = {}, fallbackTs = 0) => ({
  id: s(raw?.id || id),
  unlockedAt: n(raw?.unlockedAt || raw?.timestamp || raw?.ts || fallbackTs) || 0,
  eventId: s(raw?.eventId || ''),
  sessionId: s(raw?.sessionId || ''),
  deviceStableId: s(raw?.deviceStableId || ''),
  deviceHash: s(raw?.deviceHash || ''),
  deviceLabel: s(raw?.deviceLabel || ''),
  deviceClass: s(raw?.deviceClass || ''),
  devicePwa: !!raw?.devicePwa,
  platform: s(raw?.platform || ''),
  source: s(raw?.source || 'achievement_unlock')
});

export const normalizeAchievementUnlockMeta = (raw = {}, unlocked = {}) => {
  const out = {};
  Object.entries(isObj(raw) ? raw : {}).forEach(([id, row]) => {
    const r = normalizeAchievementUnlockMetaRow(id, row, n(unlocked?.[id]));
    if (r.id && r.unlockedAt > 0) out[r.id] = r;
  });
  Object.entries(unlocked || {}).forEach(([id, ts]) => {
    const k = s(id);
    if (k && !out[k]) out[k] = normalizeAchievementUnlockMetaRow(k, { source: 'unlocked_map' }, n(ts));
  });
  return out;
};

export const deriveAchievementUnlockMetaFromEvents = events => {
  const out = {};
  (Array.isArray(events) ? events : []).forEach(ev => {
    if (s(ev?.type) !== 'ACHIEVEMENT_UNLOCK') return;
    const id = s(ev?.data?.id);
    if (!id) return;
    const row = normalizeAchievementUnlockMetaRow(id, {
      unlockedAt: n(ev?.timestamp),
      eventId: ev?.eventId,
      sessionId: ev?.sessionId,
      deviceStableId: ev?.deviceStableId,
      deviceHash: ev?.deviceHash,
      deviceLabel: ev?.deviceLabel,
      deviceClass: ev?.deviceClass,
      devicePwa: ev?.devicePwa,
      platform: ev?.platform,
      source: 'event_log'
    });
    if (!row.unlockedAt) return;
    const prev = out[id];
    if (!prev || row.unlockedAt < prev.unlockedAt) out[id] = row;
  });
  return out;
};

export const normalizeAchievementState = raw => {
  const unlocked = normalizeUnlockedAchievements(raw?.unlocked || raw?.achievements || {});
  const unlockMeta = normalizeAchievementUnlockMeta(raw?.unlockMeta || raw?.unlockedMeta || {}, unlocked);
  Object.entries(unlockMeta).forEach(([id, row]) => {
    if (!unlocked[id] || row.unlockedAt < unlocked[id]) unlocked[id] = row.unlockedAt;
  });
  return {
    version: s(raw?.version || ACHIEVEMENT_STATE_VERSION) || ACHIEVEMENT_STATE_VERSION,
    updatedAt: n(raw?.updatedAt) || Date.now(),
    unlocked,
    unlockMeta,
    profileRpg: normalizeAchievementProfile(raw?.profileRpg || raw?.userProfileRpg || {}),
    streaks: normalizeAchievementStreaks(raw?.streaks || {})
  };
};

export const buildAchievementBackupState = ({ unlocked = {}, unlockMeta = {}, profileRpg = {}, streaks = {}, events = [] } = {}) => {
  const fromEvents = deriveAchievementUnlockMetaFromEvents(events);
  return normalizeAchievementState({
    unlocked,
    unlockMeta: { ...unlockMeta, ...fromEvents },
    profileRpg,
    streaks,
    updatedAt: Date.now()
  });
};

const pickEarlierMeta = (a, b, id) => {
  const aa = normalizeAchievementUnlockMetaRow(id, a), bb = normalizeAchievementUnlockMetaRow(id, b);
  if (!aa.unlockedAt) return bb;
  if (!bb.unlockedAt) return aa;
  if (bb.unlockedAt < aa.unlockedAt) return bb;
  if (aa.unlockedAt < bb.unlockedAt) return aa;
  return aa.deviceLabel || aa.eventId ? aa : bb;
};

export const mergeAchievementStates = (localRaw = {}, remoteRaw = {}) => {
  const l = normalizeAchievementState(localRaw), r = normalizeAchievementState(remoteRaw);
  const unlocked = { ...l.unlocked };
  Object.entries(r.unlocked).forEach(([id, ts]) => {
    const a = n(unlocked[id]), b = n(ts);
    unlocked[id] = a > 0 && b > 0 ? Math.min(a, b) : (b || a || Date.now());
  });
  const unlockMeta = { ...l.unlockMeta };
  Object.keys({ ...l.unlockMeta, ...r.unlockMeta, ...unlocked }).forEach(id => {
    unlockMeta[id] = pickEarlierMeta(l.unlockMeta[id], r.unlockMeta[id], id);
    if (!unlockMeta[id]?.unlockedAt && unlocked[id]) unlockMeta[id] = normalizeAchievementUnlockMetaRow(id, { source: 'merged_unlocked_map' }, unlocked[id]);
    if (unlockMeta[id]?.unlockedAt && (!unlocked[id] || unlockMeta[id].unlockedAt < unlocked[id])) unlocked[id] = unlockMeta[id].unlockedAt;
  });
  return normalizeAchievementState({
    updatedAt: Math.max(n(l.updatedAt), n(r.updatedAt), Date.now()),
    unlocked,
    unlockMeta,
    profileRpg: {
      xp: Math.max(n(l.profileRpg.xp), n(r.profileRpg.xp)),
      level: Math.max(1, n(l.profileRpg.level), n(r.profileRpg.level))
    },
    streaks: {
      ...l.streaks,
      ...r.streaks,
      current: Math.max(n(l.streaks.current), n(r.streaks.current)),
      longest: Math.max(n(l.streaks.longest), n(r.streaks.longest)),
      lastActiveDate: [s(l.streaks.lastActiveDate), s(r.streaks.lastActiveDate)].sort().pop() || ''
    }
  });
};

export const applyAchievementStateToMetaDB = async (metaDB, stateRaw) => {
  const st = normalizeAchievementState(stateRaw);
  await Promise.all([
    metaDB.setGlobal('unlocked_achievements', st.unlocked),
    metaDB.setGlobal('achievement_unlock_meta', st.unlockMeta),
    metaDB.setGlobal('user_profile_rpg', st.profileRpg),
    metaDB.setGlobal('global_streak', st.streaks)
  ]);
  return st;
};

export const refreshAchievementEngineFromDb = async ({ metaDB, reason = 'achievement_state_refresh', forceCheck = true, silent = true } = {}) => {
  const eng = window.achievementEngine;
  if (!eng || !metaDB) return false;
  const [u, m, r, st, warm] = await Promise.all([
    metaDB.getGlobal('unlocked_achievements').catch(() => null),
    metaDB.getGlobal('achievement_unlock_meta').catch(() => null),
    metaDB.getGlobal('user_profile_rpg').catch(() => null),
    metaDB.getGlobal('global_streak').catch(() => null),
    metaDB.getEvents('events_warm').catch(() => [])
  ]);
  const fromEvents = deriveAchievementUnlockMetaFromEvents(warm);
  const merged = mergeAchievementStates(
    { unlocked: u?.value || {}, unlockMeta: m?.value || {}, profileRpg: r?.value || { xp: 0, level: 1 }, streaks: st?.value || {} },
    { unlocked: Object.fromEntries(Object.entries(fromEvents).map(([id, x]) => [id, x.unlockedAt])), unlockMeta: fromEvents }
  );
  await applyAchievementStateToMetaDB(metaDB, merged);
  eng.unlocked = merged.unlocked;
  eng.unlockMeta = merged.unlockMeta;
  eng.profile = merged.profileRpg;
  if (forceCheck && typeof eng.check === 'function') {
    const old = !!eng._silentNotify;
    eng._silentNotify = !!silent;
    try { await eng.check({ force: true }); } finally { eng._silentNotify = old; }
  } else {
    eng.achievements = eng._buildUIArray?.() || eng.achievements || [];
    eng.broadcast?.(n(st?.value?.current));
  }
  window.dispatchEvent(new CustomEvent('achievements:updated', { detail: {
    total: eng.achievements?.length || 0,
    unlocked: Object.keys(eng.unlocked || {}).length,
    items: eng.unlocked || {},
    unlockMeta: eng.unlockMeta || {},
    streak: n(st?.value?.current),
    profile: eng.profile || { xp: 0, level: 1 },
    reason
  } }));
  return true;
};

export default {
  ACHIEVEMENT_STATE_VERSION,
  normalizeUnlockedAchievements,
  normalizeAchievementProfile,
  normalizeAchievementStreaks,
  normalizeAchievementUnlockMetaRow,
  normalizeAchievementUnlockMeta,
  deriveAchievementUnlockMetaFromEvents,
  normalizeAchievementState,
  buildAchievementBackupState,
  mergeAchievementStates,
  applyAchievementStateToMetaDB,
  refreshAchievementEngineFromDb
};

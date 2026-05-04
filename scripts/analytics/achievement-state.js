// UID.003_(Event log truth)_(achievement state должен быть merge-safe и rebuildable)_(unlocked/profile/streaks сохраняются единым контрактом)
// UID.004_(Stats as cache)_(прогресс достижений выводится из stats/event log, но unlock/RPG/streak snapshot сохраняется без регрессий)
// UID.099_(Multi-device sync model)_(achievements merge без дублей XP и потерь unlock)_(earliest unlock, max XP/level, max streak)

export const ACHIEVEMENT_STATE_VERSION = '1.0';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const s = v => String(v == null ? '' : v).trim();
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export const normalizeUnlockedAchievements = raw =>
  Object.fromEntries(Object.entries(isObj(raw) ? raw : {}).map(([k, v]) => [s(k), n(v) || Date.now()]).filter(([k]) => k));

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

export const normalizeAchievementState = raw => ({
  version: s(raw?.version || ACHIEVEMENT_STATE_VERSION) || ACHIEVEMENT_STATE_VERSION,
  updatedAt: n(raw?.updatedAt) || Date.now(),
  unlocked: normalizeUnlockedAchievements(raw?.unlocked || raw?.achievements || {}),
  profileRpg: normalizeAchievementProfile(raw?.profileRpg || raw?.userProfileRpg || {}),
  streaks: normalizeAchievementStreaks(raw?.streaks || {})
});

export const buildAchievementBackupState = ({ unlocked = {}, profileRpg = {}, streaks = {} } = {}) =>
  normalizeAchievementState({ unlocked, profileRpg, streaks, updatedAt: Date.now() });

export const mergeAchievementStates = (localRaw = {}, remoteRaw = {}) => {
  const l = normalizeAchievementState(localRaw), r = normalizeAchievementState(remoteRaw);
  const unlocked = { ...l.unlocked };
  Object.entries(r.unlocked).forEach(([id, ts]) => {
    const a = n(unlocked[id]), b = n(ts);
    unlocked[id] = a > 0 && b > 0 ? Math.min(a, b) : (b || a || Date.now());
  });
  return normalizeAchievementState({
    updatedAt: Math.max(n(l.updatedAt), n(r.updatedAt), Date.now()),
    unlocked,
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
    metaDB.setGlobal('user_profile_rpg', st.profileRpg),
    metaDB.setGlobal('global_streak', st.streaks)
  ]);
  return st;
};

export const refreshAchievementEngineFromDb = async ({ metaDB, reason = 'achievement_state_refresh', forceCheck = true, silent = true } = {}) => {
  const eng = window.achievementEngine;
  if (!eng || !metaDB) return false;
  const [u, r, st] = await Promise.all([
    metaDB.getGlobal('unlocked_achievements').catch(() => null),
    metaDB.getGlobal('user_profile_rpg').catch(() => null),
    metaDB.getGlobal('global_streak').catch(() => null)
  ]);
  eng.unlocked = normalizeUnlockedAchievements(u?.value || {});
  eng.profile = normalizeAchievementProfile(r?.value || { xp: 0, level: 1 });
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
  normalizeAchievementState,
  buildAchievementBackupState,
  mergeAchievementStates,
  applyAchievementStateToMetaDB,
  refreshAchievementEngineFromDb
};

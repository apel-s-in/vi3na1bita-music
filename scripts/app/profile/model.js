// Profile model собирает только публичные snapshots.
// Локальные stats остаются rebuildable источником рекомендаций.
import { resolveListeningStatsViewModel } from '../../analytics/confirmed-listening-stats.js';
import { getLoyaltyState } from '../../analytics/loyalty-state.js';

export const loadProfileModel = async () => {
  let metaDB = null;
  let all = [];
  let achievements = {};
  let profile = {
    name: 'Слушатель',
    avatar: '😎'
  };

  try {
    const module = await import('../../analytics/meta-db.js');
    metaDB = module.metaDB;

    const [
      statsRow,
      achievementsRow,
      profileRow
    ] = await Promise.all([
      metaDB.getAllStats().catch(() => []),
      metaDB.getGlobal('unlocked_achievements')
        .catch(() => null),
      metaDB.getGlobal('user_profile')
        .catch(() => null)
    ]);

    all = statsRow || [];
    achievements = achievementsRow?.value || {};
    profile = profileRow?.value || profile;
  } catch {}

  const statsVm = resolveListeningStatsViewModel(all);
  const loyalty = getLoyaltyState();

  return {
    metaDB,
    all,
    ach: achievements,
    profile,
    statsVm,
    loyalty,
    streak: loyalty.available
      ? loyalty.currentDays
      : 0,
    totalFull: statsVm.summary.totalFull,
    totalSec: statsVm.summary.totalSec
  };
};

export default { loadProfileModel };

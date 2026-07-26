// UID.044_(ListenerProfile core)_(profile model должен стать местом мягкой сборки user portrait)_(future сюда можно подмешивать listener profile summary без ломки legacy stats model) UID.070_(Linked providers)_(model должен уметь принимать provider identity snapshot)_(но truth linked accounts хранится не здесь, а в intel/providers/provider-identity.js) UID.072_(Provider consents)_(model сможет отдавать consent snapshot для profile UI)_(но хранение consent state вынесено в intel/providers/provider-consents.js) UID.073_(Hybrid sync orchestrator)_(model должен принять sync state как optional extension)_(но orchestration logic не должна появляться в этом файле) UID.094_(No-paralysis rule)_(legacy profile model остаётся валидным fallback)_(если intel слой недоступен, этот model продолжает работать сам)
import { resolveListeningStatsViewModel } from '../../analytics/confirmed-listening-stats.js';

export const loadProfileModel = async () => {
  let metaDB = null;
  let all = [];
  let achievements = {};
  let streak = 0;
  let profile = {
    name: 'Слушатель',
    avatar: '😎'
  };

  try {
    const module = await import(
      '../../analytics/meta-db.js'
    );
    metaDB = module.metaDB;

    const [
      statsRow,
      achievementsRow,
      streakRow,
      profileRow
    ] = await Promise.all([
      metaDB.getAllStats().catch(() => []),
      metaDB.getGlobal('unlocked_achievements')
        .catch(() => null),
      metaDB.getGlobal('global_streak')
        .catch(() => null),
      metaDB.getGlobal('user_profile')
        .catch(() => null)
    ]);

    all = statsRow || [];
    achievements = achievementsRow?.value || {};
    streak = streakRow?.value?.current || 0;
    profile = profileRow?.value || profile;
  } catch {}

  const statsVm = resolveListeningStatsViewModel(all);

  return {
    metaDB,
    all,
    ach: achievements,
    streak,
    profile,
    statsVm,
    totalFull: statsVm.summary.totalFull,
    totalSec: statsVm.summary.totalSec
  };
};

export default { loadProfileModel };

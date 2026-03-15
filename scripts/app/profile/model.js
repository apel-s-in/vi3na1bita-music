export async function loadProfileModel() {
  let metaDB = null, cloudSync = null;
  let all = [], ach = {}, streak = 0, profile = { name: 'Слушатель', avatar: '😎' };

  try {
    const [dbM, csM] = await Promise.all([
      import('../../analytics/meta-db.js'),
      import('../../analytics/cloud-sync.js')
    ]);
    metaDB = dbM.metaDB;
    cloudSync = csM.cloudSync;

    const [stats, achData, streakData, profileData] = await Promise.all([
      metaDB.getAllStats().catch(() => []),
      metaDB.getGlobal('unlocked_achievements').catch(() => null),
      metaDB.getGlobal('global_streak').catch(() => null),
      metaDB.getGlobal('user_profile').catch(() => null)
    ]);

    all = stats || [];
    ach = achData?.value || {};
    streak = streakData?.value?.current || 0;
    profile = profileData?.value || profile;
  } catch (e) {
    console.error('[Profile] init err:', e);
  }

  let totalFull = 0, totalSec = 0;
  all.forEach(s => {
    totalFull += s.globalFullListenCount || 0;
    totalSec += s.globalListenSeconds || 0;
  });

  return {
    metaDB,
    cloudSync,
    all,
    ach,
    streak,
    profile,
    totalFull,
    totalSec,
    tokens: JSON.parse(localStorage.getItem('cloud_tokens') || '{}')
  };
}

export default { loadProfileModel };

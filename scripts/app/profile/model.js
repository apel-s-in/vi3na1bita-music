export const loadProfileModel = async () => {
  let db = null, cs = null, all = [], ach = {}, streak = 0, profile = { name: 'Слушатель', avatar: '😎' };
  try {
    const [dbM, csM] = await Promise.all([import('../../analytics/meta-db.js'), import('../../analytics/cloud-sync.js')]);
    db = dbM.metaDB; cs = csM.cloudSync;
    const [s, aD, sD, pD] = await Promise.all([db.getAllStats().catch(()=>[]), db.getGlobal('unlocked_achievements').catch(()=>null), db.getGlobal('global_streak').catch(()=>null), db.getGlobal('user_profile').catch(()=>null)]);
    all = s || []; ach = aD?.value || {}; streak = sD?.value?.current || 0; profile = pD?.value || profile;
  } catch (e) { console.error('[Profile] init err:', e); }
  const { f, s } = all.reduce((a, b) => ({ f: a.f + (b.globalFullListenCount||0), s: a.s + (b.globalListenSeconds||0) }), { f: 0, s: 0 });
  return { metaDB: db, cloudSync: cs, all, ach, streak, profile, totalFull: f, totalSec: s, tokens: JSON.parse(localStorage.getItem('cloud_tokens') || '{}') };
};
export default { loadProfileModel };

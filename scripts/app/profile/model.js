// UID.044_(ListenerProfile core)_(profile model должен стать местом мягкой сборки user portrait)_(future сюда можно подмешивать listener profile summary без ломки legacy stats model) UID.070_(Linked providers)_(model должен уметь принимать provider identity snapshot)_(но truth linked accounts хранится не здесь, а в intel/providers/provider-identity.js) UID.072_(Provider consents)_(model сможет отдавать consent snapshot для profile UI)_(но хранение consent state вынесено в intel/providers/provider-consents.js) UID.073_(Hybrid sync orchestrator)_(model должен принять sync state как optional extension)_(но orchestration logic не должна появляться в этом файле) UID.094_(No-paralysis rule)_(legacy profile model остаётся валидным fallback)_(если intel слой недоступен, этот model продолжает работать сам)
export const loadProfileModel = async () => {
  let db = null, all = [], ach = {}, streak = 0, profile = { name: 'Слушатель', avatar: '😎' };
  try {
    const dbM = await import('../../analytics/meta-db.js');
    db = dbM.metaDB;
    const [s, aD, sD, pD] = await Promise.all([db.getAllStats().catch(()=>[]), db.getGlobal('unlocked_achievements').catch(()=>null), db.getGlobal('global_streak').catch(()=>null), db.getGlobal('user_profile').catch(()=>null)]);
    all = s || []; ach = aD?.value || {}; streak = sD?.value?.current || 0; profile = pD?.value || profile;
  } catch (e) { console.error('[Profile] init err:', e); }
  const { f: totalFull, s: totalSec } = all.reduce((a, b) => ({ f: a.f + (b.globalFullListenCount||0), s: a.s + (b.globalListenSeconds||0) }), { f: 0, s: 0 });
  return { metaDB: db, all, ach, streak, profile, totalFull, totalSec, tokens: {} };
};
export default { loadProfileModel };

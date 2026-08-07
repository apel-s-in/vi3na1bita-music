const st = { idx: null, idxLoadedAt: 0, cache: new Map(), api: null };
const getUrl = () => String(window.APP_CONFIG?.INTEL_LAYER_PROFILE_INDEX_URL || './data/track-profiles-index.json');
const getDir = () => String(window.APP_CONFIG?.INTEL_LAYER_PROFILE_DIR || './data/track-profiles/').replace(/\/+$/, '') + '/';
const fetchJ = async (u, k) => { const cU = `${u}?cb=${Date.now()}`, fc = window.Utils?.fetchCache; if (fc?.getJson) return fc.getJson({ key: k, url: cU, ttlMs: 43200000, store: 'session', fetchInit: { cache: 'no-cache' } }); const r = await (window.NetPolicy?.fetchWithTraffic?.(cU, { cache: 'no-cache' }) || fetch(cU, { cache: 'no-cache' })); if (!r.ok) throw 1; return r.json(); };
const profilePath = (uid, preview = null) => {
  const cleanUid = String(uid || '').trim();
  const raw = String(preview?.profilePath || `${cleanUid}.json`).trim().replace(/^\/+/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!cleanUid || !parts.length || parts.some(part => !/^[A-Za-z0-9._-]+$/.test(part)) || parts.at(-1) !== `${cleanUid}.json`) return '';
  return parts.map(encodeURIComponent).join('/');
};
export const trackProfiles = {
  async init(api = {}) { st.api = api; return true; },
  async ensureIndex() {
    if (st.idx) return st.idx;
    try {
      const loaded = await fetchJ(getUrl(), 'intel:track-profiles-index:v4');
      const value = loaded && typeof loaded === 'object' ? loaded : { items: {} };
      st.idx = value.testData === true && window.APP_CONFIG?.INTEL_TEST_PROFILES_ENABLED !== true
        ? { version: value.version || 'track-profiles-index-v4', taxonomyVersion: value.taxonomyVersion || 'taxonomy-v3', vocabularyVersion: value.vocabularyVersion || 'track-profile-vocabulary-v2', testData: false, items: {} }
        : value;
      st.idxLoadedAt = Date.now();
      window.dispatchEvent(new CustomEvent('intel:track-profiles:index-ready', { detail: { count: Object.keys(st.idx.items || {}).length, testData: st.idx.testData === true } }));
      return st.idx;
    } catch {
      return st.idx = { version: 'track-profiles-index-v4', taxonomyVersion: 'taxonomy-v3', vocabularyVersion: 'track-profile-vocabulary-v2', testData: false, items: {} };
    }
  },
  async reloadIndex() { st.idx = null; st.idxLoadedAt = 0; return this.ensureIndex(); },
  async hasPreview(uid) { return !!this.getPreview(uid) || !!(await this.ensureIndex()).items?.[String(uid || '').trim()]; },
  getPreview: u => { const k = String(u || '').trim(); return k && st.idx?.items ? st.idx.items[k] || null : null; },
  async getProfile(uid) {
    const key = String(uid || '').trim();
    if (!key) return null;
    if (st.cache.has(key)) return st.cache.get(key);

    try {
      const index = await this.ensureIndex();
      const preview = index?.items?.[key] || null;
      const relativePath = profilePath(key, preview);
      if (!relativePath) return null;
      const url = `${getDir()}${relativePath}?cb=${window.APP_CONFIG?.APP_VERSION || Date.now()}`;
      const profile = await window.Utils.fetchCache.getJson({
        key: `intel:profile:${key}:${relativePath}`,
        url,
        ttlMs: 2592000000,
        store: 'local',
        fetchInit: { cache: 'force-cache' }
      });
      if (profile?.uid !== key) return null;
      st.cache.set(key, profile);
      return profile;
    } catch {
      return null;
    }
  },
  dropProfile: u => st.cache.delete(String(u || '').trim()),
  getState: () => ({ indexLoaded: !!st.idx, indexLoadedAt: st.idxLoadedAt, cachedProfiles: st.cache.size })
};
export default trackProfiles;

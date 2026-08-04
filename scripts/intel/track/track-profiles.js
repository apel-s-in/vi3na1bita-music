const st = { idx: null, idxLoadedAt: 0, cache: new Map(), api: null };
const getUrl = () => String(window.APP_CONFIG?.INTEL_LAYER_PROFILE_INDEX_URL || './data/track-profiles-index.json');
const getDir = () => String(window.APP_CONFIG?.INTEL_LAYER_PROFILE_DIR || './data/track-profiles/').replace(/\/+$/, '') + '/';
const fetchJ = async (u, k) => { const cU = `${u}?cb=${Date.now()}`, fc = window.Utils?.fetchCache; if (fc?.getJson) return fc.getJson({ key: k, url: cU, ttlMs: 43200000, store: 'session', fetchInit: { cache: 'no-cache' } }); const r = await (window.NetPolicy?.fetchWithTraffic?.(cU, { cache: 'no-cache' }) || fetch(cU, { cache: 'no-cache' })); if (!r.ok) throw 1; return r.json(); };
export const trackProfiles = {
  async init(api = {}) { st.api = api; return true; },
  async ensureIndex() {
    if (st.idx) return st.idx;
    try {
      const loaded = await fetchJ(getUrl(), 'intel:track-profiles-index:v1');
      const value = loaded && typeof loaded === 'object' ? loaded : { items: {} };
      st.idx = value.testData === true && window.APP_CONFIG?.INTEL_TEST_PROFILES_ENABLED !== true
        ? { version: value.version || 'track-profiles-index-v1', taxonomyVersion: value.taxonomyVersion || 'taxonomy-v2', testData: false, items: {} }
        : value;
      st.idxLoadedAt = Date.now();
      window.dispatchEvent(new CustomEvent('intel:track-profiles:index-ready', { detail: { count: Object.keys(st.idx.items || {}).length, testData: st.idx.testData === true } }));
      return st.idx;
    } catch {
      return st.idx = { version: 'track-profiles-index-v1', testData: false, items: {} };
    }
  },
  async reloadIndex() { st.idx = null; st.idxLoadedAt = 0; return this.ensureIndex(); },
  async hasPreview(uid) { return !!this.getPreview(uid) || !!(await this.ensureIndex()).items?.[String(uid || '').trim()]; },
  getPreview: u => { const k = String(u || '').trim(); return k && st.idx?.items ? st.idx.items[k] || null : null; },
  async getProfile(uid) { const k = String(uid || '').trim(); if (!k) return null; if (st.cache.has(k)) return st.cache.get(k); try { const cU = `${getDir()}${encodeURIComponent(k)}.json?cb=${window.APP_CONFIG?.APP_VERSION || Date.now()}`, d = await window.Utils.fetchCache.getJson({ key: `intel:profile:${k}`, url: cU, ttlMs: 2592000000, store: 'local', fetchInit: { cache: 'force-cache' } }); if (d) st.cache.set(k, d); return d || null; } catch { return null; } },
  dropProfile: u => st.cache.delete(String(u || '').trim()),
  getState: () => ({ indexLoaded: !!st.idx, indexLoadedAt: st.idxLoadedAt, cachedProfiles: st.cache.size })
};
export default trackProfiles;

// UID.019_(Compact TrackProfile index)_(быстро фильтровать и рекомендовать каталог)_(загружать и кэшировать легкий index отдельно от full profiles)
// UID.020_(Full TrackProfile per uid)_(открывать детальную карточку трека)_(лениво загружать файлы data/track-profiles/UID.json)
// UID.021_(musicAnalysis block)_(подготовить аудио-паспорт трека)_(читать этот блок из full profile когда он появится)
// UID.022_(lyricAnalysis block)_(подготовить текстовый паспорт трека)_(читать этот блок из full profile когда он появится)
// UID.023_(finalProfile block)_(иметь fused truth для рекомендаций)_(отдавать finalProfile из full JSON без влияния на playback)
// UID.088_(Profiles data layout)_(сохранить лёгкий startup)_(держать индекс отдельно и полные профили грузить по uid)
// UID.095_(Ownership boundary: legacy vs intel)_(не превращать semantic profiles в новый source-of-truth для playback/content)_(track-profiles слой только читает static semantic data и не владеет media/state logic)

const state = {
  index: null,
  indexLoadedAt: 0,
  profileCache: new Map(),
  api: null
};

const getIndexUrl = () => String(window.APP_CONFIG?.INTEL_LAYER_PROFILE_INDEX_URL || './data/track-profiles-index.json');
const getProfileDir = () => String(window.APP_CONFIG?.INTEL_LAYER_PROFILE_DIR || './data/track-profiles/').replace(/\/+$/, '') + '/';

async function fetchJson(url, cacheKey) {
  const fc = window.Utils?.fetchCache;
  if (fc?.getJson) {
    return fc.getJson({
      key: cacheKey,
      url,
      ttlMs: 12 * 60 * 60 * 1000,
      store: 'session',
      fetchInit: { cache: 'force-cache' }
    });
  }
  const res = await (window.NetPolicy?.fetchWithTraffic?.(url, { cache: 'force-cache' }) || fetch(url, { cache: 'force-cache' }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const trackProfiles = {
  async init(api = {}) {
    state.api = api;
    return true;
  },

  async ensureIndex() {
    if (state.index) return state.index;
    try {
      const data = await fetchJson(getIndexUrl(), 'intel:track-profiles-index:v1');
      state.index = data && typeof data === 'object' ? data : { items: {} };
      state.indexLoadedAt = Date.now();
      window.dispatchEvent(new CustomEvent('intel:track-profiles:index-ready', { detail: { count: Object.keys(state.index.items || {}).length } }));
      return state.index;
    } catch {
      state.index = { version: 'track-profiles-index-v1', items: {} };
      return state.index;
    }
  },

  async reloadIndex() {
    state.index = null;
    state.indexLoadedAt = 0;
    return this.ensureIndex();
  },

  async hasPreview(uid) {
    return !!this.getPreview(uid) || !!(await this.ensureIndex()).items?.[String(uid || '').trim()];
  },

  getPreview(uid) {
    const key = String(uid || '').trim();
    if (!key || !state.index?.items) return null;
    return state.index.items[key] || null;
  },

  async getProfile(uid) {
    const key = String(uid || '').trim();
    if (!key) return null;
    if (state.profileCache.has(key)) return state.profileCache.get(key);

    const url = `${getProfileDir()}${encodeURIComponent(key)}.json`;
    try {
      const data = await fetchJson(url, `intel:track-profile:${key}:v1`);
      if (data) state.profileCache.set(key, data);
      return data || null;
    } catch {
      return null; // Не кэшируем пустоту, чтобы плеер мог найти файл позже
    }
  },

  dropProfile(uid) {
    state.profileCache.delete(String(uid || '').trim());
  },

  getState() {
    return {
      indexLoaded: !!state.index,
      indexLoadedAt: state.indexLoadedAt,
      cachedProfiles: state.profileCache.size
    };
  }
};

export default trackProfiles;

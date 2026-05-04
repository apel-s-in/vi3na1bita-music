// UID.044_(ListenerProfile core)_(понимать вкус пользователя как сущность)_(строить отдельный profile-cache поверх локальных stats) UID.045_(Tag preferences)_(знать любимые жанры и смыслы)_(готовить поля preferences для taxonomy-групп) UID.046_(Axis preferences)_(знать эмоциональную геометрию пользователя)_(готовить axes preferences и summary) UID.047_(Feature affinity)_(видеть продуктовые привычки пользователя)_(агрегировать usage hints из stats) UID.048_(Time profile)_(учитывать когда слушает пользователь)_(готовить timeProfile на базе byHour/byWeekday) UID.049_(Behavior archetype)_(иметь human-readable портрет слушателя)_(оставить место под future archetype resolver) UID.050_(Session profile)_(развести общий вкус и текущий контекст)_(хранить session hooks отдельно от permanent profile) UID.095_(Ownership boundary: legacy vs intel)_(не превращать listener profile в новый stats/source-of-truth)_(этот слой только интерпретирует локальные aggregates/events/favorites и не владеет ими)
const state = { profile: null, lastBuiltAt: 0 };
export const listenerProfile = {
  async init() { window.addEventListener('stats:updated', () => this.scheduleRebuild()); return true; },
  async build() {
    let stats = []; try { const { metaDB } = await import('../../analytics/meta-db.js'); stats = await metaDB.getAllStats(); } catch {}
    const trks = stats.filter(s => s.uid && s.uid !== 'global');
    state.profile = { version: 'listener-profile-v1', builtAt: Date.now(), summary: { totalTracksTouched: trks.filter(s => (s.globalValidListenCount || 0) > 0).length, totalFullListens: trks.reduce((a, s) => a + (s.globalFullListenCount || 0), 0), totalListenSeconds: trks.reduce((a, s) => a + (s.globalListenSeconds || 0), 0), activeFavorites: window.FavoritesManager?.getSnapshot?.().filter(i => !i.inactiveAt && !i.deletedAt).length || 0 }, preferences: { tags: {}, axes: {}, themes: {}, styles: {}, useCases: {} }, behavior: { archetype: '', featureAffinity: {}, timeProfile: {}, sessionProfile: {} } };
    state.lastBuiltAt = Date.now(); window.dispatchEvent(new CustomEvent('intel:listener-profile:updated', { detail: state.profile })); return state.profile;
  },
  scheduleRebuild() { clearTimeout(this._t); this._t = setTimeout(() => this.build().catch(() => {}), 250); },
  async get() { return state.profile || this.build(); },
  getSync() { return state.profile; }
};
export default listenerProfile;

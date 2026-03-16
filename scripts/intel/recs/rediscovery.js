// UID.053_(Rediscovery engine)_(возвращать забытые любимые треки)_(держать отдельный источник forgotten_hits, не смешивая его с common recs)
// UID.062_(Recommendation memory and feedback)_(не спамить одинаковыми возвратами)_(позже учитывать cooldown и recommendation_state)
// UID.095_(Ownership boundary: legacy vs intel)_(rediscovery не должен владеть favorites/history truth)_(модуль только вычисляет кандидатов поверх existing stats/favorites и не меняет их напрямую)

export const rediscovery = {
  async init() {
    return true;
  },

  async getCandidates() {
    return [];
  }
};

export default rediscovery;

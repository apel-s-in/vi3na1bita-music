// UID.051_(Collection state)_(сделать треки собираемыми объектами)_(вести per-uid user-state для badges/completion)
// UID.052_(Track badges and completion)_(дать геймификацию и collectible cards)_(готовить badges на основе favorite/stats/features)

function isFavorite(uid) {
  try { return !!window.playerCore?.isFavorite?.(uid); } catch { return false; }
}

export const listenerCollection = {
  async init() {
    return true;
  },

  async getTrackState(uid) {
    const safeUid = String(uid || '').trim();
    if (!safeUid) return null;

    return {
      uid: safeUid,
      badges: {
        favorite: isFavorite(safeUid)
      },
      completionPercent: isFavorite(safeUid) ? 0.15 : 0
    };
  }
};

export default listenerCollection;

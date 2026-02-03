// scripts/core/favorites-v2.js
// Optimized Favorites Core v2.2
const LS = localStorage, J = JSON;
const K_L = "likedTrackUids:v2", K_R = "favoritesRefsByUid:v2";

const sStr = (v) => String(v || '').trim();
const get = (k, d) => { try { return J.parse(LS.getItem(k)) || d } catch { return d } };
const set = (k, v) => LS.setItem(k, J.stringify(v));
const now = Date.now;

const F2 = {
  keys: { LIKED_UIDS_V2: K_L, REFS_BY_UID_V2: K_R },

  ensureMigrated() {
    if (LS.getItem(K_L)) return; // Fast check
    try {
      const l = new Set(), r = {};
      const add = (u) => { if(u=sStr(u)) { l.add(u); if(!r[u]) r[u] = { uid:u, addedAt:now(), inactiveAt:null }; } };
      
      // One-time migration v1 -> v2
      const v1L = get("likedTrackUids:v1", {}), v1R = get("favoritesAlbumRefsByUid:v1", []);
      Object.values(v1L).flat().forEach(add);
      v1R.forEach(x => add(x?.uid));
      
      set(K_L, [...l]); set(K_R, r);
      LS.removeItem("likedTrackUids:v1"); LS.removeItem("favoritesAlbumRefsByUid:v1");
    } catch (e) { console.warn('Mig err', e); }
  },

  readLikedSet: () => new Set(get(K_L, [])),
  readRefsByUid: () => get(K_R, {}),
  writeLikedSet: (s) => set(K_L, [...s]), // Compat
  writeRefsByUid: (o) => set(K_R, o),     // Compat

  toggle(uid, { source = "album" } = {}) {
    this.ensureMigrated();
    const u = sStr(uid); if (!u) return { liked: false };
    
    const l = this.readLikedSet(), r = this.readRefsByUid();
    const next = !l.has(u);

    if (next) {
      l.add(u);
      r[u] = { uid: u, addedAt: r[u]?.addedAt || now(), inactiveAt: null };
    } else {
      l.delete(u);
      // ТЗ: В окне избранного (source='favorites') только помечаем как inactive (soft delete).
      // В альбоме (source='album') удаляем полностью (hard delete).
      if (source === "favorites") r[u] = { ...r[u], uid: u, inactiveAt: now() };
      else delete r[u];
    }

    set(K_L, [...l]); set(K_R, r);
    return { liked: next };
  },

  removeRef(uid) {
    this.ensureMigrated();
    const u = sStr(uid), r = this.readRefsByUid();
    if (!r[u]) return false;
    delete r[u];
    set(K_R, r);
    return true;
  }
};

export const FavoritesV2 = F2;
export default F2;

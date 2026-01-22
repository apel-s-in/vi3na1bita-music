// scripts/core/favorites-v2.js
const W = window;

const LS = Object.freeze({
  // v2
  LIKED_UIDS_V2: "likedTrackUids:v2", // string[]
  REFS_BY_UID_V2: "favoritesRefsByUid:v2", // { [uid]: { uid, addedAt, inactiveAt|null } }

  // legacy v1
  LIKED_BY_ALBUM_V1: "likedTrackUids:v1", // { [albumKey]: uid[] }
  REFS_V1: "favoritesAlbumRefsByUid:v1", // Array<{a, uid}>
});

function safeStr(x) {
  return String(x ?? "").trim();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nowTs() {
  return Date.now();
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const s = safeStr(x);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export const FavoritesV2 = {
  keys: LS,

  ensureMigrated() {
    const hasLikedV2 = !!localStorage.getItem(LS.LIKED_UIDS_V2);
    const hasRefsV2 = !!localStorage.getItem(LS.REFS_BY_UID_V2);
    if (hasLikedV2 && hasRefsV2) return;

    // liked v1 -> global liked set
    const likedByAlbum = readJson(LS.LIKED_BY_ALBUM_V1, {});
    const likedSet = new Set();
    if (likedByAlbum && typeof likedByAlbum === "object") {
      for (const uids of Object.values(likedByAlbum)) {
        for (const uid of Array.isArray(uids) ? uids : []) {
          const u = safeStr(uid);
          if (u) likedSet.add(u);
        }
      }
    }

    // refs v1 -> refsByUid v2
    const refsV1 = readJson(LS.REFS_V1, []);
    const refsByUid = {};
    if (Array.isArray(refsV1)) {
      for (const it of refsV1) {
        const u = safeStr(it?.uid);
        if (!u) continue;
        if (!refsByUid[u]) refsByUid[u] = { uid: u, addedAt: nowTs(), inactiveAt: null };
      }
    }

    // ensure every liked has a ref
    for (const u of likedSet) {
      if (!refsByUid[u]) refsByUid[u] = { uid: u, addedAt: nowTs(), inactiveAt: null };
      refsByUid[u].inactiveAt = null;
    }

    writeJson(LS.LIKED_UIDS_V2, Array.from(likedSet));
    writeJson(LS.REFS_BY_UID_V2, refsByUid);

    // If only one existed, still ensure both exist
    if (!hasLikedV2) writeJson(LS.LIKED_UIDS_V2, Array.from(likedSet));
    if (!hasRefsV2) writeJson(LS.REFS_BY_UID_V2, refsByUid);

    // ✅ Финальная чистка: v1 больше не держим "вживую".
    // Удаляем legacy ключи ПОСЛЕ успешной записи v2 (best-effort).
    try { localStorage.removeItem(LS.LIKED_BY_ALBUM_V1); } catch {}
    try { localStorage.removeItem(LS.REFS_V1); } catch {}
  },

  readLikedSet() {
    const arr = readJson(LS.LIKED_UIDS_V2, []);
    return new Set(uniqStrings(Array.isArray(arr) ? arr : []));
  },

  writeLikedSet(set) {
    writeJson(LS.LIKED_UIDS_V2, Array.from(set || []));
  },

  readRefsByUid() {
    const obj = readJson(LS.REFS_BY_UID_V2, {});
    const out = {};
    if (obj && typeof obj === "object") {
      for (const [uid, ref] of Object.entries(obj)) {
        const u = safeStr(uid);
        if (!u) continue;
        out[u] = {
          uid: u,
          addedAt: Number(ref?.addedAt) || 0,
          inactiveAt: ref?.inactiveAt ? Number(ref.inactiveAt) : null,
        };
      }
    }
    return out;
  },

  writeRefsByUid(refsByUid) {
    writeJson(LS.REFS_BY_UID_V2, refsByUid || {});
  },

  /**
   * Toggle like with TZ rules:
   * - source='album': unlike removes ref (no inactive row)
   * - source='favorites': unlike keeps ref and marks inactiveAt
   */
  toggle(uid, { source = "album" } = {}) {
    const u = safeStr(uid);
    if (!u) return { liked: false };

    this.ensureMigrated();

    const liked = this.readLikedSet();
    const refs = this.readRefsByUid();

    const isLiked = liked.has(u);
    const nextLiked = !isLiked;

    if (nextLiked) {
      liked.add(u);
      const ref = refs[u] || { uid: u, addedAt: nowTs(), inactiveAt: null };
      if (!ref.addedAt) ref.addedAt = nowTs();
      ref.inactiveAt = null;
      refs[u] = ref;
    } else {
      liked.delete(u);

      if (source === "favorites") {
        const ref = refs[u] || { uid: u, addedAt: nowTs(), inactiveAt: null };
        if (!ref.addedAt) ref.addedAt = nowTs();
        ref.inactiveAt = nowTs();
        refs[u] = ref;
      } else {
        // album
        delete refs[u];
      }
    }

    this.writeLikedSet(liked);
    this.writeRefsByUid(refs);

    return { liked: nextLiked };
  },

  removeRef(uid) {
    const u = safeStr(uid);
    if (!u) return false;

    this.ensureMigrated();

    const refs = this.readRefsByUid();
    if (!refs[u]) return false;

    delete refs[u];
    this.writeRefsByUid(refs);
    return true;
  },
};

export default FavoritesV2;

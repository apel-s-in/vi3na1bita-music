// UID.001_(Playback safety invariant)_(защитить ядро плеера)_(все intel-модули обязаны помнить что playback не трогается)
// UID.008_(No playback mutation by intel)_(не ломать playing playlist и позицию)_(использовать guard helpers вместо прямого вмешательства)
// UID.091_(No-op stubs before full implementation)_(оставить слой безопасным до реализации логики)_(делать safeCall/safeAsync и мягкие fallback)
// UID.095_(Ownership boundary: legacy vs intel)_(не дать future коду проломить архитектурные границы)_(guards — это policy layer, запрещающий intel считать себя владельцем playback/core truth)

export const intelGuards = {
  getCurrentUid() {
    try { return String(window.playerCore?.getCurrentTrackUid?.() || '').trim() || null; } catch { return null; }
  },

  isPlaybackActive() {
    try { return !!window.playerCore?.isPlaying?.(); } catch { return false; }
  },

  canMutatePlayback() {
    return false;
  },

  safeCall(fn, fallback = null) {
    try { return fn(); } catch { return fallback; }
  },

  async safeAsync(fn, fallback = null) {
    try { return await fn(); } catch { return fallback; }
  },

  normalizeKey(value) {
    return String(value || '').trim();
  },

  isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
};

export default intelGuards;

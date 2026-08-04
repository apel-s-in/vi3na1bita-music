export const intelGuards = {
  getCurrentUid: () => { try { return String(window.playerCore?.getCurrentTrackUid?.() || '').trim() || null; } catch { return null; } },
  isPlaybackActive: () => { try { return !!window.playerCore?.isPlaying?.(); } catch { return false; } },
  canMutatePlayback: () => false,
  safeCall: (fn, fb = null) => { try { return fn(); } catch { return fb; } },
  safeAsync: async (fn, fb = null) => { try { return await fn(); } catch { return fb; } },
  normalizeKey: v => String(v || '').trim(),
  isPlainObject: v => !!v && typeof v === 'object' && !Array.isArray(v)
};
export default intelGuards;

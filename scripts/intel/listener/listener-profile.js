// Listener Profile v2 — rebuildable interpretation поверх локальных stats.
// Не является source-of-truth, не управляет playback и не перестраивается во время музыки.
import { metaDB } from '../../analytics/meta-db.js';
import { sha256Hex, stableStringify } from '../../analytics/event-integrity.js';
import { getRecommendationControls } from '../../analytics/backup-domain-state.js';
import { trackProfiles } from '../track/track-profiles.js';

const PROFILE_KEY = 'current';
const VERSION = 'listener-profile-v3';
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const weighted = () => new Map();
const add = (map, key, value) => {
  const clean = safe(key);
  const amount = num(value);
  if (clean && amount > 0) map.set(clean, num(map.get(clean)) + amount);
};
const top = (map, limit = 8) => [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([key, weight]) => ({ key, weight }));
const profileMap = (preview, key) => preview?.finalProfile?.[key] || preview?.[key] || preview?.preferences?.[key] || {};
const rowsOfMap = raw => raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw) : [];
const dayparts = byHour => ({
  night: byHour.slice(0, 6).reduce((sum, value) => sum + num(value), 0),
  morning: byHour.slice(6, 12).reduce((sum, value) => sum + num(value), 0),
  day: byHour.slice(12, 18).reduce((sum, value) => sum + num(value), 0),
  evening: byHour.slice(18, 24).reduce((sum, value) => sum + num(value), 0)
});

const sourceHash = async stats => {
  const rollups = await metaDB.getStoreAll('backup_stats_rollups').catch(() => []);
  const hashes = rollups.map(row => safe(row?.sourceHash)).filter(Boolean).sort();
  return sha256Hex(stableStringify({ hashes, stats: stats.map(row => [row.uid, row.globalListenSeconds, row.globalValidListenCount, row.globalFullListenCount]) }));
};

const archetypes = ({ tracks, totalFull, totalValid, totalSeconds, lyricsUsed }) => {
  const touched = tracks.filter(row => num(row.globalListenSeconds) > 0).length;
  const fullPerTrack = touched ? totalFull / touched : 0;
  const validPerTrack = touched ? totalValid / touched : 0;
  const candidates = [
    { key: 'repeater', score: Math.min(1, fullPerTrack / 8) },
    { key: 'explorer', score: Math.min(1, touched / 40) * (validPerTrack < 4 ? 1 : 0.65) },
    { key: 'deep_listener', score: Math.min(1, totalFull / Math.max(1, totalValid)) },
    { key: 'lyrics_focused', score: Math.min(1, lyricsUsed / Math.max(1, touched)) },
    { key: 'long_session_listener', score: Math.min(1, totalSeconds / (50 * 3600)) }
  ];
  return candidates.filter(item => item.score >= 0.15).sort((left, right) => right.score - left.score).slice(0, 3);
};

const state = { profile: null, lastBuiltAt: 0, timer: 0, initialized: false, rebuildPending: false };

export const listenerProfile = {
  async init() {
    if (state.initialized) return true;
    state.initialized = true;
    const stored = (await metaDB.getStoreValue('listener_profile', PROFILE_KEY).catch(() => null))?.value || null;
    state.profile = stored?.version === VERSION ? stored : null;
    if (!state.profile) this.scheduleRebuild(800);
    const schedule = () => this.scheduleRebuild();
    window.addEventListener('stats:updated', schedule);
    window.addEventListener('stats:rebuilt', schedule);
    window.addEventListener('favorites:updated', schedule);
    window.addEventListener('account:data-switching', () => {
      clearTimeout(state.timer);
      state.timer = 0;
      state.profile = null;
      state.rebuildPending = false;
    });
    window.addEventListener('account:data-switched', async () => {
      const stored = (await metaDB.getStoreValue('listener_profile', PROFILE_KEY).catch(() => null))?.value || null;
      state.profile = stored?.version === VERSION ? stored : null;
      this.scheduleRebuild(1200);
    });
    ['player:pause', 'player:stop', 'player:ended'].forEach(name => window.addEventListener(name, () => {
      if (state.rebuildPending) this.scheduleRebuild(1200);
    }));
    return true;
  },

  async build({ force = false } = {}) {
    if (!force && window.playerCore?.isPlaying?.()) {
      state.rebuildPending = true;
      return state.profile;
    }

    state.rebuildPending = false;
    await trackProfiles.ensureIndex().catch(() => null);
    const stats = await metaDB.getAllStats().catch(() => []);
    const tracks = stats.filter(row => row?.uid && row.uid !== 'global');
    const global = stats.find(row => row?.uid === 'global') || {};
    const genres = weighted();
    const styles = weighted();
    const moods = weighted();
    const themes = weighted();
    const useCases = weighted();
    const axesSum = weighted();
    const axesWeight = weighted();
    const byHour = Array(24).fill(0);
    const byWeekday = Array(7).fill(0);

    let totalSeconds = 0;
    let totalValid = 0;
    let totalFull = 0;

    tracks.forEach(row => {
      const seconds = num(row.globalListenSeconds);
      const weight = Math.max(1, seconds);
      const preview = trackProfiles.getPreview(row.uid) || {};
      totalSeconds += seconds;
      totalValid += num(row.globalValidListenCount);
      totalFull += num(row.globalFullListenCount);
      (row.byHour || []).forEach((value, index) => {
        if (index < 24) byHour[index] += num(value);
      });
      (row.byWeekday || []).forEach((value, index) => {
        if (index < 7) byWeekday[index] += num(value);
      });
      rowsOfMap(profileMap(preview, 'genres')).forEach(([key, value]) => add(genres, key, num(value) * weight));
      rowsOfMap(profileMap(preview, 'styles')).forEach(([key, value]) => add(styles, key, num(value) * weight));
      rowsOfMap(profileMap(preview, 'moods')).forEach(([key, value]) => add(moods, key, num(value) * weight));
      rowsOfMap(profileMap(preview, 'themes')).forEach(([key, value]) => add(themes, key, num(value) * weight));
      rowsOfMap(profileMap(preview, 'use_cases')).forEach(([key, value]) => add(useCases, key, num(value) * weight));
      rowsOfMap(profileMap(preview, 'axes')).forEach(([key, value]) => {
        add(axesSum, key, num(value) * weight);
        add(axesWeight, key, weight);
      });
    });

    const axes = new Map([...axesSum.entries()].map(([key, value]) => [key, value / Math.max(1, num(axesWeight.get(key)))]));
    const profile = {
      version: VERSION,
      source: 'local_rebuildable',
      builtAt: Date.now(),
      builtFromRangeHash: await sourceHash(stats),
      summary: {
        totalTracksTouched: tracks.filter(row => num(row.globalListenSeconds) > 0).length,
        totalFullListens: totalFull,
        totalValidListens: totalValid,
        totalListenSeconds: totalSeconds,
        activeFavorites: window.FavoritesManager?.getSnapshot?.().filter(item => !item.inactiveAt && !item.deletedAt).length || 0
      },
      preferences: {
        genres: top(genres),
        styles: top(styles),
        moods: top(moods),
        themes: top(themes),
        use_cases: top(useCases),
        axes: top(axes)
      },
      behavior: {
        archetypes: archetypes({
          tracks,
          totalFull,
          totalValid,
          totalSeconds,
          lyricsUsed: num(global.featuresUsed?.lyrics)
        }),
        featureAffinity: { ...(global.featuresUsed || {}) },
        timeProfile: {
          byHour,
          byWeekday,
          dayparts: dayparts(byHour),
          peakHour: byHour.some(Boolean) ? byHour.indexOf(Math.max(...byHour)) : 0,
          weekendSeconds: num(byWeekday[5]) + num(byWeekday[6])
        }
      },
      recommendationControls: getRecommendationControls(),
      confidence: Math.min(1, totalSeconds / (20 * 3600))
    };

    state.profile = profile;
    state.lastBuiltAt = profile.builtAt;
    await metaDB.setStoreValue('listener_profile', PROFILE_KEY, profile);
    window.dispatchEvent(new CustomEvent('intel:listener-profile:updated', { detail: profile }));
    return profile;
  },

  scheduleRebuild(delayMs = 2000) {
    clearTimeout(state.timer);
    if (window.playerCore?.isPlaying?.()) {
      state.rebuildPending = true;
      return false;
    }
    state.timer = setTimeout(() => {
      state.timer = 0;
      this.build().catch(() => null);
    }, Math.max(500, Number(delayMs) || 2000));
    return true;
  },

  async get() {
    return state.profile || this.build();
  },

  getSync() {
    return state.profile;
  }
};

export default listenerProfile;

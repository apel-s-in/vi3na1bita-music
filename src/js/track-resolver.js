/**
 * TrackResolver — выбор источника для playback (ТЗ 19.1, 7.4.3)
 * Нормативный Source Resolver: local → network → fallback
 */

import { getAudioEntry, getAudioBlobURL, getTrackMeta, saveTrackMeta } from './cache-db.js';
import { getMode, getActivePlaybackQuality, isNetworkAllowedForPlayback, MODES } from './mode-manager.js';

const BASE_URL_KEY = 'app:baseUrl:v1';

function _getBaseUrl() {
  return localStorage.getItem(BASE_URL_KEY) || '';
}

function setBaseUrl(url) {
  localStorage.setItem(BASE_URL_KEY, url);
}

/**
 * Get variant URL from track config
 * @param {Object} track - track object from config
 * @param {string} variant - 'hi' or 'lo'
 * @returns {string|null} relative path
 */
function getTrackVariantPath(track, variant) {
  if (!track) return null;
  if (variant === 'lo') return track.audio_low || null;
  return track.audio || null;
}

/**
 * Get size for variant (ТЗ 11.2.E.4: defaults if missing)
 */
function getTrackSize(track, variant) {
  if (!track) return 5;
  if (variant === 'lo') return track.size_low || 3;
  return track.size || 8;
}

/**
 * Check if track has given variant available
 */
function hasVariant(track, variant) {
  return !!getTrackVariantPath(track, variant);
}

/**
 * ТЗ 7.4.3 — Normative Source Resolver
 * @param {Object} track - track object {uid, audio, audio_low, ...}
 * @param {string} [baseUrl] - base URL for remote files
 * @returns {Promise<{url, effectiveQuality, isLocal, cacheKind}>}
 */
async function resolvePlayback(track, baseUrl) {
  if (!track || !track.uid) {
    return { url: null, effectiveQuality: null, isLocal: false, cacheKind: 'none' };
  }

  const uid = track.uid;
  const mode = getMode();
  const apq = getActivePlaybackQuality();
  const base = baseUrl || _getBaseUrl();

  // Step 1: local copy matching ActivePlaybackQuality
  const audioEntry = await getAudioEntry(uid);
  if (audioEntry && audioEntry.variant === apq) {
    const blobUrl = URL.createObjectURL(audioEntry.blob);
    const meta = await getTrackMeta(uid);
    const kind = meta ? meta.cacheKind : 'dynamic';
    return { url: blobUrl, effectiveQuality: apq, isLocal: true, cacheKind: kind };
  }

  // Step 2: network (if allowed)
  if (mode !== MODES.R3 && isNetworkAllowedForPlayback()) {
    const path = getTrackVariantPath(track, apq);
    if (path) {
      const networkUrl = base ? `${base}/${path}` : path;
      return { url: networkUrl, effectiveQuality: apq, isLocal: false, cacheKind: 'none' };
    }
    // If desired variant path doesn't exist, try the other
    const fallbackVariant = apq === 'hi' ? 'lo' : 'hi';
    const fallbackPath = getTrackVariantPath(track, fallbackVariant);
    if (fallbackPath) {
      const networkUrl = base ? `${base}/${fallbackPath}` : fallbackPath;
      return { url: networkUrl, effectiveQuality: fallbackVariant, isLocal: false, cacheKind: 'none' };
    }
  }

  // Step 3: fallback — local copy of different quality (best effort)
  if (audioEntry) {
    const blobUrl = URL.createObjectURL(audioEntry.blob);
    const meta = await getTrackMeta(uid);
    const kind = meta ? meta.cacheKind : 'dynamic';
    // Mark needsReCache (ТЗ 7.4.3 step 3)
    if (meta && meta.cachedVariant !== apq) {
      meta.needsReCache = true;
      await saveTrackMeta(meta);
    }
    return { url: blobUrl, effectiveQuality: audioEntry.variant, isLocal: true, cacheKind: kind };
  }

  // No source available
  return { url: null, effectiveQuality: null, isLocal: false, cacheKind: 'none' };
}

/**
 * Resolve a specific variant URL for downloading
 */
function resolveVariantUrl(track, variant, baseUrl) {
  const base = baseUrl || _getBaseUrl();
  const path = getTrackVariantPath(track, variant);
  if (!path) return null;
  return base ? `${base}/${path}` : path;
}

/**
 * Check network availability (real check with timeout)
 */
async function checkNetworkAvailable(testUrl, timeout = 5000) {
  if (!navigator.onLine) return false;
  if (!testUrl) return navigator.onLine;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(testUrl, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal
    });
    clearTimeout(timer);
    return true;
  } catch (e) {
    return false;
  }
}

export {
  resolvePlayback, resolveVariantUrl,
  getTrackVariantPath, getTrackSize, hasVariant,
  checkNetworkAvailable, setBaseUrl
};

/**
 * StatsCore — единая точка подсчёта статистики (ТЗ 18)
 * Cloud stats (сбрасываемая) + Global stats (вечная)
 * Привязка по uid, не зависит от качества/источника/режима
 */

import { getTrackMeta, saveTrackMeta, getGlobalStats, saveGlobalStats, getAllGlobalStats } from './cache-db.js';

let _currentUid = null;
let _tickTimer = null;
const GLOBAL_TOTAL_KEY = 'stats:globalTotalListenSeconds:v1';

function _getCloudN() {
  const v = localStorage.getItem('offline:cloudN:v1');
  return v ? parseInt(v, 10) : 5;
}
function _getCloudD() {
  const v = localStorage.getItem('offline:cloudD:v1');
  return v ? parseInt(v, 10) : 31;
}

/** ТЗ 18.3: onTrackStart */
async function onTrackStart(uid) {
  if (_currentUid && _currentUid !== uid) {
    _stopTicking();
  }
  _currentUid = uid;
  _startTicking();
}

/** ТЗ 18.3: onSecondTick */
async function onSecondTick(uid, delta) {
  if (uid !== _currentUid) return;
  try {
    const gs = await getGlobalStats(uid);
    gs.globalListenSeconds = (gs.globalListenSeconds || 0) + delta;
    await saveGlobalStats(uid, gs);
    const cur = parseFloat(localStorage.getItem(GLOBAL_TOTAL_KEY) || '0');
    localStorage.setItem(GLOBAL_TOTAL_KEY, String(cur + delta));
  } catch (e) {
    console.error('[StatsCore] tick error', e);
  }
}

/** ТЗ 18.3: onSeek — no-op for stats, just logged */
function onSeek(uid, from, to) { /* no stat effect */ }

/** ТЗ 18.3: onEnded */
async function onEnded(uid, progress, durationValid) {
  _stopTicking();
  if (uid !== _currentUid) return;
  if (durationValid && progress > 0.9) {
    await _recordFullListen(uid);
  }
}

/** ТЗ 18.3: onSkip — >90% counts as full listen */
async function onSkip(uid, progress, durationValid) {
  _stopTicking();
  if (uid !== _currentUid) return;
  if (durationValid && progress > 0.9) {
    await _recordFullListen(uid);
  }
}

async function _recordFullListen(uid) {
  try {
    // Global stats (never reset)
    const gs = await getGlobalStats(uid);
    gs.globalFullListenCount = (gs.globalFullListenCount || 0) + 1;
    await saveGlobalStats(uid, gs);

    // Cloud stats
    const meta = await getTrackMeta(uid);
    if (!meta) return;

    meta.cloudFullListenCount = (meta.cloudFullListenCount || 0) + 1;
    meta.lastFullListenAt = Date.now();

    const N = _getCloudN();
    const D = _getCloudD();

    // ТЗ 9.3A: auto-cloud
    if (!meta.cloud && !meta.pinned && meta.cloudFullListenCount >= N) {
      meta.cloud = true;
      meta.cloudAddedAt = Date.now();
      meta.cloudExpiresAt = Date.now() + D * 86400000;
      window.dispatchEvent(new CustomEvent('cloudTriggered', { detail: { uid } }));
    }

    // ТЗ 9.4: extend TTL
    if (meta.cloud) {
      meta.cloudExpiresAt = Date.now() + D * 86400000;
    }

    await saveTrackMeta(meta);
  } catch (e) {
    console.error('[StatsCore] full listen error', e);
  }
}

function _startTicking() {
  _stopTicking();
  _tickTimer = setInterval(() => {
    if (_currentUid) onSecondTick(_currentUid, 1);
  }, 1000);
}

function _stopTicking() {
  if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
}

function pauseTicking() { _stopTicking(); }
function resumeTicking() { if (_currentUid) _startTicking(); }

function getGlobalTotalListenSeconds() {
  return parseFloat(localStorage.getItem(GLOBAL_TOTAL_KEY) || '0');
}

/** ТЗ 19.4: top tracks with >= minFullListens */
async function getTopTracks(minFullListens = 3) {
  const all = await getAllGlobalStats();
  return all
    .filter(s => (s.globalFullListenCount || 0) >= minFullListens)
    .sort((a, b) => (b.globalFullListenCount || 0) - (a.globalFullListenCount || 0));
}

/** ТЗ 9.5: reset cloud stats only */
async function resetCloudStats(uid) {
  const meta = await getTrackMeta(uid);
  if (!meta) return;
  meta.cloudFullListenCount = 0;
  meta.lastFullListenAt = null;
  meta.cloudAddedAt = null;
  meta.cloudExpiresAt = null;
  meta.cloud = false;
  await saveTrackMeta(meta);
}

function getCurrentUid() { return _currentUid; }

export {
  onTrackStart, onSecondTick, onSeek, onEnded, onSkip,
  pauseTicking, resumeTicking,
  getGlobalTotalListenSeconds, getTopTracks,
  resetCloudStats, getCurrentUid
};

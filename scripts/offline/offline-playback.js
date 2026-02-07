/**
 * offline-playback.js — Fix #19.1/#19.2/#19.3
 * Поведение при потере сети: skip, protect window, FOQ.
 */

import { hasAudioForUid } from './cache-db.js';

let _active = false;

export function initOfflinePlayback() {
  window.addEventListener('offline', _onOffline);
  window.addEventListener('online', _onOnline);

  const pc = window.playerCore;
  if (!pc) return;

  // Wrap load to catch network errors
  const origLoad = pc.load.bind(pc);
  pc._origLoad = origLoad;
  pc.load = async function(idx, opts) {
    try {
      await origLoad(idx, opts);
    } catch (e) {
      const blocked = !navigator.onLine || (window.NetPolicy && !window.NetPolicy.isNetworkAllowed());
      if (blocked) {
        await _skipToNextAvailable(idx, opts?.dir || 1);
      } else {
        throw e;
      }
    }
  };
}

async function _onOffline() {
  _active = true;
  const mgr = window.OfflineManager;
  if (!mgr || mgr.getMode() !== 'R1') return;

  try {
    const { protectWindow } = await import('../app/playback-cache-bootstrap.js');
    protectWindow();
  } catch {}
}

async function _onOnline() {
  if (!_active) return;
  _active = false;
  try {
    const { unprotectWindow } = await import('../app/playback-cache-bootstrap.js');
    unprotectWindow();
  } catch {}
}

// Fix #19.1
async function _skipToNextAvailable(fromIdx, dir = 1) {
  const pc = window.playerCore;
  if (!pc) return;
  const playlist = pc.getPlaylistSnapshot?.() || [];
  if (!playlist.length) return;

  const len = playlist.length;
  let idx = fromIdx;
  let attempts = 0;

  while (attempts < len) {
    idx = dir >= 0 ? (idx + 1) % len : (idx - 1 + len) % len;
    attempts++;

    const track = playlist[idx];
    if (!track?.uid) continue;

    const uid = String(track.uid).trim();
    const hasBlob = await hasAudioForUid(uid);

    if (hasBlob) {
      try {
        await pc._origLoad(idx, { autoPlay: true, dir });
        return;
      } catch { continue; }
    }
  }

  const toast = window.NotificationSystem?.warning || window.toast;
  if (toast) toast('Нет доступных треков офлайн.');
}

export default { initOfflinePlayback };

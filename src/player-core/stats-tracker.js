// src/player-core/stats-tracker.js
function safeUid(v) { return String(v || '').trim() || null; }

export function createListenStatsTracker({ getUid, getPos, getDur, record } = {}) {
  const state = { lastSecond: -1, activeUid: null };

  function onTick() {
    const uid = safeUid(getUid());
    if (!uid) return;
    
    if (uid !== state.activeUid) { state.activeUid = uid; state.lastSecond = -1; }
    
    const pos = Math.floor(getPos() || 0);
    if (pos > state.lastSecond) {
        state.lastSecond = pos;
        record(uid, { deltaSec: 1, isFullListen: false });
    }
  }

  function onEnded() {
    const uid = safeUid(getUid());
    if (!uid) return;
    
    const dur = getDur();
    const pos = getPos();
    // 90% threshold for full listen
    const isFull = (dur > 0 && (pos / dur) > 0.9);
    
    record(uid, { deltaSec: 0, isFullListen: isFull });
  }

  return { onTick, onEnded, onPauseOrStop: () => {} };
}

// src/player-core/stats-tracker.js
// Fix #2.4/#8.1: Added onSkip method
// Fix #8.2: onEnded checks active UID

function safeUid(v) { return String(v || '').trim() || null; }

export function createListenStatsTracker({ getUid, getPos, getDur, recordTick, recordEnd } = {}) {
  const state = { lastSecond: -1, activeUid: null, endedFired: false };

  function onTick() {
    const uid = safeUid(getUid());
    if (!uid) return;

    if (uid !== state.activeUid) {
      if (state.activeUid && window.GlobalStatsManager?.flush) {
        window.GlobalStatsManager.flush().catch(() => {});
      }
      state.activeUid = uid;
      state.lastSecond = -1;
      state.endedFired = false;
    }

    const pos = Math.floor(getPos() || 0);
    if (pos > state.lastSecond) {
      state.lastSecond = pos;
      if (window.GlobalStatsManager?.recordTick) {
        window.GlobalStatsManager.recordTick(uid, { deltaSec: 1 });
      }
      if (recordTick) recordTick(uid, { deltaSec: 1 });
    }
  }

  function onEnded() {
    const uid = safeUid(getUid());
    if (!uid) return;
    // Fix #8.2: Check that UID matches active
    if (uid !== state.activeUid) return;
    if (state.endedFired) return;
    state.endedFired = true;

    const dur = getDur() || 0;
    const pos = getPos() || 0;

    if (window.GlobalStatsManager?.registerFullListen) {
      window.GlobalStatsManager.registerFullListen(uid, { duration: dur, position: pos });
    }
    if (recordEnd) recordEnd(uid, { duration: dur, position: pos });
  }

  // Fix #2.4/#8.1: onSkip — check if >90% progress, register full listen
  function onSkip() {
    const uid = safeUid(getUid());
    if (!uid || uid !== state.activeUid) return;

    const dur = getDur() || 0;
    const pos = getPos() || 0;

    // Fix #11.1: Flush accumulated seconds before skip
    if (window.GlobalStatsManager?.flush) {
      window.GlobalStatsManager.flush().catch(() => {});
    }

    // If >90% played, count as full listen
    if (dur > 0 && (pos / dur) >= 0.9 && !state.endedFired) {
      state.endedFired = true;
      if (window.GlobalStatsManager?.registerFullListen) {
        window.GlobalStatsManager.registerFullListen(uid, { duration: dur, position: pos });
      }
      if (recordEnd) recordEnd(uid, { duration: dur, position: pos });
    }
  }

  return { onTick, onEnded, onSkip, onPauseOrStop: () => {} };
}

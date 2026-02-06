// src/player-core/stats-tracker.js
// Разделённый трекер: tick (секунды) и ended (full listen).
// ТЗ П.5.2: Full listen = duration > 0 && position/duration > 0.9

function safeUid(v) { return String(v || '').trim() || null; }

export function createListenStatsTracker({ getUid, getPos, getDur, recordTick, recordEnd } = {}) {
  const state = { lastSecond: -1, activeUid: null, endedFired: false };

  function onTick() {
    const uid = safeUid(getUid());
    if (!uid) return;

    if (uid !== state.activeUid) {
      state.activeUid = uid;
      state.lastSecond = -1;
      state.endedFired = false;
    }

    const pos = Math.floor(getPos() || 0);
    if (pos > state.lastSecond) {
      state.lastSecond = pos;
      /* Только инкремент секунд — НЕ full listen */
      if (recordTick) recordTick(uid, { deltaSec: 1 });
    }
  }

  function onEnded() {
    const uid = safeUid(getUid());
    if (!uid) return;

    /* Защита от двойного срабатывания на одном треке */
    if (state.endedFired && uid === state.activeUid) return;
    state.endedFired = true;

    const dur = getDur() || 0;
    const pos = getPos() || 0;

    /* Передаём duration и position — проверка 90% в registerFullListen */
    if (recordEnd) recordEnd(uid, { duration: dur, position: pos });
  }

  return { onTick, onEnded, onPauseOrStop: () => {} };
}


// src/player-core/stats-tracker.js
// Разделённый трекер: tick (секунды) и ended (full listen).
// ТЗ П.5.2: Full listen = duration > 0 && position/duration > 0.9

function safeUid(v) { return String(v || '').trim() || null; }

export function createListenStatsTracker({ getUid, getPos, getDur, recordTick, recordEnd } = {}) {
  const state = { lastSecond: -1, activeUid: null };

  function onTick() {
    const uid = safeUid(getUid());
    if (!uid) return;

    if (uid !== state.activeUid) { state.activeUid = uid; state.lastSecond = -1; }

    const pos = Math.floor(getPos() || 0);
    if (pos > state.lastSecond) {
      state.lastSecond = pos;
      /* Инкрементальная запись секунды прослушивания (globalListenSeconds) */
      if (recordTick) recordTick(uid, { deltaSec: 1 });
    }
  }

  function onEnded() {
    const uid = safeUid(getUid());
    if (!uid) return;

    const dur = getDur() || 0;
    const pos = getPos() || 0;

    /* ТЗ П.5.2: Full listen при duration > 0 и progress > 90% */
    if (recordEnd) recordEnd(uid, { duration: dur, position: pos });
  }

  return { onTick, onEnded, onPauseOrStop: () => {} };
}

// src/player-core/stats-tracker.js
// Единый трекер статистики:
// - секунды: lastSecondReported (устойчиво, без "Math.floor(pos) > Math.floor(lastPos)" разброса)
// - full listen: duration валидна и (pos/dur > 0.9) на момент ended
// - никаких stop/play/seek внутри

function safeUid(v) {
  const s = String(v || '').trim();
  return s ? s : null;
}

export function createListenStatsTracker({ getUid, getPos, getDur, record } = {}) {
  const state = {
    lastSecondReported: -1,
    activeUid: null,
  };

  function resetForUid(uid) {
    state.activeUid = uid;
    state.lastSecondReported = -1;
  }

  function onTick() {
    const uid = safeUid(getUid && getUid());
    if (!uid) return;

    if (uid !== state.activeUid) resetForUid(uid);

    const pos = Number(getPos && getPos()) || 0;
    const sec = Math.floor(pos);

    if (!Number.isFinite(sec) || sec < 0) return;
    if (sec <= state.lastSecondReported) return;

    state.lastSecondReported = sec;

    try {
      record && record(uid, { deltaSec: 1, isFullListen: false });
    } catch {}
  }

  function onPauseOrStop() {
    // сейчас секунды учитываются через onTick; здесь просто не даём переносить lastSecond между треками
    const uid = safeUid(getUid && getUid());
    if (!uid) return;
    if (uid !== state.activeUid) resetForUid(uid);
  }

  function onEnded() {
    const uid = safeUid(getUid && getUid());
    if (!uid) return;

    if (uid !== state.activeUid) resetForUid(uid);

    const dur = Number(getDur && getDur()) || 0;
    const pos = Number(getPos && getPos()) || 0;

    const durationValid = Number.isFinite(dur) && dur > 0;
    const progress = durationValid ? (pos / dur) : 0;

    const isFullListen = !!(durationValid && progress > 0.9);

    try {
      record && record(uid, { deltaSec: 0, isFullListen });
    } catch {}
  }

  return { onTick, onPauseOrStop, onEnded };
}

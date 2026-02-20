// src/player-core/stats-tracker.js
// Optimized: DRY 90% logic, robust GlobalStats tracking.

const safeUid = v => String(v || '').trim() || null;

export function createListenStatsTracker({ getUid, getPos, getDur, recordTick, recordEnd } = {}) {
  const st = { last: -1, uid: null, ended: false };

  const checkFull = () => {
    const u = safeUid(getUid()), dur = getDur() || 0, pos = getPos() || 0;
    if (u && u === st.uid && dur > 0 && (pos / dur) >= 0.9 && !st.ended) {
      st.ended = true;
      window.GlobalStatsManager?.registerFullListen?.(u, { duration: dur, position: pos });
      recordEnd?.(u, { duration: dur, position: pos });
    }
  };

  return {
    onTick: () => {
      const u = safeUid(getUid()), p = Math.floor(getPos() || 0);
      if (!u) return;
      
      if (u !== st.uid) {
        if (st.uid) window.GlobalStatsManager?.flush?.().catch(()=>{});
        st.uid = u; st.last = -1; st.ended = false;
      }
      
      if (p > st.last) {
        st.last = p;
        window.GlobalStatsManager?.recordTick?.(u, { deltaSec: 1 });
        recordTick?.(u, { deltaSec: 1 });
      }
    },
    onEnded: () => { if (safeUid(getUid()) === st.uid) checkFull(); },
    onSkip: () => { 
      if (safeUid(getUid()) === st.uid) { 
        window.GlobalStatsManager?.flush?.().catch(()=>{}); 
        checkFull(); 
      } 
    },
    onPauseOrStop: () => {}
  };
}

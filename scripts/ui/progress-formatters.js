export const fmtClockMs = (ms) => {
  const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}д ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export const fmtAchTimerText = (a, mode = 'remaining') => {
  const pm = a?.progressMeta;
  if (!pm || a?.isUnlocked || a?.isHidden) return '';
  if (pm.kind === 'time_accum') return mode === 'elapsed' ? fmtClockMs(pm.elapsedMs) : fmtClockMs(pm.remainingMs);
  if (pm.kind === 'streak_days') return mode === 'elapsed' ? `${pm.elapsedDays} / ${pm.targetDays} дн` : `ещё ${pm.remainingDays} дн`;
  return a?.progress ? `Осталось: ${Math.max(0, (a.progress.target || 0) - (a.progress.current || 0))}` : '';
};

export const fmtAchBubbleText = (a) => {
  const nm = String(a?.name || '').replace(/ ур\. \d+/, '');
  const pm = a?.progressMeta;
  if (pm?.kind === 'time_accum') return `✨ До «${nm}»: ${fmtClockMs(pm.remainingMs)}`;
  if (pm?.kind === 'streak_days') return `✨ До «${nm}»: ${pm.remainingDays} дн`;
  return `✨ До «${nm}»: осталось ${Math.max(0, (a?.progress?.target || 0) - (a?.progress?.current || 0))}`;
};

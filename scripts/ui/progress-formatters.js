export const fmtClockMs = ms => {
  const seconds = Math.max(
    0,
    Math.floor((Number(ms) || 0) / 1000)
  );
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (days > 0) {
    return `${days} дн ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

export const fmtAchTimerText = achievement => {
  const meta = achievement?.progressMeta;

  if (
    !meta ||
    achievement?.isUnlocked ||
    achievement?.isHidden
  ) {
    return '';
  }

  if (meta.kind === 'time_accum') {
    return `Осталось ${fmtClockMs(meta.remainingMs)}`;
  }

  if (meta.kind === 'streak_days') {
    return `Осталось ${meta.remainingDays} дн`;
  }

  return achievement?.progress
    ? `Осталось: ${Math.max(
        0,
        Number(achievement.progress.target || 0) -
        Number(achievement.progress.current || 0)
      )}`
    : '';
};

export const fmtAchBubbleText = achievement => {
  const name = String(achievement?.name || '')
    .replace(/ ур\. \d+/, '');
  const meta = achievement?.progressMeta;

  if (meta?.kind === 'time_accum') {
    return `✨ До «${name}»: ${fmtClockMs(meta.remainingMs)}`;
  }

  if (meta?.kind === 'streak_days') {
    return `✨ До «${name}»: ${meta.remainingDays} дн`;
  }

  return `✨ До «${name}»: осталось ${Math.max(
    0,
    Number(achievement?.progress?.target || 0) -
    Number(achievement?.progress?.current || 0)
  )}`;
};

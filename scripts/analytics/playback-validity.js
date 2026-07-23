// UID.003_(Event log truth)_(валидное playback-время выводится из согласованности wall-time и media-position)
// UID.004_(Stats as cache)_(background throttling не должен терять честное прослушивание)
// UID.094_(No-paralysis rule)_(helper только вычисляет credit и никогда не управляет playback)

const toNum = (value, fallback = 0) =>
  Number.isFinite(Number(value))
    ? Number(value)
    : fallback;

export function getCreditedPlaybackDeltaMs({
  deltaMs,
  prevTime,
  currentTime,
  volume,
  muted,
  normalDeltaMs = 2500,
  seekToleranceSec = 1.5,
  throttledToleranceSec = 3,
  throttledToleranceRatio = 0.2
} = {}) {
  const wallMs = toNum(deltaMs);
  const previous = toNum(prevTime);
  const current = toNum(currentTime, previous);
  const mediaMs = (current - previous) * 1000;

  if (
    wallMs <= 0 ||
    mediaMs <= 0 ||
    toNum(volume, 100) <= 0 ||
    muted
  ) {
    return 0;
  }

  if (wallMs <= normalDeltaMs) {
    if (mediaMs > wallMs + seekToleranceSec * 1000) {
      return 0;
    }

    return Math.max(
      0,
      Math.floor(Math.min(wallMs, mediaMs))
    );
  }

  const toleranceMs = Math.max(
    throttledToleranceSec * 1000,
    wallMs * throttledToleranceRatio
  );

  if (Math.abs(mediaMs - wallMs) > toleranceMs) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(Math.min(wallMs, mediaMs))
  );
}

export default {
  getCreditedPlaybackDeltaMs
};

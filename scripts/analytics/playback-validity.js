// UID.003_(Event log truth)_(единое правило валидного playback delta)_(session/live analytics должны опираться на один helper, а не дублировать условия)
// UID.004_(Stats as cache)_(не допускать дрейфа между live projection и event truth)_(helper определяет только валидность тика, не пишет state сам)
// UID.018_(Variant and quality stats)_(подготовить общую точку для future variant-aware validation)_(audio/minus/stems позже смогут расширить этот helper additively)
// UID.050_(Session profile)_(дать session/live слоям единый low-level playback signal)_(верхние слои используют этот helper, не копируют пороги)
// UID.094_(No-paralysis rule)_(helper должен быть безопасным и no-throw)_(при плохих входных данных возвращает false, ничего не ломая)

const toNum = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

export function isValidPlaybackDelta({
  deltaMs,
  prevTime,
  currentTime,
  volume,
  muted,
  maxDeltaMs = 2000,
  maxSeekDeltaSec = 1.5
} = {}) {
  const dt = toNum(deltaMs, 0);
  const prev = toNum(prevTime, 0);
  const cur = toNum(currentTime, prev);
  const vol = toNum(volume, 100);
  const isMuted = !!muted;

  if (!(dt > 0 && dt < maxDeltaMs)) return false;
  if (Math.abs(cur - prev) >= maxSeekDeltaSec) return false;
  if (vol <= 0 || isMuted) return false;
  return true;
}

export default { isValidPlaybackDelta };

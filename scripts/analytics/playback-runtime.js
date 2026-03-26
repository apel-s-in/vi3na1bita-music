// UID.003_(Event log truth)_(единый runtime snapshot playback для analytics)_(session/live слои должны читать одинаковые входные данные, а не собирать их каждый по-своему) // UID.004_(Stats as cache)_(уменьшить риск дрейфа между event truth и live projection)_(helper только нормализует входные playback-метрики, не пишет state) // UID.018_(Variant and quality stats)_(подготовить общий runtime contract для future variant-aware accounting)_(дальнейшие поля можно добавлять additive) // UID.050_(Session profile)_(дать session/live аналитике один transport shape)_(верхние слои принимают единый snapshot и решают свою логику поверх него) // UID.094_(No-paralysis rule)_(helper должен быть безопасным и no-throw)_(при плохих данных возвращает нормализованный fallback)
const toNum = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

export function makePlaybackRuntimeSnapshot({ lastTickAt = 0, lastPos = 0, duration = 0, volume = 100, muted = false, tick = null, playerCore = window.playerCore } = {}) {
  const now = Date.now(), prevTickAt = toNum(lastTickAt, now) || now, prevPos = toNum(lastPos, 0);
  return {
    now, prevTickAt, deltaMs: now - prevTickAt, prevPos,
    currentTime: toNum(tick?.currentTime ?? playerCore?.getPosition?.(), prevPos),
    duration: toNum(tick?.duration ?? duration ?? playerCore?.getDuration?.(), 0),
    volume: toNum(tick?.volume ?? volume, 100),
    muted: !!(tick?.muted ?? muted)
  };
}
export default { makePlaybackRuntimeSnapshot };

const toNum = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
export function makePlaybackRuntimeSnapshot({ lastTickAt = 0, lastPos = 0, duration = 0, volume = 100, muted = false, tick = null, playerCore = window.playerCore } = {}) {
  const now = Date.now(), prevTickAt = toNum(lastTickAt, now) || now, prevPos = toNum(lastPos, 0);
  return { now, prevTickAt, deltaMs: now - prevTickAt, prevPos, currentTime: toNum(tick?.currentTime ?? playerCore?.getPosition?.(), prevPos), duration: toNum(tick?.duration ?? duration ?? playerCore?.getDuration?.(), 0), volume: toNum(tick?.volume ?? volume, 100), muted: !!(tick?.muted ?? muted) };
}
export default { makePlaybackRuntimeSnapshot };

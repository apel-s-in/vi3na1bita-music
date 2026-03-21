// UID.003_(Event log truth)_(единая boundary-семантика playback analytics)_(session/live слои должны одинаково флашить и нормализовать границы play/pause/stop/ended/trackChanged)
// UID.004_(Stats as cache)_(убрать расхождение между event truth и live projection на переходах состояний)_(helper не пишет storage, только нормализует lifecycle-поведение)
// UID.018_(Variant and quality stats)_(подготовить единый lifecycle contract для future variant-aware accounting)_(новые поля добавляются additive, не ломая текущую логику)
// UID.050_(Session profile)_(дать session/live аналитике единые правила обработки границ сессии)_(верхние слои используют helper и не копируют boundary-логику)
// UID.094_(No-paralysis rule)_(helper должен быть безопасным и no-throw)_(только чистые функции, без side-effects на playback)

export function makePlaybackLifecycleBoundary({
  playing = false,
  uid = null,
  lastPos = 0,
  resetUid = false,
  resetPos = false
} = {}) {
  return {
    playing: !!playing,
    uid: resetUid ? null : (uid || null),
    lastPos: resetPos ? 0 : Number(lastPos || 0)
  };
}

export default { makePlaybackLifecycleBoundary };

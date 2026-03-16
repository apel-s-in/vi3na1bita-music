// UID.011_(Media variants registry)_(держать единый bridge выбора источника трека)_(TrackResolver остаётся слоем разрешения source/quality, а не semantic/business логики)
// UID.012_(Quality dimension)_(не распылять выбор качества по приложению)_(PlayerCore/UI должны получать уже resolved source отсюда)
// UID.019_(Compact TrackProfile index)_(не смешивать semantic profile и media resolution)_(track profile layer не должен вмешиваться в resolver path)
// UID.077_(Yandex auth/backup/AI)_(не смешивать provider identity и source resolution)_(provider-linked capabilities не должны ломать текущий dual-source resolution)
// UID.094_(No-paralysis rule)_(оставить resolver безопасным fallback-слоем)_(при любых сбоях intel/providers resolver должен возвращать stream/none без падения приложения)
let _mgr = null;
export const initTrackResolver = (offlineManager) => { _mgr = offlineManager; window.TrackResolver = { resolve }; };

export const resolve = async (uid, quality) => {
  if (!_mgr) return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  try {
    const r = await _mgr.resolveTrackSource(uid, quality);
    return { source: r.source || 'stream', url: r.url || null, blob: r.blob || null, quality: r.quality || quality, localKind: r.source === 'local' ? 'cache' : 'none', provider: r.source === 'local' ? 'cache' : (r.provider || 'unknown') };
  } catch (e) {
    console.warn('[TrackResolver] resolve failed:', e);
    return { source: 'stream', url: null, blob: null, quality, localKind: 'none' };
  }
};
export default { initTrackResolver, resolve };

// Канонический pure-контракт playback fencing payload.
// Не читает storage, не выполняет сеть и не управляет playback.
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export const normalizePlaybackFenceGrant = raw => ({
  logicalSessionId: safe(raw?.logicalSessionId),
  ownerEpoch: Math.max(0, Math.floor(num(raw?.ownerEpoch))),
  fencingToken: safe(raw?.fencingToken),
  trackVersion: safe(raw?.trackVersion)
});

export const buildPlaybackFencePayload = ({ grant = null, deviceId = '', trackVersion = '' } = {}) => {
  const normalized = normalizePlaybackFenceGrant(grant);
  return {
    deviceId: safe(deviceId),
    logicalSessionId: normalized.logicalSessionId,
    ownerEpoch: normalized.ownerEpoch,
    fencingToken: normalized.fencingToken,
    trackVersion: safe(trackVersion || normalized.trackVersion)
  };
};

export const hasPlaybackFence = raw => {
  const normalized = normalizePlaybackFenceGrant(raw);
  return !!normalized.logicalSessionId && normalized.ownerEpoch > 0 && !!normalized.fencingToken && !!normalized.trackVersion;
};

export default {
  normalizePlaybackFenceGrant,
  buildPlaybackFencePayload,
  hasPlaybackFence
};

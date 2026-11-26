import { getOfflineManager } from './offline-manager.js';

let _mgr = null;

export const initTrackResolver = manager => {
  _mgr = manager;
  window.TrackResolver = { resolve };
};

export const resolve = async (uid, quality = 'lo', options = {}) => {
  const manager = _mgr || getOfflineManager();
  const result = await manager.resolveTrackSource(uid, 'lo', options);
  return {
    ...result,
    localKind: result.source === 'local' ? 'cache' : 'none',
    provider: result.source === 'local' ? 'cache' : (result.provider || 'unknown')
  };
};

export default { initTrackResolver, resolve };

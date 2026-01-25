// Этот файл - фасад для обратной совместимости.
// Он перенаправляет всё в core реестр.

import { TrackRegistry } from '../core/track-registry.js';

export const registerTrack = (t) => TrackRegistry.registerTrack(t);
export const registerTracks = (t) => TrackRegistry.registerTracks(t);
export const getTrackByUid = (uid) => TrackRegistry.getTrack(uid);
export const getAllTracks = () => TrackRegistry.getAllTracks();
export const clearRegistry = () => TrackRegistry.clearRegistry();

// Дефолтный экспорт, если кто-то импортирует через default
export default TrackRegistry;

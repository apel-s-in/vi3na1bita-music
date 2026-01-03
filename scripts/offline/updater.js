// scripts/offline/updater.js

import { getMeta, putMeta, getSetting } from './cache-db.js';

export class Updater {
  constructor({ getAllUids, getTrackByUid, onBadge }) {
    this._getAllUids = getAllUids;
    this._getTrack = getTrackByUid;
    this._onBadge = onBadge || (() => {});
    this._pending = new Set(); // uid с needsUpdate/needsReCache
  }

  async scanForUpdates({ changedSizesMap, recacheDueToCQ = false }) {
    // changedSizesMap: Map<uid, { sizeHiChanged:boolean, sizeLoChanged:boolean }>
    const cq = await getSetting('cacheQuality:v1', 'hi');
    for (const uid of this._getAllUids()) {
      const meta = (await getMeta(uid)) || {};
      let needsUpdate = false;
      let needsReCache = false;

      const ch = changedSizesMap.get(uid);
      if (ch) {
        if (meta.cachedQuality === 'hi' && ch.sizeHiChanged) needsUpdate = true;
        if (meta.cachedQuality === 'lo' && ch.sizeLoChanged) needsUpdate = true;
      }
      if (recacheDueToCQ && meta.cachedQuality && meta.cachedQuality !== cq) {
        needsReCache = true;
      }
      if (needsUpdate || needsReCache) {
        await putMeta(uid, { needsUpdate, needsReCache });
        this._pending.add(uid);
      }
    }
    if (this._pending.size > 0) this._onBadge({ bang: true });
  }

  async markDone(uid) {
    await putMeta(uid, { needsUpdate: false, needsReCache: false });
    this._pending.delete(uid);
    if (this._pending.size === 0) this._onBadge({ bang: false });
  }

  hasPending() { return this._pending.size > 0; }
}

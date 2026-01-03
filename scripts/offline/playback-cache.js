// scripts/offline/playback-cache.js

import { PRIORITY } from './queue-manager.js';

export class PlaybackCacheManager {
  constructor({ queue, resolver, getPlaylistCtx }) {
    // queue: QueueManager
    // resolver: async (track, pq) => { src, via:'local'|'network', quality:'hi'|'lo', local:{quality, bytes, complete} }
    // getPlaylistCtx: () => { list: Array<{uid,...}>, curUid:string, shuffle:boolean, favoritesOnly:boolean, favoritesInactive:Set<string>, direction:'forward'|'backward' }
    this._queue = queue;
    this._resolver = resolver;
    this._getCtx = getPlaylistCtx;
    this._lastCurUid = null;
  }

  computeWindow() {
    const { list, curUid, favoritesInactive } = this._getCtx();
    if (!list || list.length === 0 || !curUid) return { prev: null, cur: null, next: null };
    const filtered = list.filter(t => !favoritesInactive?.has?.(t.uid));
    const idx = filtered.findIndex(t => t.uid === curUid);
    if (idx === -1) return { prev: null, cur: null, next: null };
    const prev = filtered[(idx - 1 + filtered.length) % filtered.length];
    const cur = filtered[idx];
    const next = filtered[(idx + 1) % filtered.length];
    return { prev, cur, next };
  }

  // Строгий порядок: сначала CUR→100%, затем сосед по направлению→100%
  async ensureWindowFullyCached(pq, trackProvider) {
    // trackProvider(uid) -> track meta (urls, sizes, etc)
    const { prev, cur, next } = this.computeWindow();
    if (!cur) return;

    // CUR
    await this._scheduleDownload(cur.uid, pq, PRIORITY.CUR, trackProvider);

    // сосед по направлению
    const { direction } = this._getCtx();
    const neighbor = direction === 'backward' ? prev : next;
    if (neighbor) {
      await this._scheduleDownload(neighbor.uid, pq, PRIORITY.NEIGHBOR, trackProvider);
    }
  }

  async _scheduleDownload(uid, pq, prio, trackProvider) {
    const track = trackProvider(uid);
    if (!track) return;
    // Только планируем — сам выбор URL/качества делает resolver
    const { src, quality, via } = await this._resolver(track, pq);
    if (via === 'local') return; // уже есть локально в качестве >= PQ
    this._queue.add({
      uid,
      url: src,
      quality,
      type: 'audio',
      prio,
      meta: { role: 'playback-window' },
    });
  }
}

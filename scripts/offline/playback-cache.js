// scripts/offline/playback-cache.js
// PlaybackCacheManager (ESM) — MVP.
// В этом коммите он не скачивает аудио, а только "планирует" окно и эмитит прогресс через queue.
// Это нужно, чтобы scripts/app/playback-cache-bootstrap.js работал и не падал.

function normPq(pq) {
  const q = String(pq || '').toLowerCase();
  return (q === 'lo') ? 'lo' : 'hi';
}

function uidOfTrack(t) {
  const uid = String(t?.uid || '').trim();
  return uid || null;
}

export class PlaybackCacheManager {
  constructor({ queue, resolver, getPlaylistCtx } = {}) {
    this.queue = queue;
    this.resolver = resolver;     // legacy: can be used for decisions
    this.getPlaylistCtx = getPlaylistCtx;
  }

  async ensureWindowFullyCached(pq, trackProvider) {
    const ctx = (typeof this.getPlaylistCtx === 'function') ? this.getPlaylistCtx() : null;
    const list = Array.isArray(ctx?.list) ? ctx.list : [];
    if (list.length === 0) return;

    const curUid = ctx?.curUid ? String(ctx.curUid) : null;
    const curIdx = curUid ? list.findIndex(t => uidOfTrack(t) === curUid) : -1;
    if (curIdx < 0) return;

    const q = normPq(pq);
    const dir = String(ctx?.direction || 'forward') === 'backward' ? 'backward' : 'forward';

    const prevIdx = (curIdx - 1 + list.length) % list.length;
    const nextIdx = (curIdx + 1) % list.length;

    const prevUid = uidOfTrack(list[prevIdx]);
    const nextUid = uidOfTrack(list[nextIdx]);

    const om = window.OfflineUI?.offlineManager;
    if (!om || typeof om.enqueueAudioDownload !== 'function') return;

    const enqueue = (uid, priority) => {
      if (!uid) return;

      const meta = (typeof trackProvider === 'function') ? trackProvider(uid) : null;
      if (!meta) return;

      om.enqueueAudioDownload({
        uid,
        quality: q, // ✅ PlaybackCache качает в PQ (ТЗ 7.4/7.7)
        key: `pc:${q}:${uid}`,
        priority,
        userInitiated: false,
        isMass: false,
        kind: 'playbackCache'
      });
    };

    // ✅ ТЗ 7.7: CUR, потом один сосед по направлению
    enqueue(curUid, 30);
    enqueue(dir === 'backward' ? prevUid : nextUid, 20);
  }
}

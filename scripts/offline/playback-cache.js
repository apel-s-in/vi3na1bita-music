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
  constructor({ queue, resolver, downloader, getPlaylistCtx } = {}) {
    this.queue = queue;
    this.resolver = resolver;     // legacy: can be used for decisions
    this.downloader = downloader; // new: performs caching tasks
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

    const enqueue = (uid, priority) => {
      if (!uid) return;
      if (!this.queue || typeof this.queue.add !== 'function') return;

      const key = `pc:${q}:${uid}`;

      // ✅ Дедуп: не ставим задачу если она уже в очереди или выполняется
      if (typeof this.queue.hasTask === 'function' && this.queue.hasTask(key)) return;

      const meta = (typeof trackProvider === 'function') ? trackProvider(uid) : null;
      if (!meta) return;

      this.queue.add({
        key,
        uid,
        priority,
        run: async () => {
          try {
            if (typeof this.downloader === 'function') {
              await this.downloader(uid, q);
              return;
            }
            if (typeof this.resolver === 'function') {
              await this.resolver(meta, q);
            }
          } catch {}
        }
      });
    };

    // ✅ ТЗ 7.7: всегда сначала CUR до 100%
    enqueue(curUid, 30);

    // ✅ ТЗ 7.7: затем только один сосед по направлению
    if (dir === 'backward') {
      enqueue(prevUid, 20);
    } else {
      enqueue(nextUid, 20);
    }
  }

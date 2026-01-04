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

    // Окно: prev/cur/next
    const ids = [];
    for (const di of [-1, 0, 1]) {
      const idx = (curIdx + di + list.length) % list.length;
      const uid = uidOfTrack(list[idx]);
      if (uid) ids.push(uid);
    }

    for (const uid of ids) {
      const meta = (typeof trackProvider === 'function') ? trackProvider(uid) : null;
      if (!meta) continue;

      // ✅ Реальное кэширование окна через downloader (OfflineManager.cacheTrackAudio)
      if (this.queue && typeof this.queue.add === 'function') {
        const pr = (uid === curUid) ? 30 : (uid === ids[2] ? 20 : 10); // CUR > NEXT > PREV (порядок ids: prev,cur,next)
        const key = `pc:${q}:${uid}`;

        this.queue.add({
          key,
          uid,
          priority: pr,
          run: async () => {
            try {
              if (typeof this.downloader === 'function') {
                await this.downloader(uid, q);
                return;
              }
              // fallback: если downloader не передан — просто дергаем resolver (no-op)
              if (typeof this.resolver === 'function') {
                await this.resolver(meta, q);
              }
            } catch {}
          }
        });
      }
    }
  }
}

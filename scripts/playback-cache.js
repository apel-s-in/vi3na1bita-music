//=================================================
// FILE: scripts/playback-cache.js
// Playback Cache PREV/CUR/NEXT + source resolver по финальному правилу PQ↔CQ
class PlaybackCache {
  constructor() {
    this.window = { prev: null, cur: null, next: null };
    this.direction = 'forward';
  }

  updateWindow(playlist, currentIndex, shuffleMode, favoritesOnly) {
    const effectiveList = playlist.filter(t => !favoritesOnly || t.active !== false);

    if (effectiveList.length === 0) return;

    const len = effectiveList.length;
    this.window.cur = effectiveList[currentIndex % len];

    if (shuffleMode) {
      // упрощённо — используем текущий shuffle-порядок
      const idx = currentIndex;
      this.window.prev = effectiveList[(idx - 1 + len) % len];
      this.window.next = effectiveList[(idx + 1) % len];
    } else {
      this.window.prev = effectiveList[(currentIndex - 1 + len) % len];
      this.window.next = effectiveList[(currentIndex + 1) % len];
    }
  }

  async resolveUrl(uid, pq) {
    const cq = localStorage.getItem('offline:cacheQuality:v1') || 'hi';
    const preferHi = pq === 'hi';

    // 1. Локальная ≥ PQ
    const localHi = await offlineManager.hasLocal(uid, 'hi');
    const localLo = await offlineManager.hasLocal(uid, 'lo');

    if (preferHi && localHi) return { url: await offlineManager.getBlobUrl(uid, 'hi'), effective: 'hi', local: true };
    if (!preferHi && (localHi || localLo)) {
      const quality = localHi ? 'hi' : 'lo';
      return { url: await offlineManager.getBlobUrl(uid, quality), effective: quality, local: true };
    }

    // 2. Сеть = PQ (если разрешена)
    if (navigator.onLine && this.isNetworkAllowed()) {
      const variant = preferHi ? 'hi' : 'lo';
      const track = W.config.tracks.find(t => t.uid === uid);
      const remoteUrl = track[`audio${preferHi ? '' : '_low'}`];
      if (remoteUrl) {
        // transient-докачка для окна
        if (this.window.prev?.uid === uid || this.window.cur?.uid === uid || this.window.next?.uid === uid) {
          downloadQueue.enqueue({
            priority: uid === this.window.cur?.uid ? 0 : (this.direction === 'forward' ? 1 : 1),
            task: () => offlineManager.downloadAndStore(uid, variant, 'transient'),
            resolve: () => {},
            reject: () => {}
          });
        }
        return { url: remoteUrl, effective: pq, local: false };
      }
    }

    // 3. Fallback на локальное < PQ (только если ничего другого)
    if (preferHi && localLo) {
      return { url: await offlineManager.getBlobUrl(uid, 'lo'), effective: 'lo', local: true };
    }

    return null; // недоступно
  }

  isNetworkAllowed() {
    // по политике из OFFLINE modal
    const policy = JSON.parse(localStorage.getItem('offline:networkPolicy') || '{"wifi":true,"mobile":true}');
    const type = navigator.connection?.effectiveType || 'unknown';
    if (type === 'unknown') return confirm('Тип сети неизвестен. Продолжить?');
    return policy.wifi || policy.mobile;
  }

  // тихое исключение при потере сети
  filterAvailableTracks(playlist) {
    if (navigator.onLine) return playlist;
    return playlist.filter(async t => {
      const hasHi = await offlineManager.hasLocal(t.uid, 'hi');
      const hasLo = await offlineManager.hasLocal(t.uid, 'lo');
      return hasHi || hasLo;
    });
  }
}

window.playbackCache = new PlaybackCache();

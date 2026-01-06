//=================================================
// FILE: scripts/stats-manager.js
// Две независимые статистики по ТЗ
class StatsManager {
  constructor() {
    this.cloudKey = (uid) => `cloud:${uid}`;
    this.globalKey = (uid) => `global:${uid}`;
    this.totalKey = 'global:totalSeconds';
  }

  // Cloud stats (сбрасываемая)
  getCloud(uid) {
    const data = localStorage.getItem(this.cloudKey(uid));
    return data ? JSON.parse(data) : {
      fullListenCount: 0,
      lastFullListenAt: 0,
      addedAt: 0,
      expiresAt: 0,
      active: false
    };
  }

  incrementCloudListen(uid, durationValid, progressPercent) {
    if (!durationValid || progressPercent < 90) return;
    const stats = this.getCloud(uid);
    stats.fullListenCount += 1;
    stats.lastFullListenAt = Date.now();
    if (stats.active) {
      const D = parseInt(localStorage.getItem('offline:cloudTTL') || '31') * 86400000;
      stats.expiresAt = Date.now() + D;
    }
    localStorage.setItem(this.cloudKey(uid), JSON.stringify(stats));
  }

  resetCloud(uid) {
    localStorage.removeItem(this.cloudKey(uid));
  }

  setCloudActive(uid, active) {
    const stats = this.getCloud(uid);
    stats.active = active;
    if (active) {
      stats.addedAt = Date.now();
      const D = parseInt(localStorage.getItem('offline:cloudTTL') || '31') * 86400000;
      stats.expiresAt = Date.now() + D;
    }
    localStorage.setItem(this.cloudKey(uid), JSON.stringify(stats));
  }

  // Global stats (никогда не сбрасывается)
  addSeconds(uid, seconds) {
    const key = this.globalKey(uid);
    let data = localStorage.getItem(key);
    data = data ? JSON.parse(data) : { fullCount: 0, seconds: 0 };
    data.seconds += seconds;
    localStorage.setItem(key, JSON.stringify(data));

    let total = parseInt(localStorage.getItem(this.totalKey) || '0');
    total += seconds;
    localStorage.setItem(this.totalKey, total.toString());
  }

  incrementGlobalFull(uid, durationValid, progressPercent) {
    if (!durationValid || progressPercent < 90) return;
    const key = this.globalKey(uid);
    let data = localStorage.getItem(key);
    data = data ? JSON.parse(data) : { fullCount: 0, seconds: 0 };
    data.fullCount += 1;
    localStorage.setItem(key, JSON.stringify(data));
  }

  getAllGlobal() {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('global:') && !key.includes('total')) {
        const uid = key.slice(7);
        const data = JSON.parse(localStorage.getItem(key));
        if (data.fullCount >= 3) {
          result.push({ uid, ...data });
        }
      }
    }
    result.sort((a, b) => b.fullCount - a.fullCount);
    return {
      tracks: result,
      totalSeconds: parseInt(localStorage.getItem(this.totalKey) || '0')
    };
  }
}

window.statsManager = new StatsManager();

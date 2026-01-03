// scripts/utils/offline-manager.js
// Единый менеджер для оффлайн, кэша, качества, статистики (по ТЗ: сильное упрощение, uid-based)
// Зависимости: IndexedDB (idb.js если есть, или нативно), Cache API, localStorage
// Интеграция: Экспортировать в PlayerCore, albums.js, playback-policy.js

class OfflineManager {
  constructor() {
    this.db = null; // IndexedDB instance
    this.cacheName = 'vi3na1bita-audio-cache'; // Для transient via Cache API
    this.downloadQueue = []; // Очередь задач (приоритеты P0–P5 по ТЗ 15)
    this.activeDownloads = 0; // Параллельность: 1 для аудио (ТЗ 15.3)
    this.maxParallel = 1; // Default для iOS стабильности
    this.stats = {}; // Глобальная статистика (несбрасываемая, по uid, ТЗ 19 + уточнение)
    this.cloudStats = {}; // Сбрасываемая статистика для cloud (ТЗ 9, уточнение в конце ТЗ)
    this.networkPolicy = { wifi: true, mobile: true }; // Default по ТЗ 5.1
    this.cacheQuality = 'hi'; // CQ default (ТЗ 7.2)
    this.cloudN = 5; // Default (ТЗ 9.1)
    this.cloudD = 31; // Days (ТЗ 9.1)
    this.cacheLimit = 'auto'; // ТЗ 11.2
    this.initDB();
    this.loadSettings();
  }

  // Инициализация IndexedDB для pinned/cloud/transient мета + blobs
  async initDB() {
    this.db = await idb.openDB('vi3na1bita-db', 1, {
      upgrade(db) {
        db.createObjectStore('tracks', { keyPath: 'uid' }); // Хранит {uid, hiBlob, loBlob, pinned, cloud, fullListenCount, ...}
        db.createObjectStore('stats', { keyPath: 'uid' }); // Глобальная статистика
      }
    });
  }

  // Загрузка настроек из localStorage (ТЗ 7.1, 5.1, 9.1)
  loadSettings() {
    this.cacheQuality = localStorage.getItem('cacheQuality') || 'hi';
    this.networkPolicy.wifi = localStorage.getItem('networkWifi') !== 'false';
    this.networkPolicy.mobile = localStorage.getItem('networkMobile') !== 'false';
    this.cloudN = parseInt(localStorage.getItem('cloudN')) || 5;
    this.cloudD = parseInt(localStorage.getItem('cloudD')) || 31;
    // TODO: cacheLimit
  }

  // Сохранение настроек
  saveSettings() {
    localStorage.setItem('cacheQuality', this.cacheQuality);
    localStorage.setItem('networkWifi', this.networkPolicy.wifi);
    localStorage.setItem('networkMobile', this.networkPolicy.mobile);
    localStorage.setItem('cloudN', this.cloudN);
    localStorage.setItem('cloudD', this.cloudD);
  }

  // Resolve источника по uid и PQ (приоритеты по ТЗ 7.3: P-QUAL-1/2)
  async resolveSource(uid, pq = 'hi') { // pq = 'hi'|'lo'
    const track = await this.getTrack(uid);
    if (!track) return null;

    const targetQuality = pq === 'hi' ? 'hi' : 'lo';
    const fallbackQuality = pq === 'hi' ? 'lo' : 'hi';

    // 1. Локальный ≥ PQ (pinned/cloud/transient)
    if (track[targetQuality + 'Blob']) {
      return { src: URL.createObjectURL(track[targetQuality + 'Blob']), type: 'local', quality: targetQuality };
    } else if (track[fallbackQuality + 'Blob'] && fallbackQuality > targetQuality) { // Улучшение (Lo to Hi ok)
      return { src: URL.createObjectURL(track[fallbackQuality + 'Blob']), type: 'local', quality: fallbackQuality };
    }

    // 2. Сетевой = PQ, если policy позволяет
    if (await this.isNetworkAllowed()) {
      const networkSrc = this.getNetworkUrl(uid, targetQuality); // Из config.json или albums.js
      if (networkSrc) return { src: networkSrc, type: 'network', quality: targetQuality };
    }

    // 3. Локальный < PQ как fallback (только если нет сети)
    if (track[fallbackQuality + 'Blob']) {
      return { src: URL.createObjectURL(track[fallbackQuality + 'Blob']), type: 'local', quality: fallbackQuality };
    }

    // 4. Ничего — "Недоступно офлайн" (ТЗ 17)
    return null;
  }

  // Проверка сети (ТЗ 5.1–5.2)
  async isNetworkAllowed() {
    const connection = navigator.connection || {};
    const type = connection.type || 'unknown';
    if (type === 'unknown') {
      return confirm('Тип сети неизвестен. Продолжить?'); // ТЗ 5.2
    }
    return (type === 'wifi' && this.networkPolicy.wifi) || (type === 'cellular' && this.networkPolicy.mobile);
  }

  // Добавление в очередь загрузки (ТЗ 15: приоритеты P0–P5)
  queueDownload(uid, quality, priority = 'P2') { // priority: 'P0' (CUR), 'P1' (сосед), etc.
    this.downloadQueue.push({ uid, quality, priority });
    this.downloadQueue.sort((a, b) => this.getPriorityValue(a.priority) - this.getPriorityValue(b.priority));
    this.processQueue();
  }

  getPriorityValue(p) {
    const map = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
    return map[p] || 99;
  }

  async processQueue() {
    if (this.activeDownloads >= this.maxParallel || this.downloadQueue.length === 0) return;
    const task = this.downloadQueue.shift();
    this.activeDownloads++;
    try {
      // Скачивание (fetch blob, сохраняем в DB)
      const url = this.getNetworkUrl(task.uid, task.quality);
      const response = await fetch(url);
      const blob = await response.blob();
      await this.saveBlob(task.uid, task.quality, blob);
      // TODO: Обновить cachedComplete, notify UI
    } catch (e) {
      // Ретрай с backoff (ТЗ 15.4)
      setTimeout(() => this.queueDownload(task.uid, task.quality, task.priority), 5000);
    } finally {
      this.activeDownloads--;
      this.processQueue();
    }
  }

  // Сохранение blob (ТЗ 6: цельные blobs для offline)
  async saveBlob(uid, quality, blob) {
    const track = await this.getTrack(uid) || { uid };
    track[quality + 'Blob'] = blob;
    track['cachedComplete' + quality.charAt(0).toUpperCase() + quality.slice(1)] = 100; // e.g. cachedCompleteHi
    await this.db.put('tracks', track);
  }

  // Получение трека из DB
  async getTrack(uid) {
    return await this.db.get('tracks', uid);
  }

  // Статистика: обновление full listen (ТЗ 9.2, 19, P-STATS-1 — не сбрасывается)
  async updateFullListen(uid, percentPlayed, duration) {
    if (percentPlayed > 90 && duration > 0) {
      const stats = await this.getStats(uid) || { uid, fullCount: 0, totalTime: 0 };
      stats.fullCount++;
      stats.totalTime += duration;
      await this.db.put('stats', stats);

      // Cloud stats (сбрасываемая)
      const cloudStats = this.cloudStats[uid] || { fullListenCount: 0 };
      cloudStats.fullListenCount++;
      this.cloudStats[uid] = cloudStats;

      // Проверка на auto-cloud (ТЗ 9.4)
      if (cloudStats.fullListenCount >= this.cloudN) {
        this.setCloud(uid, true);
      }
    }
  }

  async getStats(uid) {
    return await this.db.get('stats', uid);
  }

  // Pinned/Cloud операции (ТЗ 10,9)
  async setPinned(uid, enabled) {
    const track = await this.getTrack(uid) || { uid };
    track.pinned = enabled;
    if (enabled) {
      this.queueDownload(uid, this.cacheQuality, 'P2'); // Докачать (ТЗ 10.1)
    } else {
      // Кандидат на cloud (ТЗ 10.2.1)
      this.setCloud(uid, true, true); // true = as candidate
    }
    await this.db.put('tracks', track);
  }

  async setCloud(uid, enabled, isCandidate = false) {
    const track = await this.getTrack(uid) || { uid };
    track.cloud = enabled;
    if (enabled) {
      const completeKey = 'cachedComplete' + this.cacheQuality.charAt(0).toUpperCase() + this.cacheQuality.slice(1);
      if (track[completeKey] < 100) {
        this.queueDownload(uid, this.cacheQuality, isCandidate ? 'P4' : 'P4'); // Cloud fill
      } else {
        track.cloudExpiresAt = Date.now() + this.cloudD * 86400000; // TTL start
      }
    } else {
      // Сброс cloud stats (уточнение ТЗ)
      delete this.cloudStats[uid];
    }
    await this.db.put('tracks', track);
  }

  // TODO: Добавить eviction по TTL/limit (ТЗ 9.7,11), needsUpdate по size (ТЗ 14), playback cache window (интегрировать с PlayerCore), UI hooks для индикаторов/прогресса.
}

// Экспорт
const offlineManager = new OfflineManager();
export default offlineManager;

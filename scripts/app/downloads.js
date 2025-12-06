
// scripts/app/downloads.js
// Управление скачиванием треков и альбомов

class DownloadsManager {
  constructor() {
    this.downloadQueue = [];
    this.isDownloading = false;
    this.activeDownloads = new Set();
  }

  async downloadTrack(trackUrl, trackTitle, albumKey) {
    try {
      window.NotificationSystem?.info(`Начинаю загрузку: ${trackTitle}`);

      const response = await fetch(trackUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${trackTitle}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      window.NotificationSystem?.success(`Скачан: ${trackTitle}`);
    } catch (error) {
      console.error('Download failed:', error);
      window.NotificationSystem?.error(`Ошибка загрузки: ${trackTitle}`);
    }
  }

  async downloadAlbum(albumKey) {
    const albumInfo = window.albumsIndex?.find(a => a.key === albumKey);
    if (!albumInfo) {
      window.NotificationSystem?.error('Альбом не найден');
      return;
    }

    const albumData = window.AlbumsManager?.getAlbumData(albumKey);
    if (!albumData) {
      window.NotificationSystem?.error('Данные альбома не загружены');
      return;
    }

    window.NotificationSystem?.info(`Подготовка к скачиванию альбома: ${albumInfo.title}`);

    const tracks = albumData.tracks || [];
    if (tracks.length === 0) {
      window.NotificationSystem?.warning('Альбом пуст');
      return;
    }

    // Скачивание с задержкой между треками
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const trackUrl = `${albumInfo.base}${track.file}`;
      
      await this.downloadTrack(trackUrl, track.title, albumKey);
      
      // Задержка между загрузками
      if (i < tracks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    window.NotificationSystem?.success(`Альбом "${albumInfo.title}" скачан`);
  }

  async downloadAllFavorites() {
    const favorites = window.FavoritesManager?.getAllFavorites() || {};
    const allTracks = [];

    // Собрать все избранные треки
    for (const albumKey in favorites) {
      const albumInfo = window.albumsIndex?.find(a => a.key === albumKey);
      if (!albumInfo) continue;

      const trackNumbers = favorites[albumKey];
      if (!trackNumbers || trackNumbers.length === 0) continue;

      const albumData = window.AlbumsManager?.getAlbumData(albumKey);
      if (!albumData) continue;

      trackNumbers.forEach(num => {
        const track = albumData.tracks.find(t => t.num === num);
        if (track) {
          allTracks.push({
            url: `${albumInfo.base}${track.file}`,
            title: track.title,
            album: albumKey
          });
        }
      });
    }

    if (allTracks.length === 0) {
      window.NotificationSystem?.warning('Нет избранных треков для скачивания');
      return;
    }

    window.NotificationSystem?.info(`Начинаю скачивание ${allTracks.length} избранных треков`);

    for (let i = 0; i < allTracks.length; i++) {
      const track = allTracks[i];
      await this.downloadTrack(track.url, track.title, track.album);
      
      if (i < allTracks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    window.NotificationSystem?.success('Все избранные треки скачаны');
  }

  // Проверка доступности скачивания (офлайн кэш)
  async checkOfflineAvailability(albumKey) {
    if (!('caches' in window)) return false;

    try {
      const albumInfo = window.albumsIndex?.find(a => a.key === albumKey);
      if (!albumInfo) return false;

      const albumData = window.AlbumsManager?.getAlbumData(albumKey);
      if (!albumData) return false;

      const cache = await caches.open('vitrina-audio-v1');
      const tracks = albumData.tracks || [];

      let cachedCount = 0;
      for (const track of tracks) {
        const trackUrl = `${albumInfo.base}${track.file}`;
        const cached = await cache.match(trackUrl);
        if (cached) cachedCount++;
      }

      return cachedCount === tracks.length;
    } catch (error) {
      console.error('Failed to check offline availability:', error);
      return false;
    }
  }

  // Кэширование альбома для офлайн доступа
  async cacheAlbumForOffline(albumKey) {
    if (!('caches' in window)) {
      window.NotificationSystem?.error('Офлайн режим не поддерживается');
      return;
    }

    const albumInfo = window.albumsIndex?.find(a => a.key === albumKey);
    if (!albumInfo) return;

    const albumData = window.AlbumsManager?.getAlbumData(albumKey);
    if (!albumData) return;

    try {
      window.NotificationSystem?.info(`Кэширование альбома: ${albumInfo.title}`);

      const cache = await caches.open('vitrina-audio-v1');
      const tracks = albumData.tracks || [];

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackUrl = `${albumInfo.base}${track.file}`;
        
        await cache.add(trackUrl);
        
        const progress = Math.round(((i + 1) / tracks.length) * 100);
        window.NotificationSystem?.info(`Кэширование: ${progress}%`);
      }

      window.NotificationSystem?.success('Альбом доступен офлайн');
    } catch (error) {
      console.error('Caching failed:', error);
      window.NotificationSystem?.error('Ошибка кэширования');
    }
  }
}

// Глобальный экземпляр
window.DownloadsManager = new DownloadsManager();

// Привязка к кнопке
document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('download-album-main');
  downloadBtn?.addEventListener('click', () => {
    const currentAlbum = window.AlbumsManager?.getCurrentAlbum();
    if (!currentAlbum) return;

    if (currentAlbum === '__favorites__') {
      window.DownloadsManager.downloadAllFavorites();
    } else if (currentAlbum !== '__reliz__') {
      window.DownloadsManager.downloadAlbum(currentAlbum);
    }
  });
});

export default DownloadsManager;

// scripts/app/downloads.js
// Управление скачиванием треков и альбомов

class DownloadsManager {
  constructor() {
    this.downloadQueue = [];
    this.isDownloading = false;
  }

  async downloadAlbum(albumKey) {
    const albumInfo = window.albumsIndex?.find(a => a.key === albumKey);
    if (!albumInfo) {
      console.error('Album not found:', albumKey);
      return;
    }

    const albumData = window.AlbumsManager?.getAlbumData(albumKey);
    if (!albumData) {
      window.NotificationSystem?.error('Не удалось загрузить данные альбома');
      return;
    }

    window.NotificationSystem?.info(`Подготовка к скачиванию: ${albumInfo.title}`);

    // track.file уже абсолютный URL (AlbumsManager нормализует через new URL(...))
    const files = (albumData.tracks || [])
      .filter(t => !!t && typeof t.file === 'string' && t.file.length > 0)
      .map(track => ({
        url: track.file,
        filename: `${albumInfo.title} - ${track.num}. ${track.title}.mp3`
      }));

    // cover в albumData сейчас относительный (например 'cover.jpg').
    // ВАЖНО: ты сейчас не рендеришь cover.jpg, но для скачивания можно оставить.
    if (albumData.cover) {
      try {
        const coverUrl = new URL(String(albumData.cover), albumInfo.base).toString();
        files.push({
          url: coverUrl,
          filename: `${albumInfo.title} - cover.jpg`
        });
      } catch {}
    }

    this.downloadFiles(files, albumInfo.title);
  }

  async downloadFiles(files, albumTitle) {
    if (!files || files.length === 0) return;

    if (!this.isDownloadSupported()) {
      this.fallbackDownload(files);
      return;
    }

    window.NotificationSystem?.info(`Скачивание ${files.length} файлов...`);
    let completed = 0;

    for (const file of files) {
      try {
        await this.downloadFile(file.url, file.filename);
        completed++;
        window.NotificationSystem?.info(`Скачано ${completed} из ${files.length}`, 2000);
        await this.delay(500);
      } catch (error) {
        console.error('Download failed:', file.filename, error);
      }
    }

    window.NotificationSystem?.success(`✅ Альбом "${albumTitle}" скачан!`);
  }

  async downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
      if (!navigator.onLine) {
        reject(new Error('Нет подключения к интернету'));
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      fetch(url, { signal: controller.signal })
        .then(response => {
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return response.blob();
        })
        .then(blob => {
          if (blob.size === 0) {
            throw new Error('Файл пустой (0 байт)');
          }

          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = this.sanitizeFilename(filename);
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setTimeout(() => URL.revokeObjectURL(link.href), 250);

          console.log(`✅ Downloaded: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        })
        .catch(error => {
          clearTimeout(timeoutId);

          if (error && error.name === 'AbortError') {
            reject(new Error('Превышено время ожидания скачивания'));
          } else {
            reject(error);
          }
        });
    });
  }

  sanitizeFilename(filename) {
    return String(filename || 'file').replace(/[<>:"/\\|?*]/g, '_');
  }

  isDownloadSupported() {
    const a = document.createElement('a');
    return typeof a.download !== 'undefined';
  }

  fallbackDownload(files) {
    window.NotificationSystem?.info('Откроются вкладки для скачивания');
    files.forEach((file, index) => {
      setTimeout(() => {
        window.open(file.url, '_blank');
      }, index * 300);
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

window.DownloadsManager = new DownloadsManager();
export default DownloadsManager;

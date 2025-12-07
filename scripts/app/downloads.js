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
    
    // Получить данные альбома
    const albumData = window.AlbumsManager?.getAlbumData(albumKey);
    if (!albumData) {
      window.NotificationSystem?.error('Не удалось загрузить данные альбома');
      return;
    }
    
    window.NotificationSystem?.info(`Подготовка к скачиванию: ${albumInfo.title}`);
    
    // Подготовить список файлов
    const files = albumData.tracks.map(track => ({
      url: `${albumInfo.base}${track.file}`,
      filename: `${albumInfo.title} - ${track.num}. ${track.title}.mp3`
    }));
    
    // Добавить обложку
    if (albumData.cover) {
      files.push({
        url: `${albumInfo.base}${albumData.cover}`,
        filename: `${albumInfo.title} - cover.jpg`
      });
    }
    
    // Начать скачивание
    this.downloadFiles(files, albumInfo.title);
  }

  async downloadFiles(files, albumTitle) {
    if (!files || files.length === 0) return;
    
    // Проверка поддержки скачивания
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
        window.NotificationSystem?.info(
          `Скачано ${completed} из ${files.length}`,
          { duration: 2000 }
        );
        // Задержка между скачиваниями (чтобы не блокировал браузер)
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
        
          const contentType = response.headers.get('content-type');
          if (!contentType || (!contentType.includes('audio') && !contentType.includes('octet-stream'))) {
            console.warn('⚠️ Unexpected content type:', contentType);
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
        
          setTimeout(() => URL.revokeObjectURL(link.href), 100);
        
          console.log(`✅ Downloaded: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        })
        .catch(error => {
          clearTimeout(timeoutId);
        
          if (error.name === 'AbortError') {
            reject(new Error('Превышено время ожидания скачивания'));
          } else {
            reject(error);
          }
        });
    });
  }

  sanitizeFilename(filename) {
    // Удалить недопустимые символы
    return filename.replace(/[<>:"/\\|?*]/g, '_');
  }

  isDownloadSupported() {
    // Проверка поддержки download attribute
    const a = document.createElement('a');
    return typeof a.download !== 'undefined';
  }

  fallbackDownload(files) {
    // Открыть каждый файл в новой вкладке (пользователь сам скачает)
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

// Глобальный экземпляр
window.DownloadsManager = new DownloadsManager();
export default DownloadsManager;

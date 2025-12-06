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
      fetch(url)
        .then(response => {
          if (!response.ok) throw new Error('Network error');
          return response.blob();
        })
        .then(blob => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = this.sanitizeFilename(filename);
          link.style.display = 'none';
          
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Освободить память
          setTimeout(() => URL.revokeObjectURL(link.href), 100);
          
          resolve();
        })
        .catch(reject);
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

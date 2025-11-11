// scripts/app/downloads.js (ESM)
// Логика скачивания треков и альбомов в виде ZIP-архива.

(function(){
  // Динамическая загрузка JSZip
  function loadJsZip() {
    if (window.JSZip) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function downloadTrack(albumKey, trackIndex) {
    if (!window.__getAlbumConfigByKey) return;
    const config = await window.__getAlbumConfigByKey(albumKey);
    const track = config?.tracks?.[trackIndex];
    if (!track || !track.audio) {
      window.NotificationSystem?.error('Аудиофайл не найден');
      return;
    }
    const url = track.audio;
    const filename = url.split('/').pop() || `track-${trackIndex + 1}.mp3`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok.');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (e) {
      console.error('Download failed:', e);
      window.NotificationSystem?.error('Ошибка при скачивании файла');
    }
  }

  async function downloadAlbum(albumKey) {
    await loadJsZip();
    if (!window.__getAlbumConfigByKey) return;
    const config = await window.__getAlbumConfigByKey(albumKey);
    if (!config) {
      window.NotificationSystem?.error('Конфигурация альбома не найдена');
      return;
    }

    const zip = new JSZip();
    const albumName = config.albumName || albumKey;

    // Добавление треков
    for (const track of config.tracks) {
      if (track.audio) {
        try {
          const response = await fetch(track.audio);
          if (response.ok) {
            const blob = await response.blob();
            const filename = track.audio.split('/').pop();
            zip.file(`${albumName}/${filename}`, blob);
          }
        } catch (e) { console.warn(`Failed to fetch track ${track.audio}:`, e); }
      }
    }
    
    // Добавление обложки, если есть
    if(window.coverGalleryArr && window.coverGalleryArr[0] && window.coverGalleryArr[0].formats.full) {
       try {
          const coverUrl = window.coverGalleryArr[0].formats.full;
          const response = await fetch(coverUrl);
          if(response.ok) {
             const blob = await response.blob();
             const filename = coverUrl.split('/').pop() || 'cover.jpg';
             zip.file(`${albumName}/${filename}`, blob);
          }
       } catch(e) { console.warn('Failed to fetch cover', e); }
    }


    zip.generateAsync({ type: "blob" }, (metadata) => {
        // Progress update if needed
    }).then((content) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${albumName}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);
    }).catch(e => {
        console.error('ZIP generation failed:', e);
        window.NotificationSystem?.error('Ошибка при создании архива');
    });
  }
  
  // Экспорт
  window.downloadTrack = downloadTrack;
  window.downloadAlbum = downloadAlbum;
})();


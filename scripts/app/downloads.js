// scripts/app/downloads.js — Менеджер загрузок
(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const escHtml = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

  const state = {
    queue: [],
    isDownloading: false,
    abortController: null
  };

  // ==================== СКАЧИВАНИЕ ТРЕКА ====================
  async function downloadTrack(track) {
    if (!track?.audio) {
      window.NotificationSystem?.error?.('Аудио недоступно');
      return false;
    }

    try {
      window.NotificationSystem?.info?.(`Загрузка: ${track.title}`);
      
      state.abortController = new AbortController();
      const response = await fetch(track.audio, { 
        signal: state.abortController.signal,
        cache: 'force-cache'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(track.title)}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      window.NotificationSystem?.success?.(`Загружено: ${track.title}`);
      return true;
    } catch (e) {
      if (e.name === 'AbortError') {
        window.NotificationSystem?.warning?.('Загрузка отменена');
      } else {
        console.error('Download error:', e);
        window.NotificationSystem?.error?.('Ошибка загрузки');
      }
      return false;
    } finally {
      state.abortController = null;
    }
  }

  function sanitizeFilename(name) {
    return (name || 'track')
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // ==================== СКАЧИВАНИЕ АЛЬБОМА (ZIP) ====================
  async function downloadAlbum(albumKey) {
    const tracks = window.AlbumsManager?.getTracks?.() || [];
    const config = window.AlbumsManager?.getConfig?.();
    
    if (!tracks.length) {
      window.NotificationSystem?.warning?.('Нет треков для загрузки');
      return;
    }

    // Проверяем наличие JSZip
    if (typeof JSZip === 'undefined') {
      // Пробуем загрузить
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      } catch {
        window.NotificationSystem?.error?.('Не удалось загрузить архиватор');
        return;
      }
    }

    const zip = new JSZip();
    const albumName = sanitizeFilename(config?.albumName || albumKey);
    let successCount = 0;

    window.NotificationSystem?.info?.(`Подготовка альбома: ${tracks.length} треков...`);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (!track?.audio) continue;

      try {
        const response = await fetch(track.audio, { cache: 'force-cache' });
        if (!response.ok) continue;
        
        const blob = await response.blob();
        const filename = `${String(i + 1).padStart(2, '0')}_${sanitizeFilename(track.title)}.mp3`;
        zip.file(filename, blob);
        successCount++;
      } catch (e) {
        console.warn(`Failed to add track: ${track.title}`, e);
      }
    }

    if (successCount === 0) {
      window.NotificationSystem?.error?.('Не удалось загрузить треки');
      return;
    }

    try {
      window.NotificationSystem?.info?.('Создание архива...');
      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${albumName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      window.NotificationSystem?.success?.(`Альбом загружен: ${successCount} треков`);
    } catch (e) {
      console.error('ZIP creation error:', e);
      window.NotificationSystem?.error?.('Ошибка создания архива');
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ==================== ОТМЕНА ====================
  function cancelDownload() {
    state.abortController?.abort();
  }

  // ==================== UI ====================
  function showDownloadModal(track) {
    const html = `
      <div class="modal-feedback" style="max-width:400px">
        <button class="bigclose">×</button>
        <h2>Скачать трек</h2>
        <p style="margin:16px 0"><strong>${escHtml(track?.title || 'Трек')}</strong></p>
        <p style="color:#888;font-size:14px">${escHtml(track?.artist || '')}</p>
        <div style="display:flex;gap:12px;margin-top:24px;justify-content:center">
          <button class="modal-action-btn" id="dl-confirm">Скачать</button>
          <button class="modal-action-btn" style="background:#444" id="dl-cancel">Отмена</button>
        </div>
      </div>
    `;

    const modal = window.Utils?.createModal?.(html);
    if (!modal) return;

    modal.querySelector('#dl-confirm')?.addEventListener('click', () => {
      modal.remove();
      downloadTrack(track);
    });

    modal.querySelector('#dl-cancel')?.addEventListener('click', () => modal.remove());
  }

  // ==================== ЭКСПОРТ ====================
  window.DownloadsManager = {
    downloadTrack,
    downloadAlbum,
    cancelDownload,
    showDownloadModal
  };
})();

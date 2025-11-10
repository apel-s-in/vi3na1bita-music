// scripts/app/downloads.js (ESM)
// Все функции скачивания/архивации с пробросом в window.* для совместимости.

(function(){
  function getPlayerConfig() {
    try {
      return (typeof window.getPlayerConfig === 'function') ? window.getPlayerConfig() : null;
    } catch { return null; }
  }
  function getTrackFileName(track, idx, artist){
    return `${String(idx+1).padStart(2,'0')} - ${track.title} - ${artist}.mp3`.replace(/[\\/:"*?<>|]+/g,'_');
  }

  function openDownloadModal(e){
    if (e) e.preventDefault();
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const fn = getTrackFileName(tr, window.playingTrack, pc.artist || 'Витрина Разбита');
    const el = document.getElementById('download-modal-filename');
    if (el) el.innerHTML=`<b>${fn}</b>`;
    document.getElementById('download-modal')?.classList.add('active');
  }
  async function downloadCurrentTrack(){
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const fn = getTrackFileName(tr, window.playingTrack, pc.artist || 'Витрина Разбита');
    const a=document.createElement('a'); a.href=tr.audio; a.download=fn;
    document.body.appendChild(a); a.click(); setTimeout(()=>{ document.body.removeChild(a); },250);
    closeDownloadModal(); try { window.NotificationSystem && window.NotificationSystem.success('Файл будет загружен!'); } catch {}
  }
  async function shareCurrentTrack(){
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const t = (window.playerCore && window.playerCore.getSeek) ? Math.floor(window.playerCore.getSeek() || 0) : 0;
    const timeParam = t > 10 ? `&time=${t}` : '';
    const shareUrl = location.origin + location.pathname + `?album=${window.playingAlbumKey}&track=${window.playingTrack}${timeParam}`;
    const txt = `🎵 ${tr.title} - ${pc.artist || 'Витрина Разбита'}\n🎧 Слушай:`;
    if (navigator.share){
      try { await navigator.share({title: tr.title, text: txt, url: shareUrl}); } catch {}
      try { window.NotificationSystem && window.NotificationSystem.success('Ссылка отправлена!'); } catch {}
      closeDownloadModal();
    } else {
      try { await navigator.clipboard.writeText(`${txt}\n${shareUrl}`); window.NotificationSystem && window.NotificationSystem.success('Ссылка скопирована!'); } catch {}
    }
  }
  function openInAppCurrentTrack() {
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return; window.open(tr.audio, '_blank', 'noopener'); closeDownloadModal();
  }
  function copyLinkCurrentTrack(){
    const pc = getPlayerConfig(); const tr = pc?.tracks?.[window.playingTrack];
    if (!tr) return;
    const directUrl = tr.audio;
    if (navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(directUrl).then(()=>window.NotificationSystem&&window.NotificationSystem.success('Прямая ссылка скопирована!'),()=>window.NotificationSystem&&window.NotificationSystem.error('Не удалось скопировать'));
    } else {
      const ta=document.createElement('textarea'); ta.value=directUrl; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); window.NotificationSystem&&window.NotificationSystem.success('Прямая ссылка скопирована!'); }catch{ window.NotificationSystem&&window.NotificationSystem.error('Не удалось скопировать'); }
      document.body.removeChild(ta);
    }
    closeDownloadModal();
  }
  function closeDownloadModal(){ document.getElementById('download-modal')?.classList.remove('active'); }

  // Альбом (модалки)
  function openAlbumDownloadModal(){ document.getElementById('albumDownloadModal')?.classList.add('active'); try { checkFavoritesAvailable(); } catch {} }
  function closeAlbumDownloadModal(){ document.getElementById('albumDownloadModal')?.classList.remove('active'); }
  function checkFavoritesAvailable(){
    try {
      const favCheckbox=document.getElementById('onlyFavorites');
      const liked = (typeof window.getLiked === 'function') ? window.getLiked() : [];
      if (!favCheckbox) return;
      favCheckbox.disabled = liked.length===0;
      favCheckbox.parentElement.style.opacity = liked.length===0 ? '.5' : '1';
    } catch {}
  }

  // Дальше — подготовка архива. Чтобы не дублировать весь код, переиспользуем существующие функции в index.html при наличии.
  // Оставим делегаты: если функции уже перенесены — используем их; если нет — fallback на имеющуюся реализацию в index.html.
  function callOrFallback(name, ...args) {
    if (typeof window[name] === 'function') return window[name](...args);
  }

  window.openDownloadModal = openDownloadModal;
  window.downloadCurrentTrack = downloadCurrentTrack;
  window.shareCurrentTrack = shareCurrentTrack;
  window.openInAppCurrentTrack = openInAppCurrentTrack;
  window.copyLinkCurrentTrack = copyLinkCurrentTrack;
  window.closeDownloadModal = closeDownloadModal;
  window.openAlbumDownloadModal = openAlbumDownloadModal;
  window.closeAlbumDownloadModal = closeAlbumDownloadModal;
  window.checkFavoritesAvailable = checkFavoritesAvailable;

  // Делегаты для сложных процедур архивации (оставим вызовы на существующую реализацию)
  window.loadJSZip = (...a) => callOrFallback('loadJSZip', ...a);
  window.prepareFilesList = (...a) => callOrFallback('prepareFilesList', ...a);
  window.gatherGalleryFilesForAlbum = (...a) => callOrFallback('gatherGalleryFilesForAlbum', ...a);
  window.prepareDownload = (...a) => callOrFallback('prepareDownload', ...a);
  window.closeSizeConfirmModal = (...a) => callOrFallback('closeSizeConfirmModal', ...a);
  window.calculateArchiveSize = (...a) => callOrFallback('calculateArchiveSize', ...a);
  window.startDownload = (...a) => callOrFallback('startDownload', ...a);
  window.showProgressModal = (...a) => callOrFallback('showProgressModal', ...a);
  window.updateProgress = (...a) => callOrFallback('updateProgress', ...a);
  window.showErrors = (...a) => callOrFallback('showErrors', ...a);
  window.createAndDownloadZip = (...a) => callOrFallback('createAndDownloadZip', ...a);
})();

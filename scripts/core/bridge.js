// scripts/core/bridge.js (ESM)
// Мост между ядром плеера (PlayerCore) и UI-модулями.
// Слушает события от плеера и вызывает соответствующие функции обновления UI.

(function(){
  if (!window.playerCore) {
    console.error("Player Core not initialized. Bridge cannot be created.");
    return;
  }
  const pc = window.playerCore;

  // Форматирование времени
  const formatTime = (secs) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  pc.on('play', (data) => {
    if(window.updatePlayPauseIcon) window.updatePlayPauseIcon();
    if(window.updateCurrentTrackHighlight) window.updateCurrentTrackHighlight(data.index);
    document.body.classList.add('is-playing');
  });

  pc.on('pause', () => {
    if(window.updatePlayPauseIcon) window.updatePlayPauseIcon();
    document.body.classList.remove('is-playing');
  });

  pc.on('stop', () => {
    if(window.updatePlayPauseIcon) window.updatePlayPauseIcon();
    if(window.updateCurrentTrackHighlight) window.updateCurrentTrackHighlight(-1);
    document.body.classList.remove('is-playing');
    // Сброс UI времени/прогресса
    document.getElementById('player-progress-fill').style.width = '0%';
    document.getElementById('time-current').textContent = '0:00';
    document.getElementById('time-duration').textContent = '0:00';
  });
  
  pc.on('trackchange', (data) => {
    window.playingAlbumKey = data.albumKey;
    window.playingTrack = data.index;

    if(window.updateCurrentTrackHighlight) window.updateCurrentTrackHighlight(data.index);
    if(window.updateURLHash) window.updateURLHash(data.albumKey, data.index);
    if(window.fetchAndCacheLyrics) window.fetchAndCacheLyrics(data.track?.lyrics);
    if(window.applyMiniModeUI) window.applyMiniModeUI();
    if(window.updateNextUpLabel) window.updateNextUpLabel();
  });
  
  pc.on('playlistchange', () => {
     if(window.updateNextUpLabel) window.updateNextUpLabel();
     if(window.buildTrackList) window.buildTrackList(); // Перерисовать список, если плейлист изменился
  });

  pc.on('timeupdate', (data) => {
    const { seek, duration } = data;
    if (duration > 0 && !document.body.classList.contains('eco-mode')) {
      const percent = (seek / duration) * 100;
      document.getElementById('player-progress-fill').style.width = `${percent}%`;
    }
    document.getElementById('time-current').textContent = formatTime(seek);
    document.getElementById('time-duration').textContent = formatTime(duration);
    
    if(window.updateLyrics && !document.body.classList.contains('eco-mode')) window.updateLyrics(seek);
  });
  
  pc.on('volumechange', (volume) => {
      if(window.updateVolumeUI) window.updateVolumeUI(volume);
  });
  
  pc.on('error', (data) => {
     window.NotificationSystem?.error(`Ошибка: ${data.message}`);
  });

})();

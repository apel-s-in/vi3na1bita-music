// scripts/ui/tracks.js (ESM)
// Рендеринг списка треков и управление подсветкой.

(function(){
  function buildTrackList() {
    const listEl = document.getElementById('track-list');
    if (!listEl || !window.config || !Array.isArray(window.config.tracks)) return;
    
    const albumKey = window.currentAlbumKey;
    const tracks = window.config.tracks;
    
    const html = tracks.map((track, index) => {
      const isFav = window.isFavorite ? window.isFavorite(albumKey, index) : false;
      return `
        <div class="track ${isFav ? 'is-favorite' : ''}" data-idx="${index}" data-action="play-track">
          <span class="tnum">${index + 1}.</span>
          <span class="track-title">${track.title || 'Без названия'}</span>
          <img class="like-star" 
               src="${isFav ? 'img/star.svg' : 'img/star-outline.svg'}" 
               alt="Избранное" 
               data-action="toggle-favorite" 
               data-album-key="${albumKey}" 
               data-track-index="${index}">
        </div>
      `;
    }).join('');
    
    listEl.innerHTML = html;
  }

  function updateCurrentTrackHighlight(trackIndex) {
    const tracks = document.querySelectorAll('#track-list .track');
    tracks.forEach(el => {
      const isCurrent = el.dataset.idx === String(trackIndex);
      el.classList.toggle('current', isCurrent);
      if (isCurrent) {
          // Плавный скролл к текущему треку
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Экспорт
  window.buildTrackList = buildTrackList;
  window.updateCurrentTrackHighlight = updateCurrentTrackHighlight;
})();

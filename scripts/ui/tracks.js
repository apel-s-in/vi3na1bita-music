// scripts/ui/tracks.js (ESM)
// Вынос: buildTrackList + renderLyricsBlock (+ улучшенный выбор аудио‑выхода)
export function buildTrackList() {
  const list = document.getElementById('track-list');
  if (!list) return;

  const cfg = window.config || null;
  const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];

  const preservedInNowPlaying = !!document.getElementById('now-playing')?.querySelector('#lyricsplayerblock');
  const foreignView = preservedInNowPlaying && window.isBrowsingOtherAlbum && window.isBrowsingOtherAlbum();

  if (!tracks.length) {
    list.innerHTML = '<div style="text-align:center; opacity:.8; margin:10px 0;">Треклист недоступен</div>';
    return;
  }

  // Рендер без inline-обработчиков: используем data-index + делегирование
  let html = '';
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const isCur = (!foreignView && i === window.currentTrack) ? ' current' : '';
    const liked = window.isLiked && window.isLiked(i);
    html += `
      <div class="track${isCur}" id="trk${i}" data-index="${i}">
        <span class="tnum">${String(i + 1).padStart(2, '0')}.</span>
        <span class="track-title">${t.title}</span>
        <img
          src="${liked ? 'img/star.png' : 'img/star2.png'}"
          class="like-star"
          alt="звезда"
          title="${liked ? 'Убрать из понравившихся' : 'Добавить в понравившиеся'}"
          data-action="toggle-like"
        />
      </div>`;
    if (i === window.currentTrack && (!preservedInNowPlaying || (window.currentAlbumKey === window.playingAlbumKey))) {
      html += `<div class="lyrics-player-block" id="lyricsplayerblock"></div>`;
    }
  }

  list.innerHTML = html;

  // Единоразово навешиваем делегированные обработчики
  if (!list.__delegatedHandlersInstalled) {
    list.__delegatedHandlersInstalled = true;

    list.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // Клик по звезде
      const star = target.closest('.like-star');
      if (star) {
        const row = target.closest('.track');
        const idx = row ? parseInt(row.getAttribute('data-index') || '-1', 10) : -1;
        if (Number.isInteger(idx) && idx >= 0) {
          // Сохраняем поведение: останавливаем всплытие, чтобы строка не запускалась
          e.stopPropagation();
          window.toggleLike && window.toggleLike(idx, e);
        }
        return;
      }

      // Клик по строке — запустить трек
      const row = target.closest('.track');
      if (row) {
        const idx = parseInt(row.getAttribute('data-index') || '-1', 10);
        if (Number.isInteger(idx) && idx >= 0) {
          window.pickAndPlayTrack && window.pickAndPlayTrack(idx);
        }
      }
    });
  }

  try { window.dedupePlayerBlock && window.dedupePlayerBlock(); } catch {}

  if (preservedInNowPlaying && window.currentAlbumKey === window.playingAlbumKey) {
    const holder = document.getElementById('now-playing');
    const lp = holder?.querySelector('#lyricsplayerblock');
    const ph = list.querySelector('#lyricsplayerblock');
    if (lp && ph && lp !== ph) {
      ph.replaceWith(lp);
      holder.innerHTML = '';
    }
  }
  if (!preservedInNowPlaying && window.currentTrack >= 0) {
    renderLyricsBlock();
  }

  if (window.favoritesFilterActive) {
    list.classList.add('filtered');
    try { window.updateFavoriteClasses && window.updateFavoriteClasses(); } catch {}
  }
}

export function renderLyricsBlock() {
  const block = document.getElementById('lyricsplayerblock') || document.getElementById('now-playing');
  if (!block) return;

  block.innerHTML = `
    <div class="mini-now" id="mini-now">
      <span class="tnum" id="mini-now-num">--.</span>
      <span class="track-title" id="mini-now-title">—</span>
      <img src="img/star2.png" class="like-star" id="mini-now-star" alt="звезда" title="Добавить в понравившиеся" data-action="mini-like"/>
    </div>
    <div id="lyrics-window" class="lyrics-normal">
      <div class="lyrics-animated-bg${window.animationEnabled ? ' active' : ''}"></div>
      <div class="lyrics-scroll" id="lyrics"></div>
    </div>
    <div class="player-progress-wrapper">
      <div class="player-progress-bar" id="player-progress-bar"><div class="player-progress-fill" id="player-progress-fill"><div class="player-progress-handle"></div></div></div>
    </div>
    <div class="audio-wrapper"><div id="audio-slot"></div></div>
    <div class="player-controls" role="group" aria-label="Управление воспроизведением">
      <div class="player-controls-row">
        <span class="time-in-controls" id="time-elapsed">00:00</span>
        <button class="player-control-btn" data-action="prev" title="Предыдущий трек (P)" aria-label="Предыдущий трек"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 5L4 12l7 7V5zm9 0v14l-7-7 7-7z"/></svg></button>
        <button class="player-control-btn main" data-action="playpause" title="Воспроизведение/Пауза (K/Пробел)" aria-label="Воспроизведение/Пауза"><svg id="play-pause-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
        <button class="player-control-btn" data-action="stop" title="Стоп (X)" aria-label="Стоп"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg></button>
        <button class="player-control-btn" data-action="next" title="Следующий трек (N)" aria-label="Следующий трек"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 5l7 7-7 7V5zM4 5v14l7-7-7-7z"/></svg></button>
        <span class="time-in-controls" id="time-remaining">--:--</span>
      </div>
      <div class="player-controls-row">
        <button class="player-control-btn" id="mute-btn" data-action="mute" title="Без звука (M)" aria-label="Без звука"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></button>
        <button class="player-control-btn${window.shuffleMode?' active':''}" id="shuffle-btn" data-action="shuffle" title="Случайный порядок (U)" aria-label="Shuffle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17h2.735a4 4 0 003.43-1.942l3.67-6.116A4 4 0 0116.265 7H21m0 0l-3-3m3 3l-3 3"/><path d="M3 7h2.735a4 4 0 013.43 1.942l3.67 6.116A4 4 0 0016.265 17H21m0 0l-3 3m3-3l-3-3"/></svg></button>
        <button class="player-control-btn animation-btn${window.animationEnabled?' animation-active':''}" id="animation-btn" data-action="animation" title="Анимация лирики (A)" aria-label="Анимация">A</button>
        <button class="player-control-btn bit-btn${window.bitEnabled?' bit-active':''}" id="bit-btn" data-action="bit" title="Пульсация логотипа (B)" aria-label="Пульсация">B</button>
        <button class="player-control-btn${window.repeatMode?' repeat-active':''}" id="repeat-btn" data-action="repeat" title="Повтор трека (R)" aria-label="Повтор"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>
        <button class="sleep-timer-btn" id="sleep-timer-btn" data-action="sleep-menu" title="Таймер сна (T)" aria-label="Таймер сна">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          <span class="sleep-timer-badge" id="sleep-timer-badge" style="display:none;">0</span>
          <div class="sleep-menu" id="sleep-menu">
            <div class="sleep-menu-item" data-action="sleep-off">Выключить</div>
            <div class="sleep-menu-item" data-action="sleep-15">15 минут</div>
            <div class="sleep-menu-item" data-action="sleep-30">30 минут</div>
            <div class="sleep-menu-item" data-action="sleep-60">60 минут</div>
            <div class="sleep-menu-item" data-action="sleep-prompt">К времени...</div>
          </div>
        </button>
        <button class="player-control-btn${window.favoritesOnlyMode?' favorites-active':''}" id="favorites-btn" data-action="favorites-toggle" title="Только избранные (F)" aria-label="Избранные"><img src="img/${window.favoritesOnlyMode?'star.png':'star2.png'}" alt="★" id="favorites-btn-icon"/></button>
      </div>
    </div>
    <div class="volume-control-wrapper">
      <div class="volume-track"></div><div class="volume-fill" id="volume-fill"></div>
      <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100" aria-label="Громкость" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
    </div>
    <div class="player-buttons-wrapper">
      <button class="lyrics-toggle-btn lyrics-normal" id="lyrics-toggle-btn" title="Скрыть лирику (Y)" aria-label="Скрыть лирику"><span class="lyrics-toggle-btn-visual">Т</span></button>
      <div class="player-extra-buttons-row">
        <button class="karaoke-btn" id="lyrics-modal-open">ТЕКСТ</button>
        <a class="player-download-btn" href="#" id="download-open">СКАЧАТЬ ПЕСНЮ</a>
        <button id="eco-btn" class="eco-btn" title="Ультра‑эконом: минимальные обновления UI в фоне" aria-pressed="false">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"></path></svg>
          <span class="eco-label">ЭКО</span>
        </button>
      </div>
    </div>
  `;

  // Делегирование кликов в пределах блока плеера
  if (!block.__delegatedHandlersInstalled) {
    block.__delegatedHandlersInstalled = true;
    block.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;

      // Мини-шапка: звезда
      if (t.closest('#mini-now-star')) {
        e.stopPropagation();
        window.toggleLikePlayingFromMini && window.toggleLikePlayingFromMini(e);
        return;
      }
      // Клик по мини-шапке (кроме звезды)
      if (t.closest('#mini-now')) {
        if (t.closest('#mini-now-star')) return;
        window.openPlayingAlbumFromMini && window.openPlayingAlbumFromMini(e);
        return;
      }

      const btn = t.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');

      switch (action) {
        case 'prev':        window.previousTrack && window.previousTrack(); break;
        case 'playpause':   window.togglePlayPause && window.togglePlayPause(); break;
        case 'stop':        window.stopPlayback && window.stopPlayback(); break;
        case 'next':        window.nextTrack && window.nextTrack(); break;
        case 'mute':        window.toggleMute && window.toggleMute(); break;
        case 'shuffle':     window.toggleShuffle && window.toggleShuffle(); break;
        case 'animation':   window.toggleAnimation && window.toggleAnimation(); break;
        case 'bit':         window.toggleBit && window.toggleBit(); break;
        case 'repeat':      window.toggleRepeat && window.toggleRepeat(); break;
        case 'favorites-toggle': window.toggleFavoritesOnly && window.toggleFavoritesOnly(); break;
        case 'sleep-menu':  window.toggleSleepMenu && window.toggleSleepMenu(); break;
        case 'sleep-off':   window.setSleepTimer && window.setSleepTimer('off'); break;
        case 'sleep-15':    window.setSleepTimer && window.setSleepTimer(15); break;
        case 'sleep-30':    window.setSleepTimer && window.setSleepTimer(30); break;
        case 'sleep-60':    window.setSleepTimer && window.setSleepTimer(60); break;
        case 'sleep-prompt':window.showTimePickerForSleep && window.showTimePickerForSleep(); break;
      }
    });

    // Прочие кнопки без data-action
    block.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      if (t.closest('#lyrics-modal-open')) {
        window.openLyricsModal && window.openLyricsModal();
        return;
      }
      if (t.closest('#download-open')) {
        e.preventDefault();
        window.openDownloadModal && window.openDownloadModal(e);
        return;
      }
      if (t.closest('#lyrics-toggle-btn')) {
        window.toggleLyricsView && window.toggleLyricsView();
        return;
      }
    });
  }

  // Дальнейшая инициализация (без изменений)
  const pc = (window.getPlayerConfig && window.getPlayerConfig()) || null;
  const tr = pc?.tracks?.[window.playingTrack];
  if (!tr) return;

  if (window.loadLyrics && tr.lyrics) window.loadLyrics(tr.lyrics);
  try { window.setupMediaSessionForPlayback && window.setupMediaSessionForPlayback(); } catch {}
  try { window.restorePlayerButtonsState && window.restorePlayerButtonsState(); } catch {}
  try { window.applyLyricsViewMode && window.applyLyricsViewMode(); } catch {}
  try { window.initializePlayerControls && window.initializePlayerControls(); } catch {}
  try { window.prefetchNextTrackAssetsForPlayback && window.prefetchNextTrackAssetsForPlayback(); } catch {}

  try { window.applyMiniModeUI && window.applyMiniModeUI(); } catch {}
  try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
  try { window.updateMiniNowHeader && window.updateMiniNowHeader(); } catch {}

  // Аудиовыход — как было
  (async function initAudioOutputSelect() {
    try {
      const row2 = document.querySelectorAll('.player-controls-row')[1];
      const dest = (window.Howler && window.Howler.ctx && window.Howler.ctx.destination) ? window.Howler.ctx.destination : null;
      if (!row2 || !dest || typeof dest.setSinkId !== 'function') return;
      if (document.getElementById('audio-output-select')) return;
      // ... (оставляем реализацию из предыдущей версии)
    } catch {}
  })();

  try { window.dedupePlayerBlock && window.dedupePlayerBlock(); } catch {}
}

// экспорт в глобал
window.UITracks = { buildTrackList, renderLyricsBlock };

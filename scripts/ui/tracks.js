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

  let html = '';
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const isCur = (!foreignView && i === window.currentTrack) ? ' current' : '';
    html += `<div class="track${isCur}" id="trk${i}" onclick="pickAndPlayTrack(${i})">
      <span class="tnum">${String(i + 1).padStart(2, '0')}.</span>
      <span class="track-title">${t.title}</span>
      <img src="${window.isLiked && window.isLiked(i) ? 'img/star.png' : 'img/star2.png'}"
           class="like-star"
           alt="звезда"
           title="${window.isLiked && window.isLiked(i) ? 'Убрать из понравившихся' : 'Добавить в понравившиеся'}"
           onclick="toggleLike(${i}, event)"/>
    </div>`;
    if (i === window.currentTrack && (!preservedInNowPlaying || (window.currentAlbumKey === window.playingAlbumKey))) {
      html += `<div class="lyrics-player-block" id="lyricsplayerblock"></div>`;
    }
  }

  list.innerHTML = html;
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
    <div class="mini-now" id="mini-now" onclick="openPlayingAlbumFromMini(event)">
      <span class="tnum" id="mini-now-num">--.</span>
      <span class="track-title" id="mini-now-title">—</span>
      <img src="img/star2.png" class="like-star" id="mini-now-star"
           alt="звезда" title="Добавить в понравившиеся"
           onclick="toggleLikePlayingFromMini(event)"/>
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
        <button class="player-control-btn" onclick="previousTrack()" title="Предыдущий трек (P)" aria-label="Предыдущий трек"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 5L4 12l7 7V5zm9 0v14l-7-7 7-7z"/></svg></button>
        <button class="player-control-btn main" onclick="togglePlayPause()" title="Воспроизведение/Пауза (K/Пробел)" aria-label="Воспроизведение/Пауза"><svg id="play-pause-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
        <button class="player-control-btn" onclick="stopPlayback()" title="Стоп (X)" aria-label="Стоп"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg></button>
        <button class="player-control-btn" onclick="nextTrack()" title="Следующий трек (N)" aria-label="Следующий трек"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 5l7 7-7 7V5zM4 5v14l7-7-7-7z"/></svg></button>
        <span class="time-in-controls" id="time-remaining">--:--</span>
      </div>
      <div class="player-controls-row">
        <button class="player-control-btn" id="mute-btn" onclick="toggleMute()" title="Без звука (M)" aria-label="Без звука"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></button>
        <button class="player-control-btn${window.shuffleMode?' active':''}" id="shuffle-btn" onclick="toggleShuffle()" title="Случайный порядок (U)" aria-label="Shuffle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17h2.735a4 4 0 003.43-1.942l3.67-6.116A4 4 0 0116.265 7H21m0 0l-3-3m3 3l-3 3"/><path d="M3 7h2.735a4 4 0 013.43 1.942l3.67 6.116A4 4 0 0016.265 17H21m0 0l-3 3m3-3l-3-3"/></svg></button>
        <button class="player-control-btn animation-btn${window.animationEnabled?' animation-active':''}" id="animation-btn" onclick="toggleAnimation()" title="Анимация лирики (A)" aria-label="Анимация">A</button>
        <button class="player-control-btn bit-btn${window.bitEnabled?' bit-active':''}" id="bit-btn" onclick="toggleBit()" title="Пульсация логотипа (B)" aria-label="Пульсация">B</button>
        <button class="player-control-btn${window.repeatMode?' repeat-active':''}" id="repeat-btn" onclick="toggleRepeat()" title="Повтор трека (R)" aria-label="Повтор"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>
        <button class="sleep-timer-btn" id="sleep-timer-btn" onclick="toggleSleepMenu()" title="Таймер сна (T)" aria-label="Таймер сна">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          <span class="sleep-timer-badge" id="sleep-timer-badge" style="display:none;">0</span>
          <div class="sleep-menu" id="sleep-menu">
            <div class="sleep-menu-item" onclick="setSleepTimer('off')">Выключить</div>
            <div class="sleep-menu-item" onclick="setSleepTimer(15)">15 минут</div>
            <div class="sleep-menu-item" onclick="setSleepTimer(30)">30 минут</div>
            <div class="sleep-menu-item" onclick="setSleepTimer(60)">60 минут</div>
            <div class="sleep-menu-item" onclick="showTimePickerForSleep()">К времени...</div>
          </div>
        </button>
        <button class="player-control-btn${window.favoritesOnlyMode?' favorites-active':''}" id="favorites-btn" onclick="toggleFavoritesOnly()" title="Только избранные (F)" aria-label="Избранные"><img src="img/${window.favoritesOnlyMode?'star.png':'star2.png'}" alt="★" id="favorites-btn-icon"/></button>
      </div>
    </div>
    <div class="volume-control-wrapper">
      <div class="volume-track"></div><div class="volume-fill" id="volume-fill"></div>
      <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100" aria-label="Громкость" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
    </div>
    <div class="player-buttons-wrapper">
      <button class="lyrics-toggle-btn lyrics-normal" onclick="toggleLyricsView()" aria-label="Скрыть лирику" title="Скрыть лирику (Y)"><span class="lyrics-toggle-btn-visual">Т</span></button>
      <div class="player-extra-buttons-row">
        <button class="karaoke-btn" onclick="openLyricsModal()">ТЕКСТ</button>
        <a class="player-download-btn" href="#" onclick="openDownloadModal(event)">СКАЧАТЬ ПЕСНЮ</a>
        <button id="eco-btn" class="eco-btn" onclick="toggleEco()" aria-pressed="false" title="Ультра‑эконом: минимальные обновления UI в фоне">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"></path>
          </svg>
          <span class="eco-label">ЭКО</span>
        </button>
      </div>
    </div>
  `;

  const pc = (window.getPlayerConfig && window.getPlayerConfig()) || null;
  const tr = pc?.tracks?.[window.playingTrack];
  if (!tr) return;

  try {
    const eb = document.getElementById('eco-btn');
    if (eb) {
      eb.classList.toggle('eco-active', !!window.ultraEcoEnabled);
      if (!eb.__ecoDbl) {
        eb.__ecoDbl = true;
        eb.addEventListener('dblclick', () => {
          const cur = parseInt(localStorage.getItem('ecoUiIntervalSec') || '5', 10);
          const val = prompt('Интервал обновления UI в ЭКО (секунды, 2–60):', String(cur));
          const n = parseInt(val || '5', 10);
          if (Number.isFinite(n) && n >= 2 && n <= 60) {
            localStorage.setItem('ecoUiIntervalSec', String(n));
            if (window.ultraEcoEnabled) {
              window.__uiUpdateMinIntervalMs = n * 1000;
              window.__progressThrottleMs = n * 1000;
            }
            window.NotificationSystem && window.NotificationSystem.success(`ЭКО: интервал ${n} с`);
          }
        });
      }
    }
  } catch {}

  if (window.loadLyrics && tr.lyrics) window.loadLyrics(tr.lyrics);
  try { window.setupMediaSessionForPlayback && window.setupMediaSessionForPlayback(); } catch {}
  try { window.restorePlayerButtonsState && window.restorePlayerButtonsState(); } catch {}
  try { window.applyLyricsViewMode && window.applyLyricsViewMode(); } catch {}
  try { window.initializePlayerControls && window.initializePlayerControls(); } catch {}
  try { window.prefetchNextTrackAssetsForPlayback && window.prefetchNextTrackAssetsForPlayback(); } catch {}

  try { window.applyMiniModeUI && window.applyMiniModeUI(); } catch {}
  try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
  try { window.updateMiniNowHeader && window.updateMiniNowHeader(); } catch {}

  // Улучшенный UI выбора аудиовыхода: <select>, persist deviceId
  (async function initAudioOutputSelect() {
    try {
      const row2 = document.querySelectorAll('.player-controls-row')[1];
      const dest = (window.Howler && window.Howler.ctx && window.Howler.ctx.destination) ? window.Howler.ctx.destination : null;
      if (!row2 || !dest || typeof dest.setSinkId !== 'function') return;

      if (document.getElementById('audio-output-select')) return;

      const wrap = document.createElement('div');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';

      const sel = document.createElement('select');
      sel.id = 'audio-output-select';
      sel.title = 'Аудиовыход';
      sel.style.minWidth = '120px';
      sel.style.height = '32px';
      sel.style.borderRadius = '8px';
      sel.style.background = 'rgba(255,255,255,.1)';
      sel.style.color = 'var(--secondary-color)';
      sel.style.border = '1px solid rgba(255,255,255,.2)';
      sel.style.cursor = 'pointer';

      const lab = document.createElement('span');
      lab.textContent = 'OUT:';
      lab.style.opacity = '.75';
      lab.style.fontSize = '12px';

      wrap.appendChild(lab);
      wrap.appendChild(sel);
      row2.insertBefore(wrap, row2.firstChild);

      async function refreshOptions() {
        let devices = [];
        try { devices = (await navigator.mediaDevices?.enumerateDevices?.()) || []; } catch {}
        const outs = devices.filter(d => d.kind === 'audiooutput');
        const savedId = localStorage.getItem('audioOutputDeviceId') || '';
        sel.innerHTML = '';
        const mk = (id, label) => {
          const o = document.createElement('option');
          o.value = id; o.textContent = label || (id ? 'Устройство вывода' : 'По умолчанию');
          return o;
        };
        sel.appendChild(mk('', 'По умолчанию'));
        outs.forEach(d => sel.appendChild(mk(d.deviceId, d.label || 'Динамики')));

        if (savedId && [...sel.options].some(o => o.value === savedId)) {
          sel.value = savedId;
          try { await dest.setSinkId(savedId); } catch {}
        }
      }

      sel.addEventListener('change', async () => {
        const id = sel.value || '';
        try {
          await dest.setSinkId(id || '');
          localStorage.setItem('audioOutputDeviceId', id);
          window.NotificationSystem && window.NotificationSystem.success('Аудиовыход переключён');
        } catch {
          window.NotificationSystem && window.NotificationSystem.error('Не удалось переключить аудиовыход');
        }
      });

      await refreshOptions();
      // На некоторых браузерах после начала воспроизведения labels появляются — обновим через 2 сек.
      setTimeout(refreshOptions, 2000);

      // Добавляем обработчик смены устройств вывода
      try {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
          navigator.mediaDevices.addEventListener('devicechange', () => { refreshOptions(); });
        } else if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
          navigator.mediaDevices.ondevicechange = () => { refreshOptions(); };
        }
      } catch {}
    } catch {}
  })();

  try { window.dedupePlayerBlock && window.dedupePlayerBlock(); } catch {}
}

// экспорт в глобал
window.UITracks = { buildTrackList, renderLyricsBlock };

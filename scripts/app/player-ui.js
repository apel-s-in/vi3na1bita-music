(function () {
  'use strict';

  const w = window, U = w.Utils;
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // State
  let animationFrame = null;
  let analyser = null;
  let dataArray = null;
  let isPulseOn = false;

  function init() {
    if (!w.playerCore) return setTimeout(init, 100);
    bindEvents();
    restoreState();
  }

  function bindEvents() {
    const pc = w.playerCore;

    // --- Core Events ---
    pc.on({
      onTrackChange: (track) => {
        updateTrackInfo(track);
        updateDownloadLink(track);
        updatePlayIcon();
      },
      onPlay: () => { updatePlayIcon(); startPulse(); },
      onPause: () => { updatePlayIcon(); stopPulseAnimation(); },
      onStop: () => { updatePlayIcon(); stopPulseAnimation(); },
      onTick: (pos, dur) => updateProgress(pos, dur)
    });

    pc.onFavoritesChanged(() => {
        // Refresh star icon if current track changed status
        const track = pc.getCurrentTrack();
        if(track) updateFavoriteIcon(track);
    });

    // --- Controls ---
    on($('play-pause-btn'), 'click', () => pc.toggle());
    on($('prev-btn'), 'click', () => pc.prev());
    on($('next-btn'), 'click', () => pc.next());
    on($('stop-btn'), 'click', () => pc.stop());
    
    on($('shuffle-btn'), 'click', () => {
       const s = pc.toggleShuffle();
       $('shuffle-btn').classList.toggle('active', s);
    });

    on($('repeat-btn'), 'click', () => {
       const r = pc.toggleRepeat(); // false -> 'all' -> 'one'
       $('repeat-btn').classList.toggle('active', !!r);
       $('repeat-btn').innerHTML = r === 'one' ? '🔂' : '🔁';
    });

    on($('favorites-btn'), 'click', () => {
       const active = pc.toggleFavoritesOnly();
       $('favorites-btn').classList.toggle('favorites-active', active);
       $('favorites-btn-icon').src = active ? 'img/star.png' : 'img/star2.png';
       w.NotificationSystem?.info(active ? 'Только избранное' : 'Все треки');
    });

    on($('mute-btn'), 'click', () => {
        const m = !pc.sound?.mute(); 
        pc.setMuted(m);
        $('mute-btn').classList.toggle('active', m);
    });

    on($('vol-slider'), 'input', (e) => {
        const val = e.target.value / 100;
        pc.setVolume(val);
        $('#volume-fill').style.width = e.target.value + '%';
        $('#volume-handle').style.left = e.target.value + '%';
    });

    // --- Extra Buttons ---
    on($('pulse-btn'), 'click', togglePulse);
    
    on($('lyrics-toggle-btn'), 'click', () => {
        const cont = $('lyrics-container');
        const hidden = cont.style.display === 'none';
        cont.style.display = hidden ? 'block' : 'none';
        $('lyrics-toggle-btn').classList.toggle('active', hidden);
    });

    on($('lyrics-text-btn'), 'click', () => {
        // Open modal
        if(w.LyricsModal) w.LyricsModal.show();
    });

    on($('animation-btn'), 'click', () => {
        // Toggle gradient animation on lyrics background
        const bg = document.querySelector('.lyrics-animated-bg');
        bg.classList.toggle('active');
        $('animation-btn').classList.toggle('active');
    });

    // Progress Bar Seek
    on($('player-progress-bar'), 'click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        pc.seek(pc.getDuration() * pct);
    });
  }

  // --- UI Updaters ---

  function updateTrackInfo(track) {
    if (!track) return;
    $('player-track-title').textContent = track.title;
    $('player-track-artist').textContent = track.artist;
    
    // Update Favorite Icon state
    updateFavoriteIcon(track);
  }

  function updateFavoriteIcon(track) {
      const isFav = w.playerCore.isFavorite(track.uid);
      // Если кнопка F (в нижнем ряду) не является индикатором текущего трека, 
      // то нам нужен отдельный индикатор. 
      // В дизайне кнопка "F" включает РЕЖИМ. 
      // Индикатор лайка ТЕКУЩЕГО трека обычно в списке или рядом с названием. 
      // Но на скриншоте его нет в панели плеера. Оставим логику F только для режима.
  }

  function updatePlayPauseIcon() {
    const playing = w.playerCore.isPlaying();
    const path = $('play-pause-icon').querySelector('path');
    if (playing) path.setAttribute('d', 'M6 4h4v16H6zM14 4h4v16h-4z'); // Pause icon
    else path.setAttribute('d', 'M8 5v14l11-7z'); // Play icon
  }

  function updateProgress(pos, dur) {
    const pct = dur > 0 ? (pos / dur) * 100 : 0;
    $('#progress-fill').style.width = pct + '%';
    $('time-current').textContent = U.formatTime(pos);
    $('time-duration').textContent = U.formatTime(dur);
  }

  function updateDownloadLink(track) {
    const a = $('track-download-btn');
    if (track && track.src) {
        a.href = track.src;
        a.download = `${track.artist} - ${track.title}.mp3`;
        a.style.pointerEvents = 'auto';
        a.style.opacity = '1';
    } else {
        a.href = '#';
        a.style.pointerEvents = 'none';
        a.style.opacity = '0.5';
    }
  }

  // --- Visualizer (Pulse) ---

  function togglePulse() {
    isPulseOn = !isPulseOn;
    $('pulse-btn').classList.toggle('active', isPulseOn);
    $('pulse-heart').textContent = isPulseOn ? '❤️' : '🤍';
    
    if (isPulseOn) {
        setupAudioAnalysis();
        startPulse();
    } else {
        stopPulseAnimation();
        // Reset scale
        $('logo-bottom').style.transform = 'scale(1)';
    }
  }

  function setupAudioAnalysis() {
    if (analyser) return; // Already setup
    const ctx = w.playerCore.getAudioContext();
    const master = w.playerCore.getMasterGain();
    
    if (ctx && master) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        master.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    }
  }

  function startPulse() {
    if (!isPulseOn || !w.playerCore.isPlaying()) return;
    
    const draw = () => {
        if (!isPulseOn) return;
        animationFrame = requestAnimationFrame(draw);
        
        if (analyser) {
            analyser.getByteFrequencyData(dataArray);
            // Get bass average (first few bins)
            let sum = 0;
            for(let i=0; i<10; i++) sum += dataArray[i];
            const avg = sum / 10;
            const scale = 1 + (avg / 255) * 0.2; // Max scale 1.2
            $('logo-bottom').style.transform = `scale(${scale})`;
        }
    };
    draw();
  }

  function stopPulseAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  }

  function restoreState() {
      // Restore volume visual
      $('#volume-slider').value = w.playerCore.volume * 100;
      $('#volume-fill').style.width = (w.playerCore.volume * 100) + '%';
      $('#volume-handle').style.left = (w.playerCore.volume * 100) + '%';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

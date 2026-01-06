/**
 * Player UI - Управление интерфейсом плеера
 * Оптимизированная версия v3.0
 * Соответствует ТЗ_НЬЮ
 */
(function PlayerUIModule() {
    'use strict';
    
    const w = window;
    
    // ==================== УТИЛИТЫ ====================
    
    const pc = () => w.playerCore;
    const $ = (sel, ctx = document) => ctx?.querySelector(sel);
    const $$ = (sel, ctx = document) => ctx?.querySelectorAll(sel) || [];
    const esc = (s) => w.Utils?.escapeHtml?.(s) ?? String(s || '');
    
    const formatTime = (sec) => {
        if (!sec || !isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };
    
    // ==================== СОСТОЯНИЕ ====================
    
    const state = {
        initialized: false,
        isDragging: false,
        isVolumeDragging: false,
        inMiniMode: false,
        currentAlbumKey: null,
        playingAlbumKey: null,
        savedMiniState: null
    };
    
    // ==================== HTML ШАБЛОНЫ ====================
    
    const PLAYER_TEMPLATE = `
        <div class="lyrics-animated-bg"></div>
        
        <div id="lyrics-window" class="lyrics-normal">
            <div class="lyrics-scroll">
                <div id="lyrics"></div>
            </div>
        </div>
        
        <div class="player-progress-wrapper">
            <div id="player-progress-bar" class="player-progress-bar">
                <div id="player-progress-fill" class="player-progress-fill"></div>
                <div class="player-progress-handle"></div>
            </div>
        </div>
        
        <div class="player-controls">
            <div class="player-controls-row">
                <span class="time-in-controls" id="time-current">0:00</span>
                
                <button class="player-control-btn" id="prev-btn" title="Предыдущий">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
                
                <button class="player-control-btn main" id="play-pause-btn" title="Play/Pause">
                    <svg id="play-pause-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                
                <button class="player-control-btn" id="next-btn" title="Следующий">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                </button>
                
                <span class="time-in-controls" id="time-duration">0:00</span>
            </div>
            
            <div class="player-controls-row">
                <button class="player-control-btn" id="shuffle-btn" title="Перемешать">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                </button>
                
                <button class="player-control-btn" id="repeat-btn" title="Повтор">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                </button>
                
                <button class="player-control-btn" id="favorites-btn" title="Только избранные">
                    <img id="favorites-btn-icon" src="img/star2.png" alt="F" style="width:18px;height:18px;">
                </button>
                
                <button class="player-control-btn" id="pq-btn" title="Качество воспроизведения">
                    <span class="pq-btn-label">Hi</span>
                </button>
                
                <button class="player-control-btn" id="mute-btn" title="Звук">
                    <svg id="mute-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                </button>
                
                <button class="sleep-timer-btn" id="sleep-timer-btn" title="Таймер сна">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                    <span class="sleep-timer-badge" id="sleep-timer-badge" style="display:none;"></span>
                </button>
            </div>
        </div>
        
        <div class="volume-control-wrapper" id="volume-wrapper">
            <div class="volume-track">
                <div class="volume-fill" id="volume-fill"></div>
                <div class="volume-handle" id="volume-handle"></div>
            </div>
            <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100">
        </div>
        
        <div class="player-buttons-wrapper">
            <div class="player-extra-buttons-row">
                <button class="lyrics-toggle-btn" id="lyrics-toggle-btn" title="Режим текста">
                    <span class="lyrics-toggle-btn-visual">T</span>
                </button>
                <button class="animation-btn" id="animation-btn" title="Анимация">A</button>
                <button class="pulse-btn" id="pulse-btn" title="Пульсация">❤️</button>
                <button class="karaoke-btn" id="lyrics-text-btn" title="Полный текст">📝</button>
                <a class="player-download-btn" id="download-btn" title="Скачать" download>💾</a>
            </div>
        </div>
    `;
    
    const MINI_NOW_TEMPLATE = `
        <div class="mini-now" id="mini-now">
            <span class="tnum" id="mini-now-num">—</span>
            <span class="track-title" id="mini-now-title">—</span>
            <img src="img/star2.png" class="like-star" id="mini-now-star" alt="⭐">
        </div>
        <div class="next-up" id="next-up" style="display:none;">
            <span class="label">Далее:</span>
            <span class="title" id="next-up-title">—</span>
        </div>
    `;
    
    // ==================== СОЗДАНИЕ ПЛЕЕРА ====================
    
    function createPlayerBlock() {
        let block = $('#lyricsplayerblock');
        if (block) return block;
        
        block = document.createElement('div');
        block.id = 'lyricsplayerblock';
        block.className = 'lyrics-player-block';
        block.innerHTML = PLAYER_TEMPLATE;
        
        return block;
    }
    
    function ensurePlayerBlock(insertAfterIndex = 0, opts = {}) {
        const trackList = $('#track-list');
        if (!trackList) return null;
        
        let block = $('#lyricsplayerblock');
        
        if (!block) {
            block = createPlayerBlock();
            bindControlEvents(block);
        }
        
        // Определяем позицию вставки
        const tracks = trackList.querySelectorAll('.track');
        const targetTrack = tracks[insertAfterIndex] || tracks[0];
        
        if (targetTrack && targetTrack.nextSibling !== block) {
            targetTrack.after(block);
        } else if (!targetTrack && !block.parentElement) {
            trackList.appendChild(block);
        }
        
        // Синхронизация UI
        syncPlayerUI();
        
        // Лирика
        if (w.LyricsController) {
            w.LyricsController.restoreSettingsIntoDom();
            const track = pc()?.getCurrentTrack();
            if (track) w.LyricsController.onTrackChange(track);
        }
        
        return block;
    }
    
    // ==================== ПРИВЯЗКА СОБЫТИЙ ====================
    
    function bindControlEvents(block) {
        if (!block) return;
        
        // Play/Pause
        $('#play-pause-btn', block)?.addEventListener('click', () => {
            if (!pc()) return;
            pc().isPlaying() ? pc().pause() : pc().play();
        });
        
        // Prev/Next
        $('#prev-btn', block)?.addEventListener('click', () => pc()?.prev());
        $('#next-btn', block)?.addEventListener('click', () => pc()?.next());
        
        // Shuffle
        $('#shuffle-btn', block)?.addEventListener('click', () => {
            if (!pc()) return;
            pc().toggleShuffle();
            $('#shuffle-btn', block)?.classList.toggle('active', pc().isShuffle());
        });
        
        // Repeat
        $('#repeat-btn', block)?.addEventListener('click', () => {
            if (!pc()) return;
            pc().toggleRepeat();
            updateRepeatUI(block);
        });
        
        // Favorites Only (кнопка F)
        $('#favorites-btn', block)?.addEventListener('click', toggleFavoritesOnlyMode);
        
        // PQ (Hi/Lo)
        $('#pq-btn', block)?.addEventListener('click', togglePlaybackQuality);
        
        // Mute
        $('#mute-btn', block)?.addEventListener('click', toggleMute);
        
        // Sleep Timer
        $('#sleep-timer-btn', block)?.addEventListener('click', () => w.SleepTimer?.show?.());
        
        // Lyrics Toggle
        $('#lyrics-toggle-btn', block)?.addEventListener('click', () => {
            w.LyricsController?.toggleLyricsView?.();
        });
        
        // Animation
        $('#animation-btn', block)?.addEventListener('click', () => {
            w.LyricsController?.toggleAnimation?.();
        });
        
        // Pulse (logo animation)
        $('#pulse-btn', block)?.addEventListener('click', togglePulse);
        
        // Full Lyrics
        $('#lyrics-text-btn', block)?.addEventListener('click', () => {
            w.LyricsModal?.show?.();
        });
        
        // Progress bar
        bindProgressEvents(block);
        
        // Volume
        bindVolumeEvents(block);
    }
    
    // ==================== ПРОГРЕСС-БАР ====================
    
    function bindProgressEvents(block) {
        const bar = $('#player-progress-bar', block);
        if (!bar) return;
        
        const seek = (e) => {
            const rect = bar.getBoundingClientRect();
            const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            const dur = pc()?.getDuration() || 0;
            if (dur > 0) pc()?.seek(pct * dur);
        };
        
        const onMove = (e) => {
            if (!state.isDragging) return;
            e.preventDefault();
            seek(e);
        };
        
        const onEnd = () => {
            if (!state.isDragging) return;
            state.isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
        
        const onStart = (e) => {
            state.isDragging = true;
            seek(e);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        };
        
        bar.addEventListener('mousedown', onStart);
        bar.addEventListener('touchstart', onStart, { passive: true });
    }
    
    // ==================== ГРОМКОСТЬ ====================
    
    function bindVolumeEvents(block) {
        const slider = $('#volume-slider', block);
        if (!slider) return;
        
        const update = (val) => {
            const v = Number(val);
            pc()?.setVolume(v);
            updateVolumeUI(v);
            try { localStorage.setItem('playerVolume', String(Math.round(v))); } catch {}
        };
        
        slider.addEventListener('input', (e) => update(e.target.value));
        
        // Начальное значение
        const saved = localStorage.getItem('playerVolume');
        const vol = saved !== null ? Number(saved) : 100;
        slider.value = vol;
        updateVolumeUI(vol);
    }
    
    function updateVolumeUI(vol) {
        const fill = $('#volume-fill');
        const handle = $('#volume-handle');
        const slider = $('#volume-slider');
        
        const pct = Math.max(0, Math.min(100, vol));
        
        if (fill) fill.style.width = `${pct}%`;
        if (handle) handle.style.left = `${pct}%`;
        if (slider) slider.value = pct;
        
        // Иконка mute
        const icon = $('#mute-icon');
        if (icon) {
            const isMuted = pct === 0;
            icon.innerHTML = isMuted
                ? '<path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.9 8.9 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
                : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        }
    }
    
    function toggleMute() {
        if (!pc()) return;
        const vol = pc().getVolume();
        const newVol = vol > 0 ? 0 : (Number(localStorage.getItem('playerVolume')) || 100);
        pc().setVolume(newVol);
        updateVolumeUI(newVol);
    }
    
    // ==================== КАЧЕСТВО (PQ) ====================
    
    function togglePlaybackQuality() {
        if (!pc()) return;
        
        const btn = $('#pq-btn');
        if (btn?.classList.contains('disabled')) {
            w.NotificationSystem?.info('Нет альтернативного качества для этого трека');
            return;
        }
        
        // Проверка сети (ТЗ 7.5.1)
        const online = navigator.onLine !== false;
        if (!online) {
            w.NotificationSystem?.warning('Нет доступа к сети');
            return;
        }
        
        const current = pc().getQualityMode();
        const next = current === 'hi' ? 'lo' : 'hi';
        
        const result = pc().switchQuality(next);
        
        if (result?.ok) {
            updatePQButtonUI();
            w.NotificationSystem?.success(`Качество: ${next.toUpperCase()}`);
        }
    }
    
    function updatePQButtonUI() {
        const btn = $('#pq-btn');
        const label = btn?.querySelector('.pq-btn-label');
        if (!btn || !label) return;
        
        const pq = pc()?.getQualityMode() || 'hi';
        const canToggle = pc()?.canToggleQualityForCurrentTrack?.() ?? false;
        const online = navigator.onLine !== false;
        
        label.textContent = pq.toUpperCase();
        
        btn.classList.remove('pq-hi', 'pq-lo', 'disabled');
        btn.classList.add(`pq-${pq}`);
        
        // Disabled если нет альтернативы или нет сети
        if (!canToggle || !online) {
            btn.classList.add('disabled');
        }
    }
    
    // ==================== FAVORITES ONLY (F) ====================
    
    function toggleFavoritesOnlyMode() {
        const btn = $('#favorites-btn');
        const icon = $('#favorites-btn-icon');
        if (!btn || !icon) return;
        
        const isActive = btn.classList.contains('favorites-active');
        const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
        
        if (!isActive) {
            // Включаем режим
            if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
                // В избранном режим всегда по active
                btn.classList.add('favorites-active');
                icon.src = 'img/star.png';
            } else {
                // Проверяем наличие избранных в альбоме
                const liked = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
                if (liked.length === 0) {
                    w.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
                    return;
                }
                btn.classList.add('favorites-active');
                icon.src = 'img/star.png';
            }
            
            try { localStorage.setItem('favoritesOnlyMode', '1'); } catch {}
        } else {
            // Выключаем режим
            btn.classList.remove('favorites-active');
            icon.src = 'img/star2.png';
            try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
        }
        
        // Применяем политику
        w.PlaybackPolicy?.apply?.({ reason: 'toggle' });
    }
    
    // ==================== REPEAT UI ====================
    
    function updateRepeatUI(block) {
        const btn = $('#repeat-btn', block || document);
        if (!btn || !pc()) return;
        
        const isRepeat = pc().isRepeat();
        btn.classList.toggle('active', isRepeat);
        btn.classList.toggle('repeat-active', isRepeat);
    }
    
    // ==================== PULSE (LOGO) ====================
    
    function togglePulse() {
        const logo = $('#logo-bottom');
        const btn = $('#pulse-btn');
        if (!logo) return;
        
        const isActive = logo.classList.toggle('pulsing');
        btn?.classList.toggle('active', isActive);
        
        try { localStorage.setItem('logoPulseEnabled', isActive ? '1' : '0'); } catch {}
    }
    
    // ==================== СИНХРОНИЗАЦИЯ UI ====================
    
    function syncPlayerUI() {
        const block = $('#lyricsplayerblock');
        if (!block || !pc()) return;
        
        // Play/Pause
        updatePlayPauseIcon(pc().isPlaying());
        
        // Progress
        updateProgress(pc().getPosition(), pc().getDuration());
        
        // Volume
        updateVolumeUI(pc().getVolume());
        
        // Shuffle
        $('#shuffle-btn', block)?.classList.toggle('active', pc().isShuffle());
        
        // Repeat
        updateRepeatUI(block);
        
        // PQ
        updatePQButtonUI();
        
        // Favorites Only
        const favEnabled = localStorage.getItem('favoritesOnlyMode') === '1';
        $('#favorites-btn', block)?.classList.toggle('favorites-active', favEnabled);
        const favIcon = $('#favorites-btn-icon', block);
        if (favIcon) favIcon.src = favEnabled ? 'img/star.png' : 'img/star2.png';
        
        // Download link
        updateDownloadLink();
        
        // Track info
        const track = pc().getCurrentTrack();
        if (track) updateTrackDisplay(track);
    }
    
    function updatePlayPauseIcon(isPlaying) {
        const icon = $('#play-pause-icon');
        if (!icon) return;
        
        icon.innerHTML = isPlaying
            ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'  // Pause
            : '<path d="M8 5v14l11-7z"/>';                   // Play
    }
    
    function updateProgress(pos, dur) {
        if (state.isDragging) return;
        
        const pct = dur > 0 ? (pos / dur) * 100 : 0;
        
        const fill = $('#player-progress-fill');
        if (fill) fill.style.width = `${pct}%`;
        
        const timeCur = $('#time-current');
        const timeDur = $('#time-duration');
        if (timeCur) timeCur.textContent = formatTime(pos);
        if (timeDur) timeDur.textContent = formatTime(dur);
    }
    
    function updateTrackDisplay(track) {
        if (!track) return;
        
        // Download link
        const dlBtn = $('#download-btn');
        if (dlBtn && track.src) {
            dlBtn.href = track.src;
            dlBtn.download = `${track.artist || 'track'} - ${track.title || 'audio'}.mp3`;
        }
    }
    
    function updateDownloadLink() {
        const track = pc()?.getCurrentTrack();
        const dlBtn = $('#download-btn');
        if (!dlBtn) return;
        
        if (track?.src) {
            dlBtn.href = track.src;
            dlBtn.download = `${track.artist || 'track'} - ${track.title || 'audio'}.mp3`;
            dlBtn.style.pointerEvents = '';
            dlBtn.style.opacity = '';
        } else {
            dlBtn.href = '#';
            dlBtn.style.pointerEvents = 'none';
            dlBtn.style.opacity = '0.4';
        }
    }
    
    // ==================== МИНИ-ПЛЕЕР ====================
    
    function createMiniNow() {
        const container = $('#now-playing');
        if (!container) return null;
        
        let mini = $('#mini-now');
        if (mini) return mini;
        
        container.innerHTML = MINI_NOW_TEMPLATE;
        
        // Привязка событий мини-плеера
        $('#mini-now', container)?.addEventListener('click', (e) => {
            if (e.target.classList.contains('like-star')) return;
            jumpToPlayingAlbum();
        });
        
        $('#mini-now-star', container)?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikePlaying();
        });
        
        return $('#mini-now', container);
    }
    
    function updateMiniNow(track, index) {
        const mini = $('#mini-now');
        if (!mini) return;
        
        const num = $('#mini-now-num');
        const title = $('#mini-now-title');
        const star = $('#mini-now-star');
        
        if (num) num.textContent = String((index ?? 0) + 1).padStart(2, '0') + '.';
        if (title) title.textContent = track?.title || '—';
        
        // Звезда
        if (star && track) {
            const albumKey = track.sourceAlbum || track.album || '';
            const uid = track.uid || '';
            const isFav = w.FavoritesManager?.isFavorite?.(albumKey, uid) ?? false;
            star.src = isFav ? 'img/star.png' : 'img/star2.png';
            star.dataset.album = albumKey;
            star.dataset.uid = uid;
        }
    }
    
    function updateNextUpLabel() {
        const nextUp = $('#next-up');
        const nextTitle = $('#next-up-title');
        if (!nextUp) return;
        
        const playlist = pc()?.getPlaylistSnapshot() || [];
        const idx = pc()?.getIndex() ?? -1;
        
        if (playlist.length > 1 && idx >= 0 && idx < playlist.length - 1) {
            const next = playlist[idx + 1];
            if (nextTitle) nextTitle.textContent = `${next?.artist || ''} — ${next?.title || ''}`;
            nextUp.style.display = 'flex';
        } else {
            nextUp.style.display = 'none';
        }
    }
    
    function jumpToPlayingAlbum() {
        const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
        if (playingAlbum && w.AlbumsManager?.loadAlbum) {
            w.AlbumsManager.loadAlbum(playingAlbum);
        }
    }
    
    function toggleLikePlaying() {
        const track = pc()?.getCurrentTrack();
        if (!track) return;
        
        const albumKey = track.sourceAlbum || track.album || '';
        const uid = track.uid || '';
        
        if (!albumKey || !uid) {
            w.NotificationSystem?.warning('UID трека не найден');
            return;
        }
        
        const wasLiked = w.FavoritesManager?.isFavorite?.(albumKey, uid) ?? false;
        w.FavoritesManager?.toggleLike?.(albumKey, uid, !wasLiked, { source: 'mini' });
        
        // Обновляем UI звезды
        const star = $('#mini-now-star');
        if (star) star.src = !wasLiked ? 'img/star.png' : 'img/star2.png';
    }
    
    // ==================== РЕЖИМЫ: ПОЛНЫЙ / МИНИ ====================
    
    function switchToMiniMode() {
        if (state.inMiniMode) return;
        state.inMiniMode = true;
        
        // Сохраняем состояние лирики
        if (w.LyricsController) {
            state.savedMiniState = w.LyricsController.getMiniSaveState();
            w.LyricsController.applyMiniMode();
        }
        
        // Скрываем основной блок
        const block = $('#lyricsplayerblock');
        if (block) block.style.display = 'none';
        
        // Показываем мини-плеер
        createMiniNow();
        const track = pc()?.getCurrentTrack();
        const idx = pc()?.getIndex() ?? 0;
        updateMiniNow(track, idx);
        updateNextUpLabel();
        
        const container = $('#now-playing');
        if (container) container.style.display = '';
    }
    
    function switchToFullMode() {
        if (!state.inMiniMode) return;
        state.inMiniMode = false;
        
        // Скрываем мини-плеер
        const container = $('#now-playing');
        if (container) container.style.display = 'none';
        
        // Показываем основной блок
        const block = $('#lyricsplayerblock');
        if (block) block.style.display = '';
        
        // Восстанавливаем лирику
        if (w.LyricsController && state.savedMiniState) {
            w.LyricsController.restoreFromMiniMode(state.savedMiniState);
            state.savedMiniState = null;
        }
        
        syncPlayerUI();
    }
    
    function switchAlbumInstantly(newAlbumKey) {
        state.currentAlbumKey = newAlbumKey;
        state.playingAlbumKey = w.AlbumsManager?.getPlayingAlbum?.() || null;
        
        const needsMini = state.playingAlbumKey &&
                         state.currentAlbumKey &&
                         state.playingAlbumKey !== state.currentAlbumKey &&
                         !String(state.currentAlbumKey).startsWith('__');
        
        if (needsMini) {
            switchToMiniMode();
        } else {
            switchToFullMode();
        }
    }
    
    // ==================== ПОДПИСКА НА СОБЫТИЯ ПЛЕЕРА ====================
    
    function setupPlayerEvents() {
        if (!pc()) return;
        
        pc().on({
            onPlay: () => {
                updatePlayPauseIcon(true);
                if (state.inMiniMode) updateMiniNow(pc().getCurrentTrack(), pc().getIndex());
            },
            
            onPause: () => {
                updatePlayPauseIcon(false);
            },
            
            onStop: () => {
                updatePlayPauseIcon(false);
                updateProgress(0, 0);
            },
            
            onTrackChange: (track, index) => {
                updateTrackDisplay(track);
                updatePQButtonUI();
                updateDownloadLink();
                
                // Лирика
                if (w.LyricsController && !state.inMiniMode) {
                    w.LyricsController.onTrackChange(track);
                }
                
                // Мини-режим
                if (state.inMiniMode) {
                    updateMiniNow(track, index);
                    updateNextUpLabel();
                }
                
                // Подсветка в списке
                w.AlbumsManager?.highlightCurrentTrack?.(index);
                
                // Сохраняем состояние
                w.PlayerState?.save?.();
            },
            
            onTick: (pos, dur) => {
                updateProgress(pos, dur);
                
                // Лирика
                if (w.LyricsController && !state.inMiniMode) {
                    w.LyricsController.onTick(pos, { inMiniMode: state.inMiniMode });
                }
            },
            
            onEnd: () => {
                // Обработка конца трека (если нужна дополнительная логика)
            },
            
            onError: (err) => {
                console.error('PlayerCore error:', err);
            }
        });
    }
    
    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    function initialize() {
        if (state.initialized) return;
        state.initialized = true;
        
        // Ждём PlayerCore
        const waitForPlayer = () => {
            if (pc()) {
                setupPlayerEvents();
                
                // Восстанавливаем громкость
                const savedVol = localStorage.getItem('playerVolume');
                if (savedVol !== null) {
                    pc().setVolume(Number(savedVol));
                }
                
                // Восстанавливаем пульсацию
                if (localStorage.getItem('logoPulseEnabled') === '1') {
                    $('#logo-bottom')?.classList.add('pulsing');
                    $('#pulse-btn')?.classList.add('active');
                }
                
                console.log('✅ PlayerUI initialized');
            } else {
                setTimeout(waitForPlayer, 100);
            }
        };
        
        waitForPlayer();
    }
    
    // ==================== ПУБЛИЧНЫЙ API ====================
    
    w.PlayerUI = {
        initialize,
        ensurePlayerBlock,
        switchAlbumInstantly,
        syncPlayerUI,
        updateMiniHeader: () => {
            const track = pc()?.getCurrentTrack();
            const idx = pc()?.getIndex() ?? 0;
            updateMiniNow(track, idx);
        },
        updateNextUpLabel,
        updateProgress,
        updatePlayPauseIcon,
        updateVolumeUI,
        updatePQButtonUI,
        updateAvailableTracksForPlayback: () => {
            // Вызывается при изменении избранного для пересчёта доступных треков
            w.PlaybackPolicy?.apply?.({ reason: 'favoritesChanged' });
        },
        togglePlayPause: () => {
            if (!pc()) return;
            pc().isPlaying() ? pc().pause() : pc().play();
        },
        state,
        
        // Для обратной совместимости
        currentLyrics: [],
        currentLyricsLines: []
    };
    
    // Связываем с LyricsController (для обратной совместимости)
    Object.defineProperty(w.PlayerUI, 'currentLyrics', {
        get: () => w.LyricsController?.getCurrentLyrics?.() || []
    });
    
    Object.defineProperty(w.PlayerUI, 'currentLyricsLines', {
        get: () => w.LyricsController?.getCurrentLyricsLines?.() || []
    });
    
})();

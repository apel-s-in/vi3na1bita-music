/**
 * Player UI - Управление интерфейсом плеера
 * Оптимизированная версия v2.0
 */
(function() {
    'use strict';
    
    const w = window;
    
    // ==================== УТИЛИТЫ ====================
    
    /** Получить PlayerCore или null */
    const pc = () => w.playerCore;
    
    /** Безопасный querySelector */
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    
    /** Форматирование времени mm:ss */
    const formatTime = (sec) => {
        if (!sec || !isFinite(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };
    
    // ==================== СОСТОЯНИЕ ====================
    
    const state = {
        isDragging: false,
        isVolumeDragging: false,
        elements: null,
        savedLyricsForMini: null,
        originalLyricsParent: null
    };
    
    // ==================== ШАБЛОН HTML ====================
    
    const PLAYER_HTML = `
        <div class="player-left">
            <img class="player-cover" src="" alt="Cover">
            <div class="player-info">
                <div class="player-title">—</div>
                <div class="player-artist">—</div>
            </div>
        </div>
        
        <div class="player-center">
            <div class="player-controls">
                <button class="control-btn shuffle-btn" title="Перемешать">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
                    </svg>
                </button>
                <button class="control-btn prev-btn" title="Предыдущий">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                    </svg>
                </button>
                <button class="control-btn play-btn" title="Воспроизвести">
                    <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display:none">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                </button>
                <button class="control-btn next-btn" title="Следующий">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                    </svg>
                </button>
                <button class="control-btn repeat-btn" title="Повтор">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                    </svg>
                </button>
            </div>
            
            <div class="progress-container">
                <span class="time-current">0:00</span>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                    <div class="progress-handle"></div>
                </div>
                <span class="time-duration">0:00</span>
            </div>
        </div>
        
        <div class="player-right">
            <button class="control-btn lyrics-toggle-btn" title="Текст песни">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 9h-2v2H9v-2H7v-2h2V7h2v2h2v2zm0 4H7v-2h6v2zm3-7V3.5L18.5 9H16z"/>
                </svg>
            </button>
            <button class="control-btn playlist-toggle-btn active" title="Плейлист">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/>
                </svg>
            </button>
            
            <div class="volume-container">
                <button class="control-btn volume-btn" title="Громкость">
                    <svg class="volume-icon-high" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                    <svg class="volume-icon-low" viewBox="0 0 24 24" fill="currentColor" style="display:none">
                        <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                    </svg>
                    <svg class="volume-icon-muted" viewBox="0 0 24 24" fill="currentColor" style="display:none">
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                </button>
                <div class="volume-slider-container">
                    <div class="volume-slider">
                        <div class="volume-fill"></div>
                        <div class="volume-handle"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // ==================== КЭШИРОВАНИЕ ЭЛЕМЕНТОВ ====================
    
    function cacheElements() {
        const player = $('.player-block');
        if (!player) return null;
        
        return {
            player,
            cover: $('.player-cover', player),
            title: $('.player-title', player),
            artist: $('.player-artist', player),
            playBtn: $('.play-btn', player),
            playIcon: $('.play-icon', player),
            pauseIcon: $('.pause-icon', player),
            prevBtn: $('.prev-btn', player),
            nextBtn: $('.next-btn', player),
            shuffleBtn: $('.shuffle-btn', player),
            repeatBtn: $('.repeat-btn', player),
            progressBar: $('.progress-bar', player),
            progressFill: $('.progress-fill', player),
            progressHandle: $('.progress-handle', player),
            timeCurrent: $('.time-current', player),
            timeDuration: $('.time-duration', player),
            volumeBtn: $('.volume-btn', player),
            volumeSlider: $('.volume-slider', player),
            volumeFill: $('.volume-fill', player),
            volumeHandle: $('.volume-handle', player),
            volumeIconHigh: $('.volume-icon-high', player),
            volumeIconLow: $('.volume-icon-low', player),
            volumeIconMuted: $('.volume-icon-muted', player),
            lyricsBtn: $('.lyrics-toggle-btn', player),
            playlistBtn: $('.playlist-toggle-btn', player)
        };
    }
    
    // ==================== СОЗДАНИЕ ПЛЕЕРА ====================
    
    function createPlayerBlock() {
        let player = $('.player-block');
        if (player) {
            state.elements = cacheElements();
            return player;
        }
        
        player = document.createElement('div');
        player.className = 'player-block';
        player.innerHTML = PLAYER_HTML;
        document.body.appendChild(player);
        
        state.elements = cacheElements();
        initEventListeners();
        
        // Инициализация громкости
        const savedVolume = localStorage.getItem('playerVolume');
        if (savedVolume !== null && pc()) {
            const vol = parseFloat(savedVolume);
            pc().setVolume(vol);
            updateVolumeUI(vol);
        }
        
        return player;
    }
    
    // ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================
    
    function initEventListeners() {
        const el = state.elements;
        if (!el) return;
        
        // Кнопки управления
        el.playBtn?.addEventListener('click', () => pc()?.togglePlay());
        el.prevBtn?.addEventListener('click', () => pc()?.prev());
        el.nextBtn?.addEventListener('click', () => pc()?.next());
        
        el.shuffleBtn?.addEventListener('click', () => {
            if (!pc()) return;
            pc().toggleShuffle();
            el.shuffleBtn.classList.toggle('active', pc().shuffle);
        });
        
        el.repeatBtn?.addEventListener('click', () => {
            if (!pc()) return;
            pc().toggleRepeat();
            updateRepeatButton();
        });
        
        // Прогресс-бар (unified pointer events)
        initProgressBarEvents();
        
        // Громкость
        initVolumeEvents();
        
        // Кнопки панелей
        el.lyricsBtn?.addEventListener('click', toggleLyricsPanel);
        el.playlistBtn?.addEventListener('click', togglePlaylistPanel);
    }
    
    // ==================== ПРОГРЕСС-БАР ====================
    
    function initProgressBarEvents() {
        const el = state.elements;
        if (!el?.progressBar) return;
        
        const bar = el.progressBar;
        
        const seek = (e) => {
            const rect = bar.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            
            if (pc()?.audio?.duration) {
                pc().seekTo(pct * pc().audio.duration);
            }
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
        bar.addEventListener('click', seek);
    }
    
    // ==================== ГРОМКОСТЬ ====================
    
    function initVolumeEvents() {
        const el = state.elements;
        if (!el) return;
        
        // Клик на кнопку громкости - mute/unmute
        el.volumeBtn?.addEventListener('click', () => {
            if (!pc()) return;
            const isMuted = pc().audio.volume === 0;
            const newVol = isMuted ? (parseFloat(localStorage.getItem('playerVolume')) || 0.7) : 0;
            pc().setVolume(newVol);
            updateVolumeUI(newVol);
            if (newVol > 0) localStorage.setItem('playerVolume', newVol);
        });
        
        // Слайдер громкости
        if (!el.volumeSlider) return;
        
        const slider = el.volumeSlider;
        
        const setVolume = (e) => {
            const rect = slider.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            
            if (pc()) {
                pc().setVolume(pct);
                updateVolumeUI(pct);
                localStorage.setItem('playerVolume', pct);
            }
        };
        
        const onMove = (e) => {
            if (!state.isVolumeDragging) return;
            e.preventDefault();
            setVolume(e);
        };
        
        const onEnd = () => {
            if (!state.isVolumeDragging) return;
            state.isVolumeDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
        
        const onStart = (e) => {
            state.isVolumeDragging = true;
            setVolume(e);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        };
        
        slider.addEventListener('mousedown', onStart);
        slider.addEventListener('touchstart', onStart, { passive: true });
        slider.addEventListener('click', setVolume);
    }
    
    function updateVolumeUI(vol) {
        const el = state.elements;
        if (!el) return;
        
        const pct = vol * 100;
        
        if (el.volumeFill) el.volumeFill.style.width = pct + '%';
        if (el.volumeHandle) el.volumeHandle.style.left = pct + '%';
        
        // Иконки громкости
        const showIcon = (icon, show) => {
            if (icon) icon.style.display = show ? 'block' : 'none';
        };
        
        showIcon(el.volumeIconHigh, vol > 0.5);
        showIcon(el.volumeIconLow, vol > 0 && vol <= 0.5);
        showIcon(el.volumeIconMuted, vol === 0);
    }
    
    // ==================== ОБНОВЛЕНИЕ UI ====================
    
    function updatePlayButton(isPlaying) {
        const el = state.elements;
        if (!el) return;
        
        if (el.playIcon) el.playIcon.style.display = isPlaying ? 'none' : 'block';
        if (el.pauseIcon) el.pauseIcon.style.display = isPlaying ? 'block' : 'none';
        el.playBtn?.setAttribute('title', isPlaying ? 'Пауза' : 'Воспроизвести');
    }
    
    function updateRepeatButton() {
        const el = state.elements;
        if (!el?.repeatBtn || !pc()) return;
        
        const mode = pc().repeat;
        el.repeatBtn.classList.remove('active', 'repeat-one');
        
        if (mode === 'all') {
            el.repeatBtn.classList.add('active');
        } else if (mode === 'one') {
            el.repeatBtn.classList.add('active', 'repeat-one');
        }
    }
    
    function updateProgress(current, duration) {
        const el = state.elements;
        if (!el || state.isDragging) return;
        
        const pct = duration ? (current / duration) * 100 : 0;
        
        if (el.progressFill) el.progressFill.style.width = pct + '%';
        if (el.progressHandle) el.progressHandle.style.left = pct + '%';
        if (el.timeCurrent) el.timeCurrent.textContent = formatTime(current);
        if (el.timeDuration) el.timeDuration.textContent = formatTime(duration);
    }
    
    function updateTrackInfo(track) {
        const el = state.elements;
        if (!el) return;
        
        if (el.title) el.title.textContent = track?.title || '—';
        if (el.artist) el.artist.textContent = track?.artist || '—';
        if (el.cover) {
            el.cover.src = track?.cover || 'assets/images/default-cover.svg';
            el.cover.onerror = () => el.cover.src = 'assets/images/default-cover.svg';
        }
        
        // Обновляем мини-заголовок и Next Up
        updateMiniHeaderAndNextUp(track);
    }
    
    // ==================== МИНИ-ЗАГОЛОВОК И NEXT UP ====================
    
    function updateMiniHeaderAndNextUp(currentTrack) {
        const miniHeader = $('.mini-header-track-info');
        const nextUpLabel = $('.next-up-label');
        
        // Мини-заголовок
        if (miniHeader && currentTrack) {
            miniHeader.innerHTML = `
                <span class="mini-track-title">${currentTrack.title || '—'}</span>
                <span class="mini-track-separator">•</span>
                <span class="mini-track-artist">${currentTrack.artist || '—'}</span>
            `;
        }
        
        // Next Up
        if (nextUpLabel && pc()) {
            const playlist = pc().playlist;
            const idx = pc().currentIndex;
            
            if (playlist?.length > 1 && idx < playlist.length - 1) {
                const next = playlist[idx + 1];
                nextUpLabel.innerHTML = `Next: <span class="next-up-track">${next.artist} — ${next.title}</span>`;
                nextUpLabel.style.display = 'block';
            } else {
                nextUpLabel.style.display = 'none';
            }
        }
    }
    
    // ==================== ПАНЕЛИ ====================
    
    function toggleLyricsPanel() {
        const lyricsPanel = $('.lyrics-panel');
        const playlistPanel = $('.playlist-panel');
        const el = state.elements;
        
        if (!lyricsPanel || !playlistPanel) return;
        
        const isActive = lyricsPanel.classList.contains('active');
        
        if (isActive) {
            // Закрываем lyrics, открываем playlist
            lyricsPanel.classList.remove('active');
            playlistPanel.classList.add('active');
            el?.lyricsBtn?.classList.remove('active');
            el?.playlistBtn?.classList.add('active');
            
            // Возвращаем lyrics на место
            restoreLyrics();
        } else {
            // Открываем lyrics, закрываем playlist
            playlistPanel.classList.remove('active');
            lyricsPanel.classList.add('active');
            el?.playlistBtn?.classList.remove('active');
            el?.lyricsBtn?.classList.add('active');
            
            // Переносим lyrics в панель
            moveLyricsToPanel();
        }
    }
    
    function togglePlaylistPanel() {
        const lyricsPanel = $('.lyrics-panel');
        const playlistPanel = $('.playlist-panel');
        const el = state.elements;
        
        if (!playlistPanel) return;
        
        const isActive = playlistPanel.classList.contains('active');
        
        if (!isActive) {
            lyricsPanel?.classList.remove('active');
            playlistPanel.classList.add('active');
            el?.lyricsBtn?.classList.remove('active');
            el?.playlistBtn?.classList.add('active');
            
            restoreLyrics();
        }
    }
    
    function moveLyricsToPanel() {
        const lyricsBlock = $('.lyrics-block');
        const lyricsPanel = $('.lyrics-panel');
        
        if (!lyricsBlock || !lyricsPanel) return;
        
        // Сохраняем оригинального родителя
        if (!state.originalLyricsParent) {
            state.originalLyricsParent = lyricsBlock.parentElement;
        }
        
        // Сохраняем содержимое
        state.savedLyricsForMini = lyricsBlock.innerHTML;
        
        // Переносим в панель
        lyricsPanel.appendChild(lyricsBlock);
    }
    
    function restoreLyrics() {
        const lyricsBlock = $('.lyrics-block');
        
        if (lyricsBlock && state.originalLyricsParent) {
            state.originalLyricsParent.appendChild(lyricsBlock);
        }
    }
    
    // ==================== МИНИ-ЗАГОЛОВОК ====================
    
    function createMiniHeader() {
        if ($('.mini-header')) return;
        
        const header = document.createElement('div');
        header.className = 'mini-header';
        header.innerHTML = `
            <div class="mini-header-content">
                <div class="mini-header-track-info">
                    <span class="mini-track-title">—</span>
                    <span class="mini-track-separator">•</span>
                    <span class="mini-track-artist">—</span>
                </div>
            </div>
        `;
        document.body.appendChild(header);
    }
    
    function createNextUpElement() {
        const playlistPanel = $('.playlist-panel');
        if (!playlistPanel || $('.next-up-label')) return;
        
        const nextUp = document.createElement('div');
        nextUp.className = 'next-up-label';
        nextUp.style.display = 'none';
        playlistPanel.insertBefore(nextUp, playlistPanel.firstChild);
    }
    
    // ==================== ПОДПИСКА НА СОБЫТИЯ ====================
    
    function setupEventSubscriptions() {
        if (!pc()) return;
        
        // Создаём вспомогательные элементы
        createMiniHeader();
        createNextUpElement();
        
        // Подписываемся на события плеера
        pc().on('play', () => updatePlayButton(true));
        pc().on('pause', () => updatePlayButton(false));
        pc().on('trackChange', (track) => {
            updateTrackInfo(track);
            updatePlayButton(pc().isPlaying);
        });
        pc().on('timeUpdate', (data) => updateProgress(data.current, data.duration));
        pc().on('volumeChange', (vol) => updateVolumeUI(vol));
        
        // Начальное состояние
        updatePlayButton(pc().isPlaying);
        updateRepeatButton();
        state.elements?.shuffleBtn?.classList.toggle('active', pc().shuffle);
        
        if (pc().currentTrack) {
            updateTrackInfo(pc().currentTrack);
        }
        
        const vol = pc().audio?.volume ?? 0.7;
        updateVolumeUI(vol);
    }
    
    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    function init() {
        createPlayerBlock();
        
        if (pc()) {
            setupEventSubscriptions();
        } else {
            // Ждём инициализации PlayerCore
            const checkPlayer = setInterval(() => {
                if (pc()) {
                    clearInterval(checkPlayer);
                    setupEventSubscriptions();
                }
            }, 100);
            
            // Таймаут на случай если PlayerCore не загрузится
            setTimeout(() => clearInterval(checkPlayer), 10000);
        }
    }
    
    // ==================== ПУБЛИЧНЫЙ API ====================
    
    w.PlayerUI = {
        init,
        createPlayerBlock,
        updateTrackInfo,
        updateProgress,
        updatePlayButton,
        updateVolumeUI,
        state
    };
    
    // Автозапуск при загрузке DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();

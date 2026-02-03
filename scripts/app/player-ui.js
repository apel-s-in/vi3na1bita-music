//=================================================
// FILE: /scripts/app/player-ui.js
// v4.0 - Fixed Mini Player Regression + Full TZ Compliance (PQ, Stats, Offline, CacheBar)
//=================================================
(function (window, document) {
    'use strict';

    const PlayerUI = {};
    const Utils = window.Utils;
    
    // DOM Cache
    let dom = {
        playerBlock: null,
        fill: null,
        cacheFill: null, // Point 15
        bar: null,
        timeElapsed: null,
        timeRemaining: null,
        volFill: null,
        volHandle: null,
        volSlider: null,
        icon: null,
        pqBtn: null,     // Point 4
        pqLabel: null,
        favBtn: null,
        favIcon: null,
        miniHeader: null,
        nextUp: null,
        nowPlayingSlot: null,
        jumpBtn: null
    };

    // State
    let state = {
        isMiniMode: false,
        isSeeking: false,
        isBitEnabled: false,
        miniSavedState: null,
        analyzer: null,
        rafId: null
    };

    // --- Initialization ---
    function init() {
        if (!window.playerCore || !window.albumsIndex) {
            return setTimeout(init, 100);
        }

        // Subscribe to Core Events
        window.playerCore.on({
            onTrackChange: handleTrackChange,
            onPlay: updatePlayPauseIcon,
            onPause: updatePlayPauseIcon,
            onStop: updatePlayPauseIcon,
            onEnd: updatePlayPauseIcon,
            onTick: handleTick,
            onLoadProgress: updateCacheProgress // Point 15
        });

        // Favorites Changed Event
        window.playerCore.onFavoritesChanged(() => {
            updateFavoritesBtn();
            updateMiniHeader();
            updatePlaylistFiltering();
        });

        // Network Status for PQ Button (Point 7.5.1)
        if (window.NetworkManager && window.NetworkManager.subscribe) {
            window.NetworkManager.subscribe(updatePQButtonState);
        } else {
            window.addEventListener('online', updatePQButtonState);
            window.addEventListener('offline', updatePQButtonState);
        }

        // Global Click Delegation (Optimization)
        document.addEventListener('click', handleGlobalClick);

        // Restore Volume & Settings
        const savedVol = Utils.toInt(Utils.lsGet('playerVolume'), 100);
        window.playerCore.setVolume(savedVol);
        
        state.isBitEnabled = Utils.lsGetBool01('bitEnabled');
        if (state.isBitEnabled) startVisualizer();

        // Initial UI Setup
        updateFavoritesBtn();
    }

    // --- Rendering Logic (Crucial for Mini Player stability) ---
    function ensurePlayerBlock(index, options) {
        // 1. Get or Create the Player Block
        if (!dom.playerBlock) {
            const template = document.getElementById('player-template');
            if (!template) return;
            const clone = template.content.cloneNode(true);
            dom.playerBlock = clone.querySelector('#lyricsplayerblock');
            cacheDomElements(dom.playerBlock);
            bindPlayerEvents(dom.playerBlock);
        }

        const trackList = document.getElementById('track-list');
        dom.nowPlayingSlot = document.getElementById('now-playing');
        
        // Determine Mode
        const newMiniMode = Utils.isBrowsingOtherAlbum();
        const modeChanged = state.isMiniMode !== newMiniMode;
        state.isMiniMode = newMiniMode;

        if (state.isMiniMode) {
            // --- MINI MODE ---
            // Move block to bottom slot if not already there
            if (dom.nowPlayingSlot && (!dom.nowPlayingSlot.contains(dom.playerBlock) || modeChanged)) {
                dom.nowPlayingSlot.innerHTML = ''; // Safe clear
                
                // Construct Mini Layout: Header + Player + NextUp
                const header = getMiniHeader();
                const nextUp = getNextUp();
                
                dom.nowPlayingSlot.appendChild(header);
                dom.nowPlayingSlot.appendChild(dom.playerBlock);
                dom.nowPlayingSlot.appendChild(nextUp);
            }
            
            // Logic integration
            if (window.LyricsController) {
                if (state.miniSavedState === null) state.miniSavedState = window.LyricsController.getMiniSaveState();
                window.LyricsController.applyMiniMode();
            }
            
            // Show/Hide specific mini elements
            if(dom.miniHeader) dom.miniHeader.style.display = 'flex';
            if(dom.nextUp) dom.nextUp.style.display = 'flex';

        } else {
            // --- FULL MODE ---
            // Insert into Track List
            if (trackList) {
                const currentTrack = window.playerCore.getCurrentTrack();
                let targetRow;
                
                if (currentTrack && currentTrack.uid) {
                    targetRow = trackList.querySelector(`.track[data-uid="${CSS.escape(currentTrack.uid)}"]`);
                } else {
                    targetRow = trackList.querySelector(`.track[data-index="${index}"]`);
                }

                // Move physically to list
                if (targetRow) {
                    if (targetRow.nextSibling !== dom.playerBlock) {
                        targetRow.after(dom.playerBlock);
                    }
                    if (options && options.userInitiated) {
                        setTimeout(() => targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    }
                } else {
                    // Fallback if row not found
                    trackList.appendChild(dom.playerBlock);
                }
            }

            // Restore from Mini Logic
            if (window.LyricsController) {
                window.LyricsController.restoreFromMiniMode(state.miniSavedState);
                state.miniSavedState = null;
            }

            // Clear bottom slot
            if (dom.nowPlayingSlot) dom.nowPlayingSlot.innerHTML = '';
            
            // Hide mini elements (they are detached anyway, but for safety)
            if(dom.miniHeader) dom.miniHeader.style.display = 'none';
            if(dom.nextUp) dom.nextUp.style.display = 'none';
        }

        // Jump Button Logic
        manageJumpButton();

        // Update UI States
        updatePQButtonState();
        updateFavoritesBtn();
        updatePlaylistFiltering();
        updateMiniHeader();
        updatePlayPauseIcon();
        updateDownloadState();
    }

    function cacheDomElements(block) {
        dom.fill = block.querySelector('#player-progress-fill');
        // Point 15: Cache Progress Bar (Create if missing)
        dom.cacheFill = block.querySelector('#player-cache-fill'); 
        if (!dom.cacheFill && dom.fill) {
            dom.cacheFill = document.createElement('div');
            dom.cacheFill.id = 'player-cache-fill';
            dom.fill.parentElement.insertBefore(dom.cacheFill, dom.fill);
        }

        dom.bar = block.querySelector('#player-progress-bar');
        dom.timeElapsed = block.querySelector('#time-elapsed');
        dom.timeRemaining = block.querySelector('#time-remaining');
        dom.volFill = block.querySelector('#volume-fill');
        dom.volHandle = block.querySelector('#volume-handle');
        dom.volSlider = block.querySelector('#volume-slider');
        dom.icon = block.querySelector('#play-pause-icon');
        dom.pqBtn = block.querySelector('#pq-btn'); // Point 4
        dom.pqLabel = block.querySelector('#pq-btn-label');
        dom.favBtn = block.querySelector('#favorites-btn');
        dom.favIcon = block.querySelector('#favorites-btn-icon');
    }

    // --- Sub-Components (Mini) ---
    function getMiniHeader() {
        if (dom.miniHeader) return dom.miniHeader;
        const tpl = document.getElementById('mini-header-template');
        dom.miniHeader = tpl.content.cloneNode(true).querySelector('#mini-now');
        
        // Mini Header Events
        dom.miniHeader.addEventListener('click', (e) => {
            if (e.target.id !== 'mini-now-star') {
                if (window.AlbumsManager) window.AlbumsManager.loadAlbum(window.AlbumsManager.getPlayingAlbum());
            }
        });
        dom.miniHeader.querySelector('#mini-now-star').addEventListener('click', (e) => {
            e.stopPropagation();
            actions.toggleLike();
        });
        
        return dom.miniHeader;
    }

    function getNextUp() {
        if (dom.nextUp) return dom.nextUp;
        const tpl = document.getElementById('next-up-template');
        dom.nextUp = tpl.content.cloneNode(true).querySelector('#next-up');
        return dom.nextUp;
    }

    // --- Event Handling ---
    function bindPlayerEvents(block) {
        // Volume Slider
        if (dom.volSlider) {
            dom.volSlider.addEventListener('input', (e) => {
                const val = Utils.toInt(e.target.value);
                window.playerCore.setVolume(val);
                Utils.lsSet('playerVolume', val);
                updateVolumeUI(val);
            });
        }

        // Seek Bar (Pointer Events for stability)
        if (dom.bar) {
            const handleSeekMove = (e) => {
                const rect = dom.bar.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const percent = Utils.clamp((clientX - rect.left) / rect.width, 0, 1);
                const duration = window.playerCore.getDuration();
                if (duration) window.playerCore.seek(duration * percent);
            };

            const onPointerUp = () => {
                state.isSeeking = false;
                document.removeEventListener('pointermove', handleSeekMove);
                document.removeEventListener('pointerup', onPointerUp);
            };

            dom.bar.addEventListener('pointerdown', (e) => {
                state.isSeeking = true;
                handleSeekMove(e); // Seek immediately on click
                document.addEventListener('pointermove', handleSeekMove);
                document.addEventListener('pointerup', onPointerUp);
            });
        }
    }

    function handleGlobalClick(e) {
        // Delegate clicks from any part of the UI (buttons, etc.)
        const btn = e.target.closest('button, a, .clickable-icon');
        if (!btn || !btn.id) return;

        if (actions[btn.id]) {
            e.preventDefault(); // Prevent default for links acting as buttons
            actions[btn.id](btn);
        }
    }

    // --- Actions Map ---
    const actions = {
        'play-pause-btn': () => window.playerCore.isPlaying() ? window.playerCore.pause() : window.playerCore.play(),
        'prev-btn': () => window.playerCore.prev(),
        'next-btn': () => window.playerCore.next(),
        'stop-btn': () => window.playerCore.stop(),
        'shuffle-btn': (btn) => {
            window.playerCore.toggleShuffle();
            Utils.setBtnActive(btn.id, window.playerCore.isShuffle());
            // Need to update next up in mini mode
            updateMiniHeader(); 
        },
        'repeat-btn': (btn) => {
            window.playerCore.toggleRepeat();
            Utils.setBtnActive(btn.id, window.playerCore.isRepeat());
        },
        'mute-btn': (btn) => {
            const isMuted = !btn.classList.contains('active');
            if (window.playerCore.setMuted) window.playerCore.setMuted(isMuted);
            Utils.setBtnActive(btn.id, isMuted);
        },
        // Point 4: PQ Button Logic
        'pq-btn': () => {
            // Point 7.5.1: Check network availability
            const isOffline = window.NetworkManager && !window.NetworkManager.isNetworkAvailable();
            if (isOffline) {
                if (window.NotificationSystem) window.NotificationSystem.info('Нет доступа к сети');
                return;
            }

            const result = Utils.pq.toggle(); // Toggles LocalStorage & Logic
            if (!result.ok) {
                const msg = result.reason === 'trackNoLo' ? 'Низкое качество недоступно' : 
                            result.reason === 'offline' ? 'Нет сети' : 'Невозможно переключить';
                if (window.NotificationSystem) window.NotificationSystem.warning(msg);
            }
            updatePQButtonState();
        },
        'favorites-btn': () => actions.toggleFavoritesOnly(),
        'lyrics-toggle-btn': () => window.LyricsController && window.LyricsController.toggleLyricsView(),
        'animation-btn': () => window.LyricsController && window.LyricsController.toggleAnimation(),
        'lyrics-text-btn': () => window.LyricsModal && window.LyricsModal.show(),
        'pulse-btn': () => actions.togglePulse(),
        'sleep-timer-btn': () => window.SleepTimer && window.SleepTimer.show(),
        // Point 17: Statistics Button
        'stats-btn': () => window.StatisticsModal && window.StatisticsModal.show(),
        'track-download-btn': (btn) => {
             // Handled by default link if href exists, else:
             if (!btn.getAttribute('href')) {
                 if(window.NotificationSystem) window.NotificationSystem.error('Скачивание недоступно');
             }
        }
    };

    // --- Update Logic ---

    function handleTrackChange(track, index) {
        // Reset Stats Timer
        window.__lastStatsSec = -1;
        
        // Highlight in Album
        if (window.AlbumsManager) {
            window.AlbumsManager.highlightCurrentTrack(
                track && track.uid ? -1 : index, 
                track && track.uid ? { uid: track.uid, albumKey: track.sourceAlbum } : {}
            );
        }

        ensurePlayerBlock(index);
        
        if (window.LyricsController) window.LyricsController.onTrackChange(track);
        
        updatePQButtonState();
        updateDownloadState();
    }

    function handleTick(pos, duration) {
        if (!state.isSeeking) {
            const pct = duration > 0 ? (pos / duration) * 100 : 0;
            if (dom.fill) dom.fill.style.width = `${pct}%`;
            if (dom.timeElapsed) dom.timeElapsed.textContent = Utils.formatTime(pos);
            if (dom.timeRemaining) dom.timeRemaining.textContent = `-${Utils.formatTime((duration || 0) - pos)}`;
        }
        
        if (window.LyricsController) {
            window.LyricsController.onTick(pos, { inMiniMode: state.isMiniMode });
        }
    }

    // Point 15: Cache Progress Bar Layer
    function updateCacheProgress(percent) {
        if (dom.cacheFill) {
            dom.cacheFill.style.width = `${percent}%`;
        }
    }

    function updatePlayPauseIcon() {
        if (dom.icon) {
            const isPlaying = window.playerCore && window.playerCore.isPlaying();
            dom.icon.innerHTML = isPlaying 
                ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' // Pause
                : '<path d="M8 5v14l11-7z"/>';           // Play
        }
    }

    function updateVolumeUI(vol) {
        if (dom.volFill) dom.volFill.style.width = `${vol}%`;
        if (dom.volHandle) dom.volHandle.style.left = `${Utils.clamp(vol, 2, 98)}%`;
        if (dom.volSlider) dom.volSlider.value = vol;
    }

    // Point 4 & 7.5.1: Update PQ Button Appearance
    function updatePQButtonState() {
        if (!dom.pqBtn) return;

        const isNetwork = window.NetworkManager ? window.NetworkManager.isNetworkAvailable() : navigator.onLine;
        const pqState = Utils.pq.getState(); // Expected: { mode: 'hi'|'lo', canToggle: bool }

        // Class logic
        let cls = 'player-control-btn ';
        
        if (!isNetwork) {
            cls += 'disabled'; // Point 7.5.1
            dom.pqBtn.setAttribute('aria-disabled', 'true');
        } else {
            cls += `pq-${pqState.mode}`; // pq-hi (green) or pq-lo (orange) via CSS
            dom.pqBtn.setAttribute('aria-disabled', !pqState.canToggle);
            if (!pqState.canToggle) cls += ' disabled-soft';
        }

        dom.pqBtn.className = cls;
        if (dom.pqLabel) dom.pqLabel.textContent = pqState.mode === 'lo' ? 'Lo' : 'Hi';
    }

    function updateFavoritesBtn() {
        const isFavOnly = Utils.lsGetBool01('favoritesOnlyMode');
        if (dom.favBtn) {
            dom.favBtn.className = `player-control-btn ${isFavOnly ? 'favorites-active' : ''}`;
        }
        if (dom.favIcon) {
            dom.favIcon.src = isFavOnly ? 'img/star.png' : 'img/star2.png';
        }
    }

    function updateMiniHeader() {
        if (!state.isMiniMode) return;

        const track = window.playerCore.getCurrentTrack();
        const plSnapshot = window.playerCore.getPlaylistSnapshot();
        const nextIdx = window.playerCore.getNextIndex();

        // Update Current Mini Track
        if (dom.miniHeader) {
            const numEl = dom.miniHeader.querySelector('#mini-now-num');
            const titleEl = dom.miniHeader.querySelector('#mini-now-title');
            const starEl = dom.miniHeader.querySelector('#mini-now-star');
            
            if (numEl) numEl.textContent = `${String((window.playerCore.getIndex() || 0) + 1).padStart(2, '0')}.`;
            if (titleEl) titleEl.textContent = track ? track.title : '—';
            
            // Star Logic
            const isLiked = Utils.fav.isTrackLikedInContext({
                playingAlbum: window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null,
                track: track
            });
            if (starEl) starEl.src = isLiked ? 'img/star.png' : 'img/star2.png';
        }

        // Update Next Up
        if (dom.nextUp) {
            const titleEl = dom.nextUp.querySelector('.title');
            if (titleEl) {
                const nextTrack = plSnapshot && plSnapshot[nextIdx];
                titleEl.textContent = nextTrack ? nextTrack.title : '—';
            }
        }
    }

    function updatePlaylistFiltering() {
        const trackList = document.getElementById('track-list');
        if (!trackList) return;

        const isFavOnly = Utils.lsGetBool01('favoritesOnlyMode');
        const curAlbum = window.AlbumsManager ? window.AlbumsManager.getCurrentAlbum() : null;
        const playAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;

        // Apply visual filter only if current view matches playing album
        const shouldFilter = isFavOnly && curAlbum === playAlbum && !Utils.isSpecialAlbumKey(curAlbum);
        
        trackList.classList.toggle('favonly-filtered', shouldFilter);

        if (shouldFilter) {
            const likedUids = new Set(window.playerCore.getLikedUidsForAlbum(curAlbum) || []);
            const rows = trackList.querySelectorAll('.track');
            rows.forEach(row => {
                const uid = row.getAttribute('data-uid');
                if (uid && !likedUids.has(uid)) {
                    row.setAttribute('data-hidden-by-favonly', '1');
                } else {
                    row.removeAttribute('data-hidden-by-favonly');
                }
            });
        }
    }

    function updateDownloadState() {
        // Point 16.1 & 19: Only "Download Track" remains.
        // Update href of the download button if needed
        const btn = document.getElementById('track-download-btn');
        if (btn) {
            Utils.download.applyDownloadLink(btn, window.playerCore.getCurrentTrack());
        }
    }

    // --- Complex Actions ---
    actions.toggleFavoritesOnly = function() {
        const currentMode = Utils.lsGetBool01('favoritesOnlyMode');
        const nextMode = !currentMode;
        
        const playingAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;

        // Validation: Don't enable if no favorites in current album
        if (nextMode && playingAlbum !== window.SPECIAL_FAVORITES_KEY) {
            const liked = window.playerCore.getLikedUidsForAlbum(playingAlbum);
            if (!liked || liked.length === 0) {
                if(window.NotificationSystem) window.NotificationSystem.info('Отметьте понравившийся трек ⭐');
                return;
            }
        }

        Utils.lsSetBool01('favoritesOnlyMode', nextMode);
        updateFavoritesBtn();
        
        // Notify Core Policy
        if (window.PlaybackPolicy && window.PlaybackPolicy.apply) {
            window.PlaybackPolicy.apply({ reason: 'toggle' });
        }
        
        // Refresh available tracks list for core
        PlayerUI.updateAvailableTracksForPlayback();

        // Update UI
        updatePlaylistFiltering();
        
        const msg = nextMode ? '⭐ Только избранные' : 'Играют все треки';
        if(window.NotificationSystem) window.NotificationSystem[nextMode ? 'success' : 'info'](msg);
    };

    actions.toggleLike = function() {
        const track = window.playerCore.getCurrentTrack();
        if (!track || !track.uid) return;

        const playingAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;
        const isSpecial = Utils.isSpecialAlbumKey(playingAlbum);
        const albumKey = track.sourceAlbum || (isSpecial ? null : playingAlbum);

        window.playerCore.toggleFavorite(track.uid, { fromAlbum: true, albumKey: albumKey });
        updateMiniHeader();
    };

    actions.togglePulse = function() {
        state.isBitEnabled = !state.isBitEnabled;
        Utils.lsSetBool01('bitEnabled', state.isBitEnabled);

        const btn = document.getElementById('pulse-btn');
        const heart = document.getElementById('pulse-heart');
        
        if (btn) btn.classList.toggle('active', state.isBitEnabled);
        if (heart) heart.textContent = state.isBitEnabled ? '❤️' : '🤍';

        state.isBitEnabled ? startVisualizer() : stopVisualizer();
    };

    // --- Visualizer (Logo Pulse) ---
    function startVisualizer() {
        // Only works if WebAudio is active
        try { 
            window.playerCore.rebuildCurrentSound({ preferWebAudio: true }); 
        } catch(e) {}

        if (window.Howler && window.Howler.ctx && !state.analyzer) {
            const ctx = window.Howler.ctx;
            if (ctx.state === 'suspended') ctx.resume();

            try {
                state.analyzer = ctx.createAnalyser();
                state.analyzer.fftSize = 256;
                // Connect to master gain to catch all sound
                window.Howler.masterGain.connect(state.analyzer);
            } catch (e) {
                state.analyzer = null;
            }
        }

        if (!state.analyzer) {
            state.isBitEnabled = false;
            Utils.lsSetBool01('bitEnabled', 0);
            return;
        }

        visualizerLoop();
    }

    function visualizerLoop() {
        if (!state.isBitEnabled) return;

        if (state.analyzer) {
            const bufferLength = state.analyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            state.analyzer.getByteFrequencyData(dataArray);

            // Simple Bass/Beat detection
            let sum = 0;
            const limit = Math.floor(bufferLength * 0.3); // Low freq only
            for (let i = 0; i < limit; i++) {
                sum += dataArray[i];
            }
            const avg = sum / limit;
            const scale = 1 + (avg / 255) * 0.2; // Max scale 1.2

            const logo = document.getElementById('logo-bottom');
            if (logo) logo.style.transform = `scale(${scale})`;
        }
        state.rafId = requestAnimationFrame(visualizerLoop);
    }

    function stopVisualizer() {
        if (state.rafId) cancelAnimationFrame(state.rafId);
        const logo = document.getElementById('logo-bottom');
        if (logo) {
            logo.style.transform = 'scale(1)';
            setTimeout(() => logo.style.transition = '', 300);
        }
        state.analyzer = null;
    }

    function manageJumpButton() {
        if (!dom.jumpBtn) {
            dom.jumpBtn = document.createElement('div');
            dom.jumpBtn.className = 'jump-to-playing';
            dom.jumpBtn.innerHTML = '<button>↑</button>';
            dom.jumpBtn.onclick = () => {
                if(dom.playerBlock) dom.playerBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
            document.body.appendChild(dom.jumpBtn);
        }

        // Observer for visibility
        if ('IntersectionObserver' in window && dom.playerBlock) {
            if (window.playerBlockObserver) window.playerBlockObserver.disconnect();
            
            window.playerBlockObserver = new IntersectionObserver(([entry]) => {
                // Show jump button if player is out of view AND NOT in mini mode
                dom.jumpBtn.style.display = (!entry.isIntersecting && !state.isMiniMode) ? 'flex' : 'none';
            }, { threshold: 0.1 });
            
            window.playerBlockObserver.observe(dom.playerBlock);
        }
    }

    // --- Public API ---
    PlayerUI.initialize = init;
    PlayerUI.ensurePlayerBlock = ensurePlayerBlock;
    PlayerUI.updateMiniHeader = updateMiniHeader;
    PlayerUI.updateNextUpLabel = updateMiniHeader;
    PlayerUI.togglePlayPause = actions['play-pause-btn'];
    PlayerUI.toggleLikePlaying = actions.toggleLike;
    PlayerUI.toggleFavoritesOnly = actions.toggleFavoritesOnly;
    
    PlayerUI.switchAlbumInstantly = (albumKey) => {
        // Helper for UI immediate response
        if (window.playerCore.getIndex() >= 0) {
            ensurePlayerBlock(window.playerCore.getIndex());
            updateMiniHeader();
        }
    };

    // Helper for Core to know what tracks are valid for playback in current mode
    PlayerUI.updateAvailableTracksForPlayback = () => {
        const playingAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;
        const isFavOnly = Utils.lsGetBool01('favoritesOnlyMode');
        
        if (playingAlbum !== window.SPECIAL_FAVORITES_KEY && isFavOnly) {
            // Filter indices based on Fav status
            const snapshot = window.playerCore.getPlaylistSnapshot();
            window.availableFavoriteIndices = snapshot.reduce((acc, track, idx) => {
                if (window.playerCore.isFavorite(track.uid)) {
                    acc.push(idx);
                }
                return acc;
            }, []);
        } else {
            window.availableFavoriteIndices = null; // All tracks available
        }
    };

    // Accessors for Lyrics
    Object.defineProperty(PlayerUI, 'currentLyrics', {
        get: () => window.LyricsController ? window.LyricsController.getCurrentLyrics() : []
    });
    Object.defineProperty(PlayerUI, 'currentLyricsLines', {
        get: () => window.LyricsController ? window.LyricsController.getCurrentLyricsLines() : []
    });

    // Expose
    window.PlayerUI = PlayerUI;
    window.toggleFavoritesOnly = actions.toggleFavoritesOnly; // Legacy ref

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window, document);

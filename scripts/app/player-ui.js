//=================================================
// FILE: /scripts/app/player-ui.js
(function (window, document) {
    'use strict';

    const PlayerUI = {};
    const U = window.Utils;
    
    let dom = {
        playerBlock: null,
        fill: null,
        cacheFill: null,
        bar: null,
        timeElapsed: null,
        timeRemaining: null,
        volFill: null,
        volHandle: null,
        volSlider: null,
        icon: null,
        pqBtn: null,
        pqLabel: null,
        favBtn: null,
        favIcon: null,
        miniHeader: null,
        nextUp: null,
        nowPlayingSlot: null,
        jumpBtn: null
    };

    let state = {
        isMiniMode: false,
        isSeeking: false,
        isBitEnabled: false,
        miniSavedState: null,
        analyzer: null,
        rafId: null
    };

    // Throttled UI updaters
    const throttledCacheUpdate = U.func.throttle((pct) => {
       if (dom.cacheFill) dom.cacheFill.style.width = `${pct}%`;
    }, 200);

    function init() {
        if (!window.playerCore || !window.albumsIndex) return setTimeout(init, 100);

        window.playerCore.on({
            onTrackChange: handleTrackChange,
            onPlay: updatePlayPauseIcon,
            onPause: updatePlayPauseIcon,
            onStop: updatePlayPauseIcon,
            onEnd: updatePlayPauseIcon,
            onTick: handleTick,
            onLoadProgress: throttledCacheUpdate // Use throttled version
        });

        window.playerCore.onFavoritesChanged(() => {
            updateFavoritesBtn();
            updateMiniHeader();
            updatePlaylistFiltering();
        });

        if (window.NetworkManager && window.NetworkManager.subscribe) {
            window.NetworkManager.subscribe(updatePQButtonState);
        } else {
            window.addEventListener('online', updatePQButtonState);
            window.addEventListener('offline', updatePQButtonState);
        }

        document.addEventListener('click', handleGlobalClick);

        const savedVol = U.math.toInt(U.lsGet('playerVolume'), 100);
        window.playerCore.setVolume(savedVol);
        
        state.isBitEnabled = U.lsGetBool01('bitEnabled');
        if (state.isBitEnabled) startVisualizer();

        updateFavoritesBtn();
    }

    function ensurePlayerBlock(index, options) {
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
        
        const newMiniMode = U.isBrowsingOtherAlbum();
        const modeChanged = state.isMiniMode !== newMiniMode;
        state.isMiniMode = newMiniMode;

        if (state.isMiniMode) {
            if (dom.nowPlayingSlot && (!dom.nowPlayingSlot.contains(dom.playerBlock) || modeChanged)) {
                dom.nowPlayingSlot.innerHTML = '';
                const header = getMiniHeader();
                const nextUp = getNextUp();
                dom.nowPlayingSlot.appendChild(header);
                dom.nowPlayingSlot.appendChild(dom.playerBlock);
                dom.nowPlayingSlot.appendChild(nextUp);
            }
            if (window.LyricsController) {
                if (state.miniSavedState === null) state.miniSavedState = window.LyricsController.getMiniSaveState();
                window.LyricsController.applyMiniMode();
            }
            if(dom.miniHeader) dom.miniHeader.style.display = 'flex';
            if(dom.nextUp) dom.nextUp.style.display = 'flex';
        } else {
            if (trackList) {
                const currentTrack = window.playerCore.getCurrentTrack();
                let targetRow;
                if (currentTrack && currentTrack.uid) {
                    targetRow = trackList.querySelector(`.track[data-uid="${CSS.escape(currentTrack.uid)}"]`);
                } else {
                    targetRow = trackList.querySelector(`.track[data-index="${index}"]`);
                }
                if (targetRow) {
                    if (targetRow.nextSibling !== dom.playerBlock) targetRow.after(dom.playerBlock);
                    if (options && options.userInitiated) {
                        setTimeout(() => targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    }
                } else {
                    trackList.appendChild(dom.playerBlock);
                }
            }
            if (window.LyricsController) {
                window.LyricsController.restoreFromMiniMode(state.miniSavedState);
                state.miniSavedState = null;
            }
            if (dom.nowPlayingSlot) dom.nowPlayingSlot.innerHTML = '';
            if(dom.miniHeader) dom.miniHeader.style.display = 'none';
            if(dom.nextUp) dom.nextUp.style.display = 'none';
        }

        manageJumpButton();
        updatePQButtonState();
        updateFavoritesBtn();
        updatePlaylistFiltering();
        updateMiniHeader();
        updatePlayPauseIcon();
        updateDownloadState();
    }

    function cacheDomElements(block) {
        dom.fill = block.querySelector('#player-progress-fill');
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
        dom.pqBtn = block.querySelector('#pq-btn');
        dom.pqLabel = block.querySelector('#pq-btn-label');
        dom.favBtn = block.querySelector('#favorites-btn');
        dom.favIcon = block.querySelector('#favorites-btn-icon');
    }

    function getMiniHeader() {
        if (dom.miniHeader) return dom.miniHeader;
        const tpl = document.getElementById('mini-header-template');
        dom.miniHeader = tpl.content.cloneNode(true).querySelector('#mini-now');
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

    function bindPlayerEvents(block) {
        if (dom.volSlider) {
            dom.volSlider.addEventListener('input', (e) => {
                const val = U.math.toInt(e.target.value);
                window.playerCore.setVolume(val);
                U.lsSet('playerVolume', val);
                updateVolumeUI(val);
            });
        }
        if (dom.bar) {
            const handleSeekMove = (e) => {
                const rect = dom.bar.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const percent = U.math.clamp((clientX - rect.left) / rect.width, 0, 1);
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
                handleSeekMove(e);
                document.addEventListener('pointermove', handleSeekMove);
                document.addEventListener('pointerup', onPointerUp);
            });
        }
    }

    function handleGlobalClick(e) {
        const btn = e.target.closest('button, a, .clickable-icon');
        if (!btn || !btn.id) return;
        if (actions[btn.id]) {
            e.preventDefault();
            actions[btn.id](btn);
        }
    }

    const actions = {
        'play-pause-btn': () => window.playerCore.isPlaying() ? window.playerCore.pause() : window.playerCore.play(),
        'prev-btn': () => window.playerCore.prev(),
        'next-btn': () => window.playerCore.next(),
        'stop-btn': () => window.playerCore.stop(),
        'shuffle-btn': (btn) => {
            window.playerCore.toggleShuffle();
            U.setBtnActive(btn.id, window.playerCore.isShuffle());
            updateMiniHeader(); 
        },
        'repeat-btn': (btn) => {
            window.playerCore.toggleRepeat();
            U.setBtnActive(btn.id, window.playerCore.isRepeat());
        },
        'mute-btn': (btn) => {
            const isMuted = !btn.classList.contains('active');
            if (window.playerCore.setMuted) window.playerCore.setMuted(isMuted);
            U.setBtnActive(btn.id, isMuted);
        },
        'pq-btn': () => {
            const res = U.pq.toggle();
            if (!res.ok) {
                const msg = res.reason === 'trackNoLo' ? 'Низкое качество недоступно' : 
                            res.reason === 'offline' ? 'Нет доступа к сети' : 'Невозможно';
                U.ui.toast(msg, 'warning');
            }
            updatePQButtonState();
        },
        'favorites-btn': () => actions.toggleFavoritesOnly(),
        'lyrics-toggle-btn': () => window.LyricsController && window.LyricsController.toggleLyricsView(),
        'animation-btn': () => window.LyricsController && window.LyricsController.toggleAnimation(),
        'lyrics-text-btn': () => window.LyricsModal && window.LyricsModal.show(),
        'pulse-btn': () => actions.togglePulse(),
        'sleep-timer-btn': () => window.SleepTimer && window.SleepTimer.show(),
        'stats-btn': () => window.StatisticsModal && window.StatisticsModal.show(),
        'track-download-btn': (btn) => {
             if (!btn.getAttribute('href')) U.ui.toast('Скачивание недоступно', 'error');
        }
    };

    function handleTrackChange(track, index) {
        window.__lastStatsSec = -1;
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
            if (dom.timeElapsed) dom.timeElapsed.textContent = U.fmt.time(pos);
            if (dom.timeRemaining) dom.timeRemaining.textContent = `-${U.fmt.time((duration || 0) - pos)}`;
        }
        if (window.LyricsController) {
            window.LyricsController.onTick(pos, { inMiniMode: state.isMiniMode });
        }
    }

    function updatePlayPauseIcon() {
        if (dom.icon) {
            const isPlaying = window.playerCore && window.playerCore.isPlaying();
            dom.icon.innerHTML = isPlaying 
                ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'
                : '<path d="M8 5v14l11-7z"/>';
        }
    }

    function updateVolumeUI(vol) {
        if (dom.volFill) dom.volFill.style.width = `${vol}%`;
        if (dom.volHandle) dom.volHandle.style.left = `${U.math.clamp(vol, 2, 98)}%`;
        if (dom.volSlider) dom.volSlider.value = vol;
    }

    function updatePQButtonState() {
        if (!dom.pqBtn) return;
        const st = U.pq.getState();
        let cls = 'player-control-btn ';
        if (!st.netOk) {
            cls += 'disabled';
            dom.pqBtn.setAttribute('aria-disabled', 'true');
        } else {
            cls += `pq-${st.mode}`;
            dom.pqBtn.setAttribute('aria-disabled', !st.canToggle);
            if (!st.canToggle) cls += ' disabled-soft';
        }
        dom.pqBtn.className = cls;
        if (dom.pqLabel) dom.pqLabel.textContent = st.mode === 'lo' ? 'Lo' : 'Hi';
    }

    function updateFavoritesBtn() {
        const isFavOnly = U.lsGetBool01('favoritesOnlyMode');
        if (dom.favBtn) dom.favBtn.className = `player-control-btn ${isFavOnly ? 'favorites-active' : ''}`;
        if (dom.favIcon) dom.favIcon.src = isFavOnly ? 'img/star.png' : 'img/star2.png';
    }

    function updateMiniHeader() {
        if (!state.isMiniMode) return;
        const track = window.playerCore.getCurrentTrack();
        const plSnapshot = window.playerCore.getPlaylistSnapshot();
        const nextIdx = window.playerCore.getNextIndex();

        if (dom.miniHeader) {
            const numEl = dom.miniHeader.querySelector('#mini-now-num');
            const titleEl = dom.miniHeader.querySelector('#mini-now-title');
            const starEl = dom.miniHeader.querySelector('#mini-now-star');
            if (numEl) numEl.textContent = `${String((window.playerCore.getIndex() || 0) + 1).padStart(2, '0')}.`;
            if (titleEl) titleEl.textContent = track ? track.title : '—';
            
            const isLiked = U.fav.isTrackLikedInContext({
                playingAlbum: window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null,
                track: track
            });
            if (starEl) starEl.src = isLiked ? 'img/star.png' : 'img/star2.png';
        }
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
        const isFavOnly = U.lsGetBool01('favoritesOnlyMode');
        const curAlbum = window.AlbumsManager ? window.AlbumsManager.getCurrentAlbum() : null;
        const playAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;
        const shouldFilter = isFavOnly && curAlbum === playAlbum && !U.isSpecialAlbumKey(curAlbum);
        
        trackList.classList.toggle('favonly-filtered', shouldFilter);
        if (shouldFilter) {
            const likedUids = new Set(window.playerCore.getLikedUidsForAlbum(curAlbum) || []);
            const rows = trackList.querySelectorAll('.track');
            rows.forEach(row => {
                const uid = row.getAttribute('data-uid');
                if (uid && !likedUids.has(uid)) row.setAttribute('data-hidden-by-favonly', '1');
                else row.removeAttribute('data-hidden-by-favonly');
            });
        }
    }

    function updateDownloadState() {
        const btn = document.getElementById('track-download-btn');
        if (btn) U.download.applyDownloadLink(btn, window.playerCore.getCurrentTrack());
    }

    actions.toggleFavoritesOnly = function() {
        const currentMode = U.lsGetBool01('favoritesOnlyMode');
        const nextMode = !currentMode;
        const playingAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;

        if (nextMode && playingAlbum !== window.SPECIAL_FAVORITES_KEY) {
            const liked = window.playerCore.getLikedUidsForAlbum(playingAlbum);
            if (!liked || liked.length === 0) return U.ui.toast('Отметьте понравившийся трек ⭐', 'info');
        }

        U.lsSetBool01('favoritesOnlyMode', nextMode);
        updateFavoritesBtn();
        if (window.PlaybackPolicy?.apply) window.PlaybackPolicy.apply({ reason: 'toggle' });
        PlayerUI.updateAvailableTracksForPlayback();
        updatePlaylistFiltering();
        U.ui.toast(nextMode ? '⭐ Только избранные' : 'Играют все треки', nextMode ? 'success' : 'info');
    };

    actions.toggleLike = function() {
        const track = window.playerCore.getCurrentTrack();
        if (!track || !track.uid) return;
        const playingAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;
        const isSpecial = U.isSpecialAlbumKey(playingAlbum);
        const albumKey = track.sourceAlbum || (isSpecial ? null : playingAlbum);
        window.playerCore.toggleFavorite(track.uid, { fromAlbum: true, albumKey: albumKey });
        updateMiniHeader();
    };

    actions.togglePulse = function() {
        state.isBitEnabled = !state.isBitEnabled;
        U.lsSetBool01('bitEnabled', state.isBitEnabled);
        const btn = document.getElementById('pulse-btn');
        const heart = document.getElementById('pulse-heart');
        if (btn) btn.classList.toggle('active', state.isBitEnabled);
        if (heart) heart.textContent = state.isBitEnabled ? '❤️' : '🤍';
        state.isBitEnabled ? startVisualizer() : stopVisualizer();
    };

    function startVisualizer() {
        try { window.playerCore.rebuildCurrentSound({ preferWebAudio: true }); } catch(e) {}
        if (window.Howler && window.Howler.ctx && !state.analyzer) {
            const ctx = window.Howler.ctx;
            if (ctx.state === 'suspended') ctx.resume();
            try {
                state.analyzer = ctx.createAnalyser();
                state.analyzer.fftSize = 256;
                window.Howler.masterGain.connect(state.analyzer);
            } catch (e) { state.analyzer = null; }
        }
        if (!state.analyzer) {
            state.isBitEnabled = false;
            U.lsSetBool01('bitEnabled', 0);
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
            let sum = 0;
            const limit = Math.floor(bufferLength * 0.3);
            for (let i = 0; i < limit; i++) sum += dataArray[i];
            const avg = sum / limit;
            const scale = 1 + (avg / 255) * 0.2;
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
        if ('IntersectionObserver' in window && dom.playerBlock) {
            if (window.playerBlockObserver) window.playerBlockObserver.disconnect();
            window.playerBlockObserver = new IntersectionObserver(([entry]) => {
                dom.jumpBtn.style.display = (!entry.isIntersecting && !state.isMiniMode) ? 'flex' : 'none';
            }, { threshold: 0.1 });
            window.playerBlockObserver.observe(dom.playerBlock);
        }
    }

    PlayerUI.initialize = init;
    PlayerUI.ensurePlayerBlock = ensurePlayerBlock;
    PlayerUI.updateMiniHeader = updateMiniHeader;
    PlayerUI.updateNextUpLabel = updateMiniHeader;
    PlayerUI.togglePlayPause = actions['play-pause-btn'];
    PlayerUI.toggleLikePlaying = actions.toggleLike;
    PlayerUI.toggleFavoritesOnly = actions.toggleFavoritesOnly;
    
    PlayerUI.switchAlbumInstantly = (albumKey) => {
        if (window.playerCore.getIndex() >= 0) {
            ensurePlayerBlock(window.playerCore.getIndex());
            updateMiniHeader();
        }
    };

    PlayerUI.updateAvailableTracksForPlayback = () => {
        const playingAlbum = window.AlbumsManager ? window.AlbumsManager.getPlayingAlbum() : null;
        const isFavOnly = U.lsGetBool01('favoritesOnlyMode');
        if (playingAlbum !== window.SPECIAL_FAVORITES_KEY && isFavOnly) {
            const snapshot = window.playerCore.getPlaylistSnapshot();
            window.availableFavoriteIndices = snapshot.reduce((acc, track, idx) => {
                if (window.playerCore.isFavorite(track.uid)) acc.push(idx);
                return acc;
            }, []);
        } else {
            window.availableFavoriteIndices = null;
        }
    };

    Object.defineProperty(PlayerUI, 'currentLyrics', {
        get: () => window.LyricsController ? window.LyricsController.getCurrentLyrics() : []
    });
    Object.defineProperty(PlayerUI, 'currentLyricsLines', {
        get: () => window.LyricsController ? window.LyricsController.getCurrentLyricsLines() : []
    });

    window.PlayerUI = PlayerUI;
    window.toggleFavoritesOnly = actions.toggleFavoritesOnly;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window, document);

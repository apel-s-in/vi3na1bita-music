// scripts/app/player-ui.js
(function (W, D) {
    'use strict';

    const PlayerUI = {};
    const U = W.Utils;
    
    let dom = {};
    let state = {
        isMiniMode: false,
        isSeeking: false,
        isBitEnabled: false,
        miniSavedState: null,
        analyzer: null,
        rafId: null
    };

    function init() {
        if (!W.playerCore || !W.albumsIndex) return setTimeout(init, 100);

        // Bind Core Events
        W.playerCore.on({
            onTrackChange: handleTrackChange,
            onPlay: updatePlayPauseIcon,
            onPause: updatePlayPauseIcon,
            onStop: updatePlayPauseIcon,
            onEnd: updatePlayPauseIcon,
            onTick: handleTick
        });

        W.playerCore.onFavoritesChanged(() => {
            updateFavoritesBtn();
            updateMiniHeader();
            updatePlaylistFiltering();
        });

        W.addEventListener('offline:uiChanged', updatePQButtonState);
        W.addEventListener('online', updatePQButtonState);
        W.addEventListener('offline', updatePQButtonState);
        D.addEventListener('click', handleGlobalClick);

        const savedVol = U.math.toInt(U.lsGet('playerVolume'), 100);
        W.playerCore.setVolume(savedVol);
        
        state.isBitEnabled = U.lsGetBool01('bitEnabled');
        if (state.isBitEnabled) startVisualizer();

        updateFavoritesBtn();
    }

    function ensurePlayerBlock(index, options) {
        if (!dom.playerBlock) {
            const tpl = D.getElementById('player-template');
            if (!tpl) return;
            dom.playerBlock = tpl.content.cloneNode(true).querySelector('#lyricsplayerblock');
            cacheDomElements(dom.playerBlock);
            bindPlayerEvents();
        }

        const trackList = D.getElementById('track-list');
        dom.nowPlayingSlot = D.getElementById('now-playing');
        
        const newMiniMode = U.isBrowsingOtherAlbum();
        const modeChanged = state.isMiniMode !== newMiniMode;
        state.isMiniMode = newMiniMode;

        if (state.isMiniMode) {
            if (dom.nowPlayingSlot && (!dom.nowPlayingSlot.contains(dom.playerBlock) || modeChanged)) {
                dom.nowPlayingSlot.innerHTML = '';
                dom.nowPlayingSlot.append(getMiniHeader(), dom.playerBlock, getNextUp());
            }
            if (W.LyricsController) {
                if (state.miniSavedState === null) state.miniSavedState = W.LyricsController.getMiniSaveState();
                W.LyricsController.applyMiniMode();
            }
            if(dom.miniHeader) dom.miniHeader.style.display = 'flex';
            if(dom.nextUp) dom.nextUp.style.display = 'flex';
        } else {
            if (trackList) {
                const cur = W.playerCore.getCurrentTrack();
                const sel = cur?.uid ? `.track[data-uid="${CSS.escape(cur.uid)}"]` : `.track[data-index="${index}"]`;
                const row = trackList.querySelector(sel);
                
                if (row) {
                    if (row.nextSibling !== dom.playerBlock) row.after(dom.playerBlock);
                    if (options?.userInitiated) setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                } else {
                    trackList.appendChild(dom.playerBlock);
                }
            }
            if (W.LyricsController) {
                W.LyricsController.restoreFromMiniMode(state.miniSavedState);
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

    function cacheDomElements(blk) {
        const q = (s) => blk.querySelector(s);
        dom.fill = q('#player-progress-fill');
        // Cache overlay is handled by scripts/ui/cache-progress-overlay.js
        dom.bar = q('#player-progress-bar');
        dom.timeElapsed = q('#time-elapsed');
        dom.timeRemaining = q('#time-remaining');
        dom.volFill = q('#volume-fill');
        dom.volHandle = q('#volume-handle');
        dom.volSlider = q('#volume-slider');
        dom.icon = q('#play-pause-icon');
        dom.pqBtn = q('#pq-btn');
        dom.pqLabel = q('#pq-btn-label');
        dom.favBtn = q('#favorites-btn');
        dom.favIcon = q('#favorites-btn-icon');
    }

    function getMiniHeader() {
        if (dom.miniHeader) return dom.miniHeader;
        const tpl = D.getElementById('mini-header-template');
        dom.miniHeader = tpl.content.cloneNode(true).querySelector('#mini-now');
        dom.miniHeader.addEventListener('click', (e) => {
            if (e.target.id !== 'mini-now-star' && W.AlbumsManager) 
                W.AlbumsManager.loadAlbum(W.AlbumsManager.getPlayingAlbum());
        });
        dom.miniHeader.querySelector('#mini-now-star').addEventListener('click', (e) => {
            e.stopPropagation(); actions.toggleLike();
        });
        return dom.miniHeader;
    }

    function getNextUp() {
        if (dom.nextUp) return dom.nextUp;
        dom.nextUp = D.getElementById('next-up-template').content.cloneNode(true).querySelector('#next-up');
        return dom.nextUp;
    }

    function bindPlayerEvents() {
        if (dom.volSlider) {
            dom.volSlider.addEventListener('input', (e) => {
                const val = U.math.toInt(e.target.value);
                W.playerCore.setVolume(val);
                updateVolumeUI(val);
            });
        }
        if (dom.bar) {
            const move = (e) => {
                const rect = dom.bar.getBoundingClientRect();
                const x = e.touches ? e.touches[0].clientX : e.clientX;
                const p = U.math.clamp((x - rect.left) / rect.width, 0, 1);
                const d = W.playerCore.getDuration();
                if (d) W.playerCore.seek(d * p);
            };
            const up = () => {
                state.isSeeking = false;
                D.removeEventListener('pointermove', move);
                D.removeEventListener('pointerup', up);
            };
            dom.bar.addEventListener('pointerdown', (e) => {
                state.isSeeking = true;
                move(e);
                D.addEventListener('pointermove', move);
                D.addEventListener('pointerup', up);
            });
        }
    }

    function handleGlobalClick(e) {
        const btn = e.target.closest('button, a, .clickable-icon');
        if (btn?.id && actions[btn.id]) {
            e.preventDefault();
            actions[btn.id](btn);
        }
    }

    const actions = {
        'play-pause-btn': () => W.playerCore.isPlaying() ? W.playerCore.pause() : W.playerCore.play(),
        'prev-btn': () => W.playerCore.prev(),
        'next-btn': () => W.playerCore.next(),
        'stop-btn': () => W.playerCore.stop(),
        'shuffle-btn': (b) => { W.playerCore.toggleShuffle(); U.setBtnActive(b.id, W.playerCore.isShuffle()); updateMiniHeader(); },
        'repeat-btn': (b) => { W.playerCore.toggleRepeat(); U.setBtnActive(b.id, W.playerCore.isRepeat()); },
        'mute-btn': (b) => {
            const m = !b.classList.contains('active');
            if (W.playerCore.setMuted) W.playerCore.setMuted(m); // Optional support
            U.setBtnActive(b.id, m);
        },
        'pq-btn': async () => {
            const mgr = W.OfflineManager || (await import('../offline/offline-manager.js')).getOfflineManager();
            const stats = await mgr.getCacheSummary();
            const totalFiles = stats.pinned.count + stats.cloud.count;
            
            const nextQ = U.pq.getMode() === 'hi' ? 'lo' : 'hi';
            
            // ТЗ 4.3: Confirm если > 5 файлов
            if (totalFiles > 5) {
                if (!confirm(`Смена качества затронет ${totalFiles} файлов. Перекачать?`)) {
                    return; // Отмена
                }
            }
            
            const r = U.pq.toggle(); // Это вызовет switchQuality в PlayerCore
            if (!r.ok) U.ui.toast(r.reason === 'trackNoLo' ? 'Низкое качество недоступно' : r.reason === 'offline' ? 'Нет доступа к сети' : 'Невозможно', 'warning');
            
            updatePQButtonState();
        },
        'favorites-btn': () => actions.toggleFavoritesOnly(),
        'lyrics-toggle-btn': () => W.LyricsController?.toggleLyricsView(),
        'animation-btn': () => W.LyricsController?.toggleAnimation(),
        'lyrics-text-btn': () => W.LyricsModal?.show(),
        'pulse-btn': () => actions.togglePulse(),
        // 'sleep-timer-btn': handled by scripts/ui/sleep.js delegation
        'stats-btn': () => window.StatisticsModal?.openStatisticsModal?.(),
        'track-download-btn': (b) => { if (!b.getAttribute('href')) U.ui.toast('Скачивание недоступно', 'error'); }
    };

    function handleTrackChange(track, index) {
        W.__lastStatsSec = -1;
        W.AlbumsManager?.highlightCurrentTrack(track?.uid ? -1 : index, track?.uid ? { uid: track.uid, albumKey: track.sourceAlbum } : {});
        ensurePlayerBlock(index);
        W.LyricsController?.onTrackChange(track);
        updatePQButtonState();
        updateDownloadState();
    }

    function handleTick(pos, dur) {
        if (!state.isSeeking) {
            const p = dur > 0 ? (pos / dur) * 100 : 0;
            if (dom.fill) dom.fill.style.width = `${p}%`;
            if (dom.timeElapsed) dom.timeElapsed.textContent = U.fmt.time(pos);
            if (dom.timeRemaining) dom.timeRemaining.textContent = `-${U.fmt.time((dur || 0) - pos)}`;
        }
        W.LyricsController?.onTick(pos, { inMiniMode: state.isMiniMode });
    }

    function updatePlayPauseIcon() {
        if (!dom.icon) return;
        dom.icon.innerHTML = W.playerCore.isPlaying() 
            ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' 
            : '<path d="M8 5v14l11-7z"/>';
    }

    function updateVolumeUI(v) {
        if (dom.volFill) dom.volFill.style.width = `${v}%`;
        if (dom.volHandle) dom.volHandle.style.left = `${U.math.clamp(v, 2, 98)}%`;
        if (dom.volSlider) dom.volSlider.value = v;
    }

    function updatePQButtonState() {
        if (!dom.pqBtn) return;
        
        // v1.0: Кнопка качества видна всегда (R0 и R1). R2/R3 не реализованы.
        dom.pqBtn.style.display = '';

        const s = U.pq.getState();
        let cls = 'player-control-btn ';
        if (!s.netOk) { cls += 'disabled'; dom.pqBtn.setAttribute('aria-disabled', 'true'); }
        else {
            cls += `pq-${s.mode}`;
            dom.pqBtn.setAttribute('aria-disabled', !s.canToggle);
            if (!s.canToggle) cls += ' disabled-soft';
        }
        dom.pqBtn.className = cls;
        if (dom.pqLabel) dom.pqLabel.textContent = s.mode === 'lo' ? 'Lo' : 'Hi';
    }

    function updateFavoritesBtn() {
        const on = U.lsGetBool01('favoritesOnlyMode');
        if (dom.favBtn) dom.favBtn.className = `player-control-btn ${on ? 'favorites-active' : ''}`;
        if (dom.favIcon) dom.favIcon.src = on ? 'img/star.png' : 'img/star2.png';
    }

    function updateMiniHeader() {
        if (!state.isMiniMode) return;
        const trk = W.playerCore.getCurrentTrack();
        const nxt = W.playerCore.getPlaylistSnapshot()?.[W.playerCore.getNextIndex()];

        if (dom.miniHeader) {
            const tnum = dom.miniHeader.querySelector('#mini-now-num');
            const tit = dom.miniHeader.querySelector('#mini-now-title');
            const star = dom.miniHeader.querySelector('#mini-now-star');
            if (tnum) tnum.textContent = `${String((W.playerCore.getIndex()||0)+1).padStart(2,'0')}.`;
            if (tit) tit.textContent = trk ? trk.title : '—';
            if (star) star.src = U.fav.isTrackLikedInContext({ playingAlbum: W.AlbumsManager?.getPlayingAlbum(), track: trk }) ? 'img/star.png' : 'img/star2.png';
        }
        if (dom.nextUp) {
            const t = dom.nextUp.querySelector('.title');
            if (t) t.textContent = nxt ? nxt.title : '—';
        }
    }

    function updatePlaylistFiltering() {
        const lst = D.getElementById('track-list');
        if (!lst) return;
        const on = U.lsGetBool01('favoritesOnlyMode');
        const ca = W.AlbumsManager?.getCurrentAlbum(), pa = W.AlbumsManager?.getPlayingAlbum();
        const filter = on && ca === pa && !U.isSpecialAlbumKey(ca);
        
        lst.classList.toggle('favonly-filtered', filter);
        if (filter) {
            const liked = new Set(W.playerCore.getLikedUidsForAlbum(ca) || []);
            lst.querySelectorAll('.track').forEach(r => {
                const u = r.dataset.uid;
                if(u && !liked.has(u)) r.setAttribute('data-hidden-by-favonly', '1');
                else r.removeAttribute('data-hidden-by-favonly');
            });
        }
    }

    function updateDownloadState() {
        const btn = D.getElementById('track-download-btn');
        if (btn) U.download.applyDownloadLink(btn, W.playerCore.getCurrentTrack());
    }

    actions.toggleFavoritesOnly = () => {
        const next = !U.lsGetBool01('favoritesOnlyMode');
        const pa = W.AlbumsManager?.getPlayingAlbum();
        
        if (next && pa !== W.SPECIAL_FAVORITES_KEY) {
            const l = W.playerCore.getLikedUidsForAlbum(pa);
            if (!l?.length) return U.ui.toast('Отметьте понравившийся трек ⭐', 'info');
        }

        U.lsSetBool01('favoritesOnlyMode', next);
        updateFavoritesBtn();
        W.PlaybackPolicy?.apply({ reason: 'toggle' });
        PlayerUI.updateAvailableTracksForPlayback();
        updatePlaylistFiltering();
        U.ui.toast(next ? '⭐ Только избранные' : 'Играют все треки', next ? 'success' : 'info');
    };

    actions.toggleLike = () => {
        const t = W.playerCore.getCurrentTrack();
        if (!t?.uid) return;
        const pa = W.AlbumsManager?.getPlayingAlbum();
        const aKey = t.sourceAlbum || (U.isSpecialAlbumKey(pa) ? null : pa);
        W.playerCore.toggleFavorite(t.uid, { fromAlbum: true, albumKey: aKey }); // Unified call
        updateMiniHeader();
    };

    actions.togglePulse = () => {
        state.isBitEnabled = !state.isBitEnabled;
        U.lsSetBool01('bitEnabled', state.isBitEnabled);
        D.getElementById('pulse-btn')?.classList.toggle('active', state.isBitEnabled);
        const h = D.getElementById('pulse-heart'); if(h) h.textContent = state.isBitEnabled ? '❤️' : '🤍';
        state.isBitEnabled ? startVisualizer() : stopVisualizer();
    };

    function startVisualizer() {
        try { W.playerCore.sound?.html5 ? null : null; } catch(e){} // No-op check
        if (W.Howler?.ctx && !state.analyzer) {
            const ctx = W.Howler.ctx;
            if (ctx.state === 'suspended') ctx.resume();
            try {
                state.analyzer = ctx.createAnalyser();
                state.analyzer.fftSize = 256;
                W.Howler.masterGain.connect(state.analyzer);
            } catch {}
        }
        if (!state.analyzer) return;
        visualizerLoop();
    }

    function visualizerLoop() {
        if (!state.isBitEnabled) return;
        if (state.analyzer) {
            const len = state.analyzer.frequencyBinCount;
            const arr = new Uint8Array(len);
            state.analyzer.getByteFrequencyData(arr);
            let sum = 0;
            const lim = Math.floor(len * 0.3);
            for(let i=0; i<lim; i++) sum += arr[i];
            const scale = 1 + (sum / lim / 255) * 0.2;
            const l = D.getElementById('logo-bottom');
            if(l) l.style.transform = `scale(${scale})`;
        }
        state.rafId = requestAnimationFrame(visualizerLoop);
    }

    function stopVisualizer() {
        if (state.rafId) cancelAnimationFrame(state.rafId);
        const l = D.getElementById('logo-bottom');
        if(l) { l.style.transform = 'scale(1)'; setTimeout(()=>l.style.transition='',300); }
        state.analyzer = null;
    }

    function manageJumpButton() {
        if (!dom.jumpBtn) {
            dom.jumpBtn = D.createElement('div');
            dom.jumpBtn.className = 'jump-to-playing';
            dom.jumpBtn.innerHTML = '<button>↑</button>';
            dom.jumpBtn.onclick = () => dom.playerBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            D.body.appendChild(dom.jumpBtn);
        }
        if ('IntersectionObserver' in W && dom.playerBlock) {
            if (W.playerBlockObserver) W.playerBlockObserver.disconnect();
            W.playerBlockObserver = new IntersectionObserver(([e]) => {
                dom.jumpBtn.style.display = (!e.isIntersecting && !state.isMiniMode) ? 'flex' : 'none';
            }, { threshold: 0.1 });
            W.playerBlockObserver.observe(dom.playerBlock);
        }
    }

    PlayerUI.initialize = init;
    PlayerUI.ensurePlayerBlock = ensurePlayerBlock;
    PlayerUI.updateMiniHeader = updateMiniHeader;
    PlayerUI.updateNextUpLabel = updateMiniHeader;
    PlayerUI.togglePlayPause = actions['play-pause-btn'];
    PlayerUI.switchAlbumInstantly = (k) => { if(W.playerCore.getIndex()>=0) { ensurePlayerBlock(W.playerCore.getIndex()); updateMiniHeader(); } };
    
    PlayerUI.updateAvailableTracksForPlayback = () => {
        const pa = W.AlbumsManager?.getPlayingAlbum();
        const on = U.lsGetBool01('favoritesOnlyMode');
        if (pa !== W.SPECIAL_FAVORITES_KEY && on) {
            const snap = W.playerCore.getPlaylistSnapshot();
            W.availableFavoriteIndices = snap.reduce((acc, t, i) => { if(W.playerCore.isFavorite(t.uid)) acc.push(i); return acc; }, []);
        } else W.availableFavoriteIndices = null;
    };

    // Removed unused getters

    W.PlayerUI = PlayerUI;
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();

})(window, document);

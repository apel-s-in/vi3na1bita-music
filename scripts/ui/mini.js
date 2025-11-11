// scripts/ui/mini.js (ESM)
// Логика "мини-режима" плеера.

(function(){
    function applyMiniModeUI() {
        const isMini = window.playingAlbumKey && window.currentAlbumKey && window.playingAlbumKey !== window.currentAlbumKey;
        document.body.classList.toggle('mini-mode', isMini);
        updateMiniNowHeader();
    }
    
    function updateMiniNowHeader() {
        const cont = document.getElementById('now-playing');
        if(!cont) return;

        const isMini = document.body.classList.contains('mini-mode');
        const isPlaying = window.playerCore?.isPlaying();

        if (isMini && isPlaying) {
            const track = window.playerCore.getCurrentTrackMeta();
            if(track) {
                const albumMeta = window.albumByKey ? window.albumByKey(window.playingAlbumKey) : null;
                cont.innerHTML = `
                <div class="mini-now">
                    <div class="tnum">${albumMeta ? albumMeta.short || '▶' : '▶'}</div>
                    <div class="track-title">${track.title}</div>
                </div>
                `;
            }
        } else {
            cont.innerHTML = '';
        }
    }
    
    function updateNextUpLabel() {
        const nextUpEl = document.querySelector('.next-up');
        if(!nextUpEl) return;
        
        const nextTrack = window.playerCore?.getNextTrackMeta();
        if(nextTrack && window.playerCore?.isPlaying()) {
            nextUpEl.style.display = 'flex';
            nextUpEl.querySelector('.title').textContent = nextTrack.title;
        } else {
            nextUpEl.style.display = 'none';
        }
    }

    window.applyMiniModeUI = applyMiniModeUI;
    window.updateMiniNowHeader = updateMiniNowHeader;
    window.updateNextUpLabel = updateNextUpLabel;
})();


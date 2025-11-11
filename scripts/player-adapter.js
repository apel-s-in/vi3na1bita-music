// scripts/player-adapter.js (ESM)
// Адаптер LocalStorage/SessionStorage ↔ PlayerCore: восстановление состояния.

function initWhenReady() {
  const pc = window.playerCore;
  if (!pc) {
    setTimeout(initWhenReady, 50);
    return;
  }
  try {
    const repeat = localStorage.getItem('repeatMode') === '1';
    const shuffle = localStorage.getItem('shuffleMode') === '1';
    pc.setRepeat(!!repeat);
    pc.setShuffle(!!shuffle);

    const savedVolume = parseFloat(localStorage.getItem('playerVolume'));
    if (Number.isFinite(savedVolume)) pc.setVolume(savedVolume);

    const favsOnly = localStorage.getItem('favoritesOnlyMode') === '1';
    pc.setFavoritesOnly(!!favsOnly, []);
  } catch {}
}

window.addEventListener('storage', (e) => {
  const pc = window.playerCore;
  if (!pc) return;
  try {
    if (e.key === 'repeatMode') pc.setRepeat(e.newValue === '1');
    if (e.key === 'shuffleMode') pc.setShuffle(e.newValue === '1');
    if (e.key === 'playerVolume') {
      const v = parseFloat(e.newValue || '1');
      if (Number.isFinite(v)) pc.setVolume(v);
    }
    if (e.key === 'favoritesOnlyMode') {
      const on = e.newValue === '1';
      pc.setFavoritesOnly(on, []);
    }
  } catch {}
});

export const PlayerState = {
  key: 'playerStateV1',
  save() {
    try {
      const pc = window.playerCore;
      const st = {
        album: window.playingAlbumKey || window.currentAlbumKey || null,
        trackIndex: pc ? pc.getIndex() : (window.playingTrack >= 0 ? window.playingTrack : window.currentTrack),
        position: pc ? Math.floor(pc.getSeek?.() || 0) : 0,
        volume: pc ? (pc.getVolume?.() ?? 1) : 1,
        shuffle: localStorage.getItem('shuffleMode') === '1',
        repeat:  localStorage.getItem('repeatMode') === '1',
        favoritesOnly: localStorage.getItem('favoritesOnlyMode') === '1',
        lyricsMode: localStorage.getItem('lyricsViewMode') || 'normal'
      };
      localStorage.setItem(this.key, JSON.stringify(st));
    } catch {}
  },
  restore() {
    try { const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  },
  applyState(state) {
    try {
      const pc = window.playerCore;
      if (!pc || !state) return;
      if (typeof state.volume === 'number') pc.setVolume(state.volume);
      // Плейлист должен быть уже установлен к этому моменту
      if (typeof state.trackIndex === 'number' && state.trackIndex >= 0) {
        if (state.wasPlaying) {
          pc.play(state.trackIndex);
          if (typeof state.position === 'number' && state.position > 1) {
             pc.seek(state.position);
          }
        } else {
          // Если не играло, просто выставляем трек без автозапуска
          pc.index = state.trackIndex;
          const tr = pc.playlist[pc.index];
          pc._fire('onTrackChange', tr, pc.index);
          pc.seek(state.position || 0);
        }
      }
    } catch (e) {
      console.error("Failed to apply state", e);
    }
  }
};

window.PlayerState = PlayerState;
window.PlayerAdapter = { applyState: PlayerState.applyState };

initWhenReady();

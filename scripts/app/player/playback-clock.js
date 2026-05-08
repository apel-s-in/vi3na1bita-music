const W = window;
let _init = false, _state = { uid: null, currentTime: 0, duration: 0, isPlaying: false, visibility: document.visibilityState || 'visible', uiBackgroundSuspend: document.visibilityState === 'hidden', ts: Date.now() };

const pull = () => {
  const pc = W.playerCore, vis = document.visibilityState || 'visible';
  _state = { ..._state, uid: String(pc?.getCurrentTrackUid?.() || '') || null, currentTime: Number(pc?.getPosition?.() || 0), duration: Number(pc?.getDuration?.() || 0), isPlaying: !!pc?.isPlaying?.(), visibility: vis, uiBackgroundSuspend: vis === 'hidden', ts: Date.now() };
  W.dispatchEvent(new CustomEvent('playback:clock', { detail: { ..._state } }));
};

export const initPlaybackClock = () => {
  if (_init) return; _init = true;
  ['player:play', 'player:pause', 'player:stop', 'player:ended', 'player:trackChanged', 'player:tick'].forEach(n => W.addEventListener(n, pull));
  document.addEventListener('visibilitychange', pull); pull();
};

export const getPlaybackClock = () => ({ ..._state });
W.PlaybackClock = { initPlaybackClock, getPlaybackClock };
export default W.PlaybackClock;

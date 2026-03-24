const W = window;

let _init = false;
let _state = {
  uid: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  visibility: document.visibilityState || 'visible',
  ts: Date.now()
};

const emit = () => {
  _state.ts = Date.now();
  W.dispatchEvent(new CustomEvent('playback:clock', { detail: { ..._state } }));
};

const pull = () => {
  const pc = W.playerCore;
  _state = {
    ..._state,
    uid: String(pc?.getCurrentTrackUid?.() || '') || null,
    currentTime: Number(pc?.getPosition?.() || 0),
    duration: Number(pc?.getDuration?.() || 0),
    isPlaying: !!pc?.isPlaying?.(),
    visibility: document.visibilityState || 'visible',
    ts: Date.now()
  };
  emit();
};

export function initPlaybackClock() {
  if (_init) return;
  _init = true;
  ['player:play', 'player:pause', 'player:stop', 'player:ended', 'player:trackChanged', 'player:tick'].forEach(n => W.addEventListener(n, pull));
  document.addEventListener('visibilitychange', pull);
  pull();
}

export function getPlaybackClock() {
  return { ..._state };
}

W.PlaybackClock = { initPlaybackClock, getPlaybackClock };
export default { initPlaybackClock, getPlaybackClock };

// Восстановление playback intent только после настоящего пользовательского жеста.
// Listener автоматически удаляется после запуска, pagehide или timeout.

const EVENTS = Object.freeze([
  'pointerdown',
  'touchend',
  'keydown'
]);

let activeCleanup = null;

export const cancelRestorePlaybackGesture = () => {
  activeCleanup?.();
  activeCleanup = null;
};

export const armRestorePlaybackGesture = ({
  uid,
  timeoutMs = 120000
} = {}) => {
  cancelRestorePlaybackGesture();

  const expectedUid = String(uid || '').trim();
  if (!expectedUid) return () => {};

  let armed = true;
  let timer = 0;

  const cleanup = () => {
    if (!armed) return;
    armed = false;
    clearTimeout(timer);

    EVENTS.forEach(name =>
      document.removeEventListener(name, resume, true)
    );

    window.removeEventListener('pagehide', cleanup);
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  const resume = event => {
    if (!armed || event?.isTrusted === false) return;

    const player = window.playerCore;

    if (
      player?.getCurrentTrackUid?.() !== expectedUid ||
      player?.isPlaying?.()
    ) {
      cleanup();
      return;
    }

    cleanup();

    try {
      player.prepareContext?.();
      player.play?.();
    } catch {}
  };

  EVENTS.forEach(name =>
    document.addEventListener(name, resume, {
      capture: true,
      passive: true
    })
  );

  window.addEventListener('pagehide', cleanup, {
    once: true
  });

  timer = setTimeout(cleanup, Math.max(
    10000,
    Number(timeoutMs) || 120000
  ));

  activeCleanup = cleanup;
  return cleanup;
};

export default {
  armRestorePlaybackGesture,
  cancelRestorePlaybackGesture
};

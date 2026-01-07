import { Howler } from '../../vendor/howler.min.js';

let unlocked = false;

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Best-effort: iOS PWA often needs an explicit resume from a user gesture.
async function unlockWebAudioOnce() {
  if (unlocked) return;
  if (!isIOS()) return;

  try {
    const ctx = Howler && Howler.ctx;
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Some iOS versions also need a short silent play attempt to fully unlock.
    // Howler has internal unlock, but we ensure resume at least.
    unlocked = true;
  } catch (e) {
    // Do not throw. Never stop/play here (TЗ инвариант).
    // Just mark as not unlocked so we can retry on next gesture.
    unlocked = false;
  }
}

export function installIOSAudioUnlock() {
  const handler = () => { unlockWebAudioOnce(); };

  // pointerdown is the most reliable "gesture" signal across iOS Safari/PWA.
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('touchend', handler, { passive: true });
  window.addEventListener('click', handler, { passive: true });
}

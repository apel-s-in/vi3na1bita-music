// scripts/app/background-audio.js
// iOS audio unlock helper (no imports; Howler is loaded from CDN in index.html)

let unlocked = false;

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Best-effort: iOS needs explicit resume from a user gesture.
async function unlockWebAudioOnce() {
  if (unlocked) return;
  if (!isIOS()) return;

  try {
    const Howler = window.Howler;
    const ctx = Howler && Howler.ctx;

    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    unlocked = true;
  } catch (e) {
    // Never throw. Never stop/play here (player invariant).
    unlocked = false;
  }
}

export function installIOSAudioUnlock() {
  const handler = () => { unlockWebAudioOnce(); };

  // pointerdown is the most reliable gesture on iOS Safari/PWA
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('touchend', handler, { passive: true });
  window.addEventListener('click', handler, { passive: true });
}

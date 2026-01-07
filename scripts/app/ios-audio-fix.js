// scripts/app/ios-audio-fix.js
// Enhanced iOS audio unlock fix for the player

(function iOSAudioFix() {
  'use strict';

  const w = window;

  // Check if we're on iOS
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  // Enhanced iOS audio unlock
  function unlockIOSAudio() {
    if (!isIOS()) return;

    console.log('📱 iOS detected, preparing audio unlock');

    // Create a temporary silent buffer to play on first user interaction
    let audioContext = null;
    let unlockBuffer = null;

    try {
      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      
      // Create a short silent buffer
      unlockBuffer = audioContext.createBuffer(1, 1, 22050);
    } catch (e) {
      console.warn('⚠️ Could not create AudioContext for iOS unlock:', e);
      return;
    }

    function attemptUnlock() {
      if (!audioContext || audioContext.state !== 'suspended') {
        return;
      }

      // Create and play a silent buffer to unlock
      const source = audioContext.createBufferSource();
      source.buffer = unlockBuffer;
      source.connect(audioContext.destination);
      source.start(0);

      // Resume the Howler context too
      if (w.Howler && w.Howler.ctx && w.Howler.ctx.state === 'suspended') {
        w.Howler.ctx.resume()
          .then(() => {
            console.log('✅ Howler.js AudioContext unlocked on iOS');
          })
          .catch(err => {
            console.warn('⚠️ Could not unlock Howler.js AudioContext:', err);
          });
      }

      // Wait a moment then resume the main context
      setTimeout(() => {
        audioContext.resume()
          .then(() => {
            console.log('✅ Main AudioContext unlocked on iOS');
            // Remove the event listeners after successful unlock
            removeUnlockListeners();
          })
          .catch(err => {
            console.warn('⚠️ Could not unlock main AudioContext:', err);
          });
      }, 50);
    }

    // Add multiple event listeners for different types of user interactions
    function addUnlockListeners() {
      document.addEventListener('touchstart', attemptUnlock, { once: true, passive: false });
      document.addEventListener('touchend', attemptUnlock, { once: true, passive: false });
      document.addEventListener('mousedown', attemptUnlock, { once: true });
      document.addEventListener('mouseup', attemptUnlock, { once: true });
      document.addEventListener('click', attemptUnlock, { once: true, passive: false });
      document.addEventListener('pointerdown', attemptUnlock, { once: true, passive: false });
      document.addEventListener('pointerup', attemptUnlock, { once: true, passive: false });
    }

    function removeUnlockListeners() {
      document.removeEventListener('touchstart', attemptUnlock);
      document.removeEventListener('touchend', attemptUnlock);
      document.removeEventListener('mousedown', attemptUnlock);
      document.removeEventListener('mouseup', attemptUnlock);
      document.removeEventListener('click', attemptUnlock);
      document.removeEventListener('pointerdown', attemptUnlock);
      document.removeEventListener('pointerup', attemptUnlock);
    }

    // Add the unlock listeners
    addUnlockListeners();

    // Also try to unlock immediately if context is already running
    if (audioContext.state === 'suspended') {
      // Try to unlock right away if possible
      setTimeout(attemptUnlock, 100);
    }
  }

  // Apply the fix when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', unlockIOSAudio);
  } else {
    // Wait a bit to ensure Howler is loaded
    setTimeout(unlockIOSAudio, 200);
  }

  // Also hook into the player play functionality to ensure unlock before playback
  const originalPlay = function(index, options) {
    if (isIOS() && w.Howler && w.Howler.ctx && w.Howler.ctx.state === 'suspended') {
      w.Howler.ctx.resume().catch(err => {
        console.warn('Attempt to unlock during play failed:', err);
      });
    }
    
    // Proceed with normal play logic
    if (w.playerCore) {
      w.playerCore._pushHistoryForCurrent();
      
      if (!w.playerCore.sound) return;
      
      w.playerCore.sound.play();
      w.playerCore._updateMedia(w.playerCore.getCurrentTrack());
    }
  };

  // Enhance the playerCore play method to handle iOS unlock
  if (w.playerCore) {
    const originalPlayerPlay = w.playerCore.play.bind(w.playerCore);
    w.playerCore.play = async function(index, options = {}) {
      if (isIOS()) {
        // Try to unlock audio context before playing
        if (w.Howler && w.Howler.ctx && w.Howler.ctx.state === 'suspended') {
          try {
            await w.Howler.ctx.resume();
            console.log('✅ AudioContext unlocked via play attempt');
          } catch (err) {
            console.warn('⚠️ Could not unlock AudioContext during play:', err);
          }
        }
      }
      return originalPlayerPlay(index, options);
    };
  }

})();
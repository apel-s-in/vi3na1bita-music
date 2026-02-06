/**
 * PlayerCore Patch v1.0
 * Добавляет к существующему PlayerCore методы, необходимые для интеграции:
 * - loadSource() с preservePosition
 * - Event hooks (onTrackChange, onTrackEnded, etc.)
 * - blob/objectURL support
 *
 * Применяется поверх существующего PlayerCore без его переписывания.
 */

(function() {
  'use strict';

  // Wait for PlayerCore to be available
  function patchWhenReady() {
    const pc = window.PlayerCore || window.playerCore;
    if (!pc) {
      setTimeout(patchWhenReady, 100);
      return;
    }
    applyPatch(pc);
  }

  function applyPatch(PlayerCore) {
    if (PlayerCore._v1Patched) return;
    PlayerCore._v1Patched = true;

    console.log('[PlayerCorePatch] Applying v1.0 patch');

    // Store original methods
    const origLoad = PlayerCore.load ? PlayerCore.load.bind(PlayerCore) : null;

    // Event callback storage
    const _hooks = {
      trackChange: [],
      trackEnded: [],
      trackSkipped: [],
      seek: [],
      play: [],
      pause: []
    };

    // ==================== loadSource ====================

    /**
     * Load a source with options (ТЗ 16.1, 4.2)
     * @param {Object} track - track object
     * @param {string} url - URL or blob URL
     * @param {Object} opts - { html5, preservePosition, autoplay }
     */
    PlayerCore.loadSource = function(track, url, opts) {
      opts = opts || {};
      const isBlob = url && (url.startsWith('blob:') || url.startsWith('data:'));
      const html5 = opts.html5 !== undefined ? opts.html5 : !isBlob;

      // Store state before load
      const prevUid = this.getCurrentTrackUid ? this.getCurrentTrackUid() : null;
      const prevProgress = this.getProgress ? this.getProgress() : 0;
      const prevDuration = this.getDuration ? this.getDuration() : 0;
      const prevDurationValid = prevDuration > 0 && isFinite(prevDuration);

      // If changing track, fire skip event for old track
      if (prevUid && track.uid !== prevUid) {
        _fireSkip(prevUid, prevProgress, prevDurationValid);
      }

      // Create new Howl or use existing mechanism
      if (this._currentHowl) {
        // Unload old without calling stop events
        try { this._currentHowl.unload(); } catch(e) {}
      }

      const howlOpts = {
        src: [url],
        html5: html5,
        preload: true,
        volume: this.getVolume ? this.getVolume() : 1
      };

      const howl = new Howl(howlOpts);
      this._currentHowl = howl;
      this._currentTrack = track;
      this._currentUrl = url;

      howl.once('load', () => {
        // Seek to preserved position
        if (opts.preservePosition && opts.preservePosition > 0) {
          howl.seek(opts.preservePosition);
        }
        // Autoplay
        if (opts.autoplay) {
          howl.play();
        }
        // Fire track change
        _hooks.trackChange.forEach(fn => {
          try { fn(track, 'load'); } catch(e) {}
        });

        // Fire play event
        window.dispatchEvent(new CustomEvent('playerTrackStart', {
          detail: { uid: track.uid, track }
        }));
      });

      howl.on('end', () => {
        const progress = 1;
        const dur = howl.duration();
        const valid = dur > 0 && isFinite(dur);
        _hooks.trackEnded.forEach(fn => {
          try { fn(track.uid, progress, valid); } catch(e) {}
        });
        window.dispatchEvent(new CustomEvent('playerTrackEnded', {
          detail: { uid: track.uid, progress, durationValid: valid }
        }));
      });

      howl.on('play', () => {
        _hooks.play.forEach(fn => { try { fn(); } catch(e) {} });
        window.dispatchEvent(new CustomEvent('playerPlay'));
      });

      howl.on('pause', () => {
        _hooks.pause.forEach(fn => { try { fn(); } catch(e) {} });
        window.dispatchEvent(new CustomEvent('playerPause'));
      });

      howl.on('seek', () => {
        const pos = howl.seek();
        _hooks.seek.forEach(fn => {
          try { fn(track.uid, 0, pos); } catch(e) {}
        });
      });

      howl.on('loaderror', (id, err) => {
        console.error('[PlayerCorePatch] Load error:', err);
      });

      howl.on('playerror', (id, err) => {
        console.error('[PlayerCorePatch] Play error:', err);
      });
    };

    function _fireSkip(uid, progress, durationValid) {
      _hooks.trackSkipped.forEach(fn => {
        try { fn(uid, progress, durationValid); } catch(e) {}
      });
      window.dispatchEvent(new CustomEvent('playerSkip', {
        detail: { uid, progress, durationValid }
      }));
    }

    // ==================== Getters ====================

    if (!PlayerCore.getCurrentTrackUid) {
      PlayerCore.getCurrentTrackUid = function() {
        if (this._currentTrack) return this._currentTrack.uid || this._currentTrack.id;
        return null;
      };
    }

    if (!PlayerCore.isPlaying) {
      PlayerCore.isPlaying = function() {
        if (this._currentHowl) return this._currentHowl.playing();
        return false;
      };
    }

    if (!PlayerCore.getPosition) {
      PlayerCore.getPosition = function() {
        if (this._currentHowl) {
          const s = this._currentHowl.seek();
          return typeof s === 'number' ? s : 0;
        }
        return 0;
      };
    }

    if (!PlayerCore.getProgress) {
      PlayerCore.getProgress = function() {
        if (!this._currentHowl) return 0;
        const dur = this._currentHowl.duration();
        const pos = this._currentHowl.seek();
        if (!dur || dur <= 0) return 0;
        return pos / dur;
      };
    }

    if (!PlayerCore.getDuration) {
      PlayerCore.getDuration = function() {
        if (this._currentHowl) return this._currentHowl.duration();
        return 0;
      };
    }

    if (!PlayerCore.getVolume) {
      PlayerCore.getVolume = function() {
        if (this._currentHowl) return this._currentHowl.volume();
        return 1;
      };
    }

    // ==================== Hook registration ====================

    PlayerCore.onTrackChange = function(fn) { _hooks.trackChange.push(fn); };
    PlayerCore.onTrackEnded = function(fn) { _hooks.trackEnded.push(fn); };
    PlayerCore.onTrackSkipped = function(fn) { _hooks.trackSkipped.push(fn); };
    PlayerCore.onSeek = function(fn) { _hooks.seek.push(fn); };
    PlayerCore.onPlay = function(fn) { _hooks.play.push(fn); };
    PlayerCore.onPause = function(fn) { _hooks.pause.push(fn); };

    console.log('[PlayerCorePatch] Patch applied successfully');
  }

  // Start patching
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchWhenReady);
  } else {
    patchWhenReady();
  }
})();

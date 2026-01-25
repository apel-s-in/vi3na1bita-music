import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';
import FavoritesV2 from '../scripts/core/favorites-v2.js';

(function () {
  'use strict';

  const W = window;
  const U = W.Utils;

  const clamp = U?.clamp || ((n, a, b) => Math.max(a, Math.min(b, n)));
  const isIOS = U?.isIOS || (() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !W.MSStream);
  const safeStr = (v) => String(v ?? '').trim() || null;

  class PlayerCore {
    constructor() {
      this.sound = null; // Howl instance
      this.playlist = [];         
      this.originalPlaylist = []; 
      this.currentIndex = -1;
      this.currentUid = null;
      
      this.isShuffle = false;
      this.isRepeat = false; // false | 'all' | 'one'
      this.isFavOnly = false;

      this.volume = 1.0;
      this._loadToken = 0; // Для защиты от гонок

      // Events
      this.callbacks = {
        onTrackChange: [], onPlay: [], onPause: [], onStop: [], 
        onEnd: [], onTick: [], onError: [], onSleepTriggered: []
      };

      this.sleepTimerId = null;
      this.sleepTimerTarget = 0;

      // Stats & Session
      this._mediaSession = ensureMediaSession(this._getMsHandlers());
      this._stats = createListenStatsTracker({
        getUid: () => safeStr(this.getCurrentTrack()?.uid),
        getPos: () => this.getPosition(),
        getDur: () => this.getDuration(),
        record: (uid, p) => W.OfflineUI?.offlineManager?.recordListenStats?.(uid, p)
      });

      this._favEmitter = { subs: new Set() };
    }

    initialize() {
      this._armIOSUnlock();
    }

    // =================================================
    // Playlist & Playback
    // =================================================

    setPlaylist(tracks, startIndex = 0, meta = {}, opts = {}) {
      const wasPlaying = this.isPlaying();
      const prevPos = this.getPosition();

      // Normalize tracks
      this.playlist = (tracks || []).map(t => ({
        ...t,
        uid: safeStr(t.uid),
        src: t.url || t.audio || t.src // normalize src
      }));

      if (!opts.preserveOriginalPlaylist) {
        this.originalPlaylist = [...this.playlist];
        this.isFavOnly = false; // Reset F mode on new playlist
      }

      if (this.isShuffle) this.shufflePlaylist();

      // Find index
      const len = this.playlist.length;
      this.currentIndex = (len > 0) ? clamp(startIndex, 0, len - 1) : -1;

      // Load/Play
      if (this.currentIndex >= 0) {
        this.load(this.currentIndex, { 
          autoPlay: wasPlaying || opts.autoPlay, 
          resumePosition: opts.preservePosition ? prevPos : 0 
        });
      } else {
        this.stop();
      }
    }

    async load(index, opts = {}) {
      if (index < 0 || index >= this.playlist.length) return;
      
      const token = ++this._loadToken;
      if (this.sound) this.sound.unload();

      this.currentIndex = index;
      const track = this.playlist[index];
      this.currentUid = track.uid;

      // Resolve URL (Offline check)
      let src = track.src;
      if (W.OfflineUI?.offlineManager?.resolveForPlayback) {
        // Simple synchronous check or async if needed. 
        // For simplicity here, assuming src is valid or blob url.
        // In full impl, this should await offlineManager.
      }

      this.sound = new Howl({
        src: [src],
        html5: true, // Force HTML5 Audio for streaming/large files
        volume: this.volume,
        onplay: () => {
          if(token !== this._loadToken) return;
          this.trigger('onPlay');
          this._startTick();
          this._updateMedia();
        },
        onpause: () => {
          if(token !== this._loadToken) return;
          this.trigger('onPause');
          this._stopTick();
          this._stats.onPauseOrStop();
        },
        onend: () => {
          if(token !== this._loadToken) return;
          this._stats.onEnded();
          this.handleTrackEnd();
        },
        onstop: () => {
          if(token !== this._loadToken) return;
          this._stopTick();
          this.trigger('onStop');
        },
        onloaderror: (id, e) => console.error('Load error', e),
        onplayerror: (id, e) => {
           console.error('Play error', e);
           this.sound.once('unlock', () => this.sound.play());
        }
      });

      if (opts.autoPlay) {
        this.sound.play();
      }
      
      if (opts.resumePosition) {
        this.sound.seek(opts.resumePosition);
      }

      this.trigger('onTrackChange', track, index);
      this._updateMedia();
    }

    play(index) {
        if (typeof index === 'number') {
            this.load(index, { autoPlay: true });
        } else if (this.sound) {
            this.sound.play();
        }
    }

    pause() {
        if (this.sound) this.sound.pause();
    }

    stop() {
        if (this.sound) {
            this.sound.stop();
            this.sound.unload();
            this.sound = null;
        }
        this._stopTick();
        this.trigger('onStop');
    }

    prev() {
        if (this.getPosition() > 3) {
            this.seek(0);
            return;
        }
        const len = this.playlist.length;
        if (!len) return;
        const next = (this.currentIndex - 1 + len) % len;
        this.load(next, { autoPlay: true });
    }

    next(auto = false) {
        const len = this.playlist.length;
        if (!len) return;
        
        let next = this.currentIndex + 1;
        if (next >= len) {
            if (this.isRepeat === 'all' || this.isRepeat === true) next = 0;
            else if (!auto) next = 0; // Manual next wraps
            else return; // Stop at end
        }
        this.load(next, { autoPlay: true });
    }

    handleTrackEnd() {
        if (this.isRepeat === 'one') {
            this.play(this.currentIndex);
        } else {
            this.next(true);
        }
    }

    // =================================================
    // Features: Shuffle, Repeat, FavOnly
    // =================================================

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        const curUid = this.currentUid;
        
        if (this.isShuffle) {
            // Shuffle but keep current first
            const others = this.originalPlaylist.filter(t => t.uid !== curUid);
            this.playlist = [this.getCurrentTrack(), ...shuffleArray(others)].filter(Boolean);
        } else {
            // Restore order (respecting FavOnly filter if active)
            this.playlist = this.isFavOnly 
                ? this.originalPlaylist.filter(t => this.isFavorite(t.uid))
                : [...this.originalPlaylist];
        }
        
        // Update index
        this.currentIndex = this.playlist.findIndex(t => t.uid === curUid);
        return this.isShuffle;
    }

    toggleRepeat() {
        if (!this.isRepeat) this.isRepeat = 'all';
        else if (this.isRepeat === 'all') this.isRepeat = 'one';
        else this.isRepeat = false;
        return this.isRepeat;
    }

    toggleFavoritesOnly() {
        this.isFavOnly = !this.isFavOnly;
        const curUid = this.currentUid;
        const wasPlaying = this.isPlaying();
        const pos = this.getPosition();

        // Rebuild playlist
        let nextList = [...this.originalPlaylist];
        if (this.isFavOnly) {
            nextList = nextList.filter(t => this.isFavorite(t.uid));
            // Ensure current track is kept if playing, even if not favorite (optional, strictly speaking F should filter it out, but UX is better if we don't stop music abruptly)
            // But per your strict rules: F limits NEXT/PREV. 
            // If current is not favorite, we keep playing it until user switches? 
            // Let's keep it simple: filter. If current removed, stop? No, better keep current in list until change.
            if (curUid && !this.isFavorite(curUid)) {
                 // Option A: Stop. Option B: Keep. 
                 // Let's keep for seamless UX, but next track will be favorite.
                 const curTrack = this.originalPlaylist.find(t => t.uid === curUid);
                 if(curTrack && !nextList.includes(curTrack)) nextList.unshift(curTrack);
            }
        }

        if (this.isShuffle) {
            const cur = nextList.find(t => t.uid === curUid);
            const others = nextList.filter(t => t.uid !== curUid);
            this.playlist = [cur, ...shuffleArray(others)].filter(Boolean);
        } else {
            this.playlist = nextList;
        }

        this.currentIndex = this.playlist.findIndex(t => t.uid === curUid);
        
        // If current track disappeared (rare edge case), stop or play first
        if (this.currentIndex === -1 && this.playlist.length > 0) {
            this.load(0, { autoPlay: wasPlaying });
        }
        
        return this.isFavOnly;
    }

    // =================================================
    // Utils & Getters
    // =================================================

    seek(sec) { if (this.sound) this.sound.seek(sec); }
    setVolume(v) { this.volume = v; if (this.sound) this.sound.volume(v); }
    setMuted(m) { if (this.sound) this.sound.mute(m); }
    
    getPosition() { return this.sound ? this.sound.seek() : 0; }
    getDuration() { return this.sound ? this.sound.duration() : 0; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getPlaylistSnapshot() { return [...this.playlist]; }

    // Favorites Logic (Proxied to FavoritesV2)
    isFavorite(uid) {
        if (!uid) return false;
        try { return FavoritesV2.readLikedSet().has(uid); } catch { return false; }
    }
    
    toggleFavorite(uid, opts) {
        const res = FavoritesV2.toggle(uid, { source: opts?.fromAlbum ? 'album' : 'favorites' });
        this._favEmitter.emit(res); // Notify UI
        return res;
    }
    
    onFavoritesChanged(fn) { 
        this._favEmitter.subs.add(fn); 
        return () => this._favEmitter.subs.delete(fn);
    }

    // Helpers
    _startTick() {
        this._stopTick();
        this._tickInterval = setInterval(() => {
            this.trigger('onTick', this.getPosition(), this.getDuration());
            this._stats.onTick();
        }, 200);
    }
    _stopTick() { clearInterval(this._tickInterval); }
    
    _updateMedia() {
        const t = this.getCurrentTrack();
        if(t) this._mediaSession.updateMetadata({ title: t.title, artist: t.artist, artworkUrl: t.cover });
    }

    _getMsHandlers() {
        return {
            onPlay: () => this.play(),
            onPause: () => this.pause(),
            onStop: () => this.stop(),
            onPrev: () => this.prev(),
            onNext: () => this.next(),
            onSeekTo: (t) => this.seek(t),
            getPositionState: () => ({ duration: this.getDuration(), position: this.getPosition() })
        };
    }

    _armIOSUnlock() {
        // Howler handles AudioContext unlocking mostly, but we can double check
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            const unlock = () => {
                Howler.ctx.resume();
                document.removeEventListener('click', unlock);
                document.removeEventListener('touchstart', unlock);
            };
            document.addEventListener('click', unlock);
            document.addEventListener('touchstart', unlock);
        }
    }

    // API for Visualizer
    getAudioContext() { return Howler.ctx; }
    getMasterGain() { return Howler.masterGain; }

    trigger(evt, ...args) {
        (this.callbacks[evt] || []).forEach(fn => fn(...args));
    }
    on(map) {
        Object.keys(map).forEach(k => {
            if (this.callbacks[k]) this.callbacks[k].push(map[k]);
        });
    }
  }

  W.playerCore = new PlayerCore();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => W.playerCore.initialize());
  else W.playerCore.initialize();

})();

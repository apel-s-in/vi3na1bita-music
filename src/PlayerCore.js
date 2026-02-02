//=================================================
// FILE: /src/PlayerCore.js
// src/PlayerCore.js
// Optimized v1.0: Delegates logic to OfflineManager, TrackResolver, FavoritesV2.
// Implements T3 requirements: seamless PQ switch, offline playback, stats.

import { getOfflineManager } from '../scripts/offline/offline-manager.js';
import { resolvePlaybackSource } from '../scripts/offline/track-resolver.js';
import { getTrackByUid } from '../scripts/app/track-registry.js';
import FavoritesV2 from '../scripts/core/favorites-v2.js';
import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';

(function () {
  'use strict';

  const W = window;
  const U = W.Utils;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
  const safeStr = (v) => (v ? String(v).trim() : null);

  class PlayerCore {
    constructor() {
      // Playlist State
      this.playlist = [];
      this.originalPlaylist = []; // For shuffle
      this.currentIndex = -1;
      this.shuffleMode = false;
      this.repeatMode = false;
      this.shuffleHistory = [];

      // Audio State
      this.sound = null;
      this.qualityMode = localStorage.getItem('qualityMode:v1') === 'lo' ? 'lo' : 'hi';
      this._loadToken = 0; // Race condition guard

      // Event Bus
      this.callbacks = {
        onTrackChange: [], onPlay: [], onPause: [], onStop: [], 
        onEnd: [], onTick: [], onError: [], onSleepTriggered: []
      };
      this._favSubs = new Set(); // Favorites specific emitter

      // Modules
      this._mediaSession = ensureMediaSession(this._getMediaHandlers());
      this._stats = createListenStatsTracker({
        getUid: () => safeStr(this.getCurrentTrack()?.uid),
        getPos: () => this.getPosition(),
        getDur: () => this.getDuration(),
        record: (uid, p) => getOfflineManager().recordListenStats(uid, p)
      });

      this._setupIOSUnlock();
    }

    initialize() {
      this.isReady = true;
    }

    // --- Playlist Management ---

    setPlaylist(tracks, startIndex = 0, metadata = {}, options = {}) {
      const { preserveOriginalPlaylist, preserveShuffleMode, preservePosition } = options;
      const prevPos = this.getPosition();
      const wasPlaying = this.isPlaying();

      this.playlist = (tracks || []).map(t => ({
        ...t,
        uid: safeStr(t.uid),
        title: t.title || 'Без названия',
        artist: t.artist || 'Витрина Разбита'
      }));

      if (!preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];
      if (this.shuffleMode && !preserveShuffleMode) this.shufflePlaylist();
      else if (!this.shuffleMode) this.shuffleHistory = [];

      this.currentIndex = clamp(startIndex, 0, this.playlist.length - 1);

      if (wasPlaying) {
        this.load(this.currentIndex, { autoPlay: true, resumePosition: preservePosition ? prevPos : 0 });
      } else {
        const cur = this.getCurrentTrack();
        if (cur) {
          this._trigger('onTrackChange', cur, this.currentIndex);
          this._updateMedia();
        }
      }
    }

    getPlaylistSnapshot() { return [...this.playlist]; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getIndex() { return this.currentIndex; }
    getNextIndex() { return (this.currentIndex + 1) % this.playlist.length; }

    // --- Playback Controls ---

    isPlaying() {
      return !!(this.sound && this.sound.playing());
    }

    async play(index, options = {}) {
      if (index !== undefined && index !== null && index !== this.currentIndex) {
        return this.load(index, options);
      }
      if (this.sound) {
        this.sound.play();
      } else if (this.currentIndex >= 0) {
        this.load(this.currentIndex, { autoPlay: true });
      }
    }

    pause() {
      this.sound?.pause();
    }

    stop() {
      this._unload();
      this._trigger('onStop');
      this._updateMedia();
    }

    next() {
      if (!this.playlist.length) return;
      this._addToShuffleHistory();
      this.play((this.currentIndex + 1) % this.playlist.length, { direction: 'forward' });
    }

    prev() {
      if (!this.playlist.length) return;
      if (this.getPosition() > 3) return this.seek(0); // Restart if played > 3s
      
      const histIdx = this._popShuffleHistory();
      if (histIdx >= 0) return this.play(histIdx, { direction: 'backward' });

      const prevIdx = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
      this.play(prevIdx, { direction: 'backward' });
    }

    seek(sec) { this.sound?.seek(sec); }
    
    setVolume(val) { 
      const v = clamp(val / 100, 0, 1);
      Howler.volume(v);
      localStorage.setItem('playerVolume', Math.round(v * 100));
    }
    
    getVolume() { return (Number(localStorage.getItem('playerVolume')) || 100); }
    getPosition() { return this.sound?.seek() || 0; }
    getDuration() { return this.sound?.duration() || 0; }

    // --- Core Loading Logic (Source Resolution) ---

    async load(index, opts = {}) {
      const track = this.playlist[index];
      if (!track) return;

      const token = ++this._loadToken;
      this._unload(true); // silent unload
      this.currentIndex = index;

      // 1. Resolve Source (Network vs Offline)
      const src = await resolvePlaybackSource({
        track, 
        pq: this.qualityMode, 
        cq: await getOfflineManager().getCacheQuality(),
        offlineMode: getOfflineManager().isOfflineMode()
      });

      if (token !== this._loadToken) return; // Race check

      if (!src.url) {
        // T3 7.5: Offline handling (Skip)
        W.NotificationSystem?.warning('Нет доступа к треку (офлайн)');
        // Try next
        const dir = opts.direction === 'backward' ? -1 : 1;
        const nextIdx = (index + dir + this.playlist.length) % this.playlist.length;
        if (nextIdx !== index) this.load(nextIdx, opts);
        return;
      }

      // 2. Init Howler
      this.sound = new Howl({
        src: [src.url],
        html5: !src.isLocal, // Blob URLs require WebAudio (html5:false)
        volume: this.getVolume() / 100,
        format: ['mp3'],
        onload: () => {
          if (token !== this._loadToken) return;
          if (opts.resumePosition) this.seek(opts.resumePosition);
          if (opts.autoPlay) this.sound.play();
          this._updateMedia();
        },
        onplay: () => {
          if (token !== this._loadToken) return;
          this._startTick();
          this._trigger('onPlay', track, index);
          this._updateMedia();
        },
        onpause: () => {
          if (token !== this._loadToken) return;
          this._stopTick();
          this._stats.onPauseOrStop();
          this._trigger('onPause');
          this._updateMedia();
        },
        onend: () => {
          if (token !== this._loadToken) return;
          this._stats.onEnded();
          this._trigger('onEnd');
          if (this.repeatMode) this.play(this.currentIndex);
          else this.next();
        },
        onloaderror: (id, e) => this._trigger('onError', { msg: 'Load error', e }),
        onplayerror: (id, e) => {
           this.sound.once('unlock', () => this.sound.play()); 
        }
      });

      this._trigger('onTrackChange', track, index);
      
      // 3. Notify OfflineManager to update "Window" (PREV/CUR/NEXT cache)
      getOfflineManager().enqueueAudioDownload({
        uid: track.uid, quality: this.qualityMode, priority: 100, kind: 'playbackCache'
      });
    }

    _unload(silent = false) {
      if (this.sound) {
        this.sound.unload();
        this.sound = null;
      }
      this._stopTick();
      this._stats.onPauseOrStop();
      if (!silent) this._trigger('onStop');
    }

    // --- Quality (PQ) ---

    getQualityMode() { return this.qualityMode; }
    
    canToggleQualityForCurrentTrack() {
      const t = this.getCurrentTrack();
      const meta = t ? getTrackByUid(t.uid) : null;
      return !!(meta?.audio_low || meta?.urlLo || t?.sources?.audio?.lo);
    }

    async switchQuality(mode) {
      const next = normQ(mode);
      if (this.qualityMode === next) return;
      
      this.qualityMode = next;
      localStorage.setItem('qualityMode:v1', next);

      const track = this.getCurrentTrack();
      if (track && this.isPlaying()) {
        const pos = this.getPosition();
        this.load(this.currentIndex, { autoPlay: true, resumePosition: pos });
      }
      return { ok: true, mode: next };
    }

    // --- Favorites (Delegated to FavoritesV2) ---

    isFavorite(uid) {
      const likedSet = FavoritesV2.readLikedSet();
      return likedSet.has(safeStr(uid));
    }

    toggleFavorite(uid, opts = {}) {
      const u = safeStr(uid);
      const res = FavoritesV2.toggle(u, { source: opts.fromAlbum ? 'album' : 'favorites' });
      
      this._emitFavChanged({ uid: u, liked: res.liked, albumKey: opts.albumKey });
      
      // T3 Special Rule: If in Favorites view and unlike active -> next
      if (!res.liked && !opts.fromAlbum && W.AlbumsManager?.getPlayingAlbum?.() === W.SPECIAL_FAVORITES_KEY) {
         const cur = this.getCurrentTrack();
         if (cur && safeStr(cur.uid) === u) this.next();
      }
      return res;
    }

    getFavoritesState() {
      const refs = FavoritesV2.readRefsByUid();
      const active = [], inactive = [];
      const liked = FavoritesV2.readLikedSet();
      
      Object.values(refs).forEach(r => {
        const item = { uid: r.uid, sourceAlbum: r.sourceAlbum };
        if (liked.has(r.uid)) active.push(item);
        else inactive.push(item);
      });
      return { active, inactive };
    }

    getLikedUidsForAlbum(albumKey) {
      const all = FavoritesV2.readLikedSet();
      return Array.from(all); 
    }

    onFavoritesChanged(cb) { this._favSubs.add(cb); return () => this._favSubs.delete(cb); }
    _emitFavChanged(d) { this._favSubs.forEach(f => f(d)); }

    // --- Shuffle / Repeat ---

    toggleShuffle() { this.shuffleMode = !this.shuffleMode; this._reshuffle(); }
    isShuffle() { return this.shuffleMode; }
    toggleRepeat() { this.repeatMode = !this.repeatMode; }
    isRepeat() { return this.repeatMode; }

    _reshuffle() {
      if (this.shuffleMode) {
        const cur = this.getCurrentTrack();
        this.playlist = [...this.playlist].sort(() => Math.random() - 0.5);
        if (cur) {
          this.playlist = [cur, ...this.playlist.filter(t => t !== cur)];
          this.currentIndex = 0;
        }
      } else {
        this.playlist = [...this.originalPlaylist];
        const cur = this.getCurrentTrack(); 
        if (cur) this.currentIndex = this.playlist.findIndex(t => t.uid === cur.uid);
      }
    }

    _addToShuffleHistory() {
      if (!this.shuffleMode) return;
      this.shuffleHistory.push(this.currentIndex);
      if (this.shuffleHistory.length > 50) this.shuffleHistory.shift();
    }

    _popShuffleHistory() {
      if (!this.shuffleMode || !this.shuffleHistory.length) return -1;
      return this.shuffleHistory.pop();
    }

    // --- Internals & Events ---

    on(events) { Object.keys(events).forEach(k => this.callbacks[k]?.push(events[k])); }
    _trigger(name, ...args) { this.callbacks[name]?.forEach(fn => fn(...args)); }

    _startTick() {
      this._stopTick();
      this._tickInterval = setInterval(() => {
        this._trigger('onTick', this.getPosition(), this.getDuration());
        this._stats.onTick();
      }, 250);
    }
    _stopTick() { clearInterval(this._tickInterval); }

    _updateMedia() {
      const t = this.getCurrentTrack();
      this._mediaSession.updateMetadata({
        title: t?.title, artist: t?.artist, album: t?.album, artworkUrl: t?.cover, playing: this.isPlaying()
      });
    }

    _getMediaHandlers() {
      return {
        onPlay: () => this.play(), onPause: () => this.pause(),
        onStop: () => this.stop(), onPrev: () => this.prev(), onNext: () => this.next(),
        onSeekTo: (t) => this.seek(t)
      };
    }

    _setupIOSUnlock() {
      const unlock = () => {
        if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume();
      };
      ['touchend', 'click'].forEach(e => document.addEventListener(e, unlock, { once: true }));
    }
    
    // --- Sleep Timer ---
    setSleepTimer(ms) {
      clearTimeout(this._sleepTimer);
      if (ms > 0) {
        this._sleepTimer = setTimeout(() => {
          this.pause();
          this._trigger('onSleepTriggered');
        }, ms);
        this._sleepTarget = Date.now() + ms;
      } else {
        this._sleepTarget = 0;
      }
    }
    getSleepTimerTarget() { return this._sleepTarget || 0; }
    clearSleepTimer() { this.setSleepTimer(0); }
  }

  // Export singleton
  W.playerCore = new PlayerCore();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => W.playerCore.initialize());
  else W.playerCore.initialize();

})();

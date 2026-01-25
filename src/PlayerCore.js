// ✅ Исправленные пути к скриптам в папке scripts/core/
import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';
import FavoritesV2 from '../scripts/core/favorites-v2.js';
import { TrackRegistry } from '../scripts/core/track-registry.js';
import { shuffleArray } from '../scripts/core/utils.js'; // Используем utils из core

(function () {
  'use strict';

  const W = window;
  // Fallback для утилит, если window.Utils еще не загружен (хотя должен быть)
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const safeStr = (v) => String(v ?? '').trim() || null;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  class PlayerCore {
    constructor() {
      this.sound = null;
      this.playlist = [];         
      this.originalPlaylist = []; 
      this.currentIndex = -1;
      this.currentUid = null;
      
      this.isShuffle = false;
      this.isRepeat = false; // false | 'all' | 'one'
      this.isFavOnly = false;

      this.volume = 1.0;
      this._loadToken = 0;

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

      this._favEmitter = { subs: new Set(), emit: (p) => { for(let f of this._favEmitter.subs) f(p); } };
    }

    initialize() {
      this._armIOSUnlock();
      console.log('✅ PlayerCore initialized (Howler v' + (Howler ? Howler.version : '??') + ')');
    }

    // =================================================
    // Playlist & Playback
    // =================================================

    setPlaylist(tracks, startIndex = 0, meta = {}, opts = {}) {
      const wasPlaying = this.isPlaying();
      const prevPos = this.getPosition();

      this.playlist = (tracks || []).map(t => ({
        ...t,
        uid: safeStr(t.uid),
        src: t.url || t.audio || t.src // Нормализация источника
      }));

      if (!opts.preserveOriginalPlaylist) {
        this.originalPlaylist = [...this.playlist];
        this.isFavOnly = false;
      }

      if (this.isShuffle) this.shufflePlaylist();

      const len = this.playlist.length;
      this.currentIndex = (len > 0) ? clamp(startIndex, 0, len - 1) : -1;

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

      // Проверка Offline менеджера на подмену URL (blob)
      let src = track.src;
      if (W.OfflineUI?.offlineManager?.resolveForPlayback) {
         try {
             // Получаем qualityMode синхронно из localStorage или 'hi'
             const pq = localStorage.getItem('qualityMode:v1') || 'hi';
             const res = await W.OfflineUI.offlineManager.resolveForPlayback(track, pq);
             if (res && res.url) src = res.url;
         } catch(e) { console.warn('Offline resolve failed', e); }
      }

      this.sound = new Howl({
        src: [src],
        html5: true, 
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

      if (opts.autoPlay) this.sound.play();
      if (opts.resumePosition) this.sound.seek(opts.resumePosition);

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

    pause() { if (this.sound) this.sound.pause(); }

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
        if (this.getPosition() > 3) return this.seek(0);
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
            else if (!auto) next = 0; 
            else return; 
        }
        this.load(next, { autoPlay: true });
    }

    handleTrackEnd() {
        if (this.isRepeat === 'one') this.play(this.currentIndex);
        else this.next(true);
    }

    // =================================================
    // Features
    // =================================================

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        const curUid = this.currentUid;
        
        if (this.isShuffle) {
            const others = this.originalPlaylist.filter(t => t.uid !== curUid);
            this.playlist = [this.getCurrentTrack(), ...shuffleArray(others)].filter(Boolean);
        } else {
            this.playlist = this.isFavOnly 
                ? this.originalPlaylist.filter(t => this.isFavorite(t.uid))
                : [...this.originalPlaylist];
        }
        
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

        let nextList = [...this.originalPlaylist];
        if (this.isFavOnly) {
            nextList = nextList.filter(t => this.isFavorite(t.uid));
            if (curUid && !this.isFavorite(curUid)) {
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
        
        if (this.currentIndex === -1 && this.playlist.length > 0) {
            this.load(0, { autoPlay: wasPlaying });
        }
        
        return this.isFavOnly;
    }

    // =================================================
    // Utils
    // =================================================

    seek(sec) { if (this.sound) this.sound.seek(sec); }
    setVolume(v) { this.volume = v; if (this.sound) this.sound.volume(v); }
    setMuted(m) { if (this.sound) this.sound.mute(m); }
    
    getPosition() { return this.sound ? this.sound.seek() : 0; }
    getDuration() { return this.sound ? this.sound.duration() : 0; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getPlaylistSnapshot() { return [...this.playlist]; }

    isFavorite(uid) {
        if (!uid) return false;
        try { return FavoritesV2.readLikedSet().has(uid); } catch { return false; }
    }
    
    toggleFavorite(uid, opts) {
        const res = FavoritesV2.toggle(uid, { source: opts?.fromAlbum ? 'album' : 'favorites' });
        this._favEmitter.emit(res);
        return res;
    }
    
    onFavoritesChanged(fn) { 
        this._favEmitter.subs.add(fn); 
        return () => this._favEmitter.subs.delete(fn);
    }

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
            onPlay: () => this.play(), onPause: () => this.pause(), onStop: () => this.stop(),
            onPrev: () => this.prev(), onNext: () => this.next(), onSeekTo: (t) => this.seek(t),
            getPositionState: () => ({ duration: this.getDuration(), position: this.getPosition() })
        };
    }

    _armIOSUnlock() {
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

    getAudioContext() { return Howler.ctx; }
    getMasterGain() { return Howler.masterGain; }

    trigger(evt, ...args) { (this.callbacks[evt] || []).forEach(fn => fn(...args)); }
    on(map) { Object.keys(map).forEach(k => { if (this.callbacks[k]) this.callbacks[k].push(map[k]); }); }
  }

  W.playerCore = new PlayerCore();
  
  // Инициализация после загрузки DOM, чтобы все скрипты успели прогрузиться
  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => W.playerCore.initialize());
  } else {
      W.playerCore.initialize();
  }

})();

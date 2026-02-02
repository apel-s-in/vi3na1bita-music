//=================================================
// FILE: /src/PlayerCore.js
// src/PlayerCore.js
// Optimized v1.2: Correctly handles Favorites removal logic (inactive vs delete).
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
      // Ensure V1 favorites are migrated to V2 on startup
      try { FavoritesV2.ensureMigrated(); } catch (e) { console.warn('Fav migration failed', e); }
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
      
      // T3: Determine context correctly.
      // If we are currently browsing the SPECIAL_FAVORITES_KEY album, 
      // then any toggle is effectively "from favorites view" (source='favorites'),
      // regardless of what the caller passed (unless it's an explicit override).
      
      let source = opts.fromAlbum ? 'album' : 'favorites';
      
      const currentViewAlbum = W.AlbumsManager?.getCurrentAlbum?.();
      if (currentViewAlbum === W.SPECIAL_FAVORITES_KEY) {
        source = 'favorites';
      }

      const res = FavoritesV2.toggle(u, { source });
      
      this._emitFavChanged({ uid: u, liked: res.liked, albumKey: opts.albumKey });
      
      // T3 Special Rule: If in Favorites playing playlist and unlike active -> next
      if (!res.liked && source === 'favorites' && W.AlbumsManager?.getPlayingAlbum?.() === W.SPECIAL_FAVORITES_KEY) {
         const cur = this.getCurrentTrack();
         if (cur && safeStr(cur.uid) === u) this.next();
      }
      return res;
    }

    // Proxy to FavoritesV2 for removal (used by inactive row modal)
    removeInactivePermanently(uid) {
      const u = safeStr(uid);
      const ok = FavoritesV2.removeRef(u);
      if (ok) {
        this._emitFavChanged({ uid: u, liked: false, removed: true });
      }
      return { ok };
    }
    
    // Proxy to restore inactive (used by inactive row modal)
    restoreInactive(uid) {
      // Just toggle it back to liked (source='favorites' or 'album' doesn't matter for liking, it adds back)
      return this.toggleFavorite(uid, { fromAlbum: false });
    }

    showInactiveFavoriteModal(params = {}) {
      const u = safeStr(params?.uid);
      const title = String(params?.title || 'Трек');
      
      if (!W.Modals?.open) return;

      const esc = W.Utils?.escapeHtml ? (s) => W.Utils.escapeHtml(String(s || '')) : (s) => String(s || '');

      const modal = W.Modals.open({
        title: 'Трек неактивен',
        maxWidth: 420,
        bodyHtml: `
          <div style="color:#9db7dd; line-height:1.45; margin-bottom:14px;">
            <div style="margin-bottom:8px;"><strong>Трек:</strong> ${esc(title)}</div>
            <div style="opacity:.9;">Вы можете вернуть трек в ⭐ или удалить его из списка «ИЗБРАННОЕ».</div>
          </div>
          ${W.Modals?.actionRow ? W.Modals.actionRow([
            { act: 'add', text: 'Добавить в ⭐', className: 'online', style: 'min-width:160px;' },
            { act: 'remove', text: 'Удалить', className: '', style: 'min-width:160px;' }
          ]) : ''}
        `
      });

      modal.querySelector('[data-act="add"]')?.addEventListener('click', () => {
        try { modal.remove(); } catch {}
        this.restoreInactive(u);
      });

      modal.querySelector('[data-act="remove"]')?.addEventListener('click', () => {
        try { modal.remove(); } catch {}
        if (W.Modals?.confirm) {
          W.Modals.confirm({
            title: 'Удалить из «ИЗБРАННОГО»?',
            textHtml: `
              <div style="margin-bottom:8px;"><strong>Трек:</strong> ${esc(title)}</div>
              <div style="opacity:.9;">Трек исчезнет из списка «ИЗБРАННОЕ». В родном альбоме ⭐ уже снята.</div>
            `,
            confirmText: 'Удалить',
            cancelText: 'Отмена',
            onConfirm: () => {
              this.removeInactivePermanently(u);
              try { params?.onDeleted?.(); } catch {}
            }
          });
        } else {
          this.removeInactivePermanently(u);
          try { params?.onDeleted?.(); } catch {}
        }
      });
    }

    getFavoritesState() {
      // 1. Get raw V2 data
      const refs = FavoritesV2.readRefsByUid();
      const liked = FavoritesV2.readLikedSet();
      const active = [], inactive = [];
      
      // 2. Resolve missing data (especially sourceAlbum) from TrackRegistry
      Object.values(refs).forEach(r => {
        const u = safeStr(r.uid);
        if (!u) return;

        // Skip if marked as inactive (inactiveAt is set) BUT user is looking for "Active" playlist
        // Actually, UI needs both lists to render gray rows.
        
        let sourceAlbum = safeStr(r.sourceAlbum);
        if (!sourceAlbum) {
          const meta = getTrackByUid(u);
          if (meta) sourceAlbum = safeStr(meta.sourceAlbum);
        }

        const item = { uid: u, sourceAlbum };
        
        // V2 Logic: 
        // Active = is in likedSet
        // Inactive = NOT in likedSet BUT has ref (inactiveAt != null)
        
        if (liked.has(u)) {
          active.push(item);
        } else if (r.inactiveAt) {
          inactive.push(item);
        }
      });

      return { active, inactive };
    }

    getLikedUidsForAlbum(albumKey) {
      const key = safeStr(albumKey);
      if (!key) return [];
      
      const likedSet = FavoritesV2.readLikedSet();
      const result = [];
      
      for (const uid of likedSet) {
        const t = getTrackByUid(uid);
        if (t && safeStr(t.sourceAlbum) === key) {
          result.push(uid);
        }
      }
      return result;
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

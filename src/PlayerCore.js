import { getOfflineManager } from '../scripts/offline/offline-manager.js';
import { resolvePlaybackSource } from '../scripts/offline/track-resolver.js';
import { getTrackByUid } from '../scripts/app/track-registry.js';
import FavoritesV2 from '../scripts/core/favorites-v2.js';
import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';

(function () {
  'use strict';

  const W = window;
  const LS_VOL = 'playerVolume';
  const LS_PQ = 'qualityMode:v1';
  
  const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
  const safeStr = (v) => (v ? String(v).trim() : null);
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  class PlayerCore {
    constructor() {
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentIndex = -1;
      this.shuffleMode = false;
      this.repeatMode = false;
      this.shuffleHistory = [];
      this.sound = null;
      this.qualityMode = normQ(localStorage.getItem(LS_PQ));
      this._loadToken = 0;
      this._ev = new Map();
      this._favSubs = new Set();
      this._sleepTimer = null;
      this._sleepTarget = 0;

      // MediaSession
      this._ms = ensureMediaSession({
        onPlay: () => this.play(), 
        onPause: () => this.pause(),
        onStop: () => this.stop(), 
        onPrev: () => this.prev(), 
        onNext: () => this.next(),
        onSeekTo: (t) => this.seek(t)
      });

      // Stats
      this._stats = createListenStatsTracker({
        getUid: () => safeStr(this.getCurrentTrack()?.uid),
        getPos: () => this.getPosition(),
        getDur: () => this.getDuration(),
        record: (uid, p) => getOfflineManager().recordListenStats(uid, p)
      });

      // iOS Audio Unlocker (Silent Buffer)
      const unlock = () => {
        if (W.Howler?.ctx && W.Howler.ctx.state === 'suspended') {
          W.Howler.ctx.resume().catch(() => {});
        }
        // Создаем пустой буфер и играем его, чтобы iOS "поверил", что мы играем аудио
        // Это позволяет в дальнейшем менять треки в фоне.
        if (!this._unlocked) {
          this._unlocked = true;
          const silent = new Howl({ src: ['data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIWFhYW5uYWFuYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5u//OEAAAAAAAAAAAAAAAAAAAAAAAAMGluZ2QAAAAcAAAABAAAASFycnJyc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nz//OEAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4Ljc2AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], html5: true, volume: 0 });
          silent.play();
        }
      };
      ['touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, unlock, { once: true, capture: true }));
    }

    initialize() { FavoritesV2.ensureMigrated(); }

    prepareContext() {
      if (W.Howler?.ctx?.state === 'suspended') {
        W.Howler.ctx.resume().catch(() => {});
      }
    }

    // --- Playlist Management ---
    setPlaylist(tracks, startIdx = 0, meta, opts = {}) {
      const prevPos = this.getPosition();
      const wasPlaying = this.isPlaying();

      this.playlist = (tracks || []).map(t => ({
        ...t, uid: safeStr(t.uid), title: t.title || 'Без названия', artist: t.artist || 'Витрина Разбита'
      }));

      if (!opts.preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];
      
      if (this.shuffleMode && !opts.preserveShuffleMode) {
        this.shufflePlaylist();
      } else if (!this.shuffleMode) {
        this.shuffleHistory = [];
      }

      this.currentIndex = clamp(startIdx, 0, this.playlist.length - 1);

      if (wasPlaying && opts.preservePosition && this.playlist[this.currentIndex]?.uid === this.getCurrentTrack()?.uid) {
         this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
         this._updMedia();
         return; 
      }

      if (wasPlaying) this.load(this.currentIndex, { autoPlay: true, resumePosition: opts.preservePosition ? prevPos : 0 });
      else {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        this._updMedia();
      }
    }

    getPlaylistSnapshot() { return [...this.playlist]; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getIndex() { return this.currentIndex; }
    getNextIndex() { return (this.currentIndex + 1) % this.playlist.length; }

    // --- Controls ---
    isPlaying() { return !!(this.sound && this.sound.playing()); }

    play(idx, opts = {}) {
      this.prepareContext();

      if (idx != null) {
          if (idx !== this.currentIndex) return this.load(idx, opts);
          // Restart current
          this.seek(0);
          if (!this.isPlaying() && this.sound) this.sound.play();
          return;
      }
      
      // Resume
      if (this.sound) {
        if (!this.isPlaying()) this.sound.play();
      } else if (this.currentIndex >= 0) {
        this.load(this.currentIndex, { autoPlay: true });
      }
    }

    pause() { this.sound?.pause(); }
    
    stop() {
      this._unload();
      this._emit('onStop');
      this._updMedia();
    }

    next() {
      if (!this.playlist.length) return;
      if (this.shuffleMode) {
        this.shuffleHistory.push(this.currentIndex);
        if (this.shuffleHistory.length > 50) this.shuffleHistory.shift();
      }
      const nextIdx = (this.currentIndex + 1) % this.playlist.length;
      this.load(nextIdx, { autoPlay: true, dir: 1 });
    }

    prev() {
      if (!this.playlist.length) return;
      if (this.getPosition() > 3) return this.seek(0);
      
      if (this.shuffleMode && this.shuffleHistory.length) {
        return this.load(this.shuffleHistory.pop(), { autoPlay: true, dir: -1 });
      }
      const prevIdx = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
      this.load(prevIdx, { autoPlay: true, dir: -1 });
    }

    seek(sec) { return this.sound?.seek(sec) || 0; }
    
    setVolume(v) { 
      const vol = clamp(v / 100, 0, 1);
      Howler.volume(vol);
      localStorage.setItem(LS_VOL, Math.round(vol * 100));
    }
    getVolume() { return Number(localStorage.getItem(LS_VOL)) || 100; }
    getPosition() { return this.sound?.seek() || 0; }
    getDuration() { return this.sound?.duration() || 0; }

    // --- Core Loading Logic ---
    async load(index, opts = {}) {
      const track = this.playlist[index];
      if (!track) return;

      const token = ++this._loadToken;
      this.currentIndex = index;
      
      // Notify UI immediately about track change (even before audio loads)
      this._emit('onTrackChange', track, index);

      const om = getOfflineManager();
      
      // Resolve source
      const src = await resolvePlaybackSource({
        track, pq: this.qualityMode, cq: await om.getCacheQuality(), offlineMode: om.isOfflineMode()
      });

      if (token !== this._loadToken) return;

      this._unload(true); // Stop previous

      if (!src.url) {
        W.NotificationSystem?.warning('Нет доступа к треку');
        // Auto-skip logic with delay to prevent CPU spin
        setTimeout(() => {
           if (token === this._loadToken) {
             const nextIdx = (index + (opts.dir || 1) + this.playlist.length) % this.playlist.length;
             if (nextIdx !== index) this.load(nextIdx, opts);
           }
        }, 1000);
        return;
      }

      this.sound = new Howl({
        src: [src.url],
        html5: true, // ✅ ALWAYS TRUE for iOS background audio
        volume: this.getVolume() / 100,
        format: ['mp3'],
        autoplay: !!opts.autoPlay,
        onload: () => {
          if (token !== this._loadToken) return;
          if (opts.resumePosition) this.seek(opts.resumePosition);
          this._updMedia();
        },
        onplay: () => {
          if (token !== this._loadToken) return;
          this._startTick();
          this._emit('onPlay', track, index);
          this._updMedia();
        },
        onpause: () => {
          if (token !== this._loadToken) return;
          this._stopTick();
          this._stats.onPauseOrStop();
          this._emit('onPause');
          this._updMedia();
        },
        onend: () => {
          if (token !== this._loadToken) return;
          this._stats.onEnded();
          this._emit('onEnd');
          // Auto-next
          this.repeatMode ? this.play(this.currentIndex) : this.next();
        },
        onloaderror: (id, e) => {
           console.error('Load Error', e);
           this._emit('onError', { msg: 'Load error', e });
           if (token === this._loadToken) setTimeout(() => this.next(), 1000);
        },
        onplayerror: (id, e) => {
           console.warn('Play Error', e);
           this.sound?.once('unlock', () => this.sound?.play());
        }
      });

      // Trigger prefetch for next track
      om.enqueueAudioDownload({ uid: track.uid, quality: this.qualityMode, priority: 100, kind: 'playbackCache' });
    }

    _unload(silent) {
      if (this.sound) { 
        this.sound.stop(); 
        this.sound.unload(); 
        this.sound = null; 
      }
      this._stopTick();
      this._stats.onPauseOrStop();
      if (!silent) this._emit('onStop');
    }

    // --- Quality ---
    getQualityMode() { return this.qualityMode; }
    
    canToggleQualityForCurrentTrack() {
      const t = this.getCurrentTrack();
      const m = t ? getTrackByUid(t.uid) : null;
      return !!(m?.audio_low || m?.urlLo || t?.sources?.audio?.lo);
    }

    switchQuality(mode) {
      const next = normQ(mode);
      if (this.qualityMode === next) return;
      this.qualityMode = next;
      localStorage.setItem(LS_PQ, next);
      if (this.isPlaying()) this.load(this.currentIndex, { autoPlay: true, resumePosition: this.getPosition() });
    }

    // --- Favorites ---
    isFavorite(uid) { return FavoritesV2.readLikedSet().has(safeStr(uid)); }

    toggleFavorite(uid, opts = {}) {
      const u = safeStr(uid);
      let source = opts.source;
      if (!source) {
         const isFavView = W.AlbumsManager?.getCurrentAlbum?.() === W.SPECIAL_FAVORITES_KEY;
         source = isFavView ? 'favorites' : 'album';
      }
      
      const res = FavoritesV2.toggle(u, { source });
      this._emitFav(u, res.liked, opts.albumKey);

      if (!res.liked && source === 'favorites' && W.AlbumsManager?.getPlayingAlbum?.() === W.SPECIAL_FAVORITES_KEY) {
         if (safeStr(this.getCurrentTrack()?.uid) === u) this.next();
      }
      return res;
    }

    removeInactivePermanently(uid) {
      const u = safeStr(uid);
      if (FavoritesV2.removeRef(u)) this._emitFav(u, false, null, true);
    }
    
    restoreInactive(uid) { return this.toggleFavorite(uid, { fromAlbum: false }); }

    showInactiveFavoriteModal(p = {}) {
      if (!W.Modals?.open) return;
      const u = safeStr(p.uid);
      const esc = W.Utils?.escapeHtml || (s => s);
      const modal = W.Modals.open({
        title: 'Трек неактивен', maxWidth: 420,
        bodyHtml: `
          <div style="color:#9db7dd;margin-bottom:14px">
            <div style="margin-bottom:8px"><strong>${esc(p.title||'Трек')}</strong></div>
            <div style="opacity:.9">Вернуть в ⭐ или удалить из списка?</div>
          </div>
          ${W.Modals.actionRow([{act:'add',text:'Вернуть',className:'online'},{act:'remove',text:'Удалить'}])}
        `
      });
      modal.querySelector('[data-act="add"]')?.addEventListener('click', () => { modal.remove(); this.restoreInactive(u); });
      modal.querySelector('[data-act="remove"]')?.addEventListener('click', () => {
        modal.remove();
        this.removeInactivePermanently(u);
        p.onDeleted?.();
      });
    }

    getFavoritesState() {
      const refs = FavoritesV2.readRefsByUid(), liked = FavoritesV2.readLikedSet();
      const active = [], inactive = [];
      Object.values(refs).forEach(r => {
        const u = safeStr(r.uid);
        if(!u) return;
        const sa = safeStr(r.sourceAlbum || getTrackByUid(u)?.sourceAlbum);
        (liked.has(u) ? active : (r.inactiveAt ? inactive : [])).push({ uid: u, sourceAlbum: sa });
      });
      return { active, inactive };
    }

    getLikedUidsForAlbum(key) {
      const k = safeStr(key);
      if (!k) return [];
      return Array.from(FavoritesV2.readLikedSet()).filter(u => safeStr(getTrackByUid(u)?.sourceAlbum) === k);
    }

    onFavoritesChanged(cb) { this._favSubs.add(cb); return () => this._favSubs.delete(cb); }
    _emitFav(uid, liked, albumKey, removed = false) { this._favSubs.forEach(f => f({ uid, liked, albumKey, removed })); }

    toggleShuffle() {
      this.shuffleMode = !this.shuffleMode;
      if (this.shuffleMode) {
        const cur = this.getCurrentTrack();
        this.playlist.sort(() => Math.random() - 0.5);
        if (cur) {
          this.playlist = [cur, ...this.playlist.filter(t => t !== cur)];
          this.currentIndex = 0;
        }
      } else {
        const uid = this.getCurrentTrack()?.uid;
        this.playlist = [...this.originalPlaylist];
        if (uid) this.currentIndex = this.playlist.findIndex(t => t.uid === uid);
      }
    }
    isShuffle() { return this.shuffleMode; }
    toggleRepeat() { this.repeatMode = !this.repeatMode; }
    isRepeat() { return this.repeatMode; }

    on(evs) { Object.entries(evs).forEach(([k, fn]) => { if(!this._ev.has(k)) this._ev.set(k, new Set()); this._ev.get(k).add(fn); }); }
    _emit(name, ...args) { this._ev.get(name)?.forEach(fn => fn(...args)); }

    _startTick() {
      this._stopTick();
      this._tickInt = setInterval(() => {
        this._emit('onTick', this.getPosition(), this.getDuration());
        this._stats.onTick();
      }, 250);
    }
    _stopTick() { clearInterval(this._tickInt); }

    _updMedia() {
      const t = this.getCurrentTrack();
      this._ms.updateMetadata({ title: t?.title, artist: t?.artist, album: t?.album, artworkUrl: t?.cover, playing: this.isPlaying() });
    }

    setSleepTimer(ms) {
      clearTimeout(this._sleepTimer);
      this._sleepTarget = ms > 0 ? Date.now() + ms : 0;
      if (ms > 0) this._sleepTimer = setTimeout(() => { this.pause(); this._emit('onSleepTriggered'); }, ms);
    }
    getSleepTimerTarget() { return this._sleepTarget; }
    clearSleepTimer() { this.setSleepTimer(0); }
  }

  W.playerCore = new PlayerCore();
  const boot = () => W.playerCore.initialize();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();

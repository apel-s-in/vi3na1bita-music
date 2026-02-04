import { getOfflineManager } from '../scripts/offline/offline-manager.js';
import { resolvePlaybackSource } from '../scripts/offline/track-resolver.js';
import { getTrackByUid } from '../scripts/app/track-registry.js';
import { Favorites } from '../scripts/core/favorites-manager.js';
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
      
      this._skipSession = { token: 0, count: 0, max: 0 };

      this._ms = ensureMediaSession({
        onPlay: () => this.play(), 
        onPause: () => this.pause(),
        onStop: () => this.pause(), 
        onPrev: () => this.prev(), 
        onNext: () => this.next(),
        onSeekTo: (t) => this.seek(t)
      });

      this._stats = createListenStatsTracker({
        getUid: () => safeStr(this.getCurrentTrack()?.uid),
        getPos: () => this.getPosition(),
        getDur: () => this.getDuration(),
        record: (uid, p) => getOfflineManager().recordListenStats(uid, p)
      });

      // iOS Unlock
      const unlock = () => {
        if (W.Howler?.ctx && W.Howler.ctx.state === 'suspended') {
          W.Howler.ctx.resume().catch(() => {});
        }
        if (!this._unlocked) {
          this._unlocked = true;
          const silent = new Howl({ src: ['data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIWFhYW5uYWFuYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5u//OEAAAAAAAAAAAAAAAAAAAAAAAAMGluZ2QAAAAcAAAABAAAASFycnJyc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nz//OEAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4Ljc2AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], html5: true, volume: 0 });
          silent.play();
        }
      };
      ['touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, unlock, { once: true, capture: true }));
    }

    initialize() {
      if (Favorites && Favorites.init) Favorites.init();
    }

    prepareContext() {
      if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(() => {});
    }

    setPlaylist(tracks, startIdx = 0, meta, opts = {}) {
      const prevPos = this.getPosition();
      const wasPlaying = this.isPlaying();

      this.playlist = (tracks || []).map(t => ({
        ...t, uid: safeStr(t.uid), title: t.title || 'Без названия', artist: t.artist || 'Витрина Разбита'
      }));

      if (!opts.preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];

      // Сначала ставим индекс корректно
      this.currentIndex = clamp(startIdx, 0, this.playlist.length - 1);
      const targetUid = this.playlist[this.currentIndex]?.uid;

      if (this.shuffleMode && !opts.preserveShuffleMode) {
        this.shufflePlaylist(targetUid);
      } else if (!this.shuffleMode) {
        this.shuffleHistory = [];
      } else if (this.shuffleMode && opts.preserveShuffleMode && targetUid) {
        const newIdx = this.playlist.findIndex(t => t.uid === targetUid);
        if (newIdx >= 0) this.currentIndex = newIdx;
      }

      this._skipSession = { token: 0, count: 0, max: this.playlist.length };

      if (wasPlaying) this.load(this.currentIndex, { autoPlay: true, resumePosition: opts.preservePosition ? prevPos : 0 });
      else {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        this._updMedia();
      }
    }

    shufflePlaylist(keepFirstUid = null) {
      const currentUid = keepFirstUid || this.getCurrentTrack()?.uid;
      for (let i = this.playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
      }
      if (currentUid) {
        const idx = this.playlist.findIndex(t => t.uid === currentUid);
        if (idx >= 0) {
          const [track] = this.playlist.splice(idx, 1);
          this.playlist.unshift(track);
          this.currentIndex = 0;
        }
      } else {
        this.currentIndex = 0;
      }
    }

    getPlaylistSnapshot() { return [...this.playlist]; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getIndex() { return this.currentIndex; }
    getNextIndex() { return (this.currentIndex + 1) % this.playlist.length; }

    isPlaying() { return !!(this.sound && this.sound.playing()); }

    play(idx, opts = {}) {
      this.prepareContext();
      if (idx != null) {
          if (idx === this.currentIndex) return; // A2: Ничего не делать при повторном клике
          return this.load(idx, opts);
      }
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

    async load(index, opts = {}) {
      const track = this.playlist[index];
      if (!track) return;

      const token = ++this._loadToken;
      this.currentIndex = index;
      
      if (!opts.isAutoSkip) this._skipSession = { token, count: 0, max: this.playlist.length };

      const om = getOfflineManager();
      const src = await resolvePlaybackSource({
        track, pq: this.qualityMode, cq: await om.getCacheQuality(), offlineMode: om.isOfflineMode()
      });

      if (token !== this._loadToken) return;

      this._emit('onTrackChange', track, index);
      this._unload(true);

      if (!src.url) {
        // A1: Не уходим в stop/unload при ошибке сети, остаемся в текущем состоянии ожидания
        // C1: Это состояние "сеть недоступна" для данного трека
        if (this._skipSession.count >= this._skipSession.max || getOfflineManager().isOfflineMode()) {
           W.NotificationSystem?.error('Трек недоступен (проверьте сеть)');
           // Не делаем _unload(true), чтобы сохранить контекст UI
           this._stopTick(); // I2: Остановить статистику
           return;
        }
        // Мягкий автоскип только если это не явный offline режим
        W.NotificationSystem?.warning('Трек недоступен, поиск...');
        setTimeout(() => {
           if (token === this._loadToken) {
             this._skipSession.count++;
             const nextIdx = (index + (opts.dir || 1) + this.playlist.length) % this.playlist.length;
             if (nextIdx !== index) this.load(nextIdx, { ...opts, isAutoSkip: true });
           }
        }, 500); 
        return;
      }

      this._skipSession.count = 0;

      this.sound = new Howl({
        src: [src.url],
        html5: true,
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
          this.repeatMode ? this.play(this.currentIndex) : this.next();
        },
        onloaderror: (id, e) => {
           console.error('Load Error', e);
           if (token === this._loadToken) {
             setTimeout(() => {
                this._skipSession.count++;
                this.next();
             }, 1000);
           }
        },
        onplayerror: (id, e) => {
           this.sound?.once('unlock', () => this.sound?.play());
        }
      });

      if (track.uid) {
        om.enqueueAudioDownload({ uid: track.uid, quality: this.qualityMode, priority: 100, kind: 'playbackCache' });
      }
    }

    _unload(silent) {
      if (this.sound) { 
        try { this.sound.stop(); } catch {}
        try { this.sound.unload(); } catch {}
        this.sound = null; 
      }
      this._stopTick();
      this._stats.onPauseOrStop();
      if (!silent) this._emit('onStop');
    }

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
      window.dispatchEvent(new CustomEvent('offline:uiChanged'));
      // B1: Тихое переключение без форса play
      const wasPlaying = this.isPlaying();
      this.load(this.currentIndex, { autoPlay: wasPlaying, resumePosition: this.getPosition() });
    }

    isFavorite(uid) { return Favorites.isLiked(safeStr(uid)); }

    toggleFavorite(uid, opts = {}) {
      const u = safeStr(uid);
      
      let source = opts.source;
      if (!source) {
         if (opts.fromAlbum) {
             source = 'album';
         } else {
             const isFavView = W.AlbumsManager?.getCurrentAlbum?.() === W.SPECIAL_FAVORITES_KEY;
             source = isFavView ? 'favorites' : 'album';
         }
      }
      
      const liked = Favorites.toggle(u, { source, albumKey: opts.albumKey });
      this._emitFav(u, liked, opts.albumKey);

      if (!liked && source === 'favorites' && W.AlbumsManager?.getCurrentAlbum?.() === W.SPECIAL_FAVORITES_KEY) {
         if (safeStr(this.getCurrentTrack()?.uid) === u) {
            const hasActive = Favorites.getSnapshot().some(i => !i.inactiveAt);
            if (!hasActive) this.stop();
            else if (!this.repeatMode) this.next();
         }
      }
      return { liked };
    }

    removeInactivePermanently(uid) {
      const u = safeStr(uid);
      if (Favorites.remove(u)) this._emitFav(u, false, null, true);
    }
    
    restoreInactive(uid) { return this.toggleFavorite(uid, { source: 'favorites' }); }

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
      const items = Favorites.getSnapshot();
      const active = [], inactive = [];
      items.forEach(item => {
        const u = safeStr(item.uid);
        if (!u) return;
        const sa = safeStr(item.sourceAlbum || item.albumKey || getTrackByUid(u)?.sourceAlbum);
        if (item.inactiveAt) inactive.push({ uid: u, sourceAlbum: sa, inactiveAt: item.inactiveAt });
        else active.push({ uid: u, sourceAlbum: sa });
      });
      return { active, inactive };
    }

    getLikedUidsForAlbum(key) {
      const k = safeStr(key);
      if (!k) return [];
      return Favorites.getSnapshot()
        .filter(i => !i.inactiveAt && safeStr(getTrackByUid(i.uid)?.sourceAlbum) === k)
        .map(i => i.uid);
    }

    onFavoritesChanged(cb) { this._favSubs.add(cb); return () => this._favSubs.delete(cb); }
    _emitFav(uid, liked, albumKey, removed = false) { this._favSubs.forEach(f => f({ uid, liked, albumKey, removed })); }

    toggleShuffle() {
      this.shuffleMode = !this.shuffleMode;
      if (this.shuffleMode) {
        this.shufflePlaylist();
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

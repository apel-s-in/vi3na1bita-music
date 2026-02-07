// src/PlayerCore.js
import { getOfflineManager } from '../scripts/offline/offline-manager.js';
import { resolveTrackUrl } from '../scripts/offline/track-resolver.js';
import { registerTrack, getTrackByUid } from '../scripts/app/track-registry.js';
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

      window.addEventListener('offline:uiChanged', () => {
        this.qualityMode = normQ(localStorage.getItem(LS_PQ));
      });
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
        recordTick: (uid, p) => getOfflineManager().recordTickStats(uid, p),
        recordEnd:  (uid, p) => getOfflineManager().registerFullListen(uid, p)
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

      const currentTrack = this.getCurrentTrack();
      const sameTrack = currentTrack && this.sound && currentTrack.uid === targetUid;

      if (sameTrack && wasPlaying && opts.preservePosition) {
          this._emit('onTrackChange', currentTrack, this.currentIndex);
          this._updMedia();
      } else {
          if (wasPlaying) this.load(this.currentIndex, { autoPlay: true, resumePosition: opts.preservePosition ? prevPos : 0 });
          else {
            this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
            this._updMedia();
          }
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
          if (idx === this.currentIndex && this.sound) {
             if (!this.isPlaying()) this.sound.play();
             return;
          }
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
      localStorage.setItem(LS_VOL, Math.round(vol * 100));
      if (!this._muted) Howler.volume(vol);
    }
    getVolume() { return Number(localStorage.getItem(LS_VOL)) || 100; }

    setMuted(muted) {
      this._muted = !!muted;
      Howler.volume(this._muted ? 0 : this.getVolume() / 100);
    }
    isMuted() { return !!this._muted; }
    getPosition() { return this.sound?.seek() || 0; }
    getDuration() { return this.sound?.duration() || 0; }

    getCurrentTrackUid() { return safeStr(this.getCurrentTrack()?.uid); }

    async load(index, opts = {}) {
      const track = this.playlist[index];
      if (!track) return;

      const token = ++this._loadToken;
      this.currentIndex = index;
      
      if (!opts.isAutoSkip) this._skipSession = { token, count: 0, max: this.playlist.length };

      // Resolve URL (v2.0 Logic)
      const trackMeta = getTrackByUid(track.uid);
      const originalUrl = track.src || track.audio || trackMeta?.audio || null;
      
      // Update quality from storage just in case
      this.qualityMode = normQ(localStorage.getItem(LS_PQ));

      let res;
      try {
        // Collect all potential sources
        const trackDataForResolve = {
          audio: trackMeta?.audio || track.src || track.audio || originalUrl,
          audio_low: trackMeta?.audio_low || track.audio_low || null,
          src: originalUrl
        };
        
        // Resolver handles Priorities: Local(Hi) > Local(Lo) > Stream(NetPolicy)
        const resolved = await resolveTrackUrl(track.uid, trackDataForResolve);

        // Fallback Logic (Anchor B): If resolver failed (e.g. offline policy blocked, but we want to try direct?)
        // No, if resolver says unavailable, we trust it (it checks NetPolicy).
        // Exception: If we are in "unknown" state or resolver errored.
        
        if (resolved.url) {
            res = {
                url: resolved.url,
                isLocal: resolved.source === 'local',
                effectiveQuality: resolved.quality,
                _blobUrl: resolved._blobUrl
            };
        } else {
            // Last resort: if online, try original URL direct (bypass policies? No, adhere to policy)
            // We return null URL to trigger skip logic below
            res = { url: null, isLocal: false, _blobUrl: false };
        }
      } catch (e) {
        console.warn('[PlayerCore] resolve error:', e);
        res = { url: null, isLocal: false, _blobUrl: false };
      }
      
      if (token !== this._loadToken) return;

      this._emit('onTrackChange', track, index);

      /* Диспатч window event для PlaybackCache и других подписчиков */
      try {
        window.dispatchEvent(new CustomEvent('player:trackChanged', {
          detail: { uid: safeStr(track?.uid), trackData: track, direction: opts.dir || 0 }
        }));
      } catch (e) { /* silent */ }

      // --- Сценарий отсутствия src.url (ТЗ 7.5.3) ---
      if (!res.url) {
        // Автоскип к следующему доступному треку
        if (this._skipSession.count >= this._skipSession.max) {
           W.NotificationSystem?.error('Нет доступных треков');
           this.pause();
           this._stopTick();
           return;
        }
        
        console.warn(`[Player] Source missing for ${track.uid}, skipping...`);
        
        setTimeout(() => {
           if (token === this._loadToken) {
             this._skipSession.count++;
             const nextIdx = (index + (opts.dir || 1) + this.playlist.length) % this.playlist.length;
             if (nextIdx !== index) this.load(nextIdx, { ...opts, autoPlay: true, isAutoSkip: true });
           }
        }, 100);
        return;
      }

      // --- Hot Swap Logic (ТЗ 4.3) ---
      const isHotSwap = !!opts.isHotSwap;
      const oldSound = this.sound; 

      if (!isHotSwap) this._unload(true);

      // ТЗ 14.1: WebAudio backend для офлайна (isLocal), HTML5 для стриминга
      const useHtml5 = !res.isLocal;

      const newSound = new Howl({
        src: [res.url],
        html5: useHtml5,
        volume: this.getVolume() / 100,
        format: ['mp3'],
        autoplay: !!opts.autoPlay,
        onload: () => {
          if (token !== this._loadToken) { newSound.unload(); return; }
          
          // Hot Swap: выгружаем старый только после готовности нового
          if (isHotSwap && oldSound) {
              try { oldSound.unload(); } catch(e) { console.warn('HotSwap unload err', e); }
          }

          if (opts.resumePosition) newSound.seek(opts.resumePosition);
          this._updMedia();
        },
        onplay: () => {
          if (token !== this._loadToken) { newSound.stop(); return; }
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
          /* Диспатч window event для PlaybackCache */
          try {
            const _endedTrack = this.getCurrentTrack();
            window.dispatchEvent(new CustomEvent('player:trackEnded', {
              detail: {
                uid: safeStr(_endedTrack?.uid),
                duration: this.getDuration() || 0,
                position: this.getPosition() || 0
              }
            }));
          } catch (e) { /* silent */ }
          this.repeatMode ? this.play(this.currentIndex) : this.next();
        },
        onloaderror: (id, e) => {
           console.error('Load Error', e);
           if (isHotSwap && oldSound) {
              try { oldSound.unload(); } catch(ex) {}
           }
           if (token === this._loadToken && !res.isLocal) {
              W.NotificationSystem?.warning('Ошибка сети, следующая...');
              setTimeout(() => this.next(), 1000);
           }
        }
      });

      this.sound = newSound;
    }

    _unload(silent) {
      /* Revoke blob URL если был local (ТЗ 14.2) */
      const curTrack = this.getCurrentTrack();
      if (curTrack?.uid && W.Utils?.blob?.revokeUrl) {
        W.Utils.blob.revokeUrl('player_' + curTrack.uid);
      }

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

      /* ТЗ 4.3: Уведомить OfflineManager и все подписчики */
      window.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: next } }));
      window.dispatchEvent(new CustomEvent('offline:uiChanged'));
      
      // ТЗ 4.3 шаг 3: Hot swap текущего трека (без stop, сохранение pos)
      if (this.currentIndex >= 0 && this.sound) {
          const wasPlaying = this.isPlaying();
          const pos = this.getPosition();
          this.load(this.currentIndex, { 
              autoPlay: wasPlaying, 
              resumePosition: pos, 
              isHotSwap: true 
          });
          // ТЗ 4.3: Toast
          W.NotificationSystem?.info?.(`Качество переключено на ${next === 'hi' ? 'Hi' : 'Lo'}`);
      }
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
        const pos = this.getPosition();
        const dur = this.getDuration();
        this._emit('onTick', pos, dur);
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

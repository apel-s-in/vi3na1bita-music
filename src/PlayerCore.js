// src/PlayerCore.js
import { getTrackByUid } from '../scripts/app/track-registry.js';
import { Favorites } from '../scripts/core/favorites-manager.js';
import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';

(function () {
  'use strict';

  const W = window;

  const LS_VOL = 'playerVolume';
  const LS_PQ = 'qualityMode:v1';

  const clamp = (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b);
  const s = (v) => (v == null ? '' : String(v)).trim();
  const uidOf = (v) => s(v) || null;
  const qNorm = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');

  const toast = (msg, type = 'info', ms) => W.NotificationSystem?.show?.(msg, type, ms);

  const netAllowed = () => (W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine) === true;

  const trackHasLo = (t) => {
    const m = t?.uid ? getTrackByUid(t.uid) : null;
    return !!(m?.audio_low || m?.urlLo || t?.sources?.audio?.lo || m?.sources?.audio?.lo);
  };

  const resolvePlayback = async (uid, quality, fallbackUrl) => {
    const resolver = W.TrackResolver?.resolve;
    if (!resolver) return { source: 'stream', url: fallbackUrl || null, blob: null, quality, localKind: 'none' };
    return resolver(uid, quality);
  };

  class PlayerCore {
    constructor() {
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentIndex = -1;

      this.shuffleMode = false;
      this.repeatMode = false;
      this.shuffleHistory = [];

      this.sound = null;
      this.qualityMode = qNorm(localStorage.getItem(LS_PQ));
      this._muted = false;

      this._loadToken = 0;
      this._tickInt = null;

      this._ev = new Map();
      this._favSubs = new Set();

      this._sleepTimer = null;
      this._sleepTarget = 0;

      this._skipSession = { token: 0, count: 0, max: 0 };

      W.addEventListener('offline:uiChanged', () => {
        this.qualityMode = qNorm(localStorage.getItem(LS_PQ));
      });

      this._ms = ensureMediaSession({
        onPlay: () => this.play(),
        onPause: () => this.pause(),
        onStop: () => this.stop(),
        onPrev: () => this.prev(),
        onNext: () => this.next(),
        onSeekTo: (t) => this.seek(t)
      });

      this._stats = createListenStatsTracker({
        getUid: () => uidOf(this.getCurrentTrack()?.uid),
        getPos: () => this.getPosition(),
        getDur: () => this.getDuration(),
        recordTick: (uid, p) => W.OfflineManager?.recordTickStats?.(uid, p),
        recordEnd: (uid, p) => W.OfflineManager?.registerFullListen?.(uid, p)
      });

      this._bindIOSUnlock();
    }

    initialize() {
      if (Favorites?.init) Favorites.init();
    }

    _bindIOSUnlock() {
      const unlock = () => {
        if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(() => {});
        if (this._unlocked) return;
        this._unlocked = true;

        // one silent play to unlock audio on iOS
        try {
          const silent = new Howl({
            src: [
              'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIWFhYW5uYWFuYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5u//OEAAAAAAAAAAAAAAAAAAAAAAAAMGluZ2QAAAAcAAAABAAAASFycnJyc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nz//OEAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4Ljc2AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
            ],
            html5: true,
            volume: 0
          });
          silent.play();
        } catch {}
      };

      ['touchend', 'click', 'keydown'].forEach((ev) => {
        document.addEventListener(ev, unlock, { once: true, capture: true });
      });
    }

    prepareContext() {
      if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(() => {});
    }

    // =========================
    // Playlist
    // =========================

    setPlaylist(tracks, startIdx = 0, meta, opts = {}) {
      const prevPos = this.getPosition();
      const wasPlaying = this.isPlaying();

      this.playlist = (tracks || []).map((t) => ({
        ...t,
        uid: uidOf(t.uid),
        title: t.title || 'Без названия',
        artist: t.artist || 'Витрина Разбита'
      }));

      if (!opts.preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];

      this.currentIndex = clamp(startIdx, 0, this.playlist.length - 1);
      const targetUid = this.playlist[this.currentIndex]?.uid;

      if (this.shuffleMode && !opts.preserveShuffleMode) {
        this.shufflePlaylist(targetUid);
      } else if (!this.shuffleMode) {
        this.shuffleHistory = [];
      } else if (this.shuffleMode && opts.preserveShuffleMode && targetUid) {
        const newIdx = this.playlist.findIndex((t) => t.uid === targetUid);
        if (newIdx >= 0) this.currentIndex = newIdx;
      }

      this._skipSession = { token: 0, count: 0, max: this.playlist.length };

      const cur = this.getCurrentTrack();
      const sameTrack = !!(cur && this.sound && cur.uid === targetUid);

      if (sameTrack && wasPlaying && opts.preservePosition) {
        this._emit('onTrackChange', cur, this.currentIndex);
        this._updMedia();
        return;
      }

      if (wasPlaying) {
        this.load(this.currentIndex, {
          autoPlay: true,
          resumePosition: opts.preservePosition ? prevPos : 0
        });
      } else {
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
        const idx = this.playlist.findIndex((t) => t.uid === currentUid);
        if (idx >= 0) {
          const [trk] = this.playlist.splice(idx, 1);
          this.playlist.unshift(trk);
          this.currentIndex = 0;
        }
      } else {
        this.currentIndex = 0;
      }
    }

    getPlaylistSnapshot() { return [...this.playlist]; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getIndex() { return this.currentIndex; }
    getNextIndex() { return this.playlist.length ? (this.currentIndex + 1) % this.playlist.length : -1; }
    getCurrentTrackUid() { return uidOf(this.getCurrentTrack()?.uid); }

    // =========================
    // Playback controls
    // =========================

    isPlaying() { return !!(this.sound && this.sound.playing()); }

    play(idx, opts = {}) {
      this.prepareContext();

      if (idx != null) {
        if (idx === this.currentIndex && this.sound) {
          if (!this.isPlaying()) this.sound.play();
          return;
        }
        this.load(idx, opts);
        return;
      }

      if (this.sound) {
        if (!this.isPlaying()) this.sound.play();
      } else if (this.currentIndex >= 0) {
        this.load(this.currentIndex, { autoPlay: true });
      }
    }

    pause() { this.sound?.pause(); }

    stop() {
      this._unload(false);
      this._updMedia();
    }

    next() {
      if (!this.playlist.length) return;
      this._stats.onSkip();

      if (this.shuffleMode) {
        this.shuffleHistory.push(this.currentIndex);
        if (this.shuffleHistory.length > 50) this.shuffleHistory.shift();
      }

      const nextIdx = (this.currentIndex + 1) % this.playlist.length;
      this.load(nextIdx, { autoPlay: true, dir: 1 });
    }

    prev() {
      if (!this.playlist.length) return;
      if (this.getPosition() > 3) return void this.seek(0);

      this._stats.onSkip();

      if (this.shuffleMode && this.shuffleHistory.length) {
        this.load(this.shuffleHistory.pop(), { autoPlay: true, dir: -1 });
        return;
      }

      const prevIdx = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
      this.load(prevIdx, { autoPlay: true, dir: -1 });
    }

    seek(sec) { return this.sound?.seek(sec) || 0; }
    getPosition() { return this.sound?.seek() || 0; }
    getDuration() { return this.sound?.duration() || 0; }

    setVolume(v) {
      const vol01 = clamp((Number(v) || 0) / 100, 0, 1);
      localStorage.setItem(LS_VOL, String(Math.round(vol01 * 100)));
      if (!this._muted) Howler.volume(vol01);
    }

    getVolume() { return Number(localStorage.getItem(LS_VOL)) || 100; }

    setMuted(muted) {
      this._muted = !!muted;
      Howler.volume(this._muted ? 0 : this.getVolume() / 100);
    }

    isMuted() { return !!this._muted; }

    // =========================
    // Load track (NO STOP by errors)
    // =========================

    async load(index, opts = {}) {
      const track = this.playlist[index];
      if (!track) return;

      const token = ++this._loadToken;
      this.currentIndex = index;

      if (!opts.isAutoSkip) this._skipSession = { token, count: 0, max: this.playlist.length };

      const dir = Number(opts.dir || 1) || 1;
      const q = this.qualityMode;
      const uid = uidOf(track.uid);

      // UI update early (as before)
      this._emit('onTrackChange', track, index);
      W.dispatchEvent(new CustomEvent('player:trackChanged', { detail: { uid, dir } }));

      // Resolve url/blob via TrackResolver (OfflineManager-aware)
      let resolved = null;
      try {
        resolved = await resolvePlayback(uid, q, track.src || null);
      } catch (e) {
        console.warn('[Player] resolve failed:', e);
      }

      if (token !== this._loadToken) return;

      // Build URL (local blob or network)
      let url = null;
      let isLocal = false;

      if ((resolved?.source === 'local' || resolved?.source === 'cache') && resolved?.blob) {
        url = W.Utils?.blob?.createUrl
          ? W.Utils.blob.createUrl('player_' + uid, resolved.blob)
          : URL.createObjectURL(resolved.blob);
        isLocal = true;
      } else if ((resolved?.source === 'stream' || resolved?.source === 'network') && resolved?.url) {
        // Respect NetPolicy: if blocked, behave like "no source" (skip logic), but never stop/pause.
        if (W.NetPolicy && !W.NetPolicy.isNetworkAllowed()) {
          url = null;
        } else {
          url = resolved.url;
          isLocal = false;

          // Cellular streaming toast (spec-driven) — only when streaming, not local
          if (W.Utils?.getNet && W.NetPolicy?.shouldShowCellularToast?.()) {
            const net = W.Utils.getNet();
            if (net.kind === 'cellular') toast('Воспроизведение через мобильную сеть', 'info');
          }
        }
      }

      // If no url: silent skip WITHOUT pause/stop (PlayBack Safety)
      if (!url) {
        if (this._skipSession.count >= this._skipSession.max) {
          toast('Нет доступных треков (проверьте сеть)', 'error');
          this._emit('onPlaybackError', { reason: 'no_source' });
          return;
        }

        setTimeout(() => {
          if (token !== this._loadToken) return;
          this._skipSession.count++;
          const len = this.playlist.length || 1;
          const nextIdx = (index + dir + len) % len;
          if (nextIdx !== index) this.load(nextIdx, { ...opts, autoPlay: true, isAutoSkip: true, dir });
        }, 80);

        return;
      }

      const wasPlaying = this.isPlaying();
      const resumePosition = Number(opts.resumePosition || 0) || 0;
      const autoPlay = opts.autoPlay != null ? !!opts.autoPlay : wasPlaying;

      // Hot swap: unload silently (no onStop)
      const oldSound = this.sound;
      this._unload(true);

      const newSound = new Howl({
        src: [url],
        html5: false, // v1.0: WebAudio backend + blob/objectURL
        volume: this.getVolume() / 100,
        format: ['mp3'],
        autoplay: autoPlay,

        onload: () => {
          if (token !== this._loadToken) {
            try { newSound.unload(); } catch {}
            return;
          }
          if (resumePosition > 0) {
            try { newSound.seek(resumePosition); } catch {}
          }
          this._updMedia();
        },

        onplay: () => {
          if (token !== this._loadToken) {
            try { newSound.stop(); } catch {}
            return;
          }
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
          this._updMedia();
          if (this.repeatMode) this.play(this.currentIndex);
          else this.next();
        },

        // ВАЖНО: никаких next()/stop()/pause() по ошибке сети
        onloaderror: (id, e) => {
          console.error('Load Error', e);
          // OfflinePlayback может перехватить pc.load (в своём модуле) — здесь не вмешиваемся.
          this._emit('onPlaybackError', { reason: 'loaderror' });
        }
      });

      this.sound = newSound;

      // Old sound unloaded. Blob URL lifecycle is safely managed by Utils.blob LRU.
      void oldSound;
      void isLocal;
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

    _startTick() {
      this._stopTick();
      this._tickInt = setInterval(() => {
        const pos = this.getPosition();
        const dur = this.getDuration();
        this._emit('onTick', pos, dur);
        this._stats.onTick();
      }, 250);
    }

    _stopTick() {
      if (this._tickInt) clearInterval(this._tickInt);
      this._tickInt = null;
    }

    _updMedia() {
      const t = this.getCurrentTrack();
      try {
        this._ms?.updateMetadata?.({
          title: t?.title,
          artist: t?.artist,
          album: t?.album,
          artworkUrl: t?.cover,
          playing: this.isPlaying()
        });
      } catch {}
    }

    // =========================
    // Quality (unified qualityMode:v1)
    // =========================

    canToggleQualityForCurrentTrack() {
      const t = this.getCurrentTrack();
      return !!t && trackHasLo(t);
    }

    async switchQuality(mode) {
      const next = qNorm(mode);
      if (this.qualityMode === next) return;

      // UI must show selected quality even if effective differs; keep single LS.
      this.qualityMode = next;
      localStorage.setItem(LS_PQ, next);

      W.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: next } }));
      W.dispatchEvent(new CustomEvent('offline:uiChanged'));

      // Hot swap current track, but only if we have access to network or local resolver provides it.
      if (this.currentIndex < 0 || !this.sound) return;

      const wasPlaying = this.isPlaying();
      const pos = this.getPosition();

      this.load(this.currentIndex, { autoPlay: wasPlaying, resumePosition: pos, dir: 1 });
      toast(`Качество переключено на ${next === 'hi' ? 'Hi' : 'Lo'}`, 'info');
    }

    // =========================
    // Favorites (strict rules)
    // =========================

    isFavorite(uid) { return Favorites.isLiked(uidOf(uid)); }

    toggleFavorite(uid, opts = {}) {
      const u = uidOf(uid);
      if (!u) return { liked: false };

      let source = opts.source;
      if (!source) {
        if (opts.fromAlbum) source = 'album';
        else {
          const isFavView = W.AlbumsManager?.getCurrentAlbum?.() === W.SPECIAL_FAVORITES_KEY;
          source = isFavView ? 'favorites' : 'album';
        }
      }

      const liked = Favorites.toggle(u, { source, albumKey: opts.albumKey });
      this._emitFav(u, liked, opts.albumKey);

      // Единственный разрешённый STOP сценарий из “Избранного”
      if (!liked && source === 'favorites' && W.AlbumsManager?.getCurrentAlbum?.() === W.SPECIAL_FAVORITES_KEY) {
        if (uidOf(this.getCurrentTrack()?.uid) === u) {
          const hasActive = Favorites.getSnapshot().some((i) => !i.inactiveAt);
          if (!hasActive) this.stop();
          else if (!this.repeatMode) this.next();
        }
      }

      return { liked };
    }

    removeInactivePermanently(uid) {
      const u = uidOf(uid);
      if (u && Favorites.remove(u)) this._emitFav(u, false, null, true);
    }

    restoreInactive(uid) {
      return this.toggleFavorite(uid, { source: 'favorites' });
    }

    showInactiveFavoriteModal(p = {}) {
      if (!W.Modals?.open) return;
      const u = uidOf(p.uid);
      const esc = W.Utils?.escapeHtml || ((x) => String(x || ''));

      const modal = W.Modals.open({
        title: 'Трек неактивен',
        maxWidth: 420,
        bodyHtml: `
          <div style="color:#9db7dd;margin-bottom:14px">
            <div style="margin-bottom:8px"><strong>${esc(p.title || 'Трек')}</strong></div>
            <div style="opacity:.9">Вернуть в ⭐ или удалить из списка?</div>
          </div>
          ${W.Modals.actionRow([
            { act: 'add', text: 'Вернуть', className: 'online' },
            { act: 'remove', text: 'Удалить' }
          ])}
        `
      });

      modal.querySelector('[data-act="add"]')?.addEventListener('click', () => {
        modal.remove();
        this.restoreInactive(u);
      });

      modal.querySelector('[data-act="remove"]')?.addEventListener('click', () => {
        modal.remove();
        this.removeInactivePermanently(u);
        try { p.onDeleted?.(); } catch {}
      });
    }

    getFavoritesState() {
      return Favorites.getSnapshot().reduce((res, i) => {
        const uid = uidOf(i?.uid);
        if (uid) res[i.inactiveAt ? 'inactive' : 'active'].push({
          uid, sourceAlbum: uidOf(i.sourceAlbum || i.albumKey || getTrackByUid(uid)?.sourceAlbum), ...(i.inactiveAt && { inactiveAt: i.inactiveAt })
        });
        return res;
      }, { active: [], inactive: [] });
    }

    getLikedUidsForAlbum(key) {
      const k = uidOf(key);
      if (!k) return [];
      return Favorites.getSnapshot()
        .filter((i) => !i.inactiveAt && uidOf(getTrackByUid(i.uid)?.sourceAlbum) === k)
        .map((i) => i.uid);
    }

    onFavoritesChanged(cb) {
      this._favSubs.add(cb);
      return () => this._favSubs.delete(cb);
    }

    _emitFav(uid, liked, albumKey, removed = false) {
      for (const fn of this._favSubs) {
        try { fn({ uid, liked, albumKey, removed }); } catch {}
      }
    }

    // =========================
    // Shuffle / Repeat
    // =========================

    toggleShuffle() {
      this.shuffleMode = !this.shuffleMode;

      if (this.shuffleMode) {
        this.shufflePlaylist();
      } else {
        const uid = this.getCurrentTrack()?.uid;
        this.playlist = [...this.originalPlaylist];
        if (uid) this.currentIndex = this.playlist.findIndex((t) => t.uid === uid);
      }

      W.dispatchEvent(new CustomEvent('playlist:changed', { detail: { reason: 'shuffle', shuffleMode: this.shuffleMode } }));
    }

    isShuffle() { return this.shuffleMode; }

    toggleRepeat() {
      this.repeatMode = !this.repeatMode;
      W.dispatchEvent(new CustomEvent('playlist:changed', { detail: { reason: 'repeat', repeatMode: this.repeatMode } }));
    }

    isRepeat() { return this.repeatMode; }

    // =========================
    // Events
    // =========================

    on(evs) {
      for (const [k, fn] of Object.entries(evs || {})) {
        if (!this._ev.has(k)) this._ev.set(k, new Set());
        this._ev.get(k).add(fn);
      }
    }

    _emit(name, ...args) {
      const set = this._ev.get(name);
      if (!set) return;
      for (const fn of set) {
        try { fn(...args); } catch {}
      }
    }

    // =========================
    // Sleep timer (allowed to pause)
    // =========================

    setSleepTimer(ms) {
      clearTimeout(this._sleepTimer);
      this._sleepTarget = ms > 0 ? Date.now() + ms : 0;

      if (ms > 0) {
        this._sleepTimer = setTimeout(() => {
          this.pause();
          this._emit('onSleepTriggered');
        }, ms);
      }
    }

    getSleepTimerTarget() { return this._sleepTarget; }
    clearSleepTimer() { this.setSleepTimer(0); }
  }

  W.playerCore = new PlayerCore();
  const boot = () => W.playerCore.initialize();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

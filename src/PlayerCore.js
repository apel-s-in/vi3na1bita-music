// src/PlayerCore.js
// Ядро плеера на базе Howler.js (ESM)
// ТЗ_НЬЮ: никаких stop()/форсить play()/сбрасывать pos/volume из-за оффлайн/кэша.
// STOP разрешён только: кнопка Stop, и спец-сценарий избранного (в FavoritesManager), и т.п.

import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';

(function PlayerCoreModule() {
  'use strict';

  const W = window;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function normQ(v) {
    return String(v || '').toLowerCase().trim() === 'lo' ? 'lo' : 'hi';
  }

  function safeUid(v) {
    const s = String(v || '').trim();
    return s ? s : null;
  }

  function safeUrl(v) {
    const s = String(v || '').trim();
    return s ? s : null;
  }

  class PlayerCore {
    constructor() {
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentIndex = -1;

      this.sound = null;
      this.isReady = false;

      this.repeatMode = false;
      this.shuffleMode = false;

      this.shuffleHistory = [];
      this.historyMax = 200;

      this.tickInterval = null;
      this.tickRate = 100;

      this.callbacks = {
        onTrackChange: [],
        onPlay: [],
        onPause: [],
        onStop: [],
        onEnd: [],
        onTick: [],
        onError: [],
        onSleepTriggered: [],
      };

      this.metadata = {
        artist: 'Витрина Разбита',
        album: '',
        cover: '',
      };

      this.sleepTimerTarget = 0;
      this.sleepTimerId = null;

      this.qualityStorageKey = 'qualityMode:v1';
      this.qualityMode = this._readQualityMode();

      // v1.0
      this.sourceKey = 'audio';

      this._offlineNoCacheToastShown = false;
      this._hasAnyOfflineCacheComplete = null;

      this._mediaSession = ensureMediaSession({
        onPlay: () => this.play(),
        onPause: () => this.pause(),
        onStop: () => this.stop(),
        onPrev: () => this.prev(),
        onNext: () => this.next(),
        onSeekTo: (t) => this.seek(t),
        onSeekBy: (delta) => {
          const pos = this.getPosition();
          const dur = this.getDuration();
          this.seek(clamp(pos + delta, 0, dur || 0));
        },
        getPositionState: () => ({
          duration: this.getDuration(),
          position: this.getPosition(),
          playbackRate: 1.0,
        }),
      });

      this._stats = createListenStatsTracker({
        getUid: () => safeUid(this.getCurrentTrack()?.uid),
        getPos: () => this.getPosition(),
        getDur: () => this.getDuration(),
        record: (uid, payload) => {
          const om = W.OfflineUI?.offlineManager;
          if (om && typeof om.recordListenStats === 'function') {
            om.recordListenStats(uid, payload);
          }
        },
      });
    }

    initialize() {
      this.isReady = true;
    }

    // =========================
    // Playlist
    // =========================
    setPlaylist(tracks, startIndex = 0, metadata = {}, options = {}) {
      const wasPlaying = this.isPlaying();
      const prev = this.getCurrentTrack();
      const prevUid = safeUid(prev?.uid);
      const prevPos = this.getPosition();

      const {
        preserveOriginalPlaylist = false,
        preserveShuffleMode = false,
        resetHistory = true,
      } = options || {};

      this._hasAnyOfflineCacheComplete = null;

      this.playlist = (Array.isArray(tracks) ? tracks : []).map((t) => {
        const uid = safeUid(t?.uid);

        const sources = (t && typeof t === 'object' && t.sources && typeof t.sources === 'object')
          ? t.sources
          : null;

        const src = this._selectSrc({
          legacySrc: t?.src,
          sources,
          sourceKey: this.sourceKey,
          qualityMode: this.qualityMode,
        });

        return {
          src: safeUrl(src),
          sources,

          title: t?.title || 'Без названия',
          artist: t?.artist || 'Витрина Разбита',
          album: t?.album || '',
          cover: t?.cover || '',

          lyrics: t?.lyrics || null,
          fulltext: t?.fulltext || null,
          uid,
          hasLyrics: (typeof t?.hasLyrics === 'boolean') ? t.hasLyrics : null,
          sourceAlbum: t?.sourceAlbum || null,
        };
      });

      if (!preserveOriginalPlaylist) {
        this.originalPlaylist = this.playlist.slice();
      }

      this.metadata = { ...this.metadata, ...(metadata || {}) };

      if (resetHistory) this.shuffleHistory = [];

      if (this.shuffleMode && !preserveShuffleMode) {
        this.shufflePlaylist();
      } else if (!this.shuffleMode && !preserveShuffleMode) {
        // no-op
      }

      let nextIndex = -1;
      if (prevUid) nextIndex = this.playlist.findIndex(t => safeUid(t?.uid) === prevUid);

      if (nextIndex < 0) {
        const len = this.playlist.length;
        nextIndex = len ? clamp(startIndex, 0, len - 1) : -1;
      }

      this.currentIndex = nextIndex;

      if (wasPlaying && this.currentIndex >= 0) {
        this.load(this.currentIndex, { autoPlay: true, resumePosition: prevPos });
      } else {
        const cur = this.getCurrentTrack();
        if (cur) {
          this.trigger('onTrackChange', cur, this.currentIndex);
          this._updateMedia(cur);
        }
      }
    }

    getPlaylistSnapshot() {
      return this.playlist.slice();
    }

    // =========================
    // Playback resolving
    // =========================
    async _resolvePlaybackUrlForTrack(track) {
      try {
        const om = W.OfflineUI?.offlineManager;
        if (!om || typeof om.resolveForPlayback !== 'function') {
          return {
            url: safeUrl(track?.src),
            effectiveQuality: this.getQualityMode(),
            isLocal: false,
            reason: 'noOfflineManager'
          };
        }

        const pq = this.getQualityMode();
        const r = await om.resolveForPlayback(track, pq);

        return {
          url: safeUrl(r?.url),
          effectiveQuality: normQ(r?.effectiveQuality || pq),
          isLocal: !!r?.isLocal,
          reason: String(r?.reason || '')
        };
      } catch {
        return {
          url: safeUrl(track?.src),
          effectiveQuality: this.getQualityMode(),
          isLocal: false,
          reason: 'resolverError'
        };
      }
    }

    async _getHasAnyOfflineCompleteCached() {
      if (this._hasAnyOfflineCacheComplete === true) return true;
      if (this._hasAnyOfflineCacheComplete === false) return false;

      try {
        const om = W.OfflineUI?.offlineManager;
        if (!om || typeof om.hasAnyComplete !== 'function') {
          this._hasAnyOfflineCacheComplete = false;
          return false;
        }

        const uids = this.playlist.map(t => safeUid(t?.uid)).filter(Boolean);
        const yes = await om.hasAnyComplete(uids);
        this._hasAnyOfflineCacheComplete = !!yes;
        return !!yes;
      } catch {
        this._hasAnyOfflineCacheComplete = false;
        return false;
      }
    }

    async _findNextPlayableIndex(direction) {
      const len = this.playlist.length;
      if (!len) return -1;

      const dir = (direction === 'backward') ? -1 : 1;
      const base = this.currentIndex >= 0 ? this.currentIndex : 0;

      for (let step = 1; step <= len; step++) {
        const idx = (base + (dir * step) + len) % len;
        const t = this.playlist[idx];
        if (!t) continue;

        // eslint-disable-next-line no-await-in-loop
        const r = await this._resolvePlaybackUrlForTrack(t);
        if (r.url) return idx;
      }

      return -1;
    }

    _isNetworkOnline() {
      try {
        if (W.NetworkManager?.getStatus) return !!W.NetworkManager.getStatus().online;
      } catch {}
      return navigator.onLine !== false;
    }

    async _skipUnavailableAndPlay(direction) {
      const dir = (direction === 'backward') ? 'backward' : 'forward';

      // Если есть локальный доступный трек — перепрыгиваем на него.
      const idx = await this._findNextPlayableIndex(dir);
      if (idx >= 0) {
        this.currentIndex = idx;
        await this.play(idx);
        return true;
      }

      // Ничего нет локально/доступного: покажем предупреждение один раз.
      if (!this._offlineNoCacheToastShown) {
        this._offlineNoCacheToastShown = true;
        W.NotificationSystem?.warning('Нет сети и нет офлайн-кэша');
      }

      return false;
    }

    // =========================
    // Public controls
    // =========================
    async play(index = null, options = {}) {
      // iOS Safari requires user gesture to resume audio context before playing
      if (this._isIOS()) {
        await this._resumeAudioContext();
      }
      
      if (index !== null && Number.isFinite(index) && index >= 0 && index < this.playlist.length) {
        await this.load(index, options);
      }

      this._pushHistoryForCurrent();

      if (!this.sound) return;

      // Try to play, and if it fails due to iOS restrictions, attempt to resume and retry
      try {
        this.sound.play();
      } catch (e) {
        if (this._isIOS()) {
          await this._resumeAudioContext();
          // Retry play after resuming audio context
          setTimeout(() => {
            try {
              this.sound?.play();
            } catch (retryErr) {
              console.warn('Retry play failed:', retryErr);
            }
          }, 10);
        } else {
          throw e;
        }
      }
      
      this._updateMedia(this.getCurrentTrack());
    }

    pause() {
      if (!this.sound) return;

      this.sound.pause();
      this.stopTick();
      this._stats.onPauseOrStop();

      this.trigger('onPause', this.getCurrentTrack(), this.currentIndex);
      this._updateMedia(this.getCurrentTrack());
    }

    stop() {
      // Разрешённый stop: по кнопке Stop или спец-случаи извне.
      if (this.sound) {
        try { this.sound.stop(); } catch {}
        try { this.sound.unload(); } catch {}
        this.sound = null;
      }

      this.stopTick();
      this._stats.onPauseOrStop();

      this.trigger('onStop', this.getCurrentTrack(), this.currentIndex);
      this._updateMedia(this.getCurrentTrack());
    }

    _silentUnloadCurrentSound() {
      // Технический unload: НЕ trigger onStop (инвариант).
      if (this.sound) {
        try { this.sound.stop(); } catch {}
        try { this.sound.unload(); } catch {}
        this.sound = null;
      }
      this.stopTick();
      this._stats.onPauseOrStop();
    }

    async load(index, options = {}) {
      if (!Number.isFinite(index) || index < 0 || index >= this.playlist.length) return;

      const { autoPlay = false, resumePosition = null } = options || {};
      let html5 = (typeof options.html5 === 'boolean') ? options.html5 : true;

      // Нельзя stop() => тихий unload
      this._silentUnloadCurrentSound();

      this.currentIndex = index;
      const track = this.playlist[index];
      if (!track) return;

      const resolved = await this._resolvePlaybackUrlForTrack(track);

      // ТЗ 16.1: offline playback через WebAudio + blobs/objectURL
      if (resolved.isLocal) html5 = false;

      if (!resolved.url) {
        // ✅ ТЗ 7.5.2: если сети нет — тихо пропускаем недоступные треки.
        // Не стопаем плеер, не ломаем плейлист, просто прыгаем к следующему доступному.
        const netOnline = this._isNetworkOnline();

        if (!netOnline) {
          // направление: если вызвали load() из next/auto — будет forward по умолчанию
          const dir = (options && options.direction === 'backward') ? 'backward' : 'forward';
          await this._skipUnavailableAndPlay(dir);
          return;
        }

        // Сеть есть, но resolve не дал URL (редкий случай) — старое поведение: fallback вперёд, если что-то доступно
        const hasAny = await this._getHasAnyOfflineCompleteCached();

        if (!hasAny) {
          if (!this._offlineNoCacheToastShown) {
            this._offlineNoCacheToastShown = true;
            W.NotificationSystem?.warning('Нет сети и нет офлайн-кэша');
          }
          return;
        }

        const fallbackIdx = await this._findNextPlayableIndex('forward');
        if (fallbackIdx >= 0 && fallbackIdx !== index) {
          this.currentIndex = fallbackIdx;
          this.play(fallbackIdx);
        }
        return;
      }

      // фиксируем URL (может быть blob)
      this.playlist[index].src = resolved.url;

      // iOS Safari: ensure audio context is resumed before creating Howl object
      if (this._isIOS()) {
        await this._resumeAudioContext();
      }

      const initialVolume = this.getVolume() / 100;

      this.sound = new Howl({
        src: [resolved.url],
        html5,
        preload: true,
        volume: initialVolume,

        onplay: () => {
          this.startTick();
          this.trigger('onPlay', track, index);
          this._updateMedia(this.getCurrentTrack());
        },

        onpause: () => {
          this.stopTick();
          this._stats.onPauseOrStop();
          this.trigger('onPause', track, index);
          this._updateMedia(this.getCurrentTrack());
        },

        onend: () => {
          this.stopTick();
          this._stats.onEnded();

          this.trigger('onEnd', track, index);
          this._updateMedia(this.getCurrentTrack());
          this.handleTrackEnd();
        },

        onload: () => {
          if (typeof resumePosition === 'number' && Number.isFinite(resumePosition) && resumePosition > 0) {
            try { this.seek(resumePosition); } catch {}
          }
          if (autoPlay) {
            // For iOS, we need to make sure audio context is unlocked before attempting to play
            if (this._isIOS()) {
              this._resumeAudioContext().then(() => {
                try { this.play(); } catch {}
              });
            } else {
              try { this.play(); } catch {}
            }
          }
          this._updateMedia(this.getCurrentTrack());
        },

        onloaderror: (id, error) => {
          this.trigger('onError', { type: 'load', error, track, index });
        },

        onplayerror: (id, error) => {
          this.trigger('onError', { type: 'play', error, track, index });
        },
      });

      this.trigger('onTrackChange', track, index);
      this._updateMedia(track);
    }

    handleTrackEnd() {
      if (this.repeatMode) {
        this.play(this.currentIndex);
        return;
      }
      this.next();
    }

    next() {
      const len = this.playlist.length;
      if (!len) return;

      this._pushHistoryForCurrent();

      const cur = this.currentIndex >= 0 ? this.currentIndex : 0;
      const nextIndex = (cur + 1) % len;

      // ✅ передаём direction, чтобы при offline skip корректно строился поиск
      this.play(nextIndex, { direction: 'forward' });
    }

    prev() {
      const len = this.playlist.length;
      if (!len) return;

      if (this.getPosition() > 3) {
        this.seek(0);
        return;
      }

      const histIdx = this._popHistoryPrevIndex();
      if (Number.isFinite(histIdx) && histIdx >= 0) {
        this.play(histIdx, { direction: 'backward' });
        return;
      }

      const cur = this.currentIndex >= 0 ? this.currentIndex : 0;
      const prevIndex = (cur - 1 + len) % len;

      this.play(prevIndex, { direction: 'backward' });
    }

    // =========================
    // Seek / Position
    // =========================
    seek(seconds) {
      if (!this.sound) return;
      const t = Number(seconds);
      if (!Number.isFinite(t)) return;
      this.sound.seek(t);
    }

    getPosition() {
      if (!this.sound) return 0;
      return Number(this.sound.seek() || 0) || 0;
    }

    getDuration() {
      if (!this.sound) return 0;
      return Number(this.sound.duration() || 0) || 0;
    }

    // =========================
    // Volume / Mute
    // =========================
    setVolume(percent) {
      const p = clamp(Number(percent) || 0, 0, 100);
      const v = p / 100;

      if (this.sound) {
        try { this.sound.volume(v); } catch {}
      }
      try { Howler.volume(v); } catch {}

      try { localStorage.setItem('playerVolume', String(Math.round(p))); } catch {}
    }

    getVolume() {
      const saved = localStorage.getItem('playerVolume');
      const n = Number.parseInt(String(saved ?? ''), 10);
      return Number.isFinite(n) ? clamp(n, 0, 100) : 100;
    }

    setMuted(muted) {
      try { Howler.mute(!!muted); } catch {}
      try { this.sound?.mute?.(!!muted); } catch {}
    }

    // =========================
    // Repeat / Shuffle
    // =========================
    toggleRepeat() {
      this.repeatMode = !this.repeatMode;
    }

    isRepeat() {
      return this.repeatMode;
    }

    setShuffleMode(enabled) {
      const next = !!enabled;
      if (this.shuffleMode === next) return;

      this.shuffleMode = next;

      if (this.shuffleMode) this.shufflePlaylist();
      else this.playlist = this.originalPlaylist.slice();
    }

    toggleShuffle() {
      this.setShuffleMode(!this.shuffleMode);
    }

    isShuffle() {
      return this.shuffleMode;
    }

    shufflePlaylist() {
      const currentTrack = this.getCurrentTrack();
      const curUid = safeUid(currentTrack?.uid);

      this.shuffleHistory = [];

      const shuffled = this.playlist.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this.playlist = shuffled;

      if (!currentTrack) return;

      if (curUid) {
        const byUid = this.playlist.findIndex(t => safeUid(t?.uid) === curUid);
        if (byUid >= 0) this.currentIndex = byUid;
      } else {
        const src = safeUrl(currentTrack?.src);
        const bySrc = src ? this.playlist.findIndex(t => safeUrl(t?.src) === src) : -1;
        if (bySrc >= 0) this.currentIndex = bySrc;
      }
    }

    // =========================
    // PQ Hi/Lo (Playback Quality)
    // =========================
    _readQualityMode() {
      try { return normQ(localStorage.getItem(this.qualityStorageKey)); } catch { return 'hi'; }
    }

    _writeQualityMode(mode) {
      const m = normQ(mode);
      try { localStorage.setItem(this.qualityStorageKey, m); } catch {}
      return m;
    }

    getQualityMode() {
      return normQ(this.qualityMode);
    }

    setQualityMode(mode) {
      const m = this._writeQualityMode(mode);
      this.qualityMode = m;
      return m;
    }

    _selectSrc({ legacySrc, sources, sourceKey, qualityMode }) {
      const key = String(sourceKey || 'audio');
      const q = normQ(qualityMode);

      const srcLegacy = safeUrl(legacySrc);
      const srcHi = safeUrl(sources?.[key]?.hi);
      const srcLo = safeUrl(sources?.[key]?.lo);

      return (q === 'lo') ? (srcLo || srcHi || srcLegacy) : (srcHi || srcLo || srcLegacy);
    }

    canToggleQualityForCurrentTrack() {
      const track = this.getCurrentTrack();
      if (!track) return false;
      const key = this.sourceKey || 'audio';
      const lo = safeUrl(track?.sources?.[key]?.lo);
      return !!lo;
    }

    switchQuality(mode) {
      // ТЗ 4.2: сохранить pos + wasPlaying, пересобрать источник без stop.
      const nextMode = this.setQualityMode(mode);

      const track = this.getCurrentTrack();
      if (!track) return { ok: true, mode: nextMode, changed: false };

      if (!this.canToggleQualityForCurrentTrack()) {
        return { ok: true, mode: nextMode, changed: false, disabled: true };
      }

      const desiredSrc = this._selectSrc({
        legacySrc: track.src,
        sources: track.sources,
        sourceKey: this.sourceKey,
        qualityMode: nextMode,
      });

      if (!desiredSrc || desiredSrc === track.src) {
        return { ok: true, mode: nextMode, changed: false };
      }

      const wasPlaying = this.isPlaying();
      const pos = this.getPosition();
      const idx = this.currentIndex;

      // обновим src по uid (и playlist, и originalPlaylist)
      const uid = safeUid(track.uid);
      if (uid) {
        const pi = this.playlist.findIndex(t => safeUid(t?.uid) === uid);
        if (pi >= 0) this.playlist[pi].src = desiredSrc;

        const oi = this.originalPlaylist.findIndex(t => safeUid(t?.uid) === uid);
        if (oi >= 0) this.originalPlaylist[oi].src = desiredSrc;
      } else if (this.playlist[idx]) {
        this.playlist[idx].src = desiredSrc;
      }

      this._silentUnloadCurrentSound();
      this.load(idx, { autoPlay: wasPlaying, resumePosition: pos });

      return { ok: true, mode: nextMode, changed: true };
    }

    // Back-compat
    setQuality(quality) {
      const q = String(quality || '').toLowerCase();
      if (q === 'low' || q === 'lo') this.switchQuality('lo');
      else if (q === 'high' || q === 'hi') this.switchQuality('hi');
    }

    // =========================
    // State getters
    // =========================
    getCurrentTrack() {
      if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) return null;
      return this.playlist[this.currentIndex] || null;
    }

    getIndex() { return this.currentIndex; }

    getNextIndex() {
      const len = this.playlist.length;
      if (!len || this.currentIndex < 0) return -1;
      return (this.currentIndex + 1) % len;
    }

    isPlaying() {
      return !!(this.sound && this.sound.playing && this.sound.playing());
    }

    // =========================
    // Events
    // =========================
    on(events) {
      Object.keys(events || {}).forEach((event) => {
        if (this.callbacks[event]) this.callbacks[event].push(events[event]);
      });
    }

    trigger(event, ...args) {
      const arr = this.callbacks[event];
      if (!arr) return;
      for (const fn of arr) {
        try { fn(...args); } catch {}
      }
    }

    // =========================
    // Tick: progress + stats
    // =========================
    startTick() {
      this.stopTick();
      this.tickInterval = setInterval(() => {
        const pos = this.getPosition();
        const dur = this.getDuration();
        this.trigger('onTick', pos, dur);
        this._stats.onTick();
      }, this.tickRate);
    }

    stopTick() {
      if (!this.tickInterval) return;
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // =========================
    // Sleep timer
    // =========================
    setSleepTimer(ms) {
      const delay = Number(ms) || 0;
      if (delay <= 0) {
        this.clearSleepTimer();
        return;
      }

      this.sleepTimerTarget = Date.now() + delay;

      if (this.sleepTimerId) {
        clearTimeout(this.sleepTimerId);
        this.sleepTimerId = null;
      }

      this.sleepTimerId = setTimeout(() => {
        this.sleepTimerId = null;

        const target = this.sleepTimerTarget;
        this.sleepTimerTarget = 0;

        this.trigger('onSleepTriggered', { targetAt: target });

        // проектная логика: таймер делает pause (разрешено)
        if (this.isPlaying()) {
          try { this.pause(); } catch {}
        }
      }, delay);
    }

    clearSleepTimer() {
      if (this.sleepTimerId) {
        clearTimeout(this.sleepTimerId);
        this.sleepTimerId = null;
      }
      this.sleepTimerTarget = 0;
    }

    getSleepTimerTarget() {
      return this.sleepTimerTarget || 0;
    }

    // =========================
    // MediaSession
    // =========================
    _updateMedia(track) {
      if (!this._mediaSession) return;
      this._mediaSession.updateMetadata({
        title: track?.title || 'Без названия',
        artist: track?.artist || this.metadata.artist,
        album: track?.album || this.metadata.album,
        artworkUrl: track?.cover || this.metadata.cover || 'icons/icon-512.png',
        playing: this.isPlaying(),
      });
      this._mediaSession.updatePositionState();
    }

    // =========================
    // Shuffle history
    // =========================
    _pushHistoryForCurrent() {
      try {
        const t = this.getCurrentTrack();
        const uid = safeUid(t?.uid);
        if (!uid) return;

        const last = this.shuffleHistory.length ? this.shuffleHistory[this.shuffleHistory.length - 1] : null;
        if (last && last.uid === uid) return;

        this.shuffleHistory.push({ uid });

        if (this.shuffleHistory.length > this.historyMax) {
          this.shuffleHistory.splice(0, this.shuffleHistory.length - this.historyMax);
        }
      } catch {}
    }

    _popHistoryPrevIndex() {
      try {
        if (!this.shuffleMode) return -1;
        if (!Array.isArray(this.shuffleHistory) || this.shuffleHistory.length === 0) return -1;

        this.shuffleHistory.pop();
        const prev = this.shuffleHistory.length ? this.shuffleHistory[this.shuffleHistory.length - 1] : null;
        const uid = safeUid(prev?.uid);
        if (!uid) return -1;

        const idx = this.playlist.findIndex(t => safeUid(t?.uid) === uid);
        return idx >= 0 ? idx : -1;
      } catch {
        return -1;
      }
    }

    // =========================
    // Helpers for PlaybackPolicy
    // =========================
    appendToPlaylistTail(tracks) {
      const list = Array.isArray(tracks) ? tracks : [];
      if (!list.length) return;

      const existingUid = new Set(this.playlist.map(t => safeUid(t?.uid)).filter(Boolean));

      const toAdd = [];
      for (const t of list) {
        const uid = safeUid(t?.uid);
        if (!uid || existingUid.has(uid)) continue;
        existingUid.add(uid);

        toAdd.push({
          src: safeUrl(t?.src),
          sources: t?.sources || null,
          title: t?.title || 'Без названия',
          artist: t?.artist || 'Витрина Разбита',
          album: t?.album || '',
          cover: t?.cover || '',
          lyrics: t?.lyrics || null,
          fulltext: t?.fulltext || null,
          uid,
          sourceAlbum: t?.sourceAlbum || null,
        });
      }

      if (!toAdd.length) return;
      this.playlist = this.playlist.concat(toAdd);
    }

    removeFromPlaylistTailIfNotPlayed(params = {}) {
      const uid = safeUid(params?.uid);
      if (!uid) return false;

      const curUid = safeUid(this.getCurrentTrack()?.uid);
      if (curUid && curUid === uid) return false;

      const played = Array.isArray(this.shuffleHistory)
        ? this.shuffleHistory.some(h => safeUid(h?.uid) === uid)
        : false;

      if (played) return false;

      const beforeLen = this.playlist.length;
      this.playlist = this.playlist.filter(t => safeUid(t?.uid) !== uid);

      if (this.currentIndex >= this.playlist.length) {
        this.currentIndex = this.playlist.length - 1;
      }

      return this.playlist.length !== beforeLen;
    }

    // =========================
    // Backend rebuild (pulse)
    // =========================
    rebuildCurrentSound(options = {}) {
      try {
        const track = this.getCurrentTrack();
        if (!track) return false;

        const preferWebAudio = !!options.preferWebAudio;
        const targetHtml5 = !preferWebAudio;

        const wasPlaying = this.isPlaying();
        const pos = this.getPosition();
        const idx = this.currentIndex;

        const curHtml5 = !!(this.sound && this.sound._html5);
        if (this.sound && curHtml5 === targetHtml5) return true;

        this._silentUnloadCurrentSound();
        this.load(idx, { autoPlay: wasPlaying, resumePosition: pos, html5: targetHtml5 });
        return true;
      } catch {
        return false;
      }
    }

    getAudioElement() {
      try {
        if (this.sound && this.sound._sounds && this.sound._sounds[0]) {
          return this.sound._sounds[0]._node;
        }
      } catch {}
      return null;
    }

    // Helper method to detect iOS devices
    _isIOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Helper method to resume audio context on iOS
    async _resumeAudioContext() {
      try {
        if (window.Howler && window.Howler.ctx && window.Howler.ctx.state === 'suspended') {
          await window.Howler.ctx.resume();
          console.log('✅ AudioContext resumed for iOS');
          return true;
        }
      } catch (err) {
        console.warn('⚠️ Could not resume AudioContext:', err);
      }
      return false;
    }

    destroy() {
      this.stop();
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentIndex = -1;

      this.callbacks = {
        onTrackChange: [],
        onPlay: [],
        onPause: [],
        onStop: [],
        onEnd: [],
        onTick: [],
        onError: [],
        onSleepTriggered: [],
      };
    }
  }

  W.playerCore = new PlayerCore();

  // ✅ iOS Safari: ждём готовности Howler.js перед инициализацией
  const initWhenReady = async () => {
    // Ждём Howler.js (загружается из CDN)
    let attempts = 0;
    while (typeof Howl === 'undefined' && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    
    if (typeof Howl === 'undefined') {
      console.error('❌ PlayerCore: Howler.js not loaded');
      return;
    }
    
    W.playerCore.initialize();
    console.log('✅ PlayerCore ready');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
  } else {
    initWhenReady();
  }
})();

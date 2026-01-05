// src/PlayerCore.js
// Ядро плеера на базе Howler.js
// ТЗ_НЬЮ: инвариант — никакие новые функции не имеют права вызывать stop()/форсить play()/сбрасывать pos/volume
// Исключения STOP: только кнопка Stop, таймер сна (pause), и спец-сценарий в Избранном (реализован в FavoritesManager).

import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';

(function PlayerCoreModule() {
  'use strict';

  const W = window;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function normQuality(v) {
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

      // Shuffle history (как Spotify): стек uid реально проигранных треков
      this.shuffleHistory = [];
      this.historyMax = 200;

      // Tick
      this.tickInterval = null;
      this.tickRate = 100;

      // callbacks
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

      // Sleep timer
      this.sleepTimerTarget = 0;
      this.sleepTimerId = null;

      // PQ (Playback Quality)
      this.qualityStorageKey = 'qualityMode:v1';
      this.qualityMode = this._readQualityMode();

      // SourceKey (v1.0: audio)
      this.sourceKey = 'audio';

      // OFFLINE UX guard (не спамить тостами)
      this._offlineNoCacheToastShown = false;

      // cache: есть ли хоть один complete офлайн трек в этом плейлисте
      this._hasAnyOfflineCacheComplete = null;

      // MediaSession (handlers ставим 1 раз)
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

      // Stats (единообразный троттлинг секунд + full listen)
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
      // setPlaylist НЕ имеет права делать stop() по инварианту.
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

      if (resetHistory) {
        this.shuffleHistory = [];
      }

      if (this.shuffleMode && !preserveShuffleMode) {
        // shuffleMode уже true — пересобираем порядок
        this.shufflePlaylist();
      } else if (!this.shuffleMode && !preserveShuffleMode) {
        // ничего
      }

      // выбрать индекс: сохранить по uid если возможно
      let nextIndex = -1;
      if (prevUid) {
        nextIndex = this.playlist.findIndex(t => safeUid(t?.uid) === prevUid);
      }
      if (nextIndex < 0) {
        const len = this.playlist.length;
        nextIndex = len ? clamp(startIndex, 0, len - 1) : -1;
      }

      this.currentIndex = nextIndex;

      // Если играло — продолжаем без stop: делаем тихую пересборку + seek(pos) + autoPlay
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
    // Playback: resolve + load
    // =========================

    async _resolvePlaybackUrlForTrack(track) {
      // Единый мост к OfflineManager.resolveForPlayback
      try {
        const om = W.OfflineUI?.offlineManager;
        if (!om || typeof om.resolveForPlayback !== 'function') {
          return {
            url: safeUrl(track?.src),
            effectiveQuality: this.getQualityMode(),
            isLocal: false,
            reason: 'noOfflineManager',
          };
        }

        const pq = this.getQualityMode();
        const r = await om.resolveForPlayback(track, pq);
        return {
          url: safeUrl(r?.url),
          effectiveQuality: normQuality(r?.effectiveQuality || pq),
          isLocal: !!r?.isLocal,
          reason: String(r?.reason || ''),
        };
      } catch {
        return {
          url: safeUrl(track?.src),
          effectiveQuality: this.getQualityMode(),
          isLocal: false,
          reason: 'resolverError',
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

    async play(index = null) {
      if (index !== null && Number.isFinite(index) && index >= 0 && index < this.playlist.length) {
        await this.load(index);
      }

      // история: фиксируем факт “дошли до текущего”
      this._pushHistoryForCurrent();

      if (!this.sound) return;

      this.sound.play();
      this._updateMedia(this.getCurrentTrack());
    }

    pause() {
      if (!this.sound) return;

      this.sound.pause();
      this.stopTick();

      // статистика: при паузе фиксируем последние секунды (если надо)
      this._stats.onPauseOrStop();

      this.trigger('onPause', this.getCurrentTrack(), this.currentIndex);
      this._updateMedia(this.getCurrentTrack());
    }

    stop() {
      // Разрешённый stop (кнопка Stop или спец-случаи извне)
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
      // Технический unload: НЕ триггерим onStop (инвариант)
      if (this.sound) {
        try { this.sound.stop(); } catch {}
        try { this.sound.unload(); } catch {}
        this.sound = null;
      }
      this.stopTick();
      this._stats.onPauseOrStop();
    }

    async load(index, options = {}) {
      if (!Number.isFinite(index) || index < 0 || index >= this.playlist.length) {
        return;
      }

      const { autoPlay = false, resumePosition = null } = options || {};
      let html5 = (typeof options.html5 === 'boolean') ? options.html5 : true;

      // НЕЛЬЗЯ stop() => только тихо выгружаем текущий sound
      this._silentUnloadCurrentSound();

      this.currentIndex = index;
      const track = this.playlist[index];
      if (!track) return;

      const resolved = await this._resolvePlaybackUrlForTrack(track);

      // локальные blob/objectURL по ТЗ играем WebAudio (html5:false)
      if (resolved.isLocal) html5 = false;

      if (!resolved.url) {
        // сеть недоступна + нет local blob для этого трека
        const hasAny = await this._getHasAnyOfflineCompleteCached();

        // (1) если вообще нет complete локального — toast один раз и просто выходим (без stop/pause)
        if (!hasAny) {
          if (!this._offlineNoCacheToastShown) {
            this._offlineNoCacheToastShown = true;
            W.NotificationSystem?.warning('Нет сети и нет офлайн-кэша');
          }
          return;
        }

        // (2) если локальные есть — тихо перескакиваем на следующий playable
        const fallbackIdx = await this._findNextPlayableIndex('forward');
        if (fallbackIdx >= 0 && fallbackIdx !== index) {
          this.currentIndex = fallbackIdx;
          this.play(fallbackIdx);
        }
        return;
      }

      // фиксируем реально выбранный URL для текущего трека (это не меняет uid/логику)
      this.playlist[index].src = resolved.url;

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

          // статистика: full listen решаем стабильно (duration валидна + >90%)
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
            try { this.play(); } catch {}
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

      // запоминаем текущий трек в истории (для prev “как Spotify”)
      this._pushHistoryForCurrent();

      const cur = this.currentIndex >= 0 ? this.currentIndex : 0;
      const nextIndex = (cur + 1) % len;
      this.play(nextIndex);
    }

    prev() {
      const len = this.playlist.length;
      if (!len) return;

      // если проиграно >3 сек — перематываем в начало
      if (this.getPosition() > 3) {
        this.seek(0);
        return;
      }

      // shuffle history: вернуться к реально проигранному (только когда shuffle ON)
      const histIdx = this._popHistoryPrevIndex();
      if (Number.isFinite(histIdx) && histIdx >= 0) {
        this.play(histIdx);
        return;
      }

      const cur = this.currentIndex >= 0 ? this.currentIndex : 0;
      const prevIndex = (cur - 1 + len) % len;
      this.play(prevIndex);
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
    // Modes
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

      if (this.shuffleMode) {
        this.shufflePlaylist();
      } else {
        this.playlist = this.originalPlaylist.slice();
      }
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

      // При reshuffle сбрасываем историю, чтобы prev не лез в старые индексы
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
        this.currentIndex = byUid >= 0 ? byUid : this.currentIndex;
      } else {
        const src = safeUrl(currentTrack?.src);
        const bySrc = src ? this.playlist.findIndex(t => safeUrl(t?.src) === src) : -1;
        if (bySrc >= 0) this.currentIndex = bySrc;
      }
    }

    // =========================
    // PQ Quality Hi/Lo
    // =========================

    _readQualityMode() {
      try {
        const v = normQuality(localStorage.getItem(this.qualityStorageKey));
        return v;
      } catch {
        return 'hi';
      }
    }

    _writeQualityMode(mode) {
      const m = normQuality(mode);
      try { localStorage.setItem(this.qualityStorageKey, m); } catch {}
      return m;
    }

    getQualityMode() {
      return normQuality(this.qualityMode);
    }

    setQualityMode(mode) {
      const m = this._writeQualityMode(mode);
      this.qualityMode = m;
      return m;
    }

    _selectSrc({ legacySrc, sources, sourceKey, qualityMode }) {
      const key = String(sourceKey || 'audio');
      const q = normQuality(qualityMode);

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
      const nextMode = this.setQualityMode(mode);

      const track = this.getCurrentTrack();
      if (!track) return { ok: true, mode: nextMode, changed: false };

      const canToggle = this.canToggleQualityForCurrentTrack();
      if (!canToggle) {
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

      // обновим src в playlist/originalPlaylist по uid
      const uid = safeUid(track.uid);
      if (uid) {
        const pi = this.playlist.findIndex(t => safeUid(t?.uid) === uid);
        if (pi >= 0) this.playlist[pi].src = desiredSrc;

        const oi = this.originalPlaylist.findIndex(t => safeUid(t?.uid) === uid);
        if (oi >= 0) this.originalPlaylist[oi].src = desiredSrc;
      } else {
        this.playlist[idx].src = desiredSrc;
      }

      // тихая пересборка
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
    // Getters / State
    // =========================

    getCurrentTrack() {
      if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) return null;
      return this.playlist[this.currentIndex] || null;
    }

    getIndex() {
      return this.currentIndex;
    }

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
    // Tick (progress + stats)
    // =========================

    startTick() {
      this.stopTick();

      this.tickInterval = setInterval(() => {
        const pos = this.getPosition();
        const dur = this.getDuration();

        this.trigger('onTick', pos, dur);

        // stats: секунды троттлим аккуратно
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

        // по текущему коду проекта таймер делает pause (это разрешено правилами)
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
    // History (shuffle)
    // =========================

    _pushHistoryForCurrent() {
      try {
        const t = this.getCurrentTrack();
        const uid = safeUid(t?.uid);
        if (!uid) return;

        const last = this.shuffleHistory.length
          ? this.shuffleHistory[this.shuffleHistory.length - 1]
          : null;

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

        // pop “текущую точку”, затем берем предыдущую
        this.shuffleHistory.pop();
        const prev = this.shuffleHistory.length
          ? this.shuffleHistory[this.shuffleHistory.length - 1]
          : null;

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
    // Backend rebuild (bit effect)
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => W.playerCore.initialize());
  } else {
    W.playerCore.initialize();
  }
})();

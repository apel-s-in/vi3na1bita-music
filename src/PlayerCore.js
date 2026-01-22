// src/PlayerCore.js
import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';

(function () {
  'use strict';

  const W = window;
  const U = W.Utils;

  const clamp = U?.clamp || ((n, a, b) => Math.max(a, Math.min(b, n)));
  const isIOS = U?.isIOS || (() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !W.MSStream);

  const normQ = (v) => (String(v || '').toLowerCase().trim() === 'lo' ? 'lo' : 'hi');
  const safeStr = (v) => {
    const s = String(v ?? '').trim();
    return s ? s : null;
  };

  class PlayerCore {
    constructor() {
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentIndex = -1;

      // ✅ Guard against races: old Howl events must not affect new playback
      // (fixes rare double-play / wrong end/next cascades)
      this._loadToken = 0;
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

      this.metadata = { artist: 'Витрина Разбита', album: '', cover: '' };

      this.sleepTimerTarget = 0;
      this.sleepTimerId = null;

      this.qualityStorageKey = 'qualityMode:v1';
      this.qualityMode = this._readQualityMode();

      this.sourceKey = 'audio';

      // =========================
      // Favorites (единственный источник истины)
      // Storage:
      // - likedTrackUids:v1 => { [albumKey]: string[] }  (для favoritesOnly в альбомах, back-compat e2e)
      // - favoritesAlbumRefsByUid:v1 => [{ a: albumKey, uid: string }]
      // Business rules:
      // - toggle in album (fromAlbum=true): unlike => remove ref "без следа"
      // - toggle in favorites view (fromAlbum=false): unlike => inactive (ref stays)
      // - In favorites playlist playing: unlike current active => next; if last active => STOP (единственный разрешённый STOP от избранного)
      this._fav = {
        likedKey: 'likedTrackUids:v1',
        refsKey: 'favoritesAlbumRefsByUid:v1',
      };

      // Favorites internal emitter (замена DOM CustomEvent 'favorites:changed')
      this._favEmitter = {
        subs: new Set(),
        emit: (payload) => {
          for (const fn of this._favEmitter.subs) {
            try { fn(payload); } catch {}
          }
        }
      };

      // Refs index cache: uid -> Set(albumKey)
      this._favRefsIndex = { built: false, map: new Map() };

      this._offlineNoCacheToastShown = false;
      this._hasAnyOfflineCacheComplete = null;

      // iOS unlock (single source of truth)
      this._ios = {
        armed: false,
        unlocked: false,
        unsubs: [],
      };

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
        getUid: () => safeStr(this.getCurrentTrack()?.uid),
        getPos: () => this.getPosition(),
        getDur: () => this.getDuration(),
        record: (uid, payload) => {
          const om = W.OfflineUI?.offlineManager;
          if (om?.recordListenStats) om.recordListenStats(uid, payload);
        },
      });
    }

    initialize() {
      this.isReady = true;
      this._armIOSUnlock();
    }

    // =========================
    // iOS unlock (единственный источник правды)
    // =========================
    _armIOSUnlock() {
      if (this._ios.armed || !isIOS()) return;
      this._ios.armed = true;

      const handler = () => { this._ensureAudioUnlocked(); };

      // максимально совместимо по iOS: touchend/click + pointerdown
      const add = (t, ev) => {
        t.addEventListener(ev, handler, { passive: true });
        this._ios.unsubs.push(() => { try { t.removeEventListener(ev, handler, { passive: true }); } catch {} });
      };

      add(document, 'touchend');
      add(document, 'touchstart');
      add(document, 'click');
      add(window, 'pointerdown');
      add(window, 'pageshow'); // возврат из BFCache
      add(document, 'visibilitychange'); // возвращение из фона
    }

    async _ensureAudioUnlocked() {
      if (this._ios.unlocked || !isIOS()) return true;

      // Лучшее что можно: возобновить контекст Howler
      try {
        const ctx = W.Howler?.ctx;
        if (ctx && ctx.state === 'suspended') await ctx.resume();
        this._ios.unlocked = true;

        // после успешного unlock можно снять часть слушателей (экономия)
        if (this._ios.unsubs.length) {
          const unsubs = this._ios.unsubs.slice();
          this._ios.unsubs.length = 0;
          for (const off of unsubs) { try { off(); } catch {} }
        }

        return true;
      } catch {
        return false;
      }
    }

    // =========================
    // Playlist
    // =========================
    setPlaylist(tracks, startIndex = 0, metadata = {}, options = {}) {
      const wasPlaying = this.isPlaying();
      const prev = this.getCurrentTrack();
      const prevUid = safeStr(prev?.uid);
      const prevPos = this.getPosition();

      const {
        preserveOriginalPlaylist = false,
        preserveShuffleMode = false,
        resetHistory = true,

        // ✅ ВАЖНО: по умолчанию PlayerCore сохраняет позицию при перестройке плейлиста,
        // чтобы не рвать playback (favoritesOnly/shuffle/like/unlike и т.п.).
        // Но при прямом выборе трека пользователем нужно ВСЕГДА стартовать с 0:00.
        preservePosition = true,
      } = options || {};

      this._hasAnyOfflineCacheComplete = null;

      this.playlist = (Array.isArray(tracks) ? tracks : []).map((t) => {
        const uid = safeStr(t?.uid);
        const sources = (t && typeof t === 'object' && t.sources && typeof t.sources === 'object') ? t.sources : null;

        const src = this._selectSrc({
          legacySrc: t?.src,
          sources,
          sourceKey: this.sourceKey,
          qualityMode: this.qualityMode,
        });

        return {
          src: safeStr(src),
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

      if (!preserveOriginalPlaylist) this.originalPlaylist = this.playlist.slice();
      this.metadata = { ...this.metadata, ...(metadata || {}) };
      if (resetHistory) this.shuffleHistory = [];

      if (this.shuffleMode && !preserveShuffleMode) this.shufflePlaylist();

      let nextIndex = -1;
      if (prevUid) nextIndex = this.playlist.findIndex(t => safeStr(t?.uid) === prevUid);

      if (nextIndex < 0) {
        const len = this.playlist.length;
        nextIndex = len ? clamp(startIndex, 0, len - 1) : -1;
      }

      this.currentIndex = nextIndex;

      if (wasPlaying && this.currentIndex >= 0) {
        this.load(this.currentIndex, {
          autoPlay: true,
          resumePosition: preservePosition ? prevPos : null
        });
      }
      else {
        const cur = this.getCurrentTrack();
        if (cur) {
          this.trigger('onTrackChange', cur, this.currentIndex);
          this._updateMedia(cur);
        }
      }
    }

    getPlaylistSnapshot() { return this.playlist.slice(); }

    // =========================
    // Playback resolving
    // =========================
    async _resolvePlaybackUrlForTrack(track) {
      try {
        const om = W.OfflineUI?.offlineManager;
        if (!om?.resolveForPlayback) {
          return { url: safeStr(track?.src), effectiveQuality: this.getQualityMode(), isLocal: false, reason: 'noOfflineManager' };
        }

        const pq = this.getQualityMode();
        const r = await om.resolveForPlayback(track, pq);
        return {
          url: safeStr(r?.url),
          effectiveQuality: normQ(r?.effectiveQuality || pq),
          isLocal: !!r?.isLocal,
          reason: String(r?.reason || ''),
        };
      } catch {
        return { url: safeStr(track?.src), effectiveQuality: this.getQualityMode(), isLocal: false, reason: 'resolverError' };
      }
    }

    async _getHasAnyOfflineCompleteCached() {
      if (this._hasAnyOfflineCacheComplete === true) return true;
      if (this._hasAnyOfflineCacheComplete === false) return false;

      try {
        const om = W.OfflineUI?.offlineManager;
        if (!om?.hasAnyComplete) return (this._hasAnyOfflineCacheComplete = false);

        const uids = this.playlist.map(t => safeStr(t?.uid)).filter(Boolean);
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
        const idx = (base + dir * step + len) % len;
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
      const idx = await this._findNextPlayableIndex(direction === 'backward' ? 'backward' : 'forward');
      if (idx >= 0) {
        this.currentIndex = idx;
        await this.play(idx);
        return true;
      }

      if (!this._offlineNoCacheToastShown) {
        this._offlineNoCacheToastShown = true;
        W.NotificationSystem?.warning?.('Нет сети и нет офлайн-кэша');
      }
      return false;
    }

    // =========================
    // Public controls
    // =========================
    async play(index = null, options = {}) {
      await this._ensureAudioUnlocked();

      if (index !== null && Number.isFinite(index) && index >= 0 && index < this.playlist.length) {
        await this.load(index, options);
      }

      this._pushHistoryForCurrent();
      if (!this.sound) return;

      try {
        this.sound.play();
      } catch {
        // iOS иногда кидает sync-ошибку — пробуем ещё раз после unlock
        await this._ensureAudioUnlocked();
        try { this.sound?.play(); } catch {}
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
      // ЕДИНСТВЕННЫЙ настоящий STOP: по кнопке стоп (или разрешённое исключение избранного).
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
      // ВАЖНО: этот метод используется внутренне при смене трека/качества.
      // Он НЕ должен считаться "STOP" с точки зрения UX-инвариантов.
      // Поэтому:
      // - не эмитим onStop
      // - не вызываем публичный stop()
      // - останавливаем тик и выгружаем Howl максимально тихо
      if (this.sound) {
        try { this.sound.pause(); } catch {}
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

      // ✅ Increment token BEFORE unloading/creating, so any late events from previous Howl are ignored.
      const token = ++this._loadToken;

      this._silentUnloadCurrentSound();

      this.currentIndex = index;
      const track = this.playlist[index];
      if (!track) return;

      const resolved = await this._resolvePlaybackUrlForTrack(track);
      if (resolved.isLocal) html5 = false;

      if (!resolved.url) {
        const netOnline = this._isNetworkOnline();
        if (!netOnline) {
          const dir = (options && options.direction === 'backward') ? 'backward' : 'forward';
          await this._skipUnavailableAndPlay(dir);
          return;
        }

        const hasAny = await this._getHasAnyOfflineCompleteCached();
        if (!hasAny) {
          if (!this._offlineNoCacheToastShown) {
            this._offlineNoCacheToastShown = true;
            W.NotificationSystem?.warning?.('Нет сети и нет офлайн-кэша');
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

      this.playlist[index].src = resolved.url;

      await this._ensureAudioUnlocked();

      const initialVolume = this.getVolume() / 100;

      this.sound = new Howl({
        src: [resolved.url],
        html5,
        preload: true,
        volume: initialVolume,

        onplay: () => {
          if (token !== this._loadToken) return;
          this.startTick();
          this.trigger('onPlay', track, index);
          this._updateMedia(this.getCurrentTrack());
        },

        onpause: () => {
          if (token !== this._loadToken) return;
          this.stopTick();
          this._stats.onPauseOrStop();
          this.trigger('onPause', track, index);
          this._updateMedia(this.getCurrentTrack());
        },

        onend: () => {
          if (token !== this._loadToken) return;
          this.stopTick();
          this._stats.onEnded();
          this.trigger('onEnd', track, index);
          this._updateMedia(this.getCurrentTrack());
          this.handleTrackEnd();
        },

        onload: () => {
          if (token !== this._loadToken) return;

          if (typeof resumePosition === 'number' && Number.isFinite(resumePosition) && resumePosition > 0) {
            try { this.seek(resumePosition); } catch {}
          }

          // ✅ CRITICAL: do NOT call this.play() here (it can re-enter load/play pipeline).
          // Only start current Howl instance.
          if (autoPlay) {
            try { this.sound?.play?.(); } catch {}
          }

          this._updateMedia(this.getCurrentTrack());
        },

        onloaderror: (id, error) => {
          if (token !== this._loadToken) return;
          this.trigger('onError', { type: 'load', error, track, index });
        },

        onplayerror: (id, error) => {
          if (token !== this._loadToken) return;
          this.trigger('onError', { type: 'play', error, track, index });
        },
      });

      this.trigger('onTrackChange', track, index);
      this._updateMedia(track);
    }

    handleTrackEnd() {
      if (this.repeatMode) return void this.play(this.currentIndex);
      this.next();
    }

    next() {
      const len = this.playlist.length;
      if (!len) return;
      this._pushHistoryForCurrent();
      const cur = this.currentIndex >= 0 ? this.currentIndex : 0;
      this.play((cur + 1) % len, { direction: 'forward' });
    }

    prev() {
      const len = this.playlist.length;
      if (!len) return;

      if (this.getPosition() > 3) return void this.seek(0);

      const histIdx = this._popHistoryPrevIndex();
      if (Number.isFinite(histIdx) && histIdx >= 0) return void this.play(histIdx, { direction: 'backward' });

      const cur = this.currentIndex >= 0 ? this.currentIndex : 0;
      this.play((cur - 1 + len) % len, { direction: 'backward' });
    }

    // =========================
    // Seek / Position
    // =========================
    seek(seconds) {
      if (!this.sound) return;
      const t = Number(seconds);
      if (Number.isFinite(t)) this.sound.seek(t);
    }

    getPosition() { return this.sound ? (Number(this.sound.seek() || 0) || 0) : 0; }
    getDuration() { return this.sound ? (Number(this.sound.duration() || 0) || 0) : 0; }

    // =========================
    // Volume / Mute
    // =========================
    setVolume(percent) {
      const p = clamp(Number(percent) || 0, 0, 100);
      const v = p / 100;

      if (this.sound) { try { this.sound.volume(v); } catch {} }
      try { Howler.volume(v); } catch {}
      try { localStorage.setItem('playerVolume', String(Math.round(p))); } catch {}
    }

    getVolume() {
      const n = Number.parseInt(String(localStorage.getItem('playerVolume') ?? ''), 10);
      return Number.isFinite(n) ? clamp(n, 0, 100) : 100;
    }

    setMuted(muted) {
      try { Howler.mute(!!muted); } catch {}
      try { this.sound?.mute?.(!!muted); } catch {}
    }

    // =========================
    // Repeat / Shuffle
    // =========================
    toggleRepeat() { this.repeatMode = !this.repeatMode; }
    isRepeat() { return this.repeatMode; }

    setShuffleMode(enabled) {
      const next = !!enabled;
      if (this.shuffleMode === next) return;
      this.shuffleMode = next;
      this.playlist = next ? (this.shufflePlaylist(), this.playlist) : this.originalPlaylist.slice();
    }

    toggleShuffle() { this.setShuffleMode(!this.shuffleMode); }
    isShuffle() { return this.shuffleMode; }

    shufflePlaylist() {
      const currentTrack = this.getCurrentTrack();
      const curUid = safeStr(currentTrack?.uid);

      this.shuffleHistory = [];

      const shuffled = this.playlist.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this.playlist = shuffled;

      if (!currentTrack) return;

      if (curUid) {
        const byUid = this.playlist.findIndex(t => safeStr(t?.uid) === curUid);
        if (byUid >= 0) this.currentIndex = byUid;
      } else {
        const src = safeStr(currentTrack?.src);
        const bySrc = src ? this.playlist.findIndex(t => safeStr(t?.src) === src) : -1;
        if (bySrc >= 0) this.currentIndex = bySrc;
      }
    }

    // =========================
    // PQ Hi/Lo
    // =========================
    _readQualityMode() {
      try { return normQ(localStorage.getItem(this.qualityStorageKey)); } catch { return 'hi'; }
    }

    _writeQualityMode(mode) {
      const m = normQ(mode);
      try { localStorage.setItem(this.qualityStorageKey, m); } catch {}
      return m;
    }

    getQualityMode() { return normQ(this.qualityMode); }
    setQualityMode(mode) { return (this.qualityMode = this._writeQualityMode(mode)); }

    _selectSrc({ legacySrc, sources, sourceKey, qualityMode }) {
      const key = String(sourceKey || 'audio');
      const q = normQ(qualityMode);

      const srcLegacy = safeStr(legacySrc);
      const srcHi = safeStr(sources?.[key]?.hi);
      const srcLo = safeStr(sources?.[key]?.lo);

      return (q === 'lo') ? (srcLo || srcHi || srcLegacy) : (srcHi || srcLo || srcLegacy);
    }

    canToggleQualityForCurrentTrack() {
      const track = this.getCurrentTrack();
      if (!track) return false;
      const key = this.sourceKey || 'audio';
      return !!safeStr(track?.sources?.[key]?.lo);
    }

    switchQuality(mode) {
      const nextMode = this.setQualityMode(mode);

      const track = this.getCurrentTrack();
      if (!track) return { ok: true, mode: nextMode, changed: false };

      // UI всегда может показывать выбранный PQ, но переключать реально можно только если есть lo
      if (!this.canToggleQualityForCurrentTrack()) {
        return { ok: true, mode: nextMode, changed: false, disabled: true };
      }

      const desiredSrc = this._selectSrc({
        legacySrc: track.src,
        sources: track.sources,
        sourceKey: this.sourceKey,
        qualityMode: nextMode,
      });

      if (!desiredSrc || desiredSrc === track.src) return { ok: true, mode: nextMode, changed: false };

      const wasPlaying = this.isPlaying();
      const pos = this.getPosition();
      const idx = this.currentIndex;

      // ВАЖНО: обновляем src только для текущего uid в playlist/originalPlaylist,
      // но не считаем это "перестройкой плейлиста".
      const uid = safeStr(track.uid);
      if (uid) {
        const pi = this.playlist.findIndex(t => safeStr(t?.uid) === uid);
        if (pi >= 0) this.playlist[pi].src = desiredSrc;

        const oi = this.originalPlaylist.findIndex(t => safeStr(t?.uid) === uid);
        if (oi >= 0) this.originalPlaylist[oi].src = desiredSrc;
      } else if (this.playlist[idx]) {
        this.playlist[idx].src = desiredSrc;
      }

      // ТИХАЯ пересборка: не вызываем stop(), не эмитим onStop.
      this._silentUnloadCurrentSound();

      // После load: seek(pos), и если wasPlaying=true — продолжаем, иначе остаёмся paused.
      this.load(idx, { autoPlay: wasPlaying, resumePosition: pos });

      return { ok: true, mode: nextMode, changed: true };
    }

    setQuality(quality) {
      const q = String(quality || '').toLowerCase();
      if (q === 'low' || q === 'lo') this.switchQuality('lo');
      else if (q === 'high' || q === 'hi') this.switchQuality('hi');
    }
    // =========================
    // Favorites API (PlayerCore)
    // =========================
    onFavoritesChanged(cb) {
      if (typeof cb !== 'function') return () => {};
      this._favEmitter?.subs?.add(cb);
      return () => { try { this._favEmitter?.subs?.delete(cb); } catch {} };
    }
    _favReadLikedMap() {
      try {
        const raw = localStorage.getItem(this._fav.likedKey);
        const j = raw ? JSON.parse(raw) : {};
        return (j && typeof j === 'object') ? j : {};
      } catch {
        return {};
      }
    }

    _favWriteLikedMap(map) {
      try {
        localStorage.setItem(this._fav.likedKey, JSON.stringify(map && typeof map === 'object' ? map : {}));
        return true;
      } catch {
        return false;
      }
    }

    _favEnsureRefsIndex() {
      if (this._favRefsIndex?.built) return;

      const refs = this._favReadRefs();
      const m = new Map();

      for (const r of refs) {
        const a = safeStr(r?.a);
        const u = safeStr(r?.uid);
        if (!a || !u) continue;
        if (!m.has(u)) m.set(u, new Set());
        m.get(u).add(a);
      }

      this._favRefsIndex = { built: true, map: m };
    }

    _favInvalidateRefsIndex() {
      if (!this._favRefsIndex) this._favRefsIndex = { built: false, map: new Map() };
      this._favRefsIndex.built = false;
      this._favRefsIndex.map = new Map();
    }

    _favReadRefs() {
      try {
        const raw = localStorage.getItem(this._fav.refsKey);
        const j = raw ? JSON.parse(raw) : [];
        return Array.isArray(j) ? j : [];
      } catch {
        return [];
      }
    }

    _favWriteRefs(arr) {
      try {
        localStorage.setItem(this._fav.refsKey, JSON.stringify(Array.isArray(arr) ? arr : []));
        this._favInvalidateRefsIndex();
        return true;
      } catch {
        return false;
      }
    }

    _favAddRefIfMissing(albumKey, uid) {
      const a = safeStr(albumKey);
      const u = safeStr(uid);
      if (!a || !u) return false;

      const refs = this._favReadRefs();
      const exists = refs.some(r => r && String(r.a || '').trim() === a && String(r.uid || '').trim() === u);
      if (exists) return false;

      refs.push({ a, uid: u });
      this._favWriteRefs(refs);
      return true;
    }

    _favRemoveRef(albumKey, uid) {
      const a = safeStr(albumKey);
      const u = safeStr(uid);
      if (!a || !u) return false;

      const refs = this._favReadRefs();
      const next = refs.filter(r => !(r && String(r.a || '').trim() === a && String(r.uid || '').trim() === u));
      if (next.length === refs.length) return false;

      this._favWriteRefs(next);
      return true;
    }

    getLikedUidsForAlbum(albumKey) {
      const a = safeStr(albumKey);
      if (!a) return [];
      const map = this._favReadLikedMap();
      const arr = Array.isArray(map[a]) ? map[a] : [];
      return Array.from(new Set(arr.map(x => String(x || '').trim()).filter(Boolean)));
    }

    isFavorite(uid) {
      const u = safeStr(uid);
      if (!u) return false;

      const map = this._favReadLikedMap();
      for (const k of Object.keys(map)) {
        const arr = Array.isArray(map[k]) ? map[k] : [];
        if (arr.includes(u)) return true;
      }
      return false;
    }

    /**
     * toggleFavorite(uid, opts?)
     * opts:
     * - fromAlbum: boolean (true = действие из родного альбома/мини; false = из Избранного)
     * - albumKey: string | null  (ЯВНОЕ указание родного альбома для uid; главный фикс)
     *
     * Правила:
     * - fromAlbum=true: unlike => ref удаляется полностью (без следа)
     * - fromAlbum=false: unlike => ref остаётся (inactive), удаление только через модалку
     */
    toggleFavorite(uid, opts = true) {
      const u = safeStr(uid);
      if (!u) return { ok: false, reason: 'noUid' };

      const fromAlbum = (typeof opts === 'boolean') ? opts : !!opts?.fromAlbum;
      const explicitAlbumKey = (typeof opts === 'object' && opts) ? safeStr(opts.albumKey) : null;

      const map = this._favReadLikedMap();

      const findAlbumContainingUid = () => {
        for (const a of Object.keys(map)) {
          const arr = Array.isArray(map[a]) ? map[a] : [];
          if (arr.includes(u)) return a;
        }
        return null;
      };

      // ✅ Если UI передал albumKey — используем его.
      // Иначе: для fromAlbum=true обязаны попытаться восстановить albumKey, чтобы refs работали стабильно.
      const guessAlbumKeyFromContext = () => {
        try {
          const a1 = W.AlbumsManager?.getCurrentAlbum?.();
          if (a1 && !String(a1).startsWith('__')) return safeStr(a1);
        } catch {}

        try {
          const cur = this.getCurrentTrack?.();
          const a2 = safeStr(cur?.sourceAlbum);
          if (a2 && !String(a2).startsWith('__')) return a2;
        } catch {}

        try {
          const a3 = W.AlbumsManager?.getPlayingAlbum?.();
          if (a3 && !String(a3).startsWith('__')) return safeStr(a3);
        } catch {}

        return null;
      };

      const albumKey =
        explicitAlbumKey ||
        findAlbumContainingUid() ||
        (fromAlbum ? guessAlbumKeyFromContext() : null) ||
        null;

      const prevLiked = (albumKey && !String(albumKey).startsWith('__'))
        ? this.getLikedUidsForAlbum(albumKey).includes(u)
        : this.isFavorite(u);

      const nextLiked = !prevLiked;

      // liked map update (только если есть albumKey и он не special)
      if (albumKey && !String(albumKey).startsWith('__')) {
        const prevArr = Array.isArray(map[albumKey]) ? map[albumKey] : [];
        const arr = Array.from(new Set(prevArr.map(x => String(x || '').trim()).filter(Boolean)));

        let nextArr = arr.slice();
        if (nextLiked && !nextArr.includes(u)) nextArr.push(u);
        if (!nextLiked && nextArr.includes(u)) nextArr = nextArr.filter(x => x !== u);

        if (nextArr.length === 0) delete map[albumKey];
        else map[albumKey] = nextArr;

        this._favWriteLikedMap(map);
      }

      // refs rules
      if (nextLiked) {
        if (albumKey) this._favAddRefIfMissing(albumKey, u);
      } else {
        if (fromAlbum) {
          // "без следа": удалить ref полностью
          if (albumKey) this._favRemoveRef(albumKey, u);
        } else {
          // favorites view: ref остаётся (inactive)
        }
      }

      // notify subscribers (без DOM events)
      try {
        this._favEmitter.emit({ albumKey: albumKey || '', uid: u, liked: nextLiked, fromAlbum: !!fromAlbum });
      } catch {}

      // спец-правило STOP/next только при снятии лайка в favorites view
      if (!nextLiked && !fromAlbum) {
        this._handleFavoritesPlaylistUnlikeCurrent(u);
      }

      return { ok: true, uid: u, albumKey, liked: nextLiked };
    }

    getFavoritesState() {
      const refs = this._favReadRefs();

      // порядок альбомов как в иконках
      const order = Array.isArray(W.ICON_ALBUMS_ORDER) ? W.ICON_ALBUMS_ORDER.map(x => String(x?.key || '')).filter(Boolean) : [];
      const orderMap = new Map(order.map((k, i) => [k, i]));

      const sorted = refs.slice().filter(r => r && safeStr(r.uid) && safeStr(r.a))
        .sort((r1, r2) => {
          const a1 = String(r1.a || '').trim();
          const a2 = String(r2.a || '').trim();
          const o1 = orderMap.has(a1) ? orderMap.get(a1) : 999;
          const o2 = orderMap.has(a2) ? orderMap.get(a2) : 999;
          if (o1 !== o2) return o1 - o2;
          return String(r1.uid || '').localeCompare(String(r2.uid || ''));
        });

      const map = this._favReadLikedMap();

      const isActive = (a, uid) => {
        const arr = Array.isArray(map[a]) ? map[a] : [];
        return arr.includes(uid);
      };

      const active = [];
      const inactive = [];

      for (const r of sorted) {
        const a = String(r.a || '').trim();
        const u = String(r.uid || '').trim();
        if (!a || !u) continue;

        // Track объект (минимальный), UI достроит поля через fetch config.json как и раньше
        const t = { uid: u, sourceAlbum: a };

        if (isActive(a, u)) active.push(t);
        else inactive.push(t);
      }

      return { active, inactive };
    }

    removeInactivePermanently(uid) {
      const u = safeStr(uid);
      if (!u) return { ok: false, reason: 'noUid' };

      this._favEnsureRefsIndex();

      const set = this._favRefsIndex.map.get(u);
      if (!set || set.size === 0) {
        // нечего удалять
        try { this._favEmitter.emit({ uid: u, liked: false, removed: true }); } catch {}
        return { ok: true, removed: 0 };
      }

      const refs = this._favReadRefs();

      // точечно убираем все пары (a, uid) для этого uid
      const next = refs.filter(r => {
        const ru = String(r?.uid || '').trim();
        if (ru !== u) return true;
        const ra = String(r?.a || '').trim();
        return !set.has(ra);
      });

      const removed = refs.length - next.length;
      this._favWriteRefs(next);

      try {
        this._favEmitter.emit({ uid: u, liked: false, removed: true });
      } catch {}

      return { ok: true, removed };
    }

    restoreInactive(uid) {
      // восстановление = просто поставить ⭐ (активировать)
      // albumKey берём как: если трек сейчас проигрывается в __favorites__, используем sourceAlbum, иначе ищем ref
      const u = safeStr(uid);
      if (!u) return { ok: false, reason: 'noUid' };

      const refs = this._favReadRefs();
      const ref = refs.find(r => String(r?.uid || '').trim() === u) || null;
      const a = safeStr(ref?.a);

      if (a && !String(a).startsWith('__')) {
        const map = this._favReadLikedMap();
        const arr = Array.isArray(map[a]) ? map[a] : [];
        if (!arr.includes(u)) {
          map[a] = Array.from(new Set(arr.concat([u])));
          this._favWriteLikedMap(map);
        }
      }

      // ref должен существовать, но на всякий
      if (a) this._favAddRefIfMissing(a, u);

      try {
        this._favEmitter.emit({ albumKey: a || '', uid: u, liked: true });
      } catch {}

      return { ok: true };
    }

    showInactiveFavoriteModal(params = {}) {
      const u = safeStr(params?.uid);
      const title = String(params?.title || 'Трек');
      if (!u) return;

      const esc = W.Utils?.escapeHtml ? (s) => W.Utils.escapeHtml(String(s || '')) : (s) => String(s || '');

      if (!W.Modals?.open) return;

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
          // fallback: без confirm helper просто удаляем
          this.removeInactivePermanently(u);
          try { params?.onDeleted?.(); } catch {}
        }
      });
    }

    _handleFavoritesPlaylistUnlikeCurrent(unlikedUid) {
      try {
        const playingAlbum = W.AlbumsManager?.getPlayingAlbum?.();
        if (playingAlbum !== W.SPECIAL_FAVORITES_KEY) return;

        const cur = this.getCurrentTrack();
        const curUid = safeStr(cur?.uid);
        if (!curUid || curUid !== safeStr(unlikedUid)) return;

        // Строим список активных через refs+map (без favoritesRefsModel)
        const state = this.getFavoritesState();
        const active = Array.isArray(state?.active) ? state.active : [];

        if (active.length === 0) {
          // единственный разрешённый STOP от избранного
          this.stop?.();
          return;
        }

        // переключаемся на следующий активный: через AlbumsManager.ensureFavoritesPlayback (уже существующая логика сборки плейлиста)
        // Здесь мы не знаем индекс в UI-модели, поэтому просим UI пересобрать модель и стартовать первый активный.
        try { W.FavoritesUI?.playFirstActiveFavorite?.(); } catch {}
      } catch (e) {
        console.warn('_handleFavoritesPlaylistUnlikeCurrent failed:', e);
      }
    }

    // =========================
    // State getters
    // =========================
    getCurrentTrack() {
      return (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) ? null : (this.playlist[this.currentIndex] || null);
    }

    getIndex() { return this.currentIndex; }

    getNextIndex() {
      const len = this.playlist.length;
      if (!len || this.currentIndex < 0) return -1;
      return (this.currentIndex + 1) % len;
    }

    isPlaying() { return !!(this.sound?.playing && this.sound.playing()); }

    // =========================
    // Events
    // =========================
    on(events) {
      for (const k of Object.keys(events || {})) {
        if (this.callbacks[k]) this.callbacks[k].push(events[k]);
      }
    }

    trigger(event, ...args) {
      const arr = this.callbacks[event];
      if (!arr) return;
      for (const fn of arr) { try { fn(...args); } catch {} }
    }

    // =========================
    // Tick
    // =========================
    startTick() {
      this.stopTick();
      this.tickInterval = setInterval(() => {
        this.trigger('onTick', this.getPosition(), this.getDuration());
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
      if (delay <= 0) return void this.clearSleepTimer();

      this.sleepTimerTarget = Date.now() + delay;
      if (this.sleepTimerId) clearTimeout(this.sleepTimerId);

      this.sleepTimerId = setTimeout(() => {
        this.sleepTimerId = null;
        const target = this.sleepTimerTarget;
        this.sleepTimerTarget = 0;
        this.trigger('onSleepTriggered', { targetAt: target });
        if (this.isPlaying()) { try { this.pause(); } catch {} }
      }, delay);
    }

    clearSleepTimer() {
      if (this.sleepTimerId) clearTimeout(this.sleepTimerId);
      this.sleepTimerId = null;
      this.sleepTimerTarget = 0;
    }

    getSleepTimerTarget() { return this.sleepTimerTarget || 0; }

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
        const uid = safeStr(this.getCurrentTrack()?.uid);
        if (!uid) return;

        const last = this.shuffleHistory.length ? this.shuffleHistory[this.shuffleHistory.length - 1] : null;
        if (last?.uid === uid) return;

        this.shuffleHistory.push({ uid });
        if (this.shuffleHistory.length > this.historyMax) this.shuffleHistory.splice(0, this.shuffleHistory.length - this.historyMax);
      } catch {}
    }

    _popHistoryPrevIndex() {
      try {
        if (!this.shuffleMode || !this.shuffleHistory?.length) return -1;
        this.shuffleHistory.pop();
        const uid = safeStr(this.shuffleHistory.length ? this.shuffleHistory[this.shuffleHistory.length - 1]?.uid : null);
        if (!uid) return -1;
        const idx = this.playlist.findIndex(t => safeStr(t?.uid) === uid);
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

      const existingUid = new Set(this.playlist.map(t => safeStr(t?.uid)).filter(Boolean));
      const toAdd = [];

      for (const t of list) {
        const uid = safeStr(t?.uid);
        if (!uid || existingUid.has(uid)) continue;
        existingUid.add(uid);

        toAdd.push({
          src: safeStr(t?.src),
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

      if (toAdd.length) this.playlist = this.playlist.concat(toAdd);
    }

    removeFromPlaylistTailIfNotPlayed(params = {}) {
      const uid = safeStr(params?.uid);
      if (!uid) return false;

      const curUid = safeStr(this.getCurrentTrack()?.uid);
      if (curUid === uid) return false;

      const played = Array.isArray(this.shuffleHistory) ? this.shuffleHistory.some(h => safeStr(h?.uid) === uid) : false;
      if (played) return false;

      const beforeLen = this.playlist.length;
      this.playlist = this.playlist.filter(t => safeStr(t?.uid) !== uid);
      if (this.currentIndex >= this.playlist.length) this.currentIndex = this.playlist.length - 1;
      return this.playlist.length !== beforeLen;
    }

    // =========================
    // Backend rebuild (pulse)
    // =========================
    rebuildCurrentSound(options = {}) {
      try {
        const track = this.getCurrentTrack();
        if (!track) return false;

        const targetHtml5 = !options.preferWebAudio;
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
      try { return this.sound?._sounds?.[0]?._node || null; } catch { return null; }
    }

    destroy() {
      this.stop();
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentIndex = -1;
      for (const off of this._ios.unsubs) { try { off(); } catch {} }
      this._ios.unsubs.length = 0;
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

  // init without duplicate Howler-wait (bootstrap already waits)
  const init = () => { try { W.playerCore.initialize(); } catch {} };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

import { getTrackByUid } from '../scripts/app/track-registry.js';
import { Favorites } from '../scripts/core/favorites-manager.js';
import { ensureMediaSession } from './player-core/media-session.js';
import { resolveFavoritesOnlyState } from '../scripts/app/player/favorites-only-resolver.js';
import { initIosAudioKeeper } from './player-core/ios-audio-keeper.js';
import { markDeviceSettingsDirty } from '../scripts/analytics/sync-dirty-events.js';

// UID.001_(Playback safety invariant)_(защитить священное правило проигрывания)_(никакие intel/recs/providers/telemetry не имеют права стопать/сбрасывать playback кроме уже разрешённых сценариев) UID.008_(No playback mutation by intel)_(развести ядро плеера и интеллектуальный слой)_(PlayerCore остаётся единственным владельцем playback state, intel только читает и рекомендует) UID.011_(Media variants registry)_(подготовить future playback для richer variants)_(PlayerCore должен оставаться тонким исполнителем, а выбор variant/source — вне его) UID.012_(Quality dimension)_(сохранить quality-aware playback как часть ядра)_(Hi/Lo/Lossless логика должна заходить в PlayerCore только через безопасные resolver/registry bridges) UID.050_(Session profile)_(дать future session-aware recommendations корректный источник контекста)_(события play/pause/tick/trackChanged отсюда питают session/intel слой, но не наоборот) UID.060_(Session-aware next-track strategy)_(подготовить безопасную стыковку next-track intelligence)_(любые future next suggestions могут предлагаться intel-слоем, но применять их может только PlayerCore по явному действию/разрешённому autoplay) UID.062_(Recommendation memory and feedback)_(готовить reaction signals без влияния на playback)_(recs telemetry может читать player transitions, но не должна вмешиваться в них) UID.079_(VK social/media actions)_(не смешивать external provider actions с ядром аудио)_(PlayerCore не должен знать о VK/Yandex/Google actions beyond already resolved media URLs) UID.094_(No-paralysis rule)_(оставить плеер работоспособным при любых сбоях нового слоя)_(если intel/providers/telemetry недоступны, PlayerCore работает полностью автономно)

(function () {
  'use strict';
  
  const W = window, ls = localStorage, LS_VOL = 'playerVolume', LS_PQ = 'qualityMode:v1';
  const clamp = (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b);
  const sUid = v => (v == null ? '' : String(v)).trim() || null;
  const qNorm = v => String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
  const emitG = (n, d) => W.dispatchEvent(new CustomEvent(n, d ? { detail: d } : undefined));
  const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  class PlayerCore {
    playlist = []; originalPlaylist = []; currentIndex = -1;
    flags = { shuf: false, rep: false, mute: false }; shufHist = [];
    sound = null; qMode = qNorm(ls.getItem(LS_PQ));
    _tok = 0; _loadReq = 0; _tick = null; _sleep = null; _skips = 0;
    _pendingIndex = null; _pendingUid = null; _selectionSeq = 0;
    _ev = new Map(); _favSubs = new Set(); _playingUid = null;
    _persistTimer = null;
    
    constructor() {
      W.addEventListener('offline:uiChanged', () => this.qMode = qNorm(ls.getItem(LS_PQ)));
      this._ms = ensureMediaSession({
        onPlay: () => this.play(),
        onPause: () => this.pause(),
        onStop: () => this.stop(),
        onPrev: () => this.prev(),
        onNext: () => this.next(),
        onSeekTo: t => this.seek(t),
        getPositionState: () => ({
          duration: this.getDuration(),
          playbackRate: 1,
          position: this.getPosition()
        })
      });
      
      const unlock = () => { 
        if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
        if (this._unlk) return; this._unlk = true;
        try { new Howl({ src: ['data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIWFhYW5uYWFuYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5u//OEAAAAAAAAAAAAAAAAAAAAAAAAMGluZ2QAAAAcAAAABAAAASFycnJyc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nz//OEAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4Ljc2AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], html5: true, volume: 0 }).play(); } catch {}
      };
      ['touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, unlock, { once: true, capture: true }));
    }

    initialize() {
      initIosAudioKeeper();
      this._bindPlaybackPersistence();
    }

    prepareContext() {
      if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
    }

    _cancelPendingLoad() {
      this._loadReq++;
      this._pendingIndex = null;
      this._pendingUid = null;
    }

    _commitTrackSelection(track, index, previousUid, dir, reason) {
      const uid = sUid(track?.uid);
      this.currentIndex = index;
      this._pendingIndex = null;
      this._pendingUid = null;

      if (!uid || uid === sUid(previousUid)) return false;

      const detail = {
        uid,
        previousUid: sUid(previousUid),
        index,
        dir: Number(dir) || 1,
        reason: String(reason || 'selection'),
        selectionSeq: ++this._selectionSeq
      };

      this._emit('onTrackChange', track, index);
      emitG('player:trackChanged', detail);
      return true;
    }

    setPlaylist(tracks, startIdx = 0, meta, opts = {}) {
      this._cancelPendingLoad();
      const prevPos = this.getPosition(), wasPlay = this.isPlaying();
      this.playlist = (tracks || []).map(t => ({ ...t, uid: sUid(t.uid), title: t.title || 'Без названия', artist: t.artist || 'Витрина Разбита' })).filter(t => t.uid);
      if (!opts.preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];

      this.currentIndex = clamp(startIdx, 0, Math.max(0, this.playlist.length - 1));
      const tUid = this.playlist[this.currentIndex]?.uid || null;
      if (!opts.preserveShuffleMode) this.shufHist = [];

      if (this.flags.shuf && !opts.preserveShuffleMode) this.shufflePlaylist(tUid);
      else if (tUid) this.currentIndex = Math.max(0, this.playlist.findIndex(t => t.uid === tUid));

      this._skips = 0;
      if (this.sound && this._playingUid === tUid && wasPlay && opts.preservePosition) {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        return this._updMedia();
      }

      if (opts.deferLoad) {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        this._updMedia();
        return;
      }

      if (wasPlay) this.load(this.currentIndex, {
        autoPlay: true,
        resumePosition: opts.preservePosition ? prevPos : 0
      });
      else {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        this._updMedia();
      }
    }

    playExactFromPlaylist(tracks, targetUid, opts = {}) {
      const uid = sUid(targetUid);
      const list = (tracks || []).map(t => ({ ...t, uid: sUid(t.uid), title: t.title || 'Без названия', artist: t.artist || 'Витрина Разбита' })).filter(t => t.uid);
      if (!uid || !list.length) return false;

      const idx = list.findIndex(t => t.uid === uid);
      if (idx < 0) return false;

      const isSame = !!this.sound && this.getCurrentTrackUid() === uid;

      this.setPlaylist(list, idx, null, {
        preservePosition: isSame,
        preserveOriginalPlaylist: !!opts.preserveOriginalPlaylist,
        preserveShuffleMode: false,
        deferLoad: !isSame
      });

      if (!isSame) {
        this.load(idx, { autoPlay: true, dir: Number(opts.dir) || 1 });
      }
      else emitG('playlist:changed', { reason: 'seamless_switch' });
      return true;
    }

    shufflePlaylist(keepUid = null) {
      const cUid = keepUid || this.getCurrentTrackUid();
      for (let i = this.playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
      }
      this.currentIndex = 0;
      if (cUid) { const idx = this.playlist.findIndex(t => t.uid === cUid); if (idx >= 0) this.playlist.unshift(...this.playlist.splice(idx, 1)); }
    }

    getPlaylistSnapshot() { return [...this.playlist]; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getIndex() { return this.currentIndex; }
    getNextIndex() { return this.playlist.length ? (this.currentIndex + 1) % this.playlist.length : -1; }
    getCurrentTrackUid() { return sUid(this.getCurrentTrack()?.uid); }

    isPlaying() { return !!this.sound?.playing(); }
    play(idx, opts = {}) {
      this.prepareContext();
      if (idx != null) {
        if (idx === this.currentIndex && this.sound) {
          if (opts.autoPlay !== false && !this.isPlaying()) return this.sound.play();
          return;
        }
        return this.load(idx, { ...opts, autoPlay: opts.autoPlay ?? true });
      }
      if (this.sound) {
        if (!this.isPlaying()) return this.sound.play();
        return;
      }
      if (this.currentIndex >= 0) return this.load(this.currentIndex, { autoPlay: true });
    }
    pause() {
      this._cancelPendingLoad();
      this.sound?.pause();
    }

    stop() {
      this._cancelPendingLoad();
      this._unload({
        emitStop: true,
        clearPersistedState: true,
        revokeBlob: true
      });
      this._updMedia();
    }
    
    next() {
      if (!this.playlist.length) return;
      const base = Number.isInteger(this._pendingIndex) ? this._pendingIndex : this.currentIndex;
      if (this.flags.shuf) { this.shufHist.push(base); if (this.shufHist.length > 50) this.shufHist.shift(); }
      return this.load((base + 1) % this.playlist.length, { autoPlay: true, dir: 1, reason: 'next' });
    }
    
    prev() {
      if (!this.playlist.length) return;
      const hasPending = Number.isInteger(this._pendingIndex);
      if (!hasPending && this.getPosition() > 3) return void this.seek(0);
      if (this.flags.shuf && this.shufHist.length) return this.load(this.shufHist.pop(), { autoPlay: true, dir: -1, reason: 'previous_history' });
      const base = hasPending ? this._pendingIndex : this.currentIndex;
      return this.load((base - 1 + this.playlist.length) % this.playlist.length, { autoPlay: true, dir: -1, reason: 'previous' });
    }
    
    seek(s) { return this.sound?.seek(s) || 0; }
    getPosition() { return this.sound?.seek() || 0; }
    getDuration() { return this.sound?.duration() || 0; }

    setVolume(v) { 
      if (isMob) return; 
      const vol = clamp(Number(v)/100, 0, 1); 
      ls.setItem(LS_VOL, String(Math.round(vol * 100)));
      markDeviceSettingsDirty();
      if (!this.flags.mute) Howler.volume(vol);
    }
    getVolume() { return isMob ? 100 : Number(ls.getItem(LS_VOL) ?? 100); }
    setMuted(m) { if (isMob) return; this.flags.mute = !!m; Howler.volume(this.flags.mute ? 0 : this.getVolume() / 100); }
    isMuted() { return this.flags.mute; }

    async load(idx, opts = {}) {
      const targetIndex = Number(idx);
      const t = this.playlist[targetIndex];
      const uid = sUid(t?.uid);
      const dir = Number(opts.dir) || 1;
      const req = ++this._loadReq;

      if (!t || !uid) return false;

      const autoPlay = opts.autoPlay ?? this.isPlaying();
      const reason = String(opts.reason || (opts.isAutoSkip ? 'auto_skip' : (opts._forceReload ? 'transport_reload' : 'selection')));
      opts = { ...opts, autoPlay, reason };
      this._pendingIndex = targetIndex;
      this._pendingUid = uid;

      if (!opts.isAutoSkip) this._skips = 0;

      let resolved = await W.TrackResolver?.resolve?.(uid, this.qMode).catch(() => null);
      if (req !== this._loadReq) return false;

      const netOk = W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
      let url = resolved?.url || null;
      let provider = resolved?.provider || 'unknown';

      if (!url && !resolved?.blob) {
        const smart = await W.TrackRegistry?.getSmartUrlInfo?.(uid, 'audio', this.qMode).catch(() => null);
        if (req !== this._loadReq) return false;
        if (smart?.url) {
          url = smart.url;
          provider = smart.provider || provider;
        }
      }

      if (!url && !resolved?.blob) {
        if (this._skips >= this.playlist.length) {
          if (req === this._loadReq) {
            this._pendingIndex = null;
            this._pendingUid = null;
          }
          W.NotificationSystem?.error('Нет доступных треков');
          this._emit('onPlaybackError', { reason: 'no_source', uid });
          return false;
        }

        setTimeout(() => {
          if (req !== this._loadReq || !this.playlist.length) return;
          this._skips++;
          this.load((targetIndex + dir + this.playlist.length) % this.playlist.length, {
            ...opts,
            autoPlay,
            isAutoSkip: true,
            dir,
            reason: 'auto_skip'
          });
        }, 80);
        return false;
      }

      const commitIndex = this.playlist.findIndex(track => sUid(track?.uid) === uid);
      if (req !== this._loadReq || commitIndex < 0) return false;

      const previousUid = sUid(this._playingUid || this.getCurrentTrackUid());
      const hadSound = !!this.sound;
      const position = Number(opts.resumePosition) || 0;
      const retry = Number(opts._retryN) || 0;

      this.currentIndex = commitIndex;
      this._pendingIndex = null;
      this._pendingUid = null;

      if (this.sound && this._playingUid === uid && !opts._forceReload) {
        if (position) this.seek(position);
        if (autoPlay && !this.isPlaying()) this.sound.play();
        this._updMedia();
        this._syncMediaSessionPosition(true);
        return true;
      }

      this._commitTrackSelection(t, commitIndex, previousUid, dir, reason);
      this._updMedia();
      this._syncMediaSessionPosition(true);

      const tok = ++this._tok;
      let blobKey = null;

      if (resolved?.blob) {
        blobKey = `p_${uid}_${tok}`;
        url = W.Utils?.blob?.createUrl
          ? W.Utils.blob.createUrl(blobKey, resolved.blob)
          : URL.createObjectURL(resolved.blob);
        provider = 'cache';
      } else if (url && netOk && W.Utils?.getNet?.()?.kind === 'cellular' && W.NetPolicy?.shouldShowCellularToast?.()) {
        W.NotificationSystem?.show?.('Воспроизведение через мобильную сеть', 'info');
      }

      this.currentProvider = provider;
      const sameUidReload = hadSound && previousUid === uid;
      const sf = fn => (...args) => tok === this._tok && fn(...args);

      this._unload({
        emitStop: false,
        clearPersistedState: false,
        revokeBlob: true
      });
      this._playingUid = uid;
      this._oK = blobKey;
      this._oKTok = blobKey ? tok : 0;

      this.sound = new Howl({
        src: [url],
        html5: true,
        format: ['mp3'],
        xhr: { withCredentials: false },
        autoplay: false,
        onload: sf(() => {
          if (position) this.seek(position);
          this._updMedia();
          this._syncMediaSessionPosition(true);
        }),
        onplay: sf(() => {
          this._startT();
          this._persistPlaybackState(true);
          this._emit('onPlay', t, commitIndex);
          this._updMedia();
          this._syncMediaSessionPosition(true);
          emitG('player:play', { uid, duration: this.getDuration(), type: 'audio', provider });
          emitG('player:providerChanged', { provider });
        }),
        onpause: sf(() => {
          this._stopT();
          this._persistPlaybackState(true);
          this._emit('onPause');
          this._updMedia();
          this._syncMediaSessionPosition(true);
          emitG('player:pause', { uid });
        }),
        onend: sf(() => {
          this._emit('onEnd');
          this._updMedia();
          emitG('player:ended', { uid });
          emitG('analytics:forceFlush');
          this.flags.rep ? this.play(this.currentIndex) : this.next();
        }),
        onloaderror: sf(() => this._err(commitIndex, retry, opts, dir)),
        onplayerror: sf(() => this._err(commitIndex, retry, opts, dir))
      });

      if (sameUidReload) {
        emitG('player:transportReloaded', {
          uid,
          reason,
          quality: this.qMode,
          provider,
          transportGeneration: tok,
          autoPlay: !!autoPlay
        });
      }

      if (autoPlay) this.sound.play();
      return true;
    }

    _err(idx, retry, opts, dir) {
      const tok = this._tok;
      const req = this._loadReq;
      const autoPlay = opts.autoPlay !== false;

      this._emit('onPlaybackError', {
        reason: 'error',
        uid: this.getCurrentTrackUid()
      });

      if (
        (W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine) &&
        retry < 2
      ) {
        setTimeout(() => {
          if (tok !== this._tok || req !== this._loadReq) return;
          this.load(idx, {
            ...opts,
            autoPlay,
            _retryN: retry + 1,
            dir,
            reason: 'retry'
          });
        }, 250 + retry * 500);
        return;
      }

      this._skips = Math.min(
        this.playlist.length,
        this._skips + 1
      );

      setTimeout(() => {
        if (
          tok !== this._tok ||
          req !== this._loadReq ||
          !this.playlist.length
        ) return;

        this.load(
          (idx + dir + this.playlist.length) % this.playlist.length,
          {
            ...opts,
            autoPlay,
            isAutoSkip: true,
            dir,
            reason: 'error_skip'
          }
        );
      }, 120);
    }

    _unload({
      emitStop = true,
      clearPersistedState = emitStop,
      revokeBlob = true
    } = {}) {
      if (this.sound) {
        try {
          this.sound.stop();
          this.sound.unload();
        } catch {}
        this.sound = null;
      }

      this._playingUid = null;

      if (revokeBlob && this._oK) {
        try {
          W.Utils?.blob?.revokeUrl?.(this._oK);
        } catch {}
        this._oK = null;
        this._oKTok = 0;
      }

      this._stopT();

      if (clearPersistedState) {
        this._clearPersistedPlaybackState();
      }

      if (emitStop) {
        this._syncMediaSessionPosition(true);
        emitG('player:stop');
        this._emit('onStop');
      }
    }

    _syncMediaSessionPosition(force = false) { try { this._ms?.updatePositionState?.({ force }); } catch {} }

    _buildPersistedState() {
      const t = this.getCurrentTrack();
      const uid = sUid(t?.uid);
      const pA = sUid(W.AlbumsManager?.getPlayingAlbum?.());
      const cA = sUid(W.AlbumsManager?.getCurrentAlbum?.()) || pA;
      if (!uid || this.currentIndex < 0 || !pA) return null;
      return {
        album: pA,
        currentAlbum: cA,
        trackUid: uid,
        sourceAlbum: sUid(t?.sourceAlbum),
        trackIndex: this.currentIndex,
        position: Math.max(0, Math.floor(this.getPosition() || 0)),
        volume: this.getVolume(),
        muted: !!this.isMuted(),
        wasPlaying: !!this.isPlaying(),
        repeat: !!this.flags.rep,
        shuffle: !!this.flags.shuf,
        quality: this.qMode || 'hi',
        ts: Date.now()
      };
    }

    _persistPlaybackState(force = false) {
      try {
        const st = this._buildPersistedState();
        if (!st) return;
        if (!force && this._persistTimer) return;
        if (!force) {
          this._persistTimer = setTimeout(() => {
            this._persistTimer = null;
            try { localStorage.setItem('playerStateV2', JSON.stringify(this._buildPersistedState())); } catch {}
          }, 150);
          return;
        }
        localStorage.setItem('playerStateV2', JSON.stringify(st));
      } catch {}
    }

    _clearPersistedPlaybackState() {
      try { localStorage.removeItem('playerStateV2'); } catch {}
    }

    _bindPlaybackPersistence() {
      W.addEventListener('beforeunload', () => this._persistPlaybackState(true));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this._persistPlaybackState(true); });
    }

    _startT() {
      this._stopT();
      this._tick = setInterval(() => {
        const pos = this.getPosition(), dur = this.getDuration();
        this._persistPlaybackState(false);
        this._emit('onTick', pos, dur);
        emitG('player:tick', { currentTime: pos, volume: this.getVolume(), muted: this.isMuted() });
        this._syncMediaSessionPosition(false);
      }, 250);
    }
    _stopT() { if (this._tick) clearInterval(this._tick); this._tick = null; }
    _updMedia() { try { this._ms?.updateMetadata?.({ title: this.getCurrentTrack()?.title, artist: this.getCurrentTrack()?.artist, album: this.getCurrentTrack()?.album, artworkUrl: this.getCurrentTrack()?.cover, playing: this.isPlaying() }); } catch {} }

    canToggleQualityForCurrentTrack() { return !!this.getCurrentTrack() && !!(getTrackByUid(this.getCurrentTrackUid())?.audio_low || this.getCurrentTrack()?.sources?.audio?.lo); }
    switchQuality(m) {
      const nq = qNorm(m);
      if (this.qMode === nq) return false;

      const wasPlaying = this.isPlaying();
      const position = this.getPosition();

      this.qMode = nq;
      ls.setItem(LS_PQ, nq);
      markDeviceSettingsDirty();
      emitG('quality:changed', { quality: nq });
      emitG('offline:uiChanged');

      if (this.currentIndex >= 0 && this.sound) {
        this.load(this.currentIndex, {
          autoPlay: wasPlaying,
          resumePosition: position,
          dir: 1,
          _forceReload: true,
          reason: 'quality_change'
        });
      }

      W.NotificationSystem?.show?.(
        `Качество переключено на ${nq === 'hi' ? 'Hi' : 'Lo'}`,
        'info'
      );
      return true;
    }

    isFavorite(uid) { return Favorites.isLiked(sUid(uid)); }
    toggleFavorite(uid, opts = {}) {
      const u = sUid(uid); if (!u) return { liked: false };
      const pA = W.AlbumsManager?.getPlayingAlbum?.(), isFavView = pA === W.SPECIAL_FAVORITES_KEY;
      const src = opts.source || (opts.fromAlbum ? 'album' : (isFavView ? 'favorites' : 'album'));
      
      const liked = Favorites.toggle(u, { source: src, albumKey: opts.albumKey });
      this._favSubs.forEach(f => { try { f({ uid: u, liked, albumKey: opts.albumKey }); } catch {} });

      if (!liked && src === 'favorites' && isFavView && this.getCurrentTrackUid() === u) {
        const activeCount = this.getFavoritesState().active?.length || 0;
        if (activeCount <= 0) {
          this.stop();
        } else {
          this.next();
        }
      } else if (!liked && ls.getItem('favoritesOnlyMode') === '1') {
        const pA = W.AlbumsManager?.getPlayingAlbum?.();
        const st = resolveFavoritesOnlyState({
          sourcePlaylist: this.originalPlaylist,
          playingAlbum: pA,
          favoritesOnly: true,
          currentUid: this.getCurrentTrackUid(),
          isFavorite: x => this.isFavorite(x),
          favoritesState: this.getFavoritesState()
        });

        if (!st.resolvedPlaylist.length) {
          ls.setItem('favoritesOnlyMode', '0');
          this.applyFavoritesOnlyFilter({ forceReload: false });
          W.NotificationSystem?.info?.('⭐ Режим только избранные выключен');
        } else {
          this.applyFavoritesOnlyFilter({ forceReload: this.getCurrentTrackUid() === u });
        }
      }
      return { liked };
    }

    removeInactivePermanently(uid) { const u = sUid(uid); if (u && Favorites.remove(u)) this._favSubs.forEach(f => { try { f({ uid: u, liked: false, removed: true }); } catch {} }); }
    restoreInactive(uid) { return this.toggleFavorite(uid, { source: 'favorites' }); }
    
    showInactiveFavoriteModal(p = {}) {
      emitG('player:inactiveFavoriteModalRequested', {
        uid: sUid(p.uid),
        title: String(p.title || 'Трек'),
        onDeleted: typeof p.onDeleted === 'function' ? p.onDeleted : null
      });
    }

    getFavoritesState() {
      return Favorites.getSnapshot().reduce((r, i) => {
        const u = sUid(i?.uid);
        if (u && !i.deletedAt) r[i.inactiveAt ? 'inactive' : 'active'].push({ uid: u, sourceAlbum: sUid(i.sourceAlbum || i.albumKey || getTrackByUid(u)?.sourceAlbum), ...(i.inactiveAt && { inactiveAt: i.inactiveAt }) });
        return r;
      }, { active: [], inactive: [] });
    }

    getLikedUidsForAlbum(key) { const k = sUid(key); return k ? Favorites.getSnapshot().filter(i => !i.inactiveAt && !i.deletedAt && sUid(getTrackByUid(i.uid)?.sourceAlbum) === k).map(i => i.uid) : []; }
    
    applyFavoritesOnlyFilter(opts = {}) {
      this._cancelPendingLoad();
      const pA = W.AlbumsManager?.getPlayingAlbum?.();
      const favOn = ls.getItem('favoritesOnlyMode') === '1';
      if (!pA || !this.originalPlaylist?.length) return false;

      const wasPlaying = this.isPlaying();
      const curUid = this.getCurrentTrackUid();
      const prevPos = this.getPosition();

      const st = resolveFavoritesOnlyState({
        sourcePlaylist: this.originalPlaylist,
        playingAlbum: pA,
        favoritesOnly: favOn,
        currentUid: curUid,
        isFavorite: uid => this.isFavorite(uid),
        favoritesState: this.getFavoritesState()
      });

      if (favOn && st.isEmptyForFavoritesMode) return false;
      if (!st.resolvedPlaylist.length) return false;

      const sameSet = st.resolvedPlaylist.length === this.playlist.length && st.resolvedPlaylist.every((t, i) => sUid(t.uid) === sUid(this.playlist[i]?.uid));
      const nextIdx = st.currentAllowed ? Math.max(0, st.currentIndex) : 0;
      const keepUid = sUid(st.resolvedPlaylist[nextIdx]?.uid);
      const keepCurrent = st.currentAllowed && sUid(curUid) === keepUid;

      this.shufHist = [];
      this.playlist = [...st.resolvedPlaylist];
      this.currentIndex = nextIdx;

      if (!favOn) {
        if (this.flags.shuf) {
          const cur = keepUid || curUid;
          this.shufflePlaylist(cur);
          this.currentIndex = Math.max(0, this.playlist.findIndex(t => sUid(t.uid) === cur));
        }
        if (keepCurrent && this.sound) {
          this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
          this._updMedia();
          W.PlayerUI?.updatePlaylistFiltering?.();
          emitG('playlist:changed', { reason: 'favoritesOnlyOff' });
          return true;
        }
      }

      if (favOn && this.flags.shuf) {
        const head = keepUid || st.firstPlayableUid;
        this.shufflePlaylist(head);
        this.currentIndex = Math.max(0, this.playlist.findIndex(t => sUid(t.uid) === head));
      }

      if (keepCurrent && this.sound && (sameSet || !opts.forceReload)) {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        this._updMedia();
        W.PlayerUI?.updatePlaylistFiltering?.();
        emitG('playlist:changed', { reason: favOn ? 'favoritesOnlyOnKeep' : 'favoritesOnlyOffKeep' });
        return true;
      }

      if (wasPlaying || opts.autoPlayIfNeeded) {
        this.load(this.currentIndex, { autoPlay: true, resumePosition: keepCurrent ? prevPos : 0, dir: 1 });
      } else {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        this._updMedia();
      }

      W.PlayerUI?.updatePlaylistFiltering?.();
      emitG('playlist:changed', { reason: favOn ? 'favoritesOnlyOn' : 'favoritesOnlyOff' });
      return true;
    }

    onFavoritesChanged(cb) { this._favSubs.add(cb); return () => this._favSubs.delete(cb); }

    toggleShuffle() { 
      this._cancelPendingLoad();
      this.flags.shuf = !this.flags.shuf; 
      if (this.flags.shuf) this.shufflePlaylist(); else { const u = this.getCurrentTrackUid(); this.playlist = [...this.originalPlaylist]; if(u) this.currentIndex = Math.max(0, this.playlist.findIndex(t => t.uid === u)); } 
      emitG('playlist:changed', { reason: 'shuffle', shuffleMode: this.flags.shuf }); 
    }
    isShuffle() { return this.flags.shuf; }
    
    toggleRepeat() { this.flags.rep = !this.flags.rep; emitG('playlist:changed', { reason: 'repeat', repeatMode: this.flags.rep }); }
    isRepeat() { return this.flags.rep; }

    on(evs) { Object.entries(evs||{}).forEach(([k, f]) => { if (!this._ev.has(k)) this._ev.set(k, new Set()); this._ev.get(k).add(f); }); }
    _emit(n, ...a) { this._ev.get(n)?.forEach(f => { try { f(...a); } catch {} }); }

    setSleepTimer(ms, meta = {}) {
      clearTimeout(this._sleep);
      this._sleep = null;
      this._sleepMeta = ms > 0 ? { ...meta } : null;
      this._sleepTarget = ms > 0 ? Date.now() + ms : 0;

      emitG('player:sleepTimerChanged', {
        active: ms > 0,
        targetAt: this._sleepTarget || 0,
        meta: this._sleepMeta || null
      });

      if (ms > 0) {
        this._sleep = setTimeout(() => {
          this.stop();
          this._emit('onSleepTriggered');
          emitG('player:sleepTimerTriggered', {
            targetAt: this._sleepTarget || 0,
            meta: this._sleepMeta || null
          });
          this._sleep = null;
          this._sleepTarget = 0;
          this._sleepMeta = null;
          emitG('player:sleepTimerChanged', { active: false, targetAt: 0, meta: null });
        }, ms);
      }
    }
    getSleepTimerTarget() { return this._sleepTarget || 0; }
    getSleepTimerMeta() { return this._sleepMeta || null; }
    clearSleepTimer() { this.setSleepTimer(0); }
  }

  W.playerCore = new PlayerCore();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => W.playerCore.initialize()); else W.playerCore.initialize();
})();

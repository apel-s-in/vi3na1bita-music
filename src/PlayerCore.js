import { getTrackByUid } from '../scripts/app/track-registry.js';
import { Favorites } from '../scripts/core/favorites-manager.js';
import { ensureMediaSession } from './player-core/media-session.js';
import { resolveFavoritesOnlyState } from '../scripts/app/player/favorites-only-resolver.js';

// UID.001_(Playback safety invariant)_(защитить священное правило проигрывания)_(никакие intel/recs/providers/telemetry не имеют права стопать/сбрасывать playback кроме уже разрешённых сценариев)
// UID.008_(No playback mutation by intel)_(развести ядро плеера и интеллектуальный слой)_(PlayerCore остаётся единственным владельцем playback state, intel только читает и рекомендует)
// UID.011_(Media variants registry)_(подготовить future playback для richer variants)_(PlayerCore должен оставаться тонким исполнителем, а выбор variant/source — вне его)
// UID.012_(Quality dimension)_(сохранить quality-aware playback как часть ядра)_(Hi/Lo/Lossless логика должна заходить в PlayerCore только через безопасные resolver/registry bridges)
// UID.050_(Session profile)_(дать future session-aware recommendations корректный источник контекста)_(события play/pause/tick/trackChanged отсюда питают session/intel слой, но не наоборот)
// UID.060_(Session-aware next-track strategy)_(подготовить безопасную стыковку next-track intelligence)_(любые future next suggestions могут предлагаться intel-слоем, но применять их может только PlayerCore по явному действию/разрешённому autoplay)
// UID.062_(Recommendation memory and feedback)_(готовить reaction signals без влияния на playback)_(recs telemetry может читать player transitions, но не должна вмешиваться в них)
// UID.079_(VK social/media actions)_(не смешивать external provider actions с ядром аудио)_(PlayerCore не должен знать о VK/Yandex/Google actions beyond already resolved media URLs)
// UID.094_(No-paralysis rule)_(оставить плеер работоспособным при любых сбоях нового слоя)_(если intel/providers/telemetry недоступны, PlayerCore работает полностью автономно)

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
    _tok = 0; _tick = null; _sleep = null; _skips = 0;
    _ev = new Map(); _favSubs = new Set();
    
    constructor() {
      W.addEventListener('offline:uiChanged', () => this.qMode = qNorm(ls.getItem(LS_PQ)));
      this._ms = ensureMediaSession({
        onPlay: () => this.play(), onPause: () => this.pause(), onStop: () => this.stop(),
        onPrev: () => this.prev(), onNext: () => this.next(), onSeekTo: t => this.seek(t)
      });
      
      const unlock = () => { 
        if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
        if (this._unlk) return; this._unlk = true;
        try { new Howl({ src: ['data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIWFhYW5uYWFuYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5u//OEAAAAAAAAAAAAAAAAAAAAAAAAMGluZ2QAAAAcAAAABAAAASFycnJyc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nz//OEAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4Ljc2AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], html5: true, volume: 0 }).play(); } catch {}
      };
      ['touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, unlock, { once: true, capture: true }));
    }

    initialize() { Favorites?.init?.(); }
    prepareContext() { if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(()=>{}); }

    setPlaylist(tracks, startIdx = 0, meta, opts = {}) {
      const prevPos = this.getPosition(), wasPlay = this.isPlaying();
      this.playlist = (tracks || []).map(t => ({ ...t, uid: sUid(t.uid), title: t.title || 'Без названия', artist: t.artist || 'Витрина Разбита' })).filter(t => t.uid);
      if (!opts.preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];

      this.currentIndex = clamp(startIdx, 0, Math.max(0, this.playlist.length - 1));
      const tUid = this.playlist[this.currentIndex]?.uid || null;
      if (!opts.preserveShuffleMode) this.shufHist = [];

      if (this.flags.shuf && !opts.preserveShuffleMode) this.shufflePlaylist(tUid);
      else if (tUid) this.currentIndex = Math.max(0, this.playlist.findIndex(t => t.uid === tUid));

      this._skips = 0;
      if (this.sound && this.getCurrentTrackUid() === tUid && wasPlay && opts.preservePosition) {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        return this._updMedia();
      }

      if (wasPlay) this.load(this.currentIndex, { autoPlay: true, resumePosition: opts.preservePosition ? prevPos : 0 });
      else { this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex); this._updMedia(); }
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
        preserveShuffleMode: false
      });
      
      if (!isSame) this.load(idx, { autoPlay: true, dir: Number(opts.dir) || 1 });
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
      if (idx != null) return (idx === this.currentIndex && this.sound) ? (!this.isPlaying() && this.sound.play()) : this.load(idx, opts);
      if (this.sound) !this.isPlaying() && this.sound.play(); else if (this.currentIndex >= 0) this.load(this.currentIndex, { autoPlay: true });
    }
    pause() { this.sound?.pause(); }
    stop() { this._unload(false); this._updMedia(); }
    
    next() {
      if (!this.playlist.length) return;
      if (this.flags.shuf) { this.shufHist.push(this.currentIndex); if (this.shufHist.length > 50) this.shufHist.shift(); }
      this.load((this.currentIndex + 1) % this.playlist.length, { autoPlay: true, dir: 1 });
    }
    
    prev() {
      if (!this.playlist.length) return;
      if (this.getPosition() > 3) return void this.seek(0);
      if (this.flags.shuf && this.shufHist.length) return this.load(this.shufHist.pop(), { autoPlay: true, dir: -1 });
      this.load((this.currentIndex - 1 + this.playlist.length) % this.playlist.length, { autoPlay: true, dir: -1 });
    }
    
    seek(s) { return this.sound?.seek(s) || 0; }
    getPosition() { return this.sound?.seek() || 0; }
    getDuration() { return this.sound?.duration() || 0; }

    setVolume(v) { 
      if (isMob) return; 
      const vol = clamp(Number(v)/100, 0, 1); 
      ls.setItem(LS_VOL, String(Math.round(vol * 100))); 
      if (!this.flags.mute) Howler.volume(vol);
    }
    getVolume() { return isMob ? 100 : Number(ls.getItem(LS_VOL) ?? 100); }
    setMuted(m) { if (isMob) return; this.flags.mute = !!m; Howler.volume(this.flags.mute ? 0 : this.getVolume() / 100); }
    isMuted() { return this.flags.mute; }

    async load(idx, opts = {}) {
      const t = this.playlist[idx], tok = ++this._tok, dir = Number(opts.dir) || 1, uid = sUid(t?.uid);
      if (!t) return;
      
      this.currentIndex = idx;
      if (!opts.isAutoSkip) this._skips = 0;
      this._emit('onTrackChange', t, idx); emitG('player:trackChanged', { uid, dir });

      let r = await W.TrackResolver?.resolve?.(uid, this.qMode).catch(()=>null);
      if (tok !== this._tok) return;

      const netOk = W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
      let url = r?.url || null, aP = r?.provider || 'unknown';

      if (r?.blob) {
        this._oK = 'p_' + uid; this._oKTok = tok;
        url = W.Utils?.blob?.createUrl ? W.Utils.blob.createUrl(this._oK, r.blob) : URL.createObjectURL(r.blob);
      } else if (url && netOk && W.Utils?.getNet?.()?.kind === 'cellular' && W.NetPolicy?.shouldShowCellularToast?.()) {
        W.NotificationSystem?.show?.('Воспроизведение через мобильную сеть', 'info');
      }
      
      if (!url) {
        const smart = await W.TrackRegistry?.getSmartUrlInfo?.(uid, 'audio', this.qMode).catch(()=>null);
        if (smart?.url) { url = smart.url; aP = smart.provider || aP; }
      }

      this.currentProvider = aP;
      const sf = fn => (...a) => tok === this._tok && fn(...a);
      
      if (!url) {
        if (this._skips >= this.playlist.length) { W.NotificationSystem?.error('Нет доступных треков'); return this._emit('onPlaybackError', { reason: 'no_source' }); }
        return setTimeout(sf(() => { this._skips++; this.load((idx + dir + this.playlist.length) % this.playlist.length, { ...opts, autoPlay: true, isAutoSkip: true, dir }); }), 80);
      }

      const pos = Number(opts.resumePosition) || 0, retry = Number(opts._retryN) || 0;
      this._unload(true);
      
      this.sound = new Howl({
        src: [url], html5: true, format: ['mp3'], xhr: { withCredentials: false }, autoplay: opts.autoPlay ?? this.isPlaying(),
        onload: sf(() => { pos && this.seek(pos); this._updMedia(); }),
        onplay: sf(() => { this._startT(); this._emit('onPlay', t, idx); this._updMedia(); emitG('player:play', { uid, duration: this.getDuration(), type: 'audio', provider: aP }); emitG('player:providerChanged', { provider: aP }); }),
        onpause: sf(() => { this._stopT(); this._emit('onPause'); this._updMedia(); emitG('player:pause'); }),
        onend: sf(() => { this._emit('onEnd'); this._updMedia(); emitG('player:ended'); emitG('analytics:forceFlush'); this.flags.rep ? this.play(this.currentIndex) : this.next(); }),
        onloaderror: sf(() => this._err(idx, retry, opts, dir)),
        onplayerror: sf(() => this._err(idx, retry, opts, dir))
      });
    }

    _err(idx, r, o, d) {
      this._emit('onPlaybackError', { reason: 'error' });
      if ((W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine) && r < 2) setTimeout(() => this._tok === this._tok && this.load(idx, { ...o, autoPlay: true, _retryN: r + 1, dir: d }), 250 + r * 500);
      else { this._skips = Math.min(this.playlist.length, this._skips + 1); setTimeout(() => this._tok === this._tok && this.load((idx + d + this.playlist.length) % this.playlist.length, { ...o, autoPlay: true, isAutoSkip: true, dir: d }), 120); }
    }

    _unload(silent) {
      if (this.sound) { try { this.sound.stop(); this.sound.unload(); } catch {} this.sound = null; }
      if (this._oK && (!silent || (this._oKTok && this._oKTok !== this._tok))) {
        try { W.Utils?.blob?.revokeUrl?.(this._oK); } catch {}
        this._oK = null; this._oKTok = 0;
      }
      this._stopT();
      if (!silent) { emitG('player:stop'); this._emit('onStop'); }
    }

    _startT() { this._stopT(); this._tick = setInterval(() => { this._emit('onTick', this.getPosition(), this.getDuration()); emitG('player:tick', { currentTime: this.getPosition(), volume: this.getVolume(), muted: this.isMuted() }); }, 250); }
    _stopT() { if (this._tick) clearInterval(this._tick); this._tick = null; }
    _updMedia() { try { this._ms?.updateMetadata?.({ title: this.getCurrentTrack()?.title, artist: this.getCurrentTrack()?.artist, album: this.getCurrentTrack()?.album, artworkUrl: this.getCurrentTrack()?.cover, playing: this.isPlaying() }); } catch {} }

    canToggleQualityForCurrentTrack() { return !!this.getCurrentTrack() && !!(getTrackByUid(this.getCurrentTrackUid())?.audio_low || this.getCurrentTrack()?.sources?.audio?.lo); }
    switchQuality(m) {
      const nq = qNorm(m); if (this.qMode === nq) return;
      this.qMode = nq; ls.setItem(LS_PQ, nq); emitG('quality:changed', { quality: nq }); emitG('offline:uiChanged');
      if (this.currentIndex >= 0 && this.sound) this.load(this.currentIndex, { autoPlay: this.isPlaying(), resumePosition: this.getPosition(), dir: 1 });
      W.NotificationSystem?.show?.(`Качество переключено на ${nq === 'hi' ? 'Hi' : 'Lo'}`, 'info');
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
        if (u) r[i.inactiveAt ? 'inactive' : 'active'].push({ uid: u, sourceAlbum: sUid(i.sourceAlbum || i.albumKey || getTrackByUid(u)?.sourceAlbum), ...(i.inactiveAt && { inactiveAt: i.inactiveAt }) });
        return r;
      }, { active: [], inactive: [] });
    }

    getLikedUidsForAlbum(key) { const k = sUid(key); return k ? Favorites.getSnapshot().filter(i => !i.inactiveAt && sUid(getTrackByUid(i.uid)?.sourceAlbum) === k).map(i => i.uid) : []; }
    
    applyFavoritesOnlyFilter(opts = {}) {
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

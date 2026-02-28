import { getTrackByUid } from '../scripts/app/track-registry.js';
import { Favorites } from '../scripts/core/favorites-manager.js';
import { ensureMediaSession } from './player-core/media-session.js';

(function () {
  'use strict';

  const W = window, ls = localStorage;
  const LS_VOL = 'playerVolume', LS_PQ = 'qualityMode:v1';

  const clamp = (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b);
  const s = v => (v == null ? '' : String(v)).trim();
  const uidOf = v => s(v) || null;
  const qNorm = v => s(v).toLowerCase() === 'lo' ? 'lo' : 'hi';
  const toast = (msg, type = 'info', ms) => W.NotificationSystem?.show?.(msg, type, ms);
  const trackHasLo = t => !!(getTrackByUid(t?.uid)?.audio_low || t?.sources?.audio?.lo);

  class PlayerCore {
    playlist = [];
    originalPlaylist = [];
    currentIndex = -1;
    
    flags = { shuf: false, rep: false, mute: false };
    shufHist = [];
    sound = null;
    qMode = qNorm(ls.getItem(LS_PQ));
    
    _tok = 0;
    _tickInt = null;
    _sleepTimer = null;
    _sleepTarget = 0;
    _skips = { tok: 0, count: 0, max: 0 };
    _ev = new Map();
    _favSubs = new Set();
    _unlocked = false;

    constructor() {
      W.addEventListener('offline:uiChanged', () => this.qMode = qNorm(ls.getItem(LS_PQ)));

      this._ms = ensureMediaSession({
        onPlay: () => this.play(), onPause: () => this.pause(), onStop: () => this.stop(),
        onPrev: () => this.prev(), onNext: () => this.next(), onSeekTo: t => this.seek(t)
      });

      // Сбор статистики делегирован в глобальные события (SessionTracker)

      this._bindIOSUnlock();
    }

    initialize() { Favorites?.init?.(); }

    _bindIOSUnlock() {
      const unlock = () => {
        if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
        if (this._unlocked) return;
        this._unlocked = true;
        try {
          new Howl({ src: ['data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIWFhYW5uYWFuYW5uYW5uYW5uYW5uYW5uYW5uYW5uYW5u//OEAAAAAAAAAAAAAAAAAAAAAAAAMGluZ2QAAAAcAAAABAAAASFycnJyc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nz//OEAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4Ljc2AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], html5: true, volume: 0 }).play();
        } catch {}
      };
      ['touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, unlock, { once: true, capture: true }));
    }

    prepareContext() { if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(()=>{}); }

    // =========================
    // Playlist & Core Logic
    // =========================
    setPlaylist(tracks, startIdx = 0, meta, opts = {}) {
          const prevPos = this.getPosition(), wasPlaying = this.isPlaying();
          this.playlist = (tracks || []).map(t => ({ ...t, uid: uidOf(t.uid), title: t.title || 'Без названия', artist: t.artist || 'Витрина Разбита' }));
          if (!opts.preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];

          this.currentIndex = clamp(startIdx, 0, this.playlist.length - 1);
          const targetUid = this.playlist[this.currentIndex]?.uid;
      
          if (!opts.preserveShuffleMode) this.shufHist = [];

          if (this.flags.shuf && !opts.preserveShuffleMode) this.shufflePlaylist(targetUid);
          else if (!this.flags.shuf) this.shufHist = [];
          else if (targetUid) {
            const nIdx = this.playlist.findIndex(t => t.uid === targetUid);
            if (nIdx >= 0) this.currentIndex = nIdx;
          }

      this._skips = { tok: 0, count: 0, max: this.playlist.length };
      const sameTrack = !!(this.sound && this.getCurrentTrackUid() === targetUid);

      if (sameTrack && wasPlaying && opts.preservePosition) {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex);
        return this._updMedia();
      }

      if (wasPlaying) this.load(this.currentIndex, { autoPlay: true, resumePosition: opts.preservePosition ? prevPos : 0 });
      else { this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex); this._updMedia(); }
    }

    shufflePlaylist(keepFirstUid = null) {
      const cUid = keepFirstUid || this.getCurrentTrackUid();
      for (let i = this.playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
      }
      this.currentIndex = 0;
      if (cUid) {
        const idx = this.playlist.findIndex(t => t.uid === cUid);
        if (idx >= 0) { const [t] = this.playlist.splice(idx, 1); this.playlist.unshift(t); }
      }
    }

    getPlaylistSnapshot() { return [...this.playlist]; }
    getCurrentTrack() { return this.playlist[this.currentIndex] || null; }
    getIndex() { return this.currentIndex; }
    getNextIndex() { return this.playlist.length ? (this.currentIndex + 1) % this.playlist.length : -1; }
    getCurrentTrackUid() { return uidOf(this.getCurrentTrack()?.uid); }

    // =========================
    // Playback Controls
    // =========================
    isPlaying() { return !!this.sound?.playing(); }
    
    play(idx, opts = {}) {
      this.prepareContext();
      if (idx != null) return (idx === this.currentIndex && this.sound) ? (!this.isPlaying() && this.sound.play()) : this.load(idx, opts);
      if (this.sound) !this.isPlaying() && this.sound.play();
      else if (this.currentIndex >= 0) this.load(this.currentIndex, { autoPlay: true });
    }

    pause() { this.sound?.pause(); }
    stop() { this._unload(false); this._updMedia(); }

    next() {
      if (!this.playlist.length) return;
      // Skip обрабатывается автоматически через событие trackChanged в трекере
      if (this.flags.shuf) { this.shufHist.push(this.currentIndex); if (this.shufHist.length > 50) this.shufHist.shift(); }
      this.load((this.currentIndex + 1) % this.playlist.length, { autoPlay: true, dir: 1 });
    }

    prev() {
      if (!this.playlist.length) return;
      if (this.getPosition() > 3) return void this.seek(0);
      // Skip обрабатывается автоматически через событие trackChanged в трекере
      if (this.flags.shuf && this.shufHist.length) return this.load(this.shufHist.pop(), { autoPlay: true, dir: -1 });
      this.load((this.currentIndex - 1 + this.playlist.length) % this.playlist.length, { autoPlay: true, dir: -1 });
    }

    seek(sec) { return this.sound?.seek(sec) || 0; }
    getPosition() { return this.sound?.seek() || 0; }
    getDuration() { return this.sound?.duration() || 0; }

    setVolume(v) {
      const vol = clamp(Number(v)/100, 0, 1);
      ls.setItem(LS_VOL, String(Math.round(vol * 100)));
      if (!this.flags.mute) Howler.volume(vol);
    }
    getVolume() { return Number(ls.getItem(LS_VOL)) || 100; }
    setMuted(m) { this.flags.mute = !!m; Howler.volume(this.flags.mute ? 0 : this.getVolume() / 100); }
    isMuted() { return this.flags.mute; }

    // =========================
    // Core Load Logic (100% Spec Safe)
    // =========================
    async load(index, opts = {}) {
      const t = this.playlist[index], tok = ++this._tok, dir = Number(opts.dir) || 1, uid = uidOf(t?.uid);
      if (!t) return;
      
      this.currentIndex = index;
      if (!opts.isAutoSkip) this._skips = { tok, count: 0, max: this.playlist.length };

      this._emit('onTrackChange', t, index);
      W.dispatchEvent(new CustomEvent('player:trackChanged', { detail: { uid, dir } }));

      let res = null, url = null;
      try { res = await W.TrackResolver?.resolve?.(uid, this.qMode); } catch {}
      if (tok !== this._tok) return;

      if ((res?.source === 'local' || res?.source === 'cache') && res?.blob) {
        const key = 'p_' + uid;
        this._objUrlKey = key;
        url = W.Utils?.blob?.createUrl ? W.Utils.blob.createUrl(key, res.blob) : URL.createObjectURL(res.blob);
      } else if (res?.source === 'stream' && res?.url && (W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) {
        this._objUrlKey = null;
        url = res.url;
        if (W.Utils?.getNet?.()?.kind === 'cellular' && W.NetPolicy?.shouldShowCellularToast?.()) toast('Воспроизведение через мобильную сеть', 'info');
      }

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Железобетонный Fallback.
      // Если TrackResolver недоступен или вернул пустой ответ, но сеть есть — играем прямой URL.
      if (!url && t.src && (!res || !W.TrackResolver || res.source === 'none') && (W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) {
        url = this.qMode === 'lo' && trackHasLo(t) ? (W.TrackRegistry?.getTrackByUid(uid)?.audio_low || t.src) : t.src;
      }

      // NO STOP INVARIANT: Fallback skip
      if (!url) {
        if (this._skips.count >= this._skips.max) { toast('Нет доступных треков', 'error'); return this._emit('onPlaybackError', { reason: 'no_source' }); }
        return setTimeout(() => {
          if (tok !== this._tok) return;
          this._skips.count++;
          this.load((index + dir + this.playlist.length) % this.playlist.length, { ...opts, autoPlay: true, isAutoSkip: true, dir });
        }, 80);
      }

      const wasPlaying = this.isPlaying(), pos = Number(opts.resumePosition) || 0;
      this._unload(true); // Silent Hot Swap

      this.sound = new Howl({
        src: [url], html5: false, volume: this.getVolume() / 100, format: ['mp3'],
        autoplay: opts.autoPlay ?? wasPlaying,
        onload: () => tok === this._tok ? (pos && this.seek(pos), this._updMedia()) : this.sound?.unload(),
        onplay: () => tok === this._tok ? (this._startTick(), this._emit('onPlay', t, index), this._updMedia(), W.dispatchEvent(new CustomEvent('player:play', { detail: { uid, duration: this.getDuration(), type: 'audio' } }))) : this.sound?.stop(),
        onpause: () => tok === this._tok && (this._stopTick(), this._emit('onPause'), this._updMedia(), W.dispatchEvent(new CustomEvent('player:pause'))),
        onend: () => tok === this._tok && (this._emit('onEnd'), this._updMedia(), W.dispatchEvent(new CustomEvent('player:ended')), W.dispatchEvent(new CustomEvent('analytics:forceFlush')), this.flags.rep ? this.play(this.currentIndex) : this.next()),
        onloaderror: () => this._emit('onPlaybackError', { reason: 'loaderror' }) // External modules handle the error, NO STOP
      });
    }

    _unload(silent) {
      if (this.sound) {
        try {
          this.sound.stop();
          this.sound.unload();
        } catch {}
        this.sound = null;
      }

      // Spec 21.2: revoke ONLY after Howl unload, and for the exact key that was created.
      try {
        if (this._objUrlKey) W.Utils?.blob?.revokeUrl?.(this._objUrlKey);
      } catch {}
      this._objUrlKey = null;

      this._stopTick();
      W.dispatchEvent(new CustomEvent('player:stop'));
      if (!silent) this._emit('onStop');
    }

    _startTick() { this._stopTick(); this._tickInt = setInterval(() => { this._emit('onTick', this.getPosition(), this.getDuration()); W.dispatchEvent(new CustomEvent('player:tick', { detail: { currentTime: this.getPosition(), volume: this.getVolume(), muted: this.isMuted() } })); }, 250);
    }
    _stopTick() { if (this._tickInt) clearInterval(this._tickInt); this._tickInt = null; }
    _updMedia() { const t = this.getCurrentTrack(); try { this._ms?.updateMetadata?.({ title: t?.title, artist: t?.artist, album: t?.album, artworkUrl: t?.cover, playing: this.isPlaying() }); } catch {} }

    // =========================
    // Quality & Favorites & Settings
    // =========================
    canToggleQualityForCurrentTrack() { return !!this.getCurrentTrack() && trackHasLo(this.getCurrentTrack()); }

    switchQuality(mode) {
      const nq = qNorm(mode);
      if (this.qMode === nq) return;
      this.qMode = nq; ls.setItem(LS_PQ, nq);
      W.dispatchEvent(new CustomEvent('quality:changed', { detail: { quality: nq } }));
      W.dispatchEvent(new CustomEvent('offline:uiChanged'));

      if (this.currentIndex >= 0 && this.sound) {
        this.load(this.currentIndex, { autoPlay: this.isPlaying(), resumePosition: this.getPosition(), dir: 1 });
      }
      toast(`Качество переключено на ${nq === 'hi' ? 'Hi' : 'Lo'}`, 'info');
    }

    isFavorite(uid) { return Favorites.isLiked(uidOf(uid)); }

    toggleFavorite(uid, opts = {}) {
          const u = uidOf(uid);
          if (!u) return { liked: false };
          const playingAlbum = W.AlbumsManager?.getPlayingAlbum?.();
          const isFavPlaying = playingAlbum === W.SPECIAL_FAVORITES_KEY;
          const src = opts.source || (opts.fromAlbum ? 'album' : (isFavPlaying ? 'favorites' : 'album'));

          const liked = Favorites.toggle(u, { source: src, albumKey: opts.albumKey });
          this._emitFav(u, liked, opts.albumKey);

          // ONLY allowed STOP scenario: единственный active снят в favorites view
          if (!liked && src === 'favorites' && isFavPlaying && this.getCurrentTrackUid() === u) {
            const favState = this.getFavoritesState();
            const activeCount = Array.isArray(favState?.active) ? favState.active.length : 0;

            // Единственный разрешённый STOP-сценарий:
            // сняли ⭐ с единственного active прямо во view Избранного (playing === favorites).
            if (activeCount <= 0) this.stop();
            else this.next(); // ТЗ: если трек стал inactive во время воспроизведения — сразу на следующий active
          }
          return { liked };
        }

    removeInactivePermanently(uid) { const u = uidOf(uid); if (u && Favorites.remove(u)) this._emitFav(u, false, null, true); }
    restoreInactive(uid) { return this.toggleFavorite(uid, { source: 'favorites' }); }
    
    showInactiveFavoriteModal(p = {}) {
      if (!W.Modals?.open) return;
      const modal = W.Modals.open({
        title: 'Трек неактивен', maxWidth: 420,
        bodyHtml: `<div style="color:#9db7dd;margin-bottom:14px"><div><strong>${W.Utils?.escapeHtml?.(p.title)||'Трек'}</strong></div><div style="opacity:.9">Вернуть в ⭐ или удалить из списка?</div></div><div class="om-actions"><button type="button" class="modal-action-btn online" data-act="add">Вернуть</button><button type="button" class="modal-action-btn" data-act="remove">Удалить</button></div>`
      });
      modal.querySelector('[data-act="add"]')?.addEventListener('click', () => { modal.remove(); this.restoreInactive(p.uid); });
      modal.querySelector('[data-act="remove"]')?.addEventListener('click', () => { modal.remove(); this.removeInactivePermanently(p.uid); try { p.onDeleted?.(); } catch {} });
    }

    getFavoritesState() {
      return Favorites.getSnapshot().reduce((r, i) => {
        const u = uidOf(i?.uid);
        if (u) r[i.inactiveAt ? 'inactive' : 'active'].push({ uid: u, sourceAlbum: uidOf(i.sourceAlbum || i.albumKey || getTrackByUid(u)?.sourceAlbum), ...(i.inactiveAt && { inactiveAt: i.inactiveAt }) });
        return r;
      }, { active: [], inactive: [] });
    }

    getLikedUidsForAlbum(key) { const k = uidOf(key); return k ?
    Favorites.getSnapshot().filter(i => !i.inactiveAt && uidOf(getTrackByUid(i.uid)?.sourceAlbum) === k).map(i => i.uid) : []; }
    
        applyFavoritesOnlyFilter() {
              const pA = W.AlbumsManager?.getPlayingAlbum?.(), isFavOnly = ls.getItem('favoritesOnlyMode') === '1';
              const src = this.originalPlaylist || [];
              if (!pA || !src.length || this.currentIndex < 0) return;

              const uniq = src.filter((t, i, arr) => t?.uid && arr.findIndex(x => x.uid === t.uid) === i);
              const liked = new Set(this.getLikedUidsForAlbum(pA) || []);
      
              const tgt = (pA === W.SPECIAL_FAVORITES_KEY || (isFavOnly && !W.Utils?.isShowcaseContext?.(pA))) 
                ? uniq.filter(t => pA === W.SPECIAL_FAVORITES_KEY ? this.isFavorite(t.uid) : liked.has(t.uid)) 
                : (isFavOnly ? uniq.filter(t => this.isFavorite(t.uid)) : uniq);

              if (!tgt.length) return;

              const curUid = this.getCurrentTrackUid();
              const nIdx = Math.max(0, tgt.findIndex(t => t.uid === curUid));
              this.shufHist = [];
      
              this.setPlaylist(tgt, nIdx, {}, { preserveOriginalPlaylist: true, preserveShuffleMode: false, preservePosition: (nIdx === this.currentIndex && tgt[nIdx]?.uid === curUid) });
              W.PlayerUI?.updatePlaylistFiltering?.();
            }

        onFavoritesChanged(cb) { this._favSubs.add(cb);
    return () => this._favSubs.delete(cb); }
    _emitFav(uid, liked, albumKey, removed = false) { this._favSubs.forEach(fn => { try { fn({ uid, liked, albumKey, removed }); } catch {} }); }

    toggleShuffle() { this.flags.shuf = !this.flags.shuf; if (this.flags.shuf) this.shufflePlaylist(); else { const u = this.getCurrentTrackUid(); this.playlist = [...this.originalPlaylist]; if(u) this.currentIndex = this.playlist.findIndex(t => t.uid === u); } W.dispatchEvent(new CustomEvent('playlist:changed', { detail: { reason: 'shuffle', shuffleMode: this.flags.shuf } })); }
    isShuffle() { return this.flags.shuf; }
    toggleRepeat() { this.flags.rep = !this.flags.rep; W.dispatchEvent(new CustomEvent('playlist:changed', { detail: { reason: 'repeat', repeatMode: this.flags.rep } })); }
    isRepeat() { return this.flags.rep; }

    on(evs) { Object.entries(evs||{}).forEach(([k, fn]) => { if (!this._ev.has(k)) this._ev.set(k, new Set()); this._ev.get(k).add(fn); }); }
    _emit(n, ...args) { this._ev.get(n)?.forEach(fn => { try { fn(...args); } catch {} }); }

    setSleepTimer(ms) {
      clearTimeout(this._sleepTimer); this._sleepTarget = ms > 0 ? Date.now() + ms : 0;
      if (ms > 0) this._sleepTimer = setTimeout(() => { this.pause(); this._emit('onSleepTriggered'); }, ms);
    }
    getSleepTimerTarget() { return this._sleepTarget; }
    clearSleepTimer() { this.setSleepTimer(0); }
  }

  W.playerCore = new PlayerCore();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => W.playerCore.initialize());
  else W.playerCore.initialize();
})();

import { getTrackByUid } from '../scripts/app/track-registry.js';
import { Favorites } from '../scripts/core/favorites-manager.js';
import { ensureMediaSession } from './player-core/media-session.js';

(function () {
  'use strict';
  const W = window, ls = localStorage;
  const LS_VOL = 'playerVolume', LS_PQ = 'qualityMode:v1';
  const clamp = (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b);
  const sUid = v => (v == null ? '' : String(v)).trim() || null;
  const qNorm = v => String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
  const emitG = (n, d) => W.dispatchEvent(new CustomEvent(n, d ? { detail: d } : undefined));
  
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
      this.playlist = (tracks || []).map(t => ({ ...t, uid: sUid(t.uid), title: t.title || 'Без названия', artist: t.artist || 'Витрина Разбита' }));
      if (!opts.preserveOriginalPlaylist) this.originalPlaylist = [...this.playlist];

      this.currentIndex = clamp(startIdx, 0, this.playlist.length - 1);
      const tUid = this.playlist[this.currentIndex]?.uid;
      if (!opts.preserveShuffleMode) this.shufHist = [];

      if (this.flags.shuf && !opts.preserveShuffleMode) this.shufflePlaylist(tUid);
      else if (tUid) this.currentIndex = Math.max(0, this.playlist.findIndex(t => t.uid === tUid));

      this._skips = 0;
      if (this.sound && this.getCurrentTrackUid() === tUid && wasPlay && opts.preservePosition) {
        this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex); return this._updMedia();
      }

      if (wasPlay) this.load(this.currentIndex, { autoPlay: true, resumePosition: opts.preservePosition ? prevPos : 0 });
      else { this._emit('onTrackChange', this.getCurrentTrack(), this.currentIndex); this._updMedia(); }
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

    setVolume(v) { const vol = clamp(Number(v)/100, 0, 1); ls.setItem(LS_VOL, String(Math.round(vol * 100))); if (!this.flags.mute) Howler.volume(vol); }
    getVolume() { return Number(ls.getItem(LS_VOL)) || 100; }
    setMuted(m) { this.flags.mute = !!m; Howler.volume(this.flags.mute ? 0 : this.getVolume() / 100); }
    isMuted() { return this.flags.mute; }

    async load(idx, opts = {}) {
      const t = this.playlist[idx], tok = ++this._tok, dir = Number(opts.dir) || 1, uid = sUid(t?.uid);
      if (!t) return;
      
      this.currentIndex = idx;
      if (!opts.isAutoSkip) this._skips = 0;
      this._emit('onTrackChange', t, idx); emitG('player:trackChanged', { uid, dir });

      let r = null, url = null;
      try { r = await W.TrackResolver?.resolve?.(uid, this.qMode); } catch {}
      if (tok !== this._tok) return;

      const netOk = W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
      if (r?.blob) url = W.Utils?.blob?.createUrl ? W.Utils.blob.createUrl(this._oK = 'p_' + uid, r.blob) : URL.createObjectURL(r.blob);
      else if (r?.source === 'stream' && r.url && netOk) {
        this._oK = null; url = r.url;
        if (W.Utils?.getNet?.()?.kind === 'cellular' && W.NetPolicy?.shouldShowCellularToast?.()) W.NotificationSystem?.show?.('Воспроизведение через мобильную сеть', 'info');
      }
      
      if (!url && t.src && (!r || r.source === 'none') && netOk) {
        url = (this.qMode === 'lo' && (getTrackByUid(uid)?.audio_low || t.sources?.audio?.lo)) ? (getTrackByUid(uid)?.audio_low || t.src) : t.src;
      }

      const sf = fn => (...a) => tok === this._tok && fn(...a);

      if (!url) {
        if (this._skips >= this.playlist.length) { W.NotificationSystem?.show?.('Нет доступных треков', 'error'); return this._emit('onPlaybackError', { reason: 'no_source' }); }
        return setTimeout(sf(() => { this._skips++; this.load((idx + dir + this.playlist.length) % this.playlist.length, { ...opts, autoPlay: true, isAutoSkip: true, dir }); }), 80);
      }

      const pos = Number(opts.resumePosition) || 0, retry = Number(opts._retryN) || 0;
      this._unload(true);

      this.sound = new Howl({
        src: [url], html5: r?.source === 'stream' || !r?.blob, volume: this.getVolume() / 100, format: ['mp3'], autoplay: opts.autoPlay ?? this.isPlaying(),
        onload: sf(() => { pos && this.seek(pos); this._updMedia(); }),
        onplay: sf(() => { this._startT(); this._emit('onPlay', t, idx); this._updMedia(); emitG('player:play', { uid, duration: this.getDuration(), type: 'audio' }); }),
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
      if (this._oK) try { W.Utils?.blob?.revokeUrl?.(this._oK); } catch {}
      this._oK = null; this._stopT();
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
        if ((this.getFavoritesState().active?.length || 0) <= 0) this.stop(); else this.next();
      }
      return { liked };
    }

    removeInactivePermanently(uid) { const u = sUid(uid); if (u && Favorites.remove(u)) this._favSubs.forEach(f => { try { f({ uid: u, liked: false, removed: true }); } catch {} }); }
    restoreInactive(uid) { return this.toggleFavorite(uid, { source: 'favorites' }); }
    
    showInactiveFavoriteModal(p = {}) {
      if (!W.Modals?.open) return;
      const m = W.Modals.open({ title: 'Трек неактивен', maxWidth: 420, bodyHtml: `<div style="color:#9db7dd;margin-bottom:14px"><div><strong>${W.Utils?.escapeHtml?.(p.title)||'Трек'}</strong></div><div style="opacity:.9">Вернуть в ⭐ или удалить?</div></div><div class="om-actions"><button type="button" class="modal-action-btn online" data-act="add">Вернуть</button><button type="button" class="modal-action-btn" data-act="remove">Удалить</button></div>` });
      m.querySelector('[data-act="add"]')?.addEventListener('click', () => { m.remove(); this.restoreInactive(p.uid); });
      m.querySelector('[data-act="remove"]')?.addEventListener('click', () => { m.remove(); this.removeInactivePermanently(p.uid); try { p.onDeleted?.(); } catch {} });
    }

    getFavoritesState() {
      return Favorites.getSnapshot().reduce((r, i) => {
        const u = sUid(i?.uid);
        if (u) r[i.inactiveAt ? 'inactive' : 'active'].push({ uid: u, sourceAlbum: sUid(i.sourceAlbum || i.albumKey || getTrackByUid(u)?.sourceAlbum), ...(i.inactiveAt && { inactiveAt: i.inactiveAt }) });
        return r;
      }, { active: [], inactive: [] });
    }

    getLikedUidsForAlbum(key) { const k = sUid(key); return k ? Favorites.getSnapshot().filter(i => !i.inactiveAt && sUid(getTrackByUid(i.uid)?.sourceAlbum) === k).map(i => i.uid) : []; }
    
    applyFavoritesOnlyFilter() {
      const pA = W.AlbumsManager?.getPlayingAlbum?.(), isFav = ls.getItem('favoritesOnlyMode') === '1';
      if (!pA || !this.originalPlaylist?.length || this.currentIndex < 0) return;
      
      const uniq = this.originalPlaylist.filter((t, i, a) => t?.uid && a.findIndex(x => x.uid === t.uid) === i);
      const liked = new Set(this.getLikedUidsForAlbum(pA));
      const tgt = (pA === W.SPECIAL_FAVORITES_KEY || (isFav && !W.Utils?.isShowcaseContext?.(pA))) ? uniq.filter(t => pA === W.SPECIAL_FAVORITES_KEY ? this.isFavorite(t.uid) : liked.has(t.uid)) : (isFav ? uniq.filter(t => this.isFavorite(t.uid)) : uniq);

      if (!tgt.length) return;
      const nIdx = Math.max(0, tgt.findIndex(t => t.uid === this.getCurrentTrackUid()));
      this.shufHist = [];
      this.setPlaylist(tgt, nIdx, {}, { preserveOriginalPlaylist: true, preserveShuffleMode: false, preservePosition: (nIdx === this.currentIndex && tgt[nIdx]?.uid === this.getCurrentTrackUid()) });
      W.PlayerUI?.updatePlaylistFiltering?.();
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

    setSleepTimer(ms) { clearTimeout(this._sleep); this._sleepTarget = ms > 0 ? Date.now() + ms : 0; if (ms > 0) this._sleep = setTimeout(() => { this.pause(); this._emit('onSleepTriggered'); }, ms); }
    getSleepTimerTarget() { return this._sleepTarget; }
    clearSleepTimer() { this.setSleepTimer(0); }
  }

  W.playerCore = new PlayerCore();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => W.playerCore.initialize()); else W.playerCore.initialize();
})();

import { getTrackByUid } from '../scripts/app/track-registry.js';
import { Favorites } from '../scripts/core/favorites-manager.js';
import { ensureMediaSession } from './player-core/media-session.js';
import { createListenStatsTracker } from './player-core/stats-tracker.js';

(function () {
  'use strict';

  const W = window;
  const LS = { VOL: 'playerVolume', PQ: 'qualityMode:v1' };
  const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
  const safe = (v) => (v ? String(v).trim() : null);
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  class PlayerCore {
    constructor() {
      this.pl = []; this.origPl = []; this.idx = -1;
      this.shuf = false; this.rep = false; this.hist = [];
      this.snd = null;
      this.q = normQ(localStorage.getItem(LS.PQ));
      this._tok = 0; // Load token for async races
      this._ev = new Map();
      this._favs = new Set();
      this._tmr = null; // Sleep timer
      this._ts = 0;     // Sleep target

      // iOS Unlocker (Compact)
      const ul = () => {
        if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
        if (!this._u) { this._u=1; (new Howl({src:['data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIWFhYW5uYWFuYW5uYW5uYW5uYW5uYW5uYW5uYW5u//OEAAAAAAAAAAAAAAAAAAAAAAAAMGluZ2QAAAAcAAAABAAAASFycnJyc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nz//OEAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4Ljc2AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],html5:true,volume:0})).play(); }
      };
      ['touchend','click','keydown'].forEach(e => document.addEventListener(e, ul, {once:true,capture:true}));

      // Subsystems
      this._ms = ensureMediaSession({
        onPlay:()=>this.play(), onPause:()=>this.pause(), onStop:()=>this.stop(),
        onPrev:()=>this.prev(), onNext:()=>this.next(), onSeekTo:(t)=>this.seek(t)
      });
      this._st = createListenStatsTracker({
        getUid:()=>safe(this.cur()?.uid), getPos:()=>this.seek(), getDur:()=>this.dur(),
        recordTick:(u,p)=>W.OfflineManager?.recordTickStats?.(u,p),
        recordEnd:(u,p)=>W.OfflineManager?.registerFullListen?.(u,p)
      });

      // Events
      W.addEventListener('offline:uiChanged', () => this.q = normQ(localStorage.getItem(LS.PQ)));
    }

    initialize() { Favorites?.init?.(); }
    
    // -- Playlist Management --
    setPlaylist(tracks, start=0, meta, opts={}) {
      const was = this.isPlaying(), pos = this.seek();
      this.pl = (tracks||[]).map(t => ({...t, uid:safe(t.uid), title:t.title||'Без названия', artist:t.artist||'Витрина Разбита'}));
      if (!opts.preserveOriginalPlaylist) this.origPl = [...this.pl];

      this.idx = clamp(start, 0, this.pl.length-1);
      const tgt = this.pl[this.idx]?.uid;

      if (this.shuf && !opts.preserveShuffleMode) this._doShuf(tgt);
      else if (!this.shuf) this.hist = [];
      else if (opts.preserveShuffleMode && tgt) this.idx = this.pl.findIndex(t => t.uid === tgt);

      if (this.cur()?.uid === tgt && was && opts.preservePosition) {
        this._emit('onTrackChange', this.cur(), this.idx);
        this._meta();
      } else {
        this.load(this.idx, { autoPlay: was || !opts.preservePosition, resumePosition: opts.preservePosition ? pos : 0 });
      }
    }

    _doShuf(keepUid) {
      for (let i = this.pl.length-1; i > 0; i--) {
        const j = Math.floor(Math.random()*(i+1));
        [this.pl[i], this.pl[j]] = [this.pl[j], this.pl[i]];
      }
      if (keepUid) {
        const i = this.pl.findIndex(t => t.uid === keepUid);
        if (i >= 0) { this.pl.unshift(this.pl.splice(i,1)[0]); this.idx = 0; }
      } else this.idx = 0;
    }

    // -- Playback Control --
    load(i, opts={}) {
      const t = this.pl[i];
      if (!t) return;
      
      const tok = ++this._tok;
      this.idx = i;
      
      // Async Resolve (R0/R1 agnostic)
      const resP = W.TrackResolver?.resolve ? W.TrackResolver.resolve(t.uid, this.q) 
        : Promise.resolve({ source:'stream', url:t.src, quality:this.q });

      return resP.then(res => {
        if (tok !== this._tok) return; // Cancelled
        
        // Spec 14.1: Handle Blob URL creation
        let url = res.url;
        let isBlob = false;
        if ((res.source==='local'||res.source==='cache') && res.blob) {
          url = W.Utils?.blob?.createUrl ? W.Utils.blob.createUrl('p_'+t.uid, res.blob) : URL.createObjectURL(res.blob);
          isBlob = true;
        } else if (!url) {
          throw new Error('No source');
        }

        if (W.NetPolicy && !W.NetPolicy.isNetworkAllowed() && !isBlob) throw new Error('Net Blocked');

        // Events
        this._emit('onTrackChange', t, i);
        window.dispatchEvent(new CustomEvent('player:trackChanged', { detail: { uid:t.uid, dir:opts.dir||1 } }));

        // Spec 4.3: Hot Swap Logic
        const hot = !!opts.isHotSwap;
        if (!hot) this._unload(true); // Silent unload

        const sound = new Howl({
          src: [url],
          html5: false, // Spec 14.1: WebAudio required for iOS stability
          volume: this.getVol()/100,
          format: ['mp3'],
          autoplay: !!opts.autoPlay,
          onload: () => {
            if (tok!==this._tok) return sound.unload();
            if (opts.resumePosition) sound.seek(opts.resumePosition);
            this._meta();
          },
          onplay: () => {
            if (tok!==this._tok) return sound.stop();
            this._tick(1);
            this._emit('onPlay', t, i);
            this._meta();
          },
          onpause: () => { if (tok===this._tok) { this._tick(0); this._st.onPauseOrStop(); this._emit('onPause'); } },
          onend: () => {
            if (tok===this._tok) { 
              this._st.onEnded(); this._emit('onEnd'); 
              this.rep ? this.play(this.idx) : this.next(); 
            }
          },
          onloaderror: (id, e) => {
            if (tok!==this._tok) return;
            console.warn('Load Err', e);
            // Safety: Auto-skip on error (Spec 8.8)
            if (!opts.isAutoSkip) {
               W.NotificationSystem?.warning('Ошибка, следующий трек...');
               setTimeout(() => this.next(), 1000);
            }
          }
        });
        this.snd = sound;
        // Cellular Toast (Spec NetPolicy 4.2)
        if (!isBlob && W.Utils?.getNet?.().kind === 'cellular' && W.NetPolicy?.shouldShowCellularToast?.()) {
          W.NotificationSystem?.info?.('Воспроизведение через мобильную сеть');
        }
      }).catch(e => {
        if (tok!==this._tok) return;
        console.warn('Resolve Fail', e);
        // Safety: Auto-skip (Spec 8.8) logic implementation via next()
        // Prevent infinite loop with simple counter or time check if needed, 
        // but here we rely on next() logic.
        if (!opts.isAutoSkip) {
           this._emit('onPlaybackError', { reason: 'no_source' });
           // Try next immediately if not hot swapping
           if (!opts.isHotSwap) this.next(); 
        }
      });
    }

    _unload(silent) {
      if (this.cur()?.uid && W.Utils?.blob?.revokeUrl) W.Utils.blob.revokeUrl('p_'+this.cur().uid);
      if (this.snd) { try{this.snd.stop(); this.snd.unload();}catch{} this.snd=null; }
      this._tick(0);
      this._st.onPauseOrStop();
      if (!silent) this._emit('onStop');
    }

    play(i, o={}) {
      if (W.Howler?.ctx?.state === 'suspended') W.Howler.ctx.resume();
      if (i!=null) return (i===this.idx && this.snd) ? (this.isPlaying()?0:this.snd.play()) : this.load(i, o);
      if (this.snd) { if(!this.isPlaying()) this.snd.play(); } 
      else if (this.idx>=0) this.load(this.idx, {autoPlay:true});
    }
    pause() { this.snd?.pause(); }
    stop() { this._unload(false); this._meta(); }
    
    next() {
      if (!this.pl.length) return;
      this._st.onSkip();
      if (this.shuf) { this.hist.push(this.idx); if(this.hist.length>50) this.hist.shift(); }
      this.load((this.idx+1)%this.pl.length, {autoPlay:true, dir:1, isAutoSkip:true});
    }
    prev() {
      if (!this.pl.length) return;
      if (this.seek()>3) return this.seek(0);
      this._st.onSkip();
      const n = this.shuf && this.hist.length ? this.hist.pop() : (this.idx-1+this.pl.length)%this.pl.length;
      this.load(n, {autoPlay:true, dir:-1});
    }

    // -- State & Helpers --
    seek(s) { return this.snd?.seek(s)||0; }
    dur() { return this.snd?.duration()||0; }
    cur() { return this.pl[this.idx]||null; }
    isPlaying() { return !!this.snd?.playing(); }
    
    setVolume(v) { 
      const n=clamp(v/100,0,1); localStorage.setItem(LS.VOL, Math.round(n*100)); 
      if (!this._muted) Howler.volume(n); 
    }
    getVol() { return Number(localStorage.getItem(LS.VOL))||100; }
    setMuted(m) { this._muted=!!m; Howler.volume(m?0:this.getVol()/100); }

    // Spec 4.3: Hot Swap Quality
    switchQuality(m) {
      const n = normQ(m);
      if (this.q === n) return;
      this.q = n; localStorage.setItem(LS.PQ, n);
      W.dispatchEvent(new CustomEvent('quality:changed', {detail:{quality:n}}));
      W.dispatchEvent(new CustomEvent('offline:uiChanged'));
      if (this.idx>=0 && this.snd) this.load(this.idx, { autoPlay:this.isPlaying(), resumePosition:this.seek(), isHotSwap:true });
    }

    // Spec 3.4: Event propagation
    toggleShuffle() { 
      this.shuf=!this.shuf; 
      this.shuf ? this._doShuf(this.cur()?.uid) : (this.pl=[...this.origPl], this.idx=this.pl.findIndex(t=>t.uid===this.cur()?.uid));
      W.dispatchEvent(new CustomEvent('playlist:changed', {detail:{reason:'shuffle', shuffleMode:this.shuf}}));
    }
    toggleRepeat() { 
      this.rep=!this.rep;
      W.dispatchEvent(new CustomEvent('playlist:changed', {detail:{reason:'repeat', repeatMode:this.rep}}));
    }
    isShuffle() { return this.shuf; }
    isRepeat() { return this.rep; }

    // Favorites Interaction
    isFavorite(u) { return Favorites.isLiked(safe(u)); }
    toggleFavorite(uid, {source, fromAlbum, albumKey}={}) {
      const u=safe(uid), s = source || (fromAlbum ? 'album' : (W.AlbumsManager?.getCurrentAlbum?.()===W.SPECIAL_FAVORITES_KEY ? 'favorites' : 'album'));
      const liked = Favorites.toggle(u, {source:s, albumKey});
      this._favs.forEach(f => f({uid:u, liked, albumKey}));
      // Stop/Next if removed from Favorites view while playing
      if (!liked && s==='favorites' && this.cur()?.uid===u && W.AlbumsManager?.getCurrentAlbum?.()===W.SPECIAL_FAVORITES_KEY) {
        Favorites.readLikedSet().size ? (this.rep ? 0 : this.next()) : this.stop();
      }
      return {liked};
    }
    onFavoritesChanged(cb) { this._favs.add(cb); return ()=>this._favs.delete(cb); }
    getFavoritesState() {
      const active=[], inactive=[];
      Favorites.getSnapshot().forEach(i => {
        const u=safe(i.uid), a=safe(i.sourceAlbum||i.albumKey||getTrackByUid(u)?.sourceAlbum);
        (i.inactiveAt ? inactive : active).push({uid:u, sourceAlbum:a, inactiveAt:i.inactiveAt});
      });
      return {active, inactive};
    }
    getLikedUidsForAlbum(k) { return Favorites.getSnapshot().filter(i=>!i.inactiveAt && safe(getTrackByUid(i.uid)?.sourceAlbum)===safe(k)).map(i=>i.uid); }
    
    // UI Helpers
    showInactiveFavoriteModal(p={}) {
      if (!W.Modals?.open) return;
      const u=safe(p.uid), modal = W.Modals.open({
        title:'Трек неактивен', maxWidth:420,
        bodyHtml:`<div style="color:#9db7dd;margin-bottom:14px"><div><strong>${W.Utils?.escapeHtml(p.title)||'Трек'}</strong></div><div style="opacity:.9">Вернуть в ⭐ или удалить?</div></div>` +
                 W.Modals.actionRow([{act:'add',text:'Вернуть',className:'online'},{act:'rm',text:'Удалить'}])
      });
      modal.querySelector('[data-act="add"]')?.addEventListener('click', ()=>{ modal.remove(); this.toggleFavorite(u, {source:'favorites'}); });
      modal.querySelector('[data-act="rm"]')?.addEventListener('click', ()=>{ modal.remove(); if(Favorites.remove(u)) this._favs.forEach(f=>f({uid:u,liked:false,removed:true})); p.onDeleted?.(); });
    }

    // Internals
    _meta() { this._ms.updateMetadata({title:this.cur()?.title, artist:this.cur()?.artist, album:this.cur()?.album, artworkUrl:this.cur()?.cover, playing:this.isPlaying()}); }
    _tick(on) {
      clearInterval(this._ti);
      if (on) this._ti = setInterval(() => { this._emit('onTick', this.seek(), this.dur()); this._st.onTick(); }, 250);
    }
    on(evs) { Object.entries(evs).forEach(([k,fn]) => (this._ev.has(k)||this._ev.set(k,new Set())).get(k).add(fn)); }
    _emit(k,...a) { this._ev.get(k)?.forEach(f => f(...a)); }
    
    setSleepTimer(ms) {
      clearTimeout(this._tmr); this._ts = ms>0 ? Date.now()+ms : 0;
      if (ms>0) this._tmr = setTimeout(() => { this.pause(); this._emit('onSleepTriggered'); }, ms);
    }
    getSleepTimerTarget() { return this._ts; }
    clearSleepTimer() { this.setSleepTimer(0); }
    // Compat
    getCurrentTrack() { return this.cur(); }
    getPlaylistSnapshot() { return [...this.pl]; }
    getIndex() { return this.idx; }
    getNextIndex() { return (this.idx+1)%this.pl.length; }
    canToggleQualityForCurrentTrack() { const t=this.cur(), m=t?getTrackByUid(t.uid):null; return !!(m?.audio_low||m?.urlLo||t?.sources?.audio?.lo); }
    getCurrentTrackUid() { return safe(this.cur()?.uid); }
  }

  W.playerCore = new PlayerCore();
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', ()=>W.playerCore.initialize()) : W.playerCore.initialize();
})();

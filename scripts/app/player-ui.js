(function (W, D) {
  'use strict';

  const U = W.Utils;
  const PC = () => W.playerCore;

  const st = {
    mini: false,
    seeking: false,
    viz: U.lsGetBool01('bitEnabled'),
    vizId: 0,
    analyser: null,
    provider: 'unknown'
  };

  const dom = {
    blk: null,
    now: null,
    mini: null,
    next: null,
    jump: null,
    el: {}
  };

  const q = s => dom.blk?.querySelector(s);

  function cacheDom() {
    if (dom.blk) return;

    dom.blk = D.getElementById('player-template').content
      .cloneNode(true).querySelector('#lyricsplayerblock');

    dom.now = D.getElementById('now-playing');

    dom.el = {
      bar: q('#player-progress-bar'),
      fill: q('#player-progress-fill'),
      tE: q('#time-elapsed'),
      tR: q('#time-remaining'),
      vF: q('#volume-fill'),
      vH: q('#volume-handle'),
      vS: q('#volume-slider'),
      ico: q('#play-pause-icon'),
      pq: q('#pq-btn'),
      pqL: q('#pq-btn-label'),
      fav: q('#favorites-btn'),
      favI: q('#favorites-btn-icon'),
      src: q('#source-indicator'),
      dl: q('#track-download-btn')
    };

    bindEvents();
  }

  function syncUI() {
    const c = PC();
    if (!c || !dom.blk) return;

    const t = c.getCurrentTrack();
    const playing = c.isPlaying();

    dom.el.ico.innerHTML = playing
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';

    ['shuffle','repeat','mute'].forEach(k =>
      U.setBtnActive(`${k}-btn`, c[`is${k.charAt(0).toUpperCase()+k.slice(1)}`]?.())
    );

    const fav = U.lsGetBool01('favoritesOnlyMode');
    dom.el.fav.classList.toggle('favorites-active', fav);
    dom.el.favI.src = fav ? 'img/star.png' : 'img/star2.png';

    const vol = c.getVolume();
    dom.el.vF.style.width = vol + '%';
    dom.el.vH.style.left = Math.max(2,Math.min(98,vol)) + '%';
    dom.el.vS.value = vol;

    U.download.applyDownloadLink(dom.el.dl, t);

    if (dom.el.src) {
      dom.el.src.className = 'source-indicator';
      if (st.provider === 'yandex') dom.el.src.classList.add('si-yandex');
      else if (st.provider === 'github') dom.el.src.classList.add('si-github');
      else if (st.provider === 'cache') dom.el.src.classList.add('si-cache');
    }

    updateMini();
  }

  function updateMini() {
    if (!st.mini || !dom.mini) return;

    const c = PC();
    const t = c.getCurrentTrack();
    const next = c.getPlaylistSnapshot()?.[c.getNextIndex()];

    const ti = dom.mini.querySelector('#mini-now-title');
    const sr = dom.mini.querySelector('#mini-now-star');
    const nti = dom.next?.querySelector('.title');

    if (ti) {
      const album = W.TrackRegistry?.getAlbumTitle(t?.sourceAlbum) || t?.album || 'Альбом';
      ti.textContent = t?.title ? `${t.title} — ${album}` : '—';
    }

    if (sr) sr.src = c.isFavorite(t?.uid) ? 'img/star.png' : 'img/star2.png';
    if (nti) nti.textContent = next?.title || '—';
  }

  function toggleViz(force=false) {
    if (!force) U.lsSetBool01('bitEnabled', st.viz = !st.viz);

    const heart = D.getElementById('pulse-heart');
    const btn = D.getElementById('pulse-btn');

    if (heart) heart.textContent = st.viz ? '❤️' : '🤍';
    if (btn) btn.classList.toggle('active', st.viz);

    if (!st.viz) {
      cancelAnimationFrame(st.vizId);
      st.vizId = 0;
      return;
    }

    if (!st.analyser && W.Howler?.ctx) {
      try {
        st.analyser = W.Howler.ctx.createAnalyser();
        st.analyser.fftSize = 256;
        W.Howler.masterGain.connect(st.analyser);
      } catch {}
    }

    loopViz();
  }

  function loopViz() {
    if (!st.viz || !st.analyser) return;

    const d = new Uint8Array(st.analyser.frequencyBinCount);
    st.analyser.getByteFrequencyData(d);

    const lim = Math.max(1, d.length*0.3)|0;
    const amp = d.slice(0,lim).reduce((a,b)=>a+b,0)/lim/255;

    const logo = D.getElementById('logo-bottom');
    if (logo) logo.style.transform = `scale(${1+amp*0.2})`;

    st.vizId = requestAnimationFrame(loopViz);
  }

  function ensureBlock(idx, user) {
    cacheDom();

    st.mini = U.isBrowsingOtherAlbum();

    if (st.mini) mountMini();
    else mountFull(idx, user);

    syncUI();
  }

  function mountMini() {
    if (!dom.mini) {
      dom.mini = D.getElementById('mini-header-template').content
        .cloneNode(true).querySelector('#mini-now');

      dom.next = D.getElementById('next-up-template').content
        .cloneNode(true).querySelector('#next-up');

      dom.mini.onclick = e=>{
        const c = PC();
        const t = c.getCurrentTrack();

        if (e.target.id==='mini-now-star') {
          e.stopPropagation();
          c.toggleFavorite(t.uid,{albumKey:t.sourceAlbum});
          syncUI();
        } else {
          const a = W.AlbumsManager?.getPlayingAlbum?.();
          if (a) W.AlbumsManager.loadAlbum(a);
        }
      };
    }

    if (!dom.now.contains(dom.blk))
      dom.now.append(dom.mini,dom.blk,dom.next);
  }

  function mountFull(idx,user) {
    const list = D.getElementById('track-list');
    const t = PC().getCurrentTrack();
    const row = list?.querySelector(`[data-uid="${CSS.escape(t?.uid||'')}"]`);

    row ? row.after(dom.blk) : list?.appendChild(dom.blk);

    if (user && row)
      setTimeout(()=>row.scrollIntoView({behavior:'smooth',block:'center'}),50);

    dom.now.innerHTML='';
  }

  function bindEvents() {

    dom.blk.addEventListener('click',e=>{
      const btn = e.target.closest('button,a');
      if (!btn || btn.tagName==='A') return;

      const c = PC();

      const map={
        'play-pause-btn':()=>c.isPlaying()?c.pause():c.play(),
        'prev-btn':()=>c.prev(),
        'next-btn':()=>c.next(),
        'stop-btn':()=>c.stop(),
        'shuffle-btn':()=>{c.toggleShuffle();syncUI()},
        'repeat-btn':()=>{c.toggleRepeat();syncUI()},
        'mute-btn':()=>{c.setMuted(!c.isMuted());syncUI()},
        'sleep-timer-btn':()=>W.SleepTimer?.show?.(),
        'pq-btn':()=>U.pq.toggle(),
        'lyrics-toggle-btn':()=>W.LyricsController?.toggleLyricsView?.(),
        'animation-btn':()=>W.LyricsController?.toggleAnimation?.(),
        'lyrics-text-btn':()=>W.LyricsModal?.show?.(),
        'pulse-btn':()=>toggleViz(),
        'stats-btn':()=>W.StatisticsModal?.openStatisticsModal?.()
      };

      map[btn.id]?.();
    });

    dom.el.vS?.addEventListener('input',e=>{
      PC().setVolume(e.target.value);
      syncUI();
    });

    dom.el.bar?.addEventListener('pointerdown',e=>{
      const c=PC();
      const r=dom.el.bar.getBoundingClientRect();
      const pct=(e.clientX-r.left)/r.width;
      c.seek(c.getDuration()*pct);
    });
  }

  function init() {

    if (!W.playerCore) return setTimeout(init,100);

    PC().on({

      onPlay:syncUI,
      onPause:syncUI,
      onStop:syncUI,
      onEnd:syncUI,

      onTrackChange:(t,i)=>{
        W.AlbumsManager?.highlightCurrentTrack?.(-1,{uid:t.uid,albumKey:t.sourceAlbum});
        ensureBlock(i);
        W.LyricsController?.onTrackChange?.(t);
        syncUI();
      },

      onTick:(p,d)=>{
        if (!st.seeking) {
          const pct=d>0?(p/d)*100:0;
          dom.el.fill.style.width=pct+'%';
          if(dom.el.tE) dom.el.tE.textContent=U.fmt.time(p);
          if(dom.el.tR) dom.el.tR.textContent='-'+U.fmt.time((d||0)-p);
        }
        W.LyricsController?.onTick?.(p,{inMiniMode:st.mini});
      }

    });

    W.addEventListener('player:providerChanged',e=>{
      st.provider=e.detail?.provider;
      syncUI();
    });

    PC().setVolume(U.math.toInt(U.lsGet('playerVolume'),100));

    if (st.viz) toggleViz(true);

    syncUI();
  }

  W.PlayerUI = {
    initialize:init,
    ensurePlayerBlock:(i,o)=>ensureBlock(i,o?.userInitiated),
    updateMiniHeader:syncUI,
    updateNextUpLabel:syncUI,
    togglePlayPause:()=>PC().isPlaying()?PC().pause():PC().play()
  };

  D.readyState==='loading'
    ? D.addEventListener('DOMContentLoaded',init)
    : init();

})(window,document);

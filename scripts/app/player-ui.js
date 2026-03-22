// UID.001_(Playback safety invariant)_(сохранить UI-слой как безопасный фасад над PlayerCore)_(PlayerUI не должен принимать intel/provider решений, которые меняют playback вне разрешённых правил)
// UID.038_(Track profile modal)_(подготовить мягкую точку входа в паспорт трека)_(кнопка статистики/будущие action buttons могут открывать intel ui, не раздувая PlayerUI)
// UID.050_(Session profile)_(дать session-aware слою безопасные UI hooks)_(PlayerUI эмитит/use current state for intel, но не получает права навязывать playback)
// UID.060_(Session-aware next-track strategy)_(не позволять recommendation logic менять очередь из UI silently)_(любая future next suggestion только как предложение пользователю)
// UID.072_(Provider consents)_(готовить user-facing toggles без жёсткой зависимости)_(future provider/AI/social buttons должны проверять consents/capabilities вне этого файла)
// UID.082_(Local truth vs external telemetry split)_(UI interactions можно маппить наружу только через mapper)_(не строить внешнюю аналитику прямо в PlayerUI)
// UID.094_(No-paralysis rule)_(PlayerUI должен работать даже без intel/recs/providers)_(все точки intel integration только optional и lazy)
import { toggleFavoritesOnlyMode } from './player/favorites-only-actions.js';

(function (W, D) {
  'use strict';
  const U = W.Utils, PC = () => W.playerCore, AM = () => W.AlbumsManager;
  const st = { isMini: false, seeking: false, vizOn: U.lsGetBool01('bitEnabled'), vizId: 0, ctx: null, provider: 'unknown' }, dom = { blk: null, now: null, mini: null, nUp: null, jump: null, el: {} };

  const applyFavoritesOnlyDomFilter = () => {
    const c = PC(), lst = D.getElementById('track-list'), cA = AM()?.getCurrentAlbum?.(), pA = AM()?.getPlayingAlbum?.(), f = U.lsGetBool01('favoritesOnlyMode');
    if (!c || !lst) return;
    const act = f && cA === pA;
    lst.classList.toggle('favonly-filtered', act);
    if (!act) {
      lst.querySelectorAll('.track[data-hidden-by-favonly], .showcase-track[data-hidden-by-favonly]').forEach(r => r.removeAttribute('data-hidden-by-favonly'));
      return;
    }
    const src = W.PlaybackContextSource?.getSourcePlaylistForContext?.(cA) || [];
    const type = cA === W.SPECIAL_FAVORITES_KEY ? 'favorites' : (W.Utils?.isShowcaseContext?.(cA) ? 'showcase' : 'album');
    const vis = W.FavoritesOnlyResolver?.getFavoritesOnlyVisibleUidSetForContext?.({
      contextType: type,
      albumKey: cA,
      sourcePlaylist: src,
      isFavorite: uid => c.isFavorite?.(uid),
      favoritesState: c.getFavoritesState?.() || { active: [], inactive: [] }
    }) || new Set();
    lst.querySelectorAll('.track[data-uid], .showcase-track[data-uid]').forEach(r => {
      const uid = String(r.dataset.uid || '').trim();
      r.toggleAttribute('data-hidden-by-favonly', !!uid && !vis.has(uid));
    });
  };

  const syncUI = () => {
    const c = PC();
    applyFavoritesOnlyDomFilter();
    if (!c || !dom.blk) return;
    const t = c.getCurrentTrack(), p = c.isPlaying(), e = dom.el, f = U.lsGetBool01('favoritesOnlyMode'), oM = W.OfflineManager, isR2 = oM?.getMode?.() === 'R2', q = isR2 ? (oM?.getCQ() || 'hi') : U.pq.getState().mode, pA = AM()?.getPlayingAlbum?.();

    W.IconUtils?.setIconUse?.(e.ico, p ? 'icon-pause' : 'icon-play');
    ['shuffle', 'repeat', 'mute'].forEach(k => U.setBtnActive(`${k}-btn`, c[`is${k.charAt(0).toUpperCase() + k.slice(1)}`]?.()));
    e.fav.className = `player-control-btn ${f ? 'favorites-active' : ''}`; if (e.favI) W.IconUtils?.setFavoriteStarState?.(e.favI, f);

    const v = c.getVolume(); e.vF.style.width = `${v}%`; e.vH.style.left = `${U.math.clamp(v, 2, 98)}%`; e.vS.value = v;

    if (e.pq) { const nD = !isR2 && !U.pq.getState().netOk; e.pq.className = `player-control-btn ${(!isR2 && (!U.pq.getState().canToggleByTrack || nD)) ? 'disabled' : `pq-${q}`}`; U.setAriaDisabled(e.pq, nD); if (e.pqL) e.pqL.textContent = q === 'lo' ? 'Lo' : 'Hi'; }
    U.download.applyDownloadLink(e.dl, t);

    if (e.srcInd) { const prv = { yandex: ['si-yandex', 'Yandex Cloud'], github: ['si-github', 'GitHub Pages'], cache: ['si-cache', 'Офлайн Кэш'] }[st.provider]; e.srcInd.className = `source-indicator ${prv ? prv[0] : ''}`; e.srcInd.style.opacity = prv ? '' : '0.3'; e.srcInd.title = prv ? `Источник: ${prv[1]}` : 'Определение источника...'; }

    if (st.isMini && dom.mini) {
      const nt = c.getPlaylistSnapshot()?.[c.getNextIndex()];
      if (e.mTi) e.mTi.textContent = t?.title ? `${t.title} — ${W.TrackRegistry?.getAlbumTitle(t.sourceAlbum) || t.album || 'Альбом'}` : '—';
      if (e.mSr) W.IconUtils?.setFavoriteStarState?.(e.mSr, U.fav.isTrackLikedInContext({ playingAlbum: pA, track: t }));
      if (e.mNUp) e.mNUp.textContent = nt?.title || '—';
    }

  };

  const onPQClick = async () => {
    const m = W.OfflineManager, c = PC(), r = U.pq.getState();
    if (m?.getMode?.() === 'R2') return W.Modals?.openOfflineModal?.();
    if (!r.netOk) return U.ui.toast('Нет доступа к сети', 'warning');
    if (!r.canToggleByTrack) return U.ui.toast('Низкое качество недоступно', 'warning');
    const nq = r.mode === 'hi' ? 'lo' : 'hi', nds = m ? await m.countNeedsReCache(nq) : 0, apply = () => { c.switchQuality(nq); syncUI(); };
    nds > 5 ? (W.Modals?.confirm?.({ title: 'Смена качества', textHtml: `Затронет ${nds} файлов. Перекачать?`, confirmText: 'Перекачать', onConfirm: apply }) || (confirm(`Затронет ${nds} файлов. Перекачать?`) && apply())) : apply();
  };

  const loopViz = () => { if (!st.vizOn || !st.ctx) return; const d = new Uint8Array(st.ctx.frequencyBinCount); st.ctx.getByteFrequencyData(d); const l = D.getElementById('logo-bottom'), lim = Math.max(1, d.length * 0.3) | 0; if (l) l.style.transform = `scale(${1 + (d.slice(0, lim).reduce((a, b) => a + b, 0) / lim / 255) * 0.2})`; st.vizId = requestAnimationFrame(loopViz); };

  const togViz = (init = false) => {
    if (!init) U.lsSetBool01('bitEnabled', st.vizOn = !st.vizOn);
    const h = D.getElementById('pulse-heart'), b = D.getElementById('pulse-btn'), l = D.getElementById('logo-bottom');
    if (h) h.textContent = st.vizOn ? '❤️' : '🤍'; if (b) b.classList.toggle('active', st.vizOn);
    if (st.vizOn) {
      if (!st.ctx && W.Howler?.ctx) { if (W.Howler.ctx.state === 'suspended') W.Howler.ctx.resume().catch(()=>{}); try { st.ctx = W.Howler.ctx.createAnalyser(); st.ctx.fftSize = 256; W.Howler.masterGain.connect(st.ctx); } catch {} }
      if (st.ctx && !st.vizId) loopViz();
    } else { cancelAnimationFrame(st.vizId); st.vizId = 0; if (l) l.style.transform = ''; }
  };

  const ensureBlock = (idx, uInit) => {
    if (!dom.blk) {
      dom.blk = D.getElementById('player-template').content.cloneNode(true).querySelector('#lyricsplayerblock'); dom.now = D.getElementById('now-playing');
      const q = s => dom.blk.querySelector(s);
      dom.el = { srcInd: q('#source-indicator'), fill: q('#player-progress-fill'), bar: q('#player-progress-bar'), tE: q('#time-elapsed'), tR: q('#time-remaining'), vF: q('#volume-fill'), vH: q('#volume-handle'), vS: q('#volume-slider'), ico: q('#play-pause-icon'), pq: q('#pq-btn'), pqL: q('#pq-btn-label'), fav: q('#favorites-btn'), favI: q('#favorites-btn-icon'), dl: q('#track-download-btn') };
      
      dom.blk.addEventListener('click', e => {
        const b = e.target.closest('button, a, .source-indicator'); if (!b || b.tagName === 'A') return;
        if (b.id === 'track-download-btn' && !b.getAttribute('href')) return e.preventDefault(), U.ui.toast('Скачивание недоступно', 'error');
        e.preventDefault(); const c = PC();
        ({
          'play-pause-btn': () => c.isPlaying() ? c.pause() : c.play(),
          'prev-btn': () => c.prev(), 'next-btn': () => c.next(), 'stop-btn': () => c.stop(),
          'shuffle-btn': () => { c.toggleShuffle(); syncUI(); }, 'repeat-btn': () => { c.toggleRepeat(); syncUI(); },
          'mute-btn': () => { c.setMuted(!c.isMuted()); syncUI(); }, 'sleep-timer-btn': () => W.SleepTimer?.show?.(),
          'pq-btn': onPQClick, 'lyrics-text-btn': () => W.LyricsModal?.show?.(), 'pulse-btn': () => togViz(),
          'stats-btn': () => W.StatisticsModal?.openStatisticsModal?.(),
          'lyrics-toggle-btn': () => { W.LyricsController?.toggleLyricsView?.(); W.eventLogger?.log('FEATURE_USED', c.getCurrentTrackUid(), { feature: 'lyrics' }); },
          'animation-btn': () => W.LyricsController?.toggleAnimation?.(),
          'source-indicator': () => { const p = {yandex:'Yandex Cloud', github:'GitHub Pages', cache:'Ваше устройство'}[st.provider] || 'Неизвестно'; U.ui.toast(`Источник музыки: ${p}`, 'info'); },
          'favorites-btn': () => {
            const res = toggleFavoritesOnlyMode({ player: c, storage: localStorage, syncUi: syncUI });
            if (!res.ok && res.reason === 'empty') return U.ui.toast('Отметьте понравившийся трек ⭐', 'info');
            U.ui.toast(res.enabled ? '⭐ Только избранные' : 'Играют все треки', res.enabled ? 'success' : 'info');
          }
        })[b.id]?.();
      });

      const m = e => PC().seek(PC().getDuration() * U.math.clamp(((e.touches ? e.touches[0].clientX : e.clientX) - dom.el.bar.getBoundingClientRect().left) / dom.el.bar.getBoundingClientRect().width, 0, 1)), up = () => { st.seeking = false; D.removeEventListener('pointermove', m); D.removeEventListener('pointerup', up); };
      dom.el.bar?.addEventListener('pointerdown', e => { st.seeking = true; m(e); D.addEventListener('pointermove', m); D.addEventListener('pointerup', up); });
      dom.el.vS?.addEventListener('input', e => { PC().setVolume(e.target.value); syncUI(); });
    }

    st.isMini = U.isBrowsingOtherAlbum();
    if (st.isMini) {
      if (!dom.mini) {
        dom.mini = D.getElementById('mini-header-template').content.cloneNode(true).querySelector('#mini-now'); dom.nUp = D.getElementById('next-up-template').content.cloneNode(true).querySelector('#next-up');
        Object.assign(dom.el, { mPrg: dom.mini.querySelector('#mini-now-progress'), mTi: dom.mini.querySelector('#mini-now-title'), mSr: dom.mini.querySelector('#mini-now-star'), mNUp: dom.nUp.querySelector('.title') });
        dom.mini.onclick = e => {
          if (e.target.closest('#mini-now-star')) { e.stopPropagation(); const t = PC().getCurrentTrack(); if(t?.uid) PC().toggleFavorite(t.uid, { source: AM()?.getPlayingAlbum?.() === W.SPECIAL_FAVORITES_KEY ? 'favorites' : 'album', albumKey: t.sourceAlbum }); syncUI(); } 
          else { const p = AM()?.getPlayingAlbum?.(); if (p) AM().loadAlbum(p).then(() => setTimeout(() => dom.blk?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)); }
        };
      }
      if (!dom.now.contains(dom.blk)) dom.now.append(dom.mini, dom.blk, dom.nUp);
      W.LyricsController?.applyMiniMode?.(); dom.mini.style.display = dom.nUp.style.display = 'flex';
    } else {
      const l = D.getElementById('track-list'), t = PC().getCurrentTrack(), u = t?.uid ? CSS.escape(t.uid) : '', r = (u && l?.querySelector(`.track[data-uid="${u}"], .showcase-track[data-uid="${u}"]`)) || (idx != null && l?.querySelector(`.track[data-index="${idx}"]`));
      r ? (r.after(dom.blk), uInit && setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)) : l?.appendChild(dom.blk);
      W.LyricsController?.restoreFromMiniMode?.(); dom.now.innerHTML = ''; if (dom.mini) dom.mini.style.display = dom.nUp.style.display = 'none';
    }

    if (!dom.jump) { dom.jump = Object.assign(D.createElement('div'), { className: 'jump-to-playing', innerHTML: '<button>↑</button>', onclick: () => dom.blk?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }); D.body.appendChild(dom.jump); }
    if (W.IntersectionObserver) { W.pBlockObs?.disconnect(); (W.pBlockObs = new IntersectionObserver(([e]) => dom.jump.style.display = (!e.isIntersecting && !st.isMini) ? 'flex' : 'none', { threshold: 0.1 })).observe(dom.blk); }
    syncUI();
  };
  
  const init = () => {
    if (!W.playerCore || !W.albumsIndex || !U) return setTimeout(init, 100);
    const c = PC();
    c.on({
      onPlay: syncUI, onPause: syncUI, onStop: syncUI, onEnd: syncUI,
      onTrackChange: (t, i) => { AM()?.highlightCurrentTrack?.(t?.uid ? -1 : i, t?.uid ? { uid: t.uid, albumKey: t.sourceAlbum } : {}); ensureBlock(i); W.LyricsController?.onTrackChange?.(t); syncUI(); },
      onTick: (p, d) => {
        if (!st.seeking) {
          const pct = d > 0 ? (p / d) * 100 : 0;
          if (dom.el.fill) dom.el.fill.style.width = `${pct}%`; 
          if (st.isMini && dom.el.mPrg) dom.el.mPrg.style.width = `${pct}%`;
          if (dom.el.tE) dom.el.tE.textContent = U.fmt.time(p); 
          if (dom.el.tR) dom.el.tR.textContent = `-${U.fmt.time((d || 0) - p)}`; 
        }
        W.LyricsController?.onTick?.(p, { inMiniMode: st.isMini });
      }
    });

    c.onFavoritesChanged(() => {
      const p = AM()?.getPlayingAlbum?.();
      if (p === W.SPECIAL_FAVORITES_KEY || U.lsGetBool01('favoritesOnlyMode')) c.applyFavoritesOnlyFilter?.();
      syncUI();
    });
    W.addEventListener('playlist:changed', syncUI);
    W.addEventListener('player:providerChanged', e => { st.provider = e.detail?.provider; syncUI(); });
    ['offline:uiChanged', 'online', 'offline'].forEach(e => W.addEventListener(e, syncUI));
    
    c.setVolume(U.math.toInt(U.lsGet('playerVolume'), 100));
    if (st.vizOn) togViz(true); 
    syncUI();
  };

  W.PlayerUI = { initialize: init, ensurePlayerBlock: (i, o) => ensureBlock(i, o?.userInitiated), updateMiniHeader: syncUI, updateNextUpLabel: syncUI, updatePlaylistFiltering: () => { applyFavoritesOnlyDomFilter(); if (dom.blk) syncUI(); }, applyFavoritesOnlyDomFilter, togglePlayPause: () => PC().isPlaying() ? PC().pause() : PC().play(), switchAlbumInstantly: () => { if (PC().getIndex() >= 0) ensureBlock(PC().getIndex()); } };
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();
})(window, document);

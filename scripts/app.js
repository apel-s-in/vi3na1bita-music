// UID.092_(Incremental rollout order)_(держать staged boot как главный механизм безопасного развития)_(legacy app boot и intel boot должны быть отделены по фазам и soft-fallback) UID.094_(No-paralysis rule)_(оставить всё приложение работоспособным при отказе любого нового слоя)_(legacy/offline/analytics/ui boot не должны зависеть от intel success) UID.095_(Ownership boundary: legacy vs intel)_(жёстко развести bootstrap ownership)_(scripts/app.js остаётся хозяином legacy runtime orchestration, а intel bootstrap подключается только как optional надстройка после core слоёв) UID.096_(Helper-first anti-duplication policy)_(сразу закрепить курс на унификацию повторяющегося кода)_(повторяющиеся init/no-op/state/storage/emitter patterns в intel слое должны выноситься в shared helpers, а не копироваться по модулям)
(function (W, D) {
  'use strict';
  const $ = id => D.getElementById(id),
    cl = id => $(id)?.click(),
    wt = async n => {
      if (W.Utils?.waitFor) return W.Utils.waitFor(() => !!W[n]?.initialize, 3000);
      for (let i = 0; !W[n]?.initialize && i < 30; i++) await new Promise(r => setTimeout(r, 100));
      return !!W[n];
    };
  const iM = async () => {
    const C = W.APP_CONFIG || {};
    try {
      await import('./core/app-activity.js').then(m => m.initAppActivity?.());
      await import('./offline/net-policy.js').then(m => m.initNetPolicy?.());
      await import('./app/offline-ui-bootstrap.js').then(m => m.initOfflineUI?.());
      const om = await import('./offline/offline-manager.js');
      await om.default.initialize();
      await import('./offline/track-resolver.js').then(m => m.initTrackResolver(om.default));
      await import('./app/playback-cache-bootstrap.js').then(m => m.initPlaybackCache?.());
      await import('./offline/update-checker.js').then(m => m.initUpdateChecker?.());
    } catch (e) {
      console.error(e);
    }
    try {
      const [M, L, ST, SA, AE, LS, PF] = await Promise.all(['meta-db', 'event-logger', 'session-tracker', 'stats-aggregator', 'achievement-engine', 'live-stats', '../ui/progress-formatters'].map(p => import(`./analytics/${p}.js`)));
      await M.metaDB.init();
      await L.eventLogger.init();
      new ST.SessionTracker();
      W.statsAggregator = new SA.StatsAggregator();
      await W.statsAggregator.processHotEvents().catch(() => {});
      import('./analytics/stats-state.js').then(m => m.migrateLocalTemporalV2?.(M.metaDB)).catch(() => {});
      await LS.liveStatsTracker.initialize();
      const receiptsModule = await import('./analytics/listening-receipts.js');
      receiptsModule.listeningReceiptService?.initialize?.();
      W.achievementEngine = new AE.AchievementEngine();
      await W.achievementEngine._initBoot().catch(() => {
        W.achievementEngine.achievements = W.achievementEngine._buildUIArray();
        W.achievementEngine.broadcast(0, { reason: 'achievement_boot_degraded' });
      });
      try {
        const MK = 'migration:cleanup_duplicates:v3';
        if (!localStorage.getItem(MK)) {
          const { default: DR } = await import('./analytics/device-registry.js'),
            b = DR.getDeviceRegistry(),
            c = DR.normalizeDeviceRegistry(b);
          if (c.length < b.length) DR.saveDeviceRegistry(c);
          await import('./analytics/backup-event-cleanup.js').then(m => m.cleanupWarmEventsStore(M.metaDB));
          localStorage.setItem(MK, String(Date.now()));
        }
      } catch {}
      W.addEventListener('achievements:updated', e => {
        const d = e.detail || {},
          t = Number.isFinite(Number(d.total)) ? Number(d.total) : W.achievementEngine?.achievements?.length || 0,
          u = Number.isFinite(Number(d.unlocked)) ? Number(d.unlocked) : (W.achievementEngine?.getCompletedCount?.() ?? 0);
        if ($('achievementsCount')) $('achievementsCount').textContent = `ВЫПОЛНЕНО: ${u} / ${t}`;
        if ($('achievementsFill')) $('achievementsFill').style.width = t ? `${Math.max(0, Math.min(100, (u / t) * 100))}%` : '0%';
        const wS = W.ShardWallet?.getSnapshot?.();
        if ($('ach-shards-balance')) $('ach-shards-balance').textContent = wS?.available ? `♦ ${Number(wS.shards || 0)}` : '♦ нужен вход';
        const bT = $('ach-hint-bubble-text');
        if (bT && !(W.YandexAuth?.getSessionStatus?.() === 'active' && W.YandexAuth?.isTokenAlive?.())) {
          clearInterval(W._bInt);
          bT.textContent = '🔒 Достижения доступны после входа через Яндекс';
          return;
        }
        if (bT && W.achievementEngine?.achievements) {
          let g = W.achievementEngine.achievements.filter(a => !a.isUnlocked && !a.isHidden && (a.progressMeta || a.progress?.target > a.progress?.current)).sort((a, b) => (b.progress?.pct || 0) - (a.progress?.pct || 0));
          const pI = g.findIndex(a => a.id === 'pwa_installed');
          if (pI >= 0 && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone) g.unshift(g.splice(pI, 1)[0]);
          g = g.slice(0, 3).map(PF.fmtAchBubbleText);
          clearInterval(W._bInt);
          let i = 0;
          const uB = () => {
            if (!g.length) return;
            bT.style.opacity = 0;
            setTimeout(() => {
              bT.innerHTML = g[i++ % g.length];
              bT.style.transform = 'scale(1)';
              bT.style.opacity = 1;
              requestAnimationFrame(() => {
                const pW = bT.parentElement.clientWidth - 36;
                if (bT.scrollWidth > pW) bT.style.transform = `scale(${pW / bT.scrollWidth})`;
              });
            }, 300);
          };
          uB();
          if (g.length > 1) W._bInt = setInterval(uB, 8000);
        }
      });
      W.addEventListener('shards:wallet-updated', e => {
        const w = e.detail?.wallet || W.ShardWallet?.getSnapshot?.();
        if ($('ach-shards-balance')) $('ach-shards-balance').textContent = w?.available ? `♦ ${Number(w.shards || 0)}` : '♦ нужен вход';
      });
      const bub = $('ach-hint-bubble');
      if (bub)
        bub.onclick = () => {
          sessionStorage.setItem('jumpToAch', '1');
          W.AlbumsManager?.loadAlbum(C.SPECIAL_PROFILE_KEY || '__profile__');
        };
      W.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    } catch {}
    try {
      if (C.INTEL_LAYER_ENABLED !== false) await import('./intel/bootstrap.js').then(m => m.initIntelBootstrap?.({ W, D, C }));
    } catch {}
    try {
      await import('./core/yandex-auth.js').then(m => m.YandexAuth?.checkAutoRelogin?.());
    } catch {}
    try {
      const m = await import('./analytics/account-data-boundary.js');
      await m.initAccountDataBoundary?.();
    } catch {}
    try {
      await import('./core/timezone-policy.js').then(m => m.initTimezonePolicy?.());
    } catch {}
    try {
      await import('./analytics/playback-ownership.js').then(m => m.initPlaybackOwnership?.());
      await import('./app/playback-return-ui.js').then(m => m.initPlaybackReturnUi?.());
    } catch {}
    try {
      await import('./analytics/favorite-mirror.js').then(m => m.favoriteMirrorService?.initialize?.());
    } catch {}
    try {
      await import('./analytics/backup-sync-engine.js').then(m => m.initBackupSyncEngine());
    } catch {}
    const rn = n => W[n]?.initialize?.();
    if (await wt('GalleryManager')) rn('GalleryManager');
    try {
      await import('./app/showcase/index.js').then(m => m.default.initialize());
    } catch {}
    if (await wt('AlbumsManager')) rn('AlbumsManager');
    if (await wt('PlayerUI')) rn('PlayerUI');
    try {
      await import('./app/player/playback-clock.js').then(m => m.initPlaybackClock?.());
    } catch {}
    try {
      await import('./ui/logo-pulse.js');
    } catch {}
    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach(rn);
    import('./ui/statistics-modal.js').catch(() => {});
    import('./ui/app-modals.js').then(m => m.bindAppModals?.({ W, D, config: C })).catch(() => {});
  };
  const sH = () => {
    const ac = {
        k: () => W.PlayerUI?.togglePlayPause(),
        ' ': e => {
          e.preventDefault();
          W.PlayerUI?.togglePlayPause();
        },
        n: 'next',
        p: 'prev',
        x: 'stop',
        arrowleft: () => W.playerCore?.seek(Math.max(0, (W.playerCore?.getPosition() || 0) - 5)),
        arrowright: () => W.playerCore?.seek(Math.min(W.playerCore?.getDuration() || 0, (W.playerCore?.getPosition() || 0) + 5)),
        arrowup: e => {
          e.preventDefault();
          W.playerCore?.setVolume(Math.min(100, W.playerCore.getVolume() + 5));
        },
        arrowdown: e => {
          e.preventDefault();
          W.playerCore?.setVolume(Math.max(0, W.playerCore.getVolume() - 5));
        }
      },
      bn = { m: 'mute-btn', r: 'repeat-btn', u: 'shuffle-btn', a: 'animation-btn', b: 'pulse-btn', f: 'favorites-btn', y: 'lyrics-toggle-btn', t: () => W.SleepTimer?.show?.() };
    D.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      const k = e.key.toLowerCase(),
        r = ac[k] || bn[k];
      if (typeof r === 'function') r(e);
      else if (typeof r === 'string' && W.playerCore?.[r]) W.playerCore[r]();
      else if (typeof r === 'string') cl(r);
    });
  };
  const sP = () => import('./app/pwa-install.js').then(m => m.initPwaInstall?.()).catch(() => {});
  const sS = () => {
    if (!('serviceWorker' in navigator)) return;
    const openFromUrl = async raw => {
      try {
        const u = new URL(raw || W.location.href, W.location.href),
          p = u.searchParams,
          g = !!(p.get('gcGame') || p.get('game') || p.get('join')),
          f = !!(p.get('openFriends') || p.get('addFriend') || p.get('chatWith') || p.get('voiceWith')),
          l = p.get('openLoyalty') === '1';
        if (l) {
          sessionStorage.setItem('jumpToAch', '1');
          p.delete('openLoyalty');
          W.history.replaceState(null, '', u.toString());
          await W.AlbumsManager?.loadAlbum?.(W.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__');
          return;
        }
        if (g || f) {
          W.history.replaceState(null, '', u.toString());
          await W.AlbumsManager?.loadAlbum?.(g ? W.APP_CONFIG?.SPECIAL_GAMES_KEY || W.SPECIAL_GAMES_KEY || '__games__' : W.APP_CONFIG?.SPECIAL_FRIENDS_KEY || W.SPECIAL_FRIENDS_KEY || '__friends__');
        }
      } catch {}
    };
    const h = e => {
      if (e.data?.type === 'SW_VERSION') {
        const v = String(e.data.version || '').trim();
        if (v && v !== String(W.VERSION || '')) W.ServiceWorkerManager?.handleVersionMessage?.({ swVer: v });
        return;
      }
      if (e.data?.type === 'PUSH_NOTIFICATION_CLICK') openFromUrl(e.data.url);
    };
    navigator.serviceWorker.addEventListener('message', h);
    W.addEventListener('message', h);
  };
  const rP = async () => {
    let st = null;
    try {
      st = JSON.parse(localStorage.getItem('playerStateV2') || 'null');
    } catch {}
    if (!st?.trackUid || !st?.album || Date.now() - Number(st.ts || 0) > 43200000) return false;
    try {
      await W.TrackRegistry?.ensurePopulated?.();
      const l = W.PlaybackContextSource?.getSourcePlaylistForContext?.(st.album) || [];
      const uid = String(st.trackUid || '').trim();
      const idx = l.findIndex(t => String(t?.uid || '').trim() === uid);
      if (!l.length || idx < 0) return false;
      if (st.album && W.AlbumsManager?.getPlayingAlbum?.() !== st.album) {
        W.AlbumsManager?.setPlayingAlbum?.(st.album);
      }
      if (st.currentAlbum) {
        await W.AlbumsManager?.loadAlbum?.(st.currentAlbum).catch(() => {});
      }
      if (Number.isFinite(Number(st.volume))) {
        const v = Math.max(0, Math.min(100, Number(st.volume))) / 100;
        try {
          localStorage.setItem('playerVolume', String(Math.round(v * 100)));
        } catch {}
        try {
          if (W.Howler) W.Howler.volume(st.muted ? 0 : v);
        } catch {}
      }
      if ('muted' in st) {
        try {
          W.playerCore.flags.mute = !!st.muted;
        } catch {}
      }
      if (st.quality) {
        W.playerCore.qMode = String(st.quality).toLowerCase() === 'lo' ? 'lo' : 'hi';
      }
      W.playerCore.flags.rep = !!st.repeat;
      W.playerCore.flags.shuf = !!st.shuffle;
      W.playerCore.setPlaylist(l, idx, null, { preserveOriginalPlaylist: false, preserveShuffleMode: true, deferLoad: true });
      await W.playerCore.load(idx, { autoPlay: false, resumePosition: Math.max(0, Number(st.position) || 0), dir: 1 });
      if (st.wasPlaying) {
        await import('./app/player/restore-gesture.js').then(module => module.armRestorePlaybackGesture({ uid })).catch(() => {});
      }
      setTimeout(() => {
        try {
          W.PlayerUI?.updateMiniHeader?.();
          W.PlayerUI?.updatePlaylistFiltering?.();
        } catch {}
      }, 120);
      return true;
    } catch {
      return false;
    }
  };
  let _i = false;
  W.app = {
    checkShowcaseShare: () => {
      const p = new URLSearchParams(W.location.search).get('playlist');
      if (p && W.ShowcaseManager) {
        W.ShowcaseManager.handleSharedPlaylist(p);
        W.history.replaceState(null, '', W.location.pathname);
      }
    },
    initialize: async () => {
      if (_i) return;
      _i = true;
      try {
        await iM();
        sH();
        sP();
        sS();
        W.app.checkShowcaseShare();
        const prms = new URLSearchParams(W.location.search);
        const hasGame = prms.get('gcGame') || prms.get('game') || prms.get('join'),
          hasFriends = prms.get('openFriends') || prms.get('addFriend') || prms.get('chatWith') || prms.get('voiceWith'),
          hasLoyalty = prms.get('openLoyalty') === '1';
        if (hasLoyalty) {
          try {
            sessionStorage.setItem('jumpToAch', '1');
            prms.delete('openLoyalty');
            const cleanUrl = `${W.location.pathname}${prms.toString() ? `?${prms}` : ''}${W.location.hash || ''}`;
            W.history.replaceState(null, '', cleanUrl);
            await W.AlbumsManager?.loadAlbum?.(W.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__');
          } catch {}
        } else if (hasGame || hasFriends) {
          try {
            await W.AlbumsManager?.loadAlbum?.(hasGame ? W.APP_CONFIG?.SPECIAL_GAMES_KEY || W.SPECIAL_GAMES_KEY || '__games__' : W.APP_CONFIG?.SPECIAL_FRIENDS_KEY || W.SPECIAL_FRIENDS_KEY || '__friends__');
          } catch {}
        }
        await rP().catch(() => {});
        W.__appReady = true;
        W.dispatchEvent(new CustomEvent('app:ready'));
      } catch (e) {
        W.__appReady = false;
        console.error(e);
        W.NotificationSystem?.error('Ошибка инициализации');
        W.dispatchEvent(new CustomEvent('app:boot-error', { detail: { error: String(e?.message || e) } }));
      }
    }
  };
})(window, document);

// UID.092_(Incremental rollout order)_(держать staged boot как главный механизм безопасного развития)_(legacy app boot и intel boot должны быть отделены по фазам и soft-fallback)
// UID.094_(No-paralysis rule)_(оставить всё приложение работоспособным при отказе любого нового слоя)_(legacy/offline/analytics/ui boot не должны зависеть от intel success)
// UID.095_(Ownership boundary: legacy vs intel)_(жёстко развести bootstrap ownership)_(scripts/app.js остаётся хозяином legacy runtime orchestration, а intel bootstrap подключается только как optional надстройка после core слоёв)
// UID.096_(Helper-first anti-duplication policy)_(сразу закрепить курс на унификацию повторяющегося кода)_(повторяющиеся init/no-op/state/storage/emitter patterns в intel слое должны выноситься в shared helpers, а не копироваться по модулям)
(function (W, D) {
  'use strict';
  const $ = id => D.getElementById(id), click = id => $(id)?.click();
  
  const waitObj = async (name) => {
    const U = W.Utils; if (U?.waitFor) return U.waitFor(() => !!W[name]?.initialize, 3000);
    for (let i = 0; !W[name]?.initialize && i < 30; i++) await new Promise(r => setTimeout(r, 100));
    return !!W[name];
  };

  const initModules = async () => {
    const C = W.APP_CONFIG || {};
    try {
      (await import('./offline/net-policy.js')).initNetPolicy?.();
      (await import('./app/offline-ui-bootstrap.js'))?.initOfflineUI?.();
      const om = await import('./offline/offline-manager.js');
      await om.default.initialize();
      (await import('./offline/track-resolver.js')).initTrackResolver(om.default);
      (await import('./app/playback-cache-bootstrap.js'))?.initPlaybackCache?.();
      (await import('./offline/update-checker.js'))?.initUpdateChecker?.();
    } catch (e) { console.error('Offline init failed:', e); }

    try {
      const [M, L, ST, SA, AE, CS, LS, PF] = await Promise.all(['meta-db', 'event-logger', 'session-tracker', 'stats-aggregator', 'achievement-engine', 'cloud-sync', 'live-stats', '../ui/progress-formatters'].map(p => import(`./analytics/${p}.js`)));
      await M.metaDB.init(); await L.eventLogger.init();
      new ST.SessionTracker(); new SA.StatsAggregator(); await LS.liveStatsTracker.initialize();
      W.achievementEngine = new AE.AchievementEngine();

      W.addEventListener('achievements:updated', e => {
        const { total, unlocked, profile } = e.detail, $el = id => $(id);
        if ($el('achievementsCount')) $el('achievementsCount').textContent = `ВЫПОЛНЕНО: ${unlocked} / ${total}`;
        if ($el('achievementsFill') && total) $el('achievementsFill').style.width = `${(unlocked / total) * 100}%`;
        if (profile) {
          if ($el('user-level-badge')) $el('user-level-badge').textContent = profile.level;
          if ($el('pg-lvl-val')) $el('pg-lvl-val').textContent = profile.level;
          const curXp = Math.pow(profile.level - 1, 2) * 100, nxtXp = Math.pow(profile.level, 2) * 100;
          if ($el('xp-progress-fill')) $el('xp-progress-fill').style.width = `${Math.max(0, Math.min(100, ((profile.xp - curXp) / (nxtXp - curXp)) * 100))}%`;
          if ($el('xp-text')) $el('xp-text').textContent = `${profile.xp} / ${nxtXp} XP`;
          if ($el('pg-xp-cur')) $el('pg-xp-cur').textContent = `${profile.xp} XP`;
        }
        const bTxt = $el('ach-hint-bubble-text');
        if (bTxt && W.achievementEngine?.achievements) {
          let goals = W.achievementEngine.achievements.filter(a => !a.isUnlocked && !a.isHidden && (a.progressMeta || a.progress?.target > a.progress?.current)).sort((a, b) => (b.progress?.pct || 0) - (a.progress?.pct || 0));
          const pwaIdx = goals.findIndex(a => a.id === 'pwa_installed');
          if (pwaIdx >= 0 && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone) goals.unshift(goals.splice(pwaIdx, 1)[0]);
          goals = goals.slice(0, 3).map(PF.fmtAchBubbleText);
          
          clearInterval(W._bInt); let i = 0;
          const uB = () => { if (!goals.length) return; bTxt.style.opacity = 0; setTimeout(() => { bTxt.innerHTML = goals[i++ % goals.length]; bTxt.style.opacity = 1; }, 300); };
          uB(); if (goals.length > 1) W._bInt = setInterval(uB, 8000);
        }
      });

      const bub = $('ach-hint-bubble'); if (bub) bub.onclick = () => { 
        sessionStorage.setItem('jumpToAch', '1'); 
        W.AlbumsManager?.loadAlbum(C.SPECIAL_PROFILE_KEY || '__profile__'); 
      };
      const sv = $('dash-save-btn'); if (sv) sv.onclick = () => {
        if (!W.NetPolicy?.isNetworkAllowed()) return W.NotificationSystem?.warning('Сеть недоступна');
        const tk = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
        tk.yandex ? CS.cloudSync.sync('yandex') : CS.cloudSync.auth('yandex');
      };
      CS.cloudSync?.checkAuthCallback?.(); W.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    } catch (e) { console.warn('Analytics init skipped/failed:', e); }

    try {
      if (C.INTEL_LAYER_ENABLED !== false) {
        const intel = await import('./intel/bootstrap.js');
        await intel.initIntelBootstrap?.({ W, D, C });
      }
    } catch (e) { console.warn('Intel layer init skipped/failed:', e); }

    const run = n => W[n]?.initialize?.();
    if (await waitObj('GalleryManager')) run('GalleryManager');
    try { const sm = await import('./app/showcase/index.js'); await sm.default.initialize(); } catch (e) { console.error('Showcase init failed:', e); }
    if (await waitObj('AlbumsManager')) run('AlbumsManager');
    if (await waitObj('PlayerUI')) run('PlayerUI');
    try { (await import('./app/player/playback-clock.js'))?.initPlaybackClock?.(); } catch (e) { console.warn('Playback clock skipped:', e); }
    try { await import('./ui/logo-pulse.js'); } catch(e) { console.warn(e); }
    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach(run);
    import('./ui/statistics-modal.js').catch(e => console.warn('Statistics modal skipped:', e));
    import('./ui/app-modals.js').then(m => m.bindAppModals?.({ W, D, config: C })).catch(e => console.warn('App modals skipped:', e));
  };

  const setupHotkeys = () => {
    const p = () => W.playerCore, m = {
      k: () => W.PlayerUI?.togglePlayPause(), ' ': e => { e.preventDefault(); W.PlayerUI?.togglePlayPause(); },
      n: () => p()?.next(), p: () => p()?.prev(), x: () => p()?.stop(),
      m: () => click('mute-btn'), r: () => click('repeat-btn'), u: () => click('shuffle-btn'),
      a: () => click('animation-btn'), b: () => click('pulse-btn'), f: () => click('favorites-btn'),
      t: () => W.SleepTimer?.show?.(), y: () => click('lyrics-toggle-btn'),
      arrowleft: () => p()?.seek(Math.max(0, (p().getPosition() || 0) - 5)),
      arrowright: () => p()?.seek(Math.min(p().getDuration() || 0, (p().getPosition() || 0) + 5)),
      arrowup: e => { e.preventDefault(); p()?.setVolume(Math.min(100, p().getVolume() + 5)); },
      arrowdown: e => { e.preventDefault(); p()?.setVolume(Math.max(0, p().getVolume() - 5)); }
    };
    D.addEventListener('keydown', e => !['INPUT', 'TEXTAREA'].includes(e.target?.tagName) && m[e.key.toLowerCase()]?.(e));
  };

  const setupPWA = () => {
    let pwaPrompt = null;
    const b = $('install-pwa-btn');
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      if (b) b.style.display = 'none';
    } else {
      W.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pwaPrompt = e; });
      if (b) {
        b.onclick = async () => {
          if (pwaPrompt) {
            pwaPrompt.prompt();
            if ((await pwaPrompt.userChoice).outcome === 'accepted') { W.NotificationSystem?.success('Установка началась!'); b.style.display = 'none'; }
            pwaPrompt = null;
          } else if (W.Utils?.getPlatform()?.isIOS) {
            const el = D.createElement('div'); el.className = 'ios-install-prompt';
            el.innerHTML = `<button class="ios-prompt-close" type="button">×</button><img class="ios-prompt-icon" src="icons/apple-touch-icon.png"><div class="ios-prompt-title">Установить на iPhone</div><div class="ios-prompt-text">Нажмите <strong>Поделиться</strong> <span style="font-size:18px">↗️</span> в меню браузера,<br>а затем выберите <strong>«На экран Домой»</strong></div><button class="ios-prompt-button" type="button">Понятно</button>`;
            el.onclick = e => { if (e.target.closest('button')) { el.classList.remove('show'); setTimeout(() => el.remove(), 350); } };
            D.body.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
          } else {
            W.NotificationSystem?.info('Установите через меню браузера (Добавить на экран)');
          }
        };
      }
    }

    W.addEventListener('appinstalled', () => {
      W.NotificationSystem?.success('Успешно установлено!');
      if (b) b.style.display = 'none';
      if (W.eventLogger) { W.eventLogger.log('FEATURE_USED', 'global', { feature: 'pwa_installed' }); W.dispatchEvent(new CustomEvent('analytics:forceFlush')); }
    });
    $('social-links')?.addEventListener('click', e => {
      const link = e.target.closest?.('a'); if (!link || !W.eventLogger) return;
      const href = String(link.getAttribute('href') || '').toLowerCase();
      let target = 'other';
      if (href.includes('youtube.com') || href.includes('youtu.be')) target = 'youtube';
      else if (href.includes('t.me')) target = 'telegram';
      else if (href.includes('vk.com')) target = 'vk';
      else if (href.includes('tiktok.com')) target = 'tiktok';
      W.eventLogger.log('FEATURE_USED', 'global', { feature: 'social_visit', target }); W.dispatchEvent(new CustomEvent('analytics:forceFlush'));
    });
  };

  const setupSW = () => {
    if (!('serviceWorker' in navigator)) return;
    const h = e => { if (e.data?.type === 'SW_VERSION') { const v = String(e.data.version || '').trim(); if (v && v !== String(W.VERSION || '')) W.ServiceWorkerManager?.handleVersionMessage?.({ swVer: v }); } };
    navigator.serviceWorker.addEventListener('message', h); W.addEventListener('message', h);
  };

  let _init = false;
  W.app = {
    checkShowcaseShare: () => { const p = new URLSearchParams(W.location.search).get('playlist'); if (p && W.ShowcaseManager) { W.ShowcaseManager.handleSharedPlaylist(p); W.history.replaceState(null, '', W.location.pathname); } },
    initialize: async () => {
      if (_init) return; _init = true;
      try { await initModules(); setupHotkeys(); setupPWA(); setupSW(); W.app.checkShowcaseShare(); } 
      catch (e) { console.error('App init failed:', e); W.NotificationSystem?.error('Ошибка инициализации'); }
    }
  };
})(window, document);

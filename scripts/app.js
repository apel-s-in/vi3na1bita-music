// scripts/app.js
// Application Entry Point v2.3.0 (Optimized, Compact, Playback Safe)
(function (W, D) {
  'use strict';

  const $ = id => D.getElementById(id);
  const click = id => $(id)?.click();

  const waitObj = async (name) => {
    const U = W.Utils;
    if (U?.waitFor) return U.waitFor(() => !!W[name]?.initialize, 3000);
    for (let i = 0; !W[name]?.initialize && i < 30; i++) await new Promise(r => setTimeout(r, 100));
    return !!W[name];
  };

  const initModules = async () => {
    const C = W.APP_CONFIG || {};

    // 1. Offline Core & UI
    try {
      (await import('./offline/net-policy.js')).initNetPolicy?.();
      (await import('./app/offline-ui-bootstrap.js'))?.initOfflineUI?.();
      const om = await import('./offline/offline-manager.js');
      await om.default.initialize();
      (await import('./offline/track-resolver.js')).initTrackResolver(om.default);
      (await import('./app/playback-cache-bootstrap.js'))?.initPlaybackCache?.();
    } catch (e) { console.error('Offline init failed:', e); }

    // 2. Analytics & RPG Progress UI (Parallel execution)
    try {
      const loadA = async (p) => await import(`./analytics/${p}.js`);
      const [M, L, ST, SA, AE, CS] = await Promise.all(['meta-db', 'event-logger', 'session-tracker', 'stats-aggregator', 'achievement-engine', 'cloud-sync'].map(loadA));
      
      await M.metaDB.init(); await L.eventLogger.init();
      new ST.SessionTracker(); new SA.StatsAggregator();
      W.achievementEngine = new AE.AchievementEngine();
      
      W.addEventListener('achievements:updated', e => {
        const { total, unlocked, streak, profile } = e.detail;
        const $el = id => $(id);
        
        if ($el('achievementsCount')) $el('achievementsCount').textContent = `ВЫПОЛНЕНО: ${unlocked} / ${total}`;
        if ($el('achievementsFill') && total) $el('achievementsFill').style.width = `${(unlocked / total) * 100}%`;
        
        if (profile) {
          if ($el('user-level-badge')) $el('user-level-badge').textContent = profile.level;
          const curXp = Math.pow(profile.level - 1, 2) * 100, nxtXp = Math.pow(profile.level, 2) * 100;
          if ($el('xp-progress-fill')) $el('xp-progress-fill').style.width = `${Math.max(0, Math.min(100, ((profile.xp - curXp) / (nxtXp - curXp)) * 100))}%`;
          if ($el('xp-text')) $el('xp-text').textContent = `${profile.xp} / ${nxtXp} XP`;
        }
        
        const bTxt = $el('ach-hint-bubble-text');
        if (bTxt && W.achievementEngine?.achievements) {
          const goals = W.achievementEngine.achievements.filter(a => !a.isUnlocked && !a.isHidden && a.progress?.target > a.progress?.current).sort((a, b) => b.progress.pct - a.progress.pct).slice(0, 3).map(a => `✨ До «${a.name.replace(/ ур\. \d+/, '')}»: осталось ${a.progress.target - a.progress.current}`);
          const nS = streak < 3 ? 3 : (streak < 7 ? 7 : (streak < 14 ? 14 : 30));
          goals.push(streak < 30 ? `✨ До «Стрик ${nS} дней»: осталось ${nS - streak}` : `✨ Легенда! Ваш стрик: ${streak} дней`);
          
          clearInterval(W._bInt); let i = 0;
          const uB = () => { if (!goals.length) return; bTxt.style.opacity = 0; setTimeout(() => { bTxt.innerHTML = goals[i++ % goals.length]; bTxt.style.opacity = 1; }, 300); };
          uB(); if (goals.length > 1) W._bInt = setInterval(uB, 8000);
        }
      });

      const bub = $('ach-hint-bubble'); if (bub) bub.onclick = () => W.AlbumsManager?.loadAlbum(C.SPECIAL_PROFILE_KEY || '__profile__');
      const sv = $('dash-save-btn'); if (sv) sv.onclick = () => {
        if (!W.NetPolicy?.isNetworkAllowed()) return W.NotificationSystem?.warning('Сеть недоступна');
        const tk = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
        if (tk.yandex) CS.cloudSync.sync('yandex'); else CS.cloudSync.auth('yandex');
      };
      CS.cloudSync?.checkAuthCallback?.();
      W.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    } catch (e) { console.warn('Analytics init skipped/failed:', e); }

    // 3. UI Modules
    const run = n => W[n]?.initialize?.();
    if (await waitObj('GalleryManager')) run('GalleryManager');
    try { const sm = await import('./app/showcase/index.js'); await sm.default.initialize(); } catch (e) { console.error('Showcase init failed:', e); }
    if (await waitObj('AlbumsManager')) run('AlbumsManager');
    if (await waitObj('PlayerUI')) run('PlayerUI');
    
    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach(run);
    import('./ui/statistics-modal.js').catch(e => console.warn('Statistics modal skipped:', e));

    const fb = $('feedback-link');
    if (fb) fb.onclick = e => {
      e.preventDefault();
      W.Modals?.open?.({ title: 'Обратная связь', maxWidth: 420, bodyHtml: `<p style="margin-bottom:20px;color:#8ab8fd;text-align:center;">Есть предложения или нашли ошибку?<br>Напишите нам!</p><div style="display:flex;flex-direction:column;gap:15px;max-width:300px;margin:0 auto;"><a href="https://t.me/vitrina_razbita" target="_blank" style="background:#0088cc;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Telegram</a><a href="mailto:${C.SUPPORT_EMAIL || 'support@vitrina-razbita.ru'}" target="_blank" style="background:#4daaff;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Email</a><a href="${C.GITHUB_URL || 'https://github.com/apel-s-in/vi3na1bita-music'}" target="_blank" style="background:#333;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">GitHub</a></div>` });
    };
    const sl = $('support-link'); if (sl) sl.href = C.SUPPORT_URL || 'https://example.com/support';
  };

  const setupHotkeys = () => {
    const p = () => W.playerCore;
    const m = {
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
    W.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); const b = $('install-pwa-btn'); if (!b) return;
      b.style.display = 'block';
      b.onclick = async () => { e.prompt(); if ((await e.userChoice).outcome === 'accepted') W.NotificationSystem?.success('Приложение установлено!'); b.style.display = 'none'; };
    });
    W.addEventListener('appinstalled', () => {
      W.NotificationSystem?.success('Успешно установлено!');
      const b = $('install-pwa-btn'); if (b) b.style.display = 'none';
      if (W.eventLogger) { W.eventLogger.log('FEATURE_USED', 'global', { feature: 'pwa_installed' }); W.dispatchEvent(new CustomEvent('analytics:forceFlush')); }
    });
    const s = $('social-links');
    if (s) s.addEventListener('click', e => {
      if (e.target.tagName === 'A' && W.eventLogger) { W.eventLogger.log('FEATURE_USED', 'global', { feature: 'social_visit' }); W.dispatchEvent(new CustomEvent('analytics:forceFlush')); }
    });
  };

  const setupSW = () => {
    if (!('serviceWorker' in navigator)) return;
    const h = e => { if (e.data?.type === 'SW_VERSION') { const v = String(e.data.version || '').trim(); if (v && v !== String(W.VERSION || '')) W.ServiceWorkerManager?.handleVersionMessage?.({ swVer: v }); } };
    navigator.serviceWorker.addEventListener('message', h); W.addEventListener('message', h);
  };

  let _init = false;
  W.app = {
    checkShowcaseShare: () => {
      const p = new URLSearchParams(W.location.search).get('playlist');
      if (p && W.ShowcaseManager) { W.ShowcaseManager.handleSharedPlaylist(p); W.history.replaceState(null, '', W.location.pathname); }
    },
    initialize: async () => {
      if (_init) return; _init = true;
      try {
        await initModules(); setupHotkeys(); setupPWA(); setupSW(); W.app.checkShowcaseShare();
      } catch (e) { console.error('App init failed:', e); W.NotificationSystem?.error('Ошибка инициализации'); }
    }
  };
})(window, document);

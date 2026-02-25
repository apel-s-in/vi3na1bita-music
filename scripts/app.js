// scripts/app.js
// Application Entry Point (fixed) v2.2.1
// Goals:
// - Restore valid syntax and deterministic init order
// - Do not import non-existing modules
// - Keep PWA/hotkeys/SW hooks

(function (W, D) {
  'use strict';

  const $ = (id) => D.getElementById(id);
  const click = (id) => $(id)?.click();

  const waitObj = async (name) => {
    const U = W.Utils;
    if (U?.waitFor) return U.waitFor(() => !!W[name]?.initialize, 3000);
    let i = 0;
    while (!W[name]?.initialize && i++ < 30) await new Promise((r) => setTimeout(r, 100));
    return !!W[name];
  };

  const initModules = async () => {
    const C = W.APP_CONFIG || {};

    // albumsIndex приходит из scripts/core/bootstrap.js
    if (!W.albumsIndex?.length) {
      try {
        await W.Utils?.onceEvent?.(W, 'albumsIndex:ready', { timeoutMs: 5000 });
      } catch {}
    }
    W.albumsIndex = W.albumsIndex || [];

    // Offline ядро + UI
    try {
      const net = await import('./offline/net-policy.js');
      net.initNetPolicy?.();

      const offlineUI = await import('./app/offline-ui-bootstrap.js');
      await offlineUI?.initOfflineUI?.();

      const offMgr = await import('./offline/offline-manager.js');
      const resolver = await import('./offline/track-resolver.js');
      await offMgr.default.initialize();
      resolver.initTrackResolver(offMgr.default);

      const playbackCache = await import('./app/playback-cache-bootstrap.js');
      await playbackCache?.initPlaybackCache?.();
    } catch (e) {
      console.error('Offline init failed:', e);
    }

    // Analytics (не должен ломать запуск)
    try {
      const { metaDB } = await import('./analytics/meta-db.js');
      const { eventLogger } = await import('./analytics/event-logger.js');
      const { SessionTracker } = await import('./analytics/session-tracker.js');
      const { StatsAggregator } = await import('./analytics/stats-aggregator.js');
      const { AchievementEngine } = await import('./analytics/achievement-engine.js');
      const { cloudSync } = await import('./analytics/cloud-sync.js');

      await metaDB.init();
      await eventLogger.init();
      new SessionTracker();
      new StatsAggregator();
      W.achievementEngine = new AchievementEngine();

      // Обновление Classic RPG Progress UI
      W.addEventListener('achievements:updated', (e) => {
        const { total, unlocked, streak, profile } = e.detail;
        
        const countEl = $('achievementsCount');
        const fillEl = $('achievementsFill');
        const bubbleText = $('ach-hint-bubble-text');
        
        const levelEl = $('user-level-badge');
        const xpFillEl = $('xp-progress-fill');
        const xpTextEl = $('xp-text');
        
        if (countEl) countEl.textContent = `ВЫПОЛНЕНО: ${unlocked} / ${total}`;
        if (fillEl && total > 0) fillEl.style.width = `${(unlocked / total) * 100}%`;
        
        // Математика уровней (Формула: Уровень = sqrt(XP/100) + 1)
        if (profile) {
          if (levelEl) levelEl.textContent = profile.level;
          
          const currentLevelXp = Math.pow(profile.level - 1, 2) * 100;
          const nextLevelXp = Math.pow(profile.level, 2) * 100;
          const xpNeeded = nextLevelXp - currentLevelXp;
          const xpGained = profile.xp - currentLevelXp;
          
          const pct = Math.max(0, Math.min(100, (xpGained / xpNeeded) * 100));
          if (xpFillEl) xpFillEl.style.width = `${pct}%`;
          if (xpTextEl) xpTextEl.textContent = `${profile.xp} / ${nextLevelXp} XP`;
        }
        
        // Ротатор подсказок для Баббла (Ближайшие цели)
        if (bubbleText) {
          // Выцепляем из движка невыполненные ачивки, где есть прогресс
          const engine = W.achievementEngine;
          if (engine && engine.achievements) {
            const goals = engine.achievements
              .filter(a => !a.isUnlocked && !a.isHidden && a.progress && a.progress.target > a.progress.current)
              .sort((a, b) => b.progress.pct - a.progress.pct) // Сортируем по близости к выполнению
              .slice(0, 3)
              .map(a => `✨ До «${a.name.replace(/ ур\. \d+/, '')}»: осталось ${a.progress.target - a.progress.current}`);
            
            // Всегда добавляем стрик в пул подсказок
            const nextStreak = streak < 3 ? 3 : (streak < 7 ? 7 : (streak < 14 ? 14 : 30));
            if (streak < 30) goals.push(`✨ До «Стрик ${nextStreak} дней»: осталось ${nextStreak - streak}`);
            else goals.push(`✨ Легенда! Ваш стрик: ${streak} дней`);

            // Очищаем старый интервал, если был
            if (W._bubbleInterval) clearInterval(W._bubbleInterval);
            
            let bIdx = 0;
            const updateB = () => {
              if (goals.length > 0) {
                bubbleText.style.opacity = 0;
                setTimeout(() => {
                  bubbleText.innerHTML = goals[bIdx % goals.length];
                  bubbleText.style.opacity = 1;
                  bIdx++;
                }, 300);
              }
            };
            
            updateB();
            if (goals.length > 1) W._bubbleInterval = setInterval(updateB, 8000);
          }
        }
      });

      // Клик по бабблу открывает профиль сразу на вкладке достижений
      const bubbleBtn = $('ach-hint-bubble');
      if (bubbleBtn) {
        bubbleBtn.onclick = () => {
           if (W.AlbumsManager) W.AlbumsManager.loadAlbum(W.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__');
        };
      }

      // Привязка кнопки сохранения
      const saveBtn = $('dash-save-btn');
      if (saveBtn) {
        saveBtn.onclick = () => {
          if (!W.NetPolicy?.isNetworkAllowed()) return W.NotificationSystem?.warning('Сеть недоступна');
          // Если подключен Yandex - синкаем, иначе просим авторизацию
          const tokens = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
          if (tokens.yandex) cloudSync.sync('yandex');
          else cloudSync.auth('yandex');
        };
      }

      // OAuth callback (если включали облако)
      cloudSync?.checkAuthCallback?.();

      // Прогреть агрегатор, чтобы UI получил stats
      W.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    } catch (e) {
      console.warn('Analytics init skipped/failed:', e);
    }

    // UI modules with legacy global initialize()
    const run = (n) => W[n]?.initialize?.();

    if (await waitObj('GalleryManager')) run('GalleryManager');

    // Showcase preload должен быть до AlbumsManager
    try {
      const showcaseMgr = await import('./app/showcase/index.js');
      await showcaseMgr.default.initialize();
    } catch (e) {
      console.error('Showcase init failed:', e);
    }

    if (await waitObj('AlbumsManager')) run('AlbumsManager');
    if (await waitObj('PlayerUI')) run('PlayerUI');

    // Остальные глобальные UI (они подключаются через <script ... defer/module> в index.html)
    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach((m) => W[m]?.initialize?.());

    // Statistics modal (ESM)
    try {
      await import('./ui/statistics-modal.js');
    } catch (e) {
      console.warn('Statistics modal init skipped:', e);
    }

    // Feedback modal
    const fb = $('feedback-link');
    if (fb) {
      fb.onclick = (e) => {
        e.preventDefault();
        W.Modals?.open?.({
          title: 'Обратная связь',
          maxWidth: 420,
          bodyHtml: `<p style="margin-bottom:20px;color:#8ab8fd;text-align:center;">Есть предложения или нашли ошибку?<br>Напишите нам!</p>
          <div style="display:flex;flex-direction:column;gap:15px;max-width:300px;margin:0 auto;">
            <a href="https://t.me/vitrina_razbita" target="_blank" style="background:#0088cc;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Telegram</a>
            <a href="mailto:${C.SUPPORT_EMAIL || 'support@vitrina-razbita.ru'}" target="_blank" style="background:#4daaff;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Email</a>
            <a href="${C.GITHUB_URL || 'https://github.com/apel-s-in/vi3na1bita-music'}" target="_blank" style="background:#333;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">GitHub</a>
          </div>`
        });
      };
    }

    const sl = $('support-link');
    if (sl) sl.href = C.SUPPORT_URL || 'https://example.com/support';
  };

  const setupHotkeys = () => {
    const map = {
      k: () => W.PlayerUI?.togglePlayPause(),
      ' ': (e) => {
        e.preventDefault();
        W.PlayerUI?.togglePlayPause();
      },
      n: () => W.playerCore?.next(),
      p: () => W.playerCore?.prev(),
      x: () => W.playerCore?.stop(),
      m: () => click('mute-btn'),
      r: () => click('repeat-btn'),
      u: () => click('shuffle-btn'),
      a: () => click('animation-btn'),
      b: () => click('pulse-btn'),
      f: () => click('favorites-btn'),
      t: () => W.SleepTimer?.show?.(),
      y: () => click('lyrics-toggle-btn'),
      arrowleft: () => W.playerCore?.seek(Math.max(0, (W.playerCore.getPosition() || 0) - 5)),
      arrowright: () => W.playerCore?.seek(Math.min(W.playerCore.getDuration() || 0, (W.playerCore.getPosition() || 0) + 5)),
      arrowup: (e) => {
        e.preventDefault();
        W.playerCore?.setVolume(Math.min(100, W.playerCore.getVolume() + 5));
      },
      arrowdown: (e) => {
        e.preventDefault();
        W.playerCore?.setVolume(Math.max(0, W.playerCore.getVolume() - 5));
      }
    };

    D.addEventListener('keydown', (e) => {
      if (!['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
        map[e.key.toLowerCase()]?.(e);
      }
    });
  };

  const setupPWA = () => {
    W.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const btn = $('install-pwa-btn');
      if (!btn) return;

      btn.style.display = 'block';
      btn.onclick = async () => {
        e.prompt();
        if ((await e.userChoice).outcome === 'accepted') W.NotificationSystem?.success('Приложение установлено!');
        btn.style.display = 'none';
      };
    });

    W.addEventListener('appinstalled', () => {
      W.NotificationSystem?.success('Успешно установлено!');
      const btn = $('install-pwa-btn');
      if (btn) btn.style.display = 'none';
      if (W.eventLogger) {
        W.eventLogger.log('FEATURE_USED', 'global', { feature: 'pwa_installed' });
        W.dispatchEvent(new CustomEvent('analytics:forceFlush'));
      }
    });

    // Трекинг социальных сетей
    const socialsBlock = $('social-links');
    if (socialsBlock) {
      socialsBlock.addEventListener('click', e => {
        if (e.target.tagName === 'A' && W.eventLogger) {
          W.eventLogger.log('FEATURE_USED', 'global', { feature: 'social_visit' });
          W.dispatchEvent(new CustomEvent('analytics:forceFlush'));
        }
      });
    }
  };

  const setupSW = () => {
    if (!('serviceWorker' in navigator)) return;

    const h = (e) => {
      if (e.data?.type === 'SW_VERSION') {
        const v = String(e.data.version || '').trim();
        if (v && v !== String(W.VERSION || '')) {
          W.ServiceWorkerManager?.handleVersionMessage?.({ swVer: v });
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', h);
    W.addEventListener('message', h);
  };

  let _init = false;
  W.app = {
    checkShowcaseShare: () => {
      const sp = new URLSearchParams(W.location.search);
      const playlistData = sp.get('playlist');
      if (playlistData && W.ShowcaseManager) {
        W.ShowcaseManager.handleSharedPlaylist(playlistData);
        W.history.replaceState(null, '', W.location.pathname);
      }
    },

    initialize: async () => {
      if (_init) return;
      _init = true;

      try {
        await initModules();
        setupHotkeys();
        setupPWA();
        setupSW();
        W.app.checkShowcaseShare();
      } catch (e) {
        console.error('App init failed:', e);
        W.NotificationSystem?.error('Ошибка инициализации');
      }
    }
  };
})(window, document);

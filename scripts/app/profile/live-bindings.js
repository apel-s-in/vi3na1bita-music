import { readStatsViewModel } from '../../analytics/stats-state.js';
import { renderProfileStats } from './stats-view.js';

export const bindProfileLiveBindings = ({ ctx, getContainer: getContainer, metaDB } = {}) => {
  if (ctx._pLB) return;
  ctx._pLB = true;

  const isProfile = () => ctx.getCurrentAlbum?.() === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__') && getContainer?.()?.isConnected;
  const achievementsActive = () => !!getContainer?.()?.querySelector('#tab-achievements.active');
  const statsActive = () => !!getContainer?.()?.querySelector('#tab-stats.active');

  const renderAchievements = () => {
    if (!isProfile() || !achievementsActive()) return;
    ctx._profileAchievementsView?.render?.(ctx._achCurrentFilter || 'available');
  };

  const updateAchievements = () => {
    if (!isProfile() || !achievementsActive()) return;
    const engine = window.achievementEngine;
    if (engine?._buildUIArray) engine.achievements = engine._buildUIArray();
    ctx._profileAchievementsView?.updateLiveNodes?.();
  };

  const renderStats = async () => {
    if (!isProfile() || !statsActive() || !metaDB) return;
    const container = getContainer();
    const vm = await readStatsViewModel(metaDB);
    const summary = vm.summary;
    const streak = (await metaDB.getGlobal('global_streak').catch(() => null))?.value?.current || 0;
    const set = (selector, value) => {
      const element = container?.querySelector(selector);
      if (element) element.textContent = String(value);
    };

    renderProfileStats({ container, vm });
    set('#prof-stat-tracks', summary.totalFull);
    set('#prof-stat-time', window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(summary.totalSec) : `${Math.floor(summary.totalSec / 60)}м`);
    set('#prof-stat-streak', streak);
    set('#prof-stat-ach', window.achievementEngine?.getCompletedCount?.() ?? 0);
  };

  window.addEventListener('analytics:liveTick', updateAchievements);
  window.addEventListener('achievements:updated', renderAchievements);
  window.addEventListener('stats:updated', () => setTimeout(renderStats, 60));
  window.addEventListener('stats:rebuilt', () => setTimeout(renderStats, 80));
  window.addEventListener('backup:restore:applied', () => {
    setTimeout(renderAchievements, 120);
    setTimeout(renderStats, 140);
  });
  window.addEventListener('profile:data:refreshed', () => {
    setTimeout(renderAchievements, 120);
    setTimeout(renderStats, 140);
  });
  window.addEventListener('profile:main-tab-selected', event => {
    if (event.detail?.tabId === 'achievements') {
      ctx._profileAchievementsView?.resetDetails?.();
      setTimeout(renderAchievements, 40);
    }

    if (event.detail?.tabId === 'stats') {
      setTimeout(renderStats, 40);
    }
  });
};

export default { bindProfileLiveBindings };

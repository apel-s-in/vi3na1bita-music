import { readStatsViewModel } from '../../analytics/stats-state.js';
import { renderProfileStats } from './stats-view.js';

export const bindProfileLiveBindings = ({ ctx, getContainer: gC, achView: aV, metaDB } = {}) => {
  if (ctx._pLB) return; ctx._pLB = true;
  const isProfile = () => ctx.getCurrentAlbum?.() === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__') && gC?.()?.isConnected;
  const achTabActive = () => !!gC?.()?.querySelector('#tab-achievements.active');
  const statsTabActive = () => !!gC?.()?.querySelector('#tab-stats.active');

  const renderAch = () => isProfile() && achTabActive() && aV.render(ctx._achCurrentFilter || 'available');
  const updateAch = () => isProfile() && achTabActive() && aV.updateLiveNodes();

  const renderStats = async () => {
    if (!isProfile() || !statsTabActive() || !metaDB) return;
    const c = gC(), vm = await readStatsViewModel(metaDB), summary = vm.summary;
    renderProfileStats({ container: c, vm });
    const totalFull = summary.totalFull, totalSec = summary.totalSec;
    const streak = (await metaDB.getGlobal('global_streak').catch(() => null))?.value?.current || 0;
    const set = (id, v) => { const el = c?.querySelector(id); if (el) el.textContent = String(v); };
    set('#prof-stat-tracks', totalFull);
    set('#prof-stat-time', window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSec) : `${Math.floor(totalSec / 60)}м`);
    set('#prof-stat-streak', streak);
    set('#prof-stat-ach', Object.keys(window.achievementEngine?.unlocked || {}).length);
  };

  window.addEventListener('analytics:liveTick', updateAch);
  window.addEventListener('achievements:updated', renderAch);
  window.addEventListener('stats:updated', () => setTimeout(renderStats, 60));
  window.addEventListener('stats:rebuilt', () => setTimeout(renderStats, 80));
  window.addEventListener('backup:restore:applied', () => { setTimeout(renderAch, 120); setTimeout(renderStats, 140); });
  window.addEventListener('profile:data:refreshed', () => { setTimeout(renderAch, 120); setTimeout(renderStats, 140); });
  window.addEventListener('profile:main-tab-selected', e => {
    if (e.detail?.tabId === 'achievements') setTimeout(renderAch, 40);
    if (e.detail?.tabId === 'stats') setTimeout(renderStats, 40);
  });
};

export default { bindProfileLiveBindings };

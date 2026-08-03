import { resolveListeningStatsViewModel } from '../../analytics/confirmed-listening-stats.js';
import { renderProfileStats } from './stats-view.js';
import { renderProfileRecs } from './recs-view.js';
import { renderProfileLogs } from './logs-view.js';

export const renderProfileTabsData = async ({
  container,
  all
} = {}) => {
  if (!container) return;

  renderProfileStats({
    container,
    all,
    vm: resolveListeningStatsViewModel(all || [])
  });
  await renderProfileRecs({ container });

  setTimeout(() => {
    renderProfileLogs({ container });
    window.AlbumsManager?.highlightCurrentTrack?.();
  }, 120);
};

export default { renderProfileTabsData };

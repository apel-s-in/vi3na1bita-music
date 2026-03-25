import { renderProfileStats } from './stats-view.js';
import { renderProfileRecs } from './recs-view.js';
import { renderProfileLogs } from './logs-view.js';

export const renderProfileTabsData = async ({ container, all, metaDB } = {}) => {
  if (!container) return;
  renderProfileStats({ container, all });
  renderProfileRecs({ container, all });
  setTimeout(() => {
    renderProfileLogs({ container, metaDB });
    window.AlbumsManager?.highlightCurrentTrack?.();
  }, 120);
};

export default { renderProfileTabsData };

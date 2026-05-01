import { safeNum, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';
import { esc, renderMetaBox as renderUiMetaBox } from './profile-ui-kit.js';

export const formatCloudDateTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleString('ru-RU') : '—';
export const formatCloudTimeOnly = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

export const getCloudCompareViewModel = (localSummary, cloudSummary) => {
  if (!cloudSummary) return { state: 'unknown', uiState: 'unknown', label: 'Нет данных о копии', compare: null };
  const compare = compareLocalVsCloud(localSummary || {}, cloudSummary || {});
  const uiStateMap = {
    no_cloud: 'local_newer',
    cloud_richer_new_device: 'cloud_newer',
    cloud_richer: 'cloud_newer',
    cloud_probably_richer: 'cloud_probable',
    local_richer: 'local_newer',
    local_probably_richer: 'local_probable',
    equivalent: 'equal',
    conflict: 'mixed'
  };
  return {
    state: compare.state,
    uiState: uiStateMap[compare.state] || 'mixed',
    label: getBackupCompareLabel(localSummary || {}, cloudSummary || {}),
    compare
  };
};

export const renderCloudMetaBox = renderUiMetaBox;

export const renderCloudCompareNotice = ({ compareVm, restoreDone = false } = {}) => {
  if (restoreDone) return '';
  if (!compareVm || !['cloud_newer', 'cloud_probable'].includes(compareVm.uiState)) return '';
  return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,152,0,.1);border:1px solid rgba(255,152,0,.3);border-radius:10px;margin-bottom:10px"><span style="font-size:18px">⚠️</span><div style="flex:1;font-size:12px;color:#ffb74d;line-height:1.4">В облаке есть более богатая или более новая копия.<br>При желании можно восстановить её вручную.</div><button class="modal-action-btn" data-ya-action="restore-backup" style="font-size:11px;padding:6px 10px;flex-shrink:0">📥 Загрузить</button></div>`;
};

export const renderCloudStatPair = ({ localSummary, cloudSummary } = {}) => `
  <div style="display:flex;gap:10px;margin:10px 0;text-align:center">
    <div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 8px">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">💾 На устройстве</div>
      <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${safeNum(localSummary?.level || 1)} <span style="color:#ff9800">(${safeNum(localSummary?.xp || 0)} XP)</span></div>
      <div style="font-size:11px;color:#eaf2ff">🏆 ${safeNum(localSummary?.achievementsCount || 0)} · ⭐ ${safeNum(localSummary?.favoritesCount || 0)}</div>
    </div>
    <div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.25);border-radius:12px;padding:10px 8px">
      <div style="font-size:10px;color:#8ab8fd;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">☁️ В облаке</div>
      <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${safeNum(cloudSummary?.level || 1)} <span style="color:#ff9800">(${safeNum(cloudSummary?.xp || 0)} XP)</span></div>
      <div style="font-size:11px;color:#eaf2ff">🏆 ${safeNum(cloudSummary?.achievementsCount || 0)} · ⭐ ${safeNum(cloudSummary?.favoritesCount || 0)}</div>
    </div>
  </div>
`;

export default {
  formatCloudDateTime,
  formatCloudTimeOnly,
  getCloudCompareViewModel,
  renderCloudMetaBox,
  renderCloudCompareNotice,
  renderCloudStatPair
};

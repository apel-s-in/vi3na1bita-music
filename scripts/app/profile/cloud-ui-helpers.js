import { safeNum, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';

export const formatCloudDateTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleString('ru-RU') : '—';
export const formatCloudTimeOnly = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

export const getCloudCompareViewModel = (l, c) => {
  if (!c) return { state: 'unknown', uiState: 'unknown', label: 'Нет данных о копии', compare: null };
  const cm = compareLocalVsCloud(l || {}, c || {});
  const uiS = { no_cloud: 'local_newer', cloud_richer_new_device: 'cloud_newer', cloud_richer: 'cloud_newer', cloud_probably_richer: 'cloud_probable', local_richer: 'local_newer', local_probably_richer: 'local_probable', equivalent: 'equal', conflict: 'mixed' };
  return { state: cm.state, uiState: uiS[cm.state] || 'mixed', label: getBackupCompareLabel(l || {}, c || {}), compare: cm };
};

export default { formatCloudDateTime, formatCloudTimeOnly, getCloudCompareViewModel };

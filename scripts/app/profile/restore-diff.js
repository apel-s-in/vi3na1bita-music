import { safeNum } from '../../analytics/backup-summary.js';
import { esc, renderSectionCard } from './profile-ui-kit.js';
const jp = (r, f = []) => { try { return JSON.parse(r || ''); } catch { return f; } };

const localCounts = () => {
  const f = jp(localStorage.getItem('__favorites_v2__') || '[]', []);
  const p = jp(localStorage.getItem('sc3:playlists') || '[]', []);
  return {
    favorites: Array.isArray(f) ? f.filter(x => !x?.inactiveAt && !x?.deletedAt).length : 0,
    playlists: Array.isArray(p) ? p.filter(x => !x?.deletedAt).length : 0,
    deletedPlaylists: Array.isArray(p) ? p.filter(x => x?.deletedAt).length : 0
  };
};

const cloudCountsFromBackup = backup => {
  const ls = backup?.data?.localStorage || {};
  const f = jp(ls['__favorites_v2__'] || '[]', []);
  const p = jp(ls['sc3:playlists'] || '[]', []);
  return {
    favorites: Array.isArray(f) ? f.filter(x => !x?.inactiveAt && !x?.deletedAt).length : 0,
    playlists: Array.isArray(p) ? p.filter(x => !x?.deletedAt).length : 0,
    deletedPlaylists: Array.isArray(p) ? p.filter(x => x?.deletedAt).length : 0
  };
};

const row = (name, l, c, hint = '') => {
  const d = safeNum(c) - safeNum(l);
  const sign = d > 0 ? `+${d}` : String(d);
  const cls = d > 0 ? '#81c784' : (d < 0 ? '#ffb74d' : '#9db7dd');
  return `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)">
    <div style="color:#eaf2ff;font-size:12px">${esc(name)}${hint ? `<div style="color:#667;font-size:10px;margin-top:2px">${esc(hint)}</div>` : ''}</div>
    <div style="font-size:12px;font-weight:900;color:${cls};white-space:nowrap">${safeNum(l)} → ${safeNum(c)} <span style="opacity:.75">(${esc(sign)})</span></div>
  </div>`;
};

export const renderRestoreDiffHtml = ({ backup, localSummary, cloudSummary, devices = [] } = {}) => {
  const lc = localCounts(), cc = backup ? cloudCountsFromBackup(backup) : {};
  const deletedCloud = safeNum(cc.deletedPlaylists);
  const cloudEventCount = safeNum(cloudSummary?.eventCount || backup?.data?.eventLog?.warm?.length || 0);
  const cloudDeviceCount = safeNum(cloudSummary?.devicesCount || devices.length || 0);

  return renderSectionCard({ title: 'Что будет объединено', style: 'margin:12px 0', body: `
    ${row('Уровень', localSummary?.level || 1, cloudSummary?.level || 1, 'не понижается')}
    ${row('XP', localSummary?.xp || 0, cloudSummary?.xp || 0, 'берётся максимум')}
    ${row('Достижения', localSummary?.achievementsCount || 0, cloudSummary?.achievementsCount || 0, 'unlock-time сохраняется')}
    ${row('Избранное', lc.favorites || localSummary?.favoritesCount || 0, cc.favorites || cloudSummary?.favoritesCount || 0, 'active ⭐ имеет приоритет')}
    ${row('Плейлисты', lc.playlists || localSummary?.playlistsCount || 0, cc.playlists || cloudSummary?.playlistsCount || 0, 'удаления идут через корзину')}
    ${row('События журнала', localSummary?.eventCount || 0, cloudEventCount, 'merge по eventId')}
    ${row('Устройства', localSummary?.devicesCount || 0, cloudDeviceCount, 'выбор device settings вручную')}
    ${deletedCloud ? `<div style="margin-top:8px;color:#ffb74d;font-size:11px">В облаке есть удалённые плейлисты в корзине: <b>${deletedCloud}</b>. Они не считаются активными, но могут быть восстановлены.</div>` : ''}
  `});
};

export default { renderRestoreDiffHtml };

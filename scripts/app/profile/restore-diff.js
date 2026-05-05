import { safeNum } from '../../analytics/backup-summary.js';
import { describeEventForUi } from '../../analytics/event-contract.js';
import { esc, renderCloudSectionCard, fmtDateTime } from './cloud-card-renderers.js';

const jp = (r, f = []) => { try { return JSON.parse(r || ''); } catch { return f; } };
const activeFav = rows => new Set((Array.isArray(rows) ? rows : []).filter(x => x?.uid && !x.inactiveAt && !x.deletedAt).map(x => String(x.uid)));
const activePl = rows => new Map((Array.isArray(rows) ? rows : []).filter(x => x?.id && !x.deletedAt).map(x => [String(x.id), x]));
const localRaw = () => ({ fav: jp(localStorage.getItem('__favorites_v2__') || '[]', []), pl: jp(localStorage.getItem('sc3:playlists') || '[]', []) });
const cloudRaw = backup => { const ls = backup?.data?.localStorage || {}; return { fav: jp(ls['__favorites_v2__'] || '[]', []), pl: jp(ls['sc3:playlists'] || '[]', []) }; };

const row = (name, l, c, hint = '') => {
  const d = safeNum(c) - safeNum(l), sign = d > 0 ? `+${d}` : String(d), cls = d > 0 ? '#81c784' : (d < 0 ? '#ffb74d' : '#9db7dd');
  return `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="color:#eaf2ff;font-size:12px">${esc(name)}${hint ? `<div style="color:#667;font-size:10px;margin-top:2px">${esc(hint)}</div>` : ''}</div><div style="font-size:12px;font-weight:900;color:${cls};white-space:nowrap">${safeNum(l)} → ${safeNum(c)} <span style="opacity:.75">(${esc(sign)})</span></div></div>`;
};

const exactDiff = backup => {
  const l = localRaw(), c = cloudRaw(backup), lf = activeFav(l.fav), cf = activeFav(c.fav), lp = activePl(l.pl), cp = activePl(c.pl);
  return {
    lf, cf, lp, cp,
    favCloudOnly: [...cf].filter(x => !lf.has(x)).length,
    favLocalOnly: [...lf].filter(x => !cf.has(x)).length,
    plCloudOnly: [...cp.keys()].filter(x => !lp.has(x)).length,
    plLocalOnly: [...lp.keys()].filter(x => !cp.has(x)).length,
    deletedCloud: (Array.isArray(c.pl) ? c.pl : []).filter(x => x?.deletedAt).length
  };
};

const renderEventExample = ev => {
  const vm = describeEventForUi(ev), title = [vm.title, ev?.uid || ''].filter(Boolean).join(' · ');
  return `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
    <div style="font-size:11px;color:#eaf2ff">${esc(vm.icon)} ${esc(title)}</div>
    <div style="font-size:10px;color:#7f93b5;margin-top:1px">${esc(fmtDateTime(ev?.timestamp))}${vm.desc ? ` · ${esc(vm.desc)}` : ''}</div>
  </div>`;
};

const renderBranchExamples = branch => {
  if (!branch) return '';
  const loc = (branch.localOnlyEvents || []).slice(-3).reverse();
  const cld = (branch.cloudOnlyEvents || []).slice(-3).reverse();
  return `<div style="margin-top:10px;display:grid;grid-template-columns:1fr;gap:8px">
    <div style="font-size:11px;color:#9db7dd;line-height:1.45">Ветки событий: <b>${esc(branch.state)}</b><br>Только локально: <b>${branch.localOnlyCount}</b> · только в облаке: <b>${branch.cloudOnlyCount}</b> · пересечение: <b>${branch.overlapCount}</b></div>
    ${loc.length ? `<div><div style="font-size:10px;font-weight:900;color:#ffb74d;text-transform:uppercase;letter-spacing:.7px">Последние локальные</div>${loc.map(renderEventExample).join('')}</div>` : ''}
    ${cld.length ? `<div><div style="font-size:10px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:.7px">Последние из облака</div>${cld.map(renderEventExample).join('')}</div>` : ''}
  </div>`;
};

export const renderRestoreDiffHtml = ({ backup, localSummary, cloudSummary, devices = [], branch = null, deviceSettingsState = '' } = {}) => {
  const ex = backup ? exactDiff(backup) : null;
  const cloudEventCount = safeNum(cloudSummary?.eventCount || backup?.data?.eventLog?.warm?.length || 0);
  const cloudDeviceCount = safeNum(cloudSummary?.devicesCount || devices.length || 0);
  const preciseHtml = ex ? `<div style="margin-top:9px;color:#9db7dd;font-size:11px;line-height:1.45">Точный diff: ⭐ из облака +${ex.favCloudOnly}, локальных ⭐ +${ex.favLocalOnly}; плейлистов из облака +${ex.plCloudOnly}, локальных плейлистов +${ex.plLocalOnly}.${deviceSettingsState ? `<br>Device settings: <b>${esc(deviceSettingsState)}</b>` : ''}</div>` : '';
  return renderCloudSectionCard({ title: 'Что будет объединено', style: 'margin:12px 0', body: `
    ${row('Уровень', localSummary?.level || 1, cloudSummary?.level || 1, 'не понижается')}
    ${row('XP', localSummary?.xp || 0, cloudSummary?.xp || 0, 'берётся максимум')}
    ${row('Достижения', localSummary?.achievementsCount || 0, cloudSummary?.achievementsCount || 0, 'unlock-time сохраняется')}
    ${row('Избранное', ex ? ex.lf.size : localSummary?.favoritesCount || 0, ex ? ex.cf.size : cloudSummary?.favoritesCount || 0, 'active ⭐ имеет приоритет')}
    ${row('Плейлисты', ex ? ex.lp.size : localSummary?.playlistsCount || 0, ex ? ex.cp.size : cloudSummary?.playlistsCount || 0, 'удаления идут через корзину')}
    ${row('События журнала', localSummary?.eventCount || 0, cloudEventCount, 'merge по eventId')}
    ${row('Устройства', localSummary?.devicesCount || 0, cloudDeviceCount, 'выбор device settings вручную')}
    ${preciseHtml}
    ${renderBranchExamples(branch)}
    ${ex?.deletedCloud ? `<div style="margin-top:8px;color:#ffb74d;font-size:11px">В облаке есть удалённые плейлисты в корзине: <b>${ex.deletedCloud}</b>.</div>` : ''}
  `});
};

export default { renderRestoreDiffHtml };

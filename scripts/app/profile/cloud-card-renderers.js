// UID.096_(Helper-first anti-duplication policy)_(общие cloud/profile карточки в одном renderer)_(убираем inline HTML из restore/account/sync)
// UID.112_(Profile command center)_(backup/sync/recovery UI должен быть единым визуально)_(одни section cards/meta rows/log rows)

import { safeNum } from '../../analytics/backup-summary.js';

export const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
export const fmtDateTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleString('ru-RU') : '—';
export const fmtTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

export const renderCloudMetaBox = ({ label = '', value = '' } = {}) => `
  <div class="yandex-auth-metabox">
    <div class="yandex-auth-metabox-label">${esc(label)}</div>
    <div class="yandex-auth-metabox-value">${esc(value)}</div>
  </div>
`;

export const renderCloudSectionCard = ({ title = '', body = '', style = '' } = {}) => `
  <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;${esc(style)}">
    ${title ? `<div style="font-size:11px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${esc(title)}</div>` : ''}
    ${body}
  </div>
`;

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

export const renderSyncLogRow = r => `
  <div class="profile-list-item sync-log-row">
    <div style="font-size:20px">${r?.ok ? '✅' : '⚠️'}</div>
    <div class="log-info">
      <div class="log-title">${esc(fmtDateTime(r?.timestamp))} · ${esc(r?.reason || 'sync')}</div>
      <div class="log-desc">${esc(r?.ok ? 'успешно' : `ошибка: ${r?.error || 'unknown'}`)}</div>
      <div class="log-desc">hash: ${esc(r?.hash || '—')} · domains: ${esc((r?.domains || []).join(', ') || '—')}</div>
      <div class="log-desc">shared: ${r?.uploadedShared ? 'да' : 'нет'} · device: ${r?.uploadedDevice ? 'да' : 'нет'}</div>
    </div>
  </div>
`;

export default {
  esc,
  fmtDateTime,
  fmtTime,
  renderCloudMetaBox,
  renderCloudSectionCard,
  renderCloudStatPair,
  renderSyncLogRow
};

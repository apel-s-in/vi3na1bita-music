// UID.096_(Helper-first anti-duplication policy)_(единый renderer-kit для profile/cloud UI)_(profile-ui-kit и cloud-card-renderers становятся facade)
// UID.112_(Profile command center)_(backup/sync/recovery/ledger UI в одном визуальном стиле)_(карточки, meta rows, actions, sync log)

import { safeNum } from '../../analytics/backup-summary.js';

export const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
export const fmtDateTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleString('ru-RU') : '—';
export const fmtTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

export const renderMetaBox = ({ label = '', value = '' } = {}) =>
  `<div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">${esc(label)}</div><div class="yandex-auth-metabox-value">${esc(value)}</div></div>`;
export const renderCloudMetaBox = renderMetaBox;

export const renderSectionCard = ({ title = '', body = '', style = '' } = {}) =>
  `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;${esc(style)}">${title ? `<div style="font-size:11px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${esc(title)}</div>` : ''}${body}</div>`;
export const renderCloudSectionCard = renderSectionCard;

export const renderSmallListRow = ({ icon = '', title = '', desc = '', attrs = '', style = '' } = {}) =>
  `<div class="profile-list-item" ${attrs} ${style ? `style="${esc(style)}"` : ''}>${icon ? `<div style="font-size:22px;width:28px;text-align:center;flex-shrink:0">${esc(icon)}</div>` : ''}<div class="log-info"><div class="log-title">${esc(title)}</div><div class="log-desc">${esc(desc)}</div></div></div>`;

export const renderInlineActions = actions =>
  `<div class="modal-choice-actions profile-inline-actions">${(actions || []).map(x => `<button type="button" class="modal-action-btn ${x.primary ? 'online' : ''}" ${x.attrs || ''}>${esc(x.text || 'OK')}</button>`).join('')}</div>`;

export const renderCloudStatPair = ({ localSummary: l, cloudSummary: c } = {}) =>
  `<div style="display:flex;gap:10px;margin:10px 0;text-align:center"><div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 8px"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">💾 На устройстве</div><div style="font-size:13px;font-weight:900;color:#fff">Ур. ${safeNum(l?.level || 1)} <span style="color:#ff9800">(${safeNum(l?.xp || 0)} XP)</span></div><div style="font-size:11px;color:#eaf2ff">🏆 ${safeNum(l?.achievementsCount || 0)} · ⭐ ${safeNum(l?.favoritesCount || 0)}</div></div><div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.25);border-radius:12px;padding:10px 8px"><div style="font-size:10px;color:#8ab8fd;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">☁️ В облаке</div><div style="font-size:13px;font-weight:900;color:#fff">Ур. ${safeNum(c?.level || 1)} <span style="color:#ff9800">(${safeNum(c?.xp || 0)} XP)</span></div><div style="font-size:11px;color:#eaf2ff">🏆 ${safeNum(c?.achievementsCount || 0)} · ⭐ ${safeNum(c?.favoritesCount || 0)}</div></div></div>`;

export const renderSyncLogRow = r =>
  `<div class="profile-list-item sync-log-row"><div style="font-size:20px">${r?.ok ? '✅' : '⚠️'}</div><div class="log-info"><div class="log-title">${esc(fmtDateTime(r?.timestamp))} · ${esc(r?.reason || 'sync')}</div><div class="log-desc">${esc(r?.ok ? 'успешно' : `ошибка: ${r?.error || 'unknown'}`)}</div><div class="log-desc">hash: ${esc(r?.hash || '—')} · domains: ${esc((r?.domains || []).join(', ') || '—')}</div><div class="log-desc">shared: ${r?.uploadedShared ? 'да' : 'нет'} · device: ${r?.uploadedDevice ? 'да' : 'нет'}</div></div></div>`;

export const renderCloudCompareNotice = ({ compareVm: c, restoreDone: r = false } = {}) =>
  (r || !c || !['cloud_newer', 'cloud_probable'].includes(c.uiState)) ? '' : `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,152,0,.1);border:1px solid rgba(255,152,0,.3);border-radius:10px;margin-bottom:10px"><span style="font-size:18px">⚠️</span><div style="flex:1;font-size:12px;color:#ffb74d;line-height:1.4">В облаке есть более богатая или более новая копия.<br>При желании можно восстановить её вручную.</div><button class="modal-action-btn" data-ya-action="restore-backup" style="font-size:11px;padding:6px 10px;flex-shrink:0">📥 Загрузить</button></div>`;

export default {
  esc,
  fmtDateTime,
  fmtTime,
  renderMetaBox,
  renderCloudMetaBox,
  renderSectionCard,
  renderCloudSectionCard,
  renderSmallListRow,
  renderInlineActions,
  renderCloudStatPair,
  renderSyncLogRow,
  renderCloudCompareNotice
};

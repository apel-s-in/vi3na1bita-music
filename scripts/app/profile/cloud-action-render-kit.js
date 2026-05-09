// UID.096_(Helper-first anti-duplication policy)_(cloud account actions/status/meta вынесены из account-cloud-renderers)_(меньше inline HTML)
// UID.112_(Profile command center)_(единый renderer для backup/sync/verify actions)_(профиль остаётся командным центром)
// UID.094_(No-paralysis rule)_(cloud UI render-only)_(не влияет на playback/iOS)

import { esc, renderCloudMetaBox, renderCloudCompareNotice } from './profile-render-kit.js';

export const renderCloudStatusHeader = ({ statusLabel = '', statusColor = '#888', profile: pr = null, hasDiskAccess = false, avatarHtml = '' } = {}) =>
  `<div class="yandex-auth-statusline"><div class="yandex-auth-statusdot" style="background:${esc(statusColor)}"></div><div class="yandex-auth-statustext">${esc(statusLabel)}</div></div>${pr ? `<div class="yandex-auth-profile">${avatarHtml}<div class="yandex-auth-profileinfo"><div class="yandex-auth-profilename">${esc(pr.displayName || pr.login || 'Пользователь')}</div><div class="yandex-auth-profilemeta">${esc(pr.login || '')}${hasDiskAccess ? ' · Диск ✓' : ''}</div></div></div>` : ''}`;

export const renderCloudMetaPair = ({ cloudInfo = null, compareVm = null, restoreDone = false } = {}) =>
  `<div class="yandex-auth-meta">${renderCloudMetaBox({ label:'Облако', value:cloudInfo ? (cloudInfo.timestamp ? new Date(Number(cloudInfo.timestamp)).toLocaleString('ru-RU') : 'есть копия') : 'копии ещё нет' })}${renderCloudMetaBox({ label:'Сравнение', value:compareVm?.label || '—' })}</div>${renderCloudCompareNotice({ compareVm, restoreDone })}`;

export const renderYandexActionGrid = (items = null) => {
  const rows = items || [
    ['rename', '✏️ Имя'],
    ['save-backup', '☁️ Сохранить'],
    ['check-backup', '🔎 Сравнить'],
    ['restore-backup', '📥 Из облака'],
    ['backup-export-manual', '💾 В файл'],
    ['backup-import-manual', '📂 Из файла']
  ];
  return `<div class="yandex-auth-actions">${rows.map(([act, text]) => `<button class="modal-action-btn" data-ya-action="${esc(act)}">${esc(text)}</button>`).join('')}</div>`;
};

export const renderAccountBottomActions = () => {
  const rows = [
    ['backup-info', 'Что сохраняется?'],
    ['sync-log', 'Журнал синхронизации'],
    ['recovery-snapshot', 'Recovery snapshot'],
    ['ledger-health', 'Диагностика журнала'],
    ['trust-check', 'Проверка доверия'],
    ['archive-maintenance', 'Обслуживание archive'],
    ['delete-old-backups', 'Удалить старые backup'],
    ['reconnect-rights', 'Переподключить права'],
    ['logout', 'Выйти из Яндекса', 'om-btn--outline']
  ];
  return `<div class="yandex-auth-bottomactions">${rows.map(([act, text, cls = 'om-btn--ghost']) => `<button class="om-btn ${esc(cls)}" data-ya-action="${esc(act)}">${esc(text)}</button>`).join('')}</div>`;
};

export default { renderCloudStatusHeader, renderCloudMetaPair, renderYandexActionGrid, renderAccountBottomActions };

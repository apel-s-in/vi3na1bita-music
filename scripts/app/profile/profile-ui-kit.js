// UID.096_(Helper-first anti-duplication policy)_(единый UI-kit для profile cloud/device карточек)_(уменьшить inline HTML в yandex-auth/account-devices/restore)
// UID.112_(Profile as command center for backup/sync/claim)_(общие карточки и строки профиля)_(не плодить разные стили для cloud/device UI)

export const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
export const fmtDateTime = ts => Number(ts || 0) > 0 ? new Date(Number(ts)).toLocaleString('ru-RU') : '—';
export const fmtTime = ts => Number(ts || 0) > 0 ? new Date(Number(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

export const renderMetaBox = ({ label = '', value = '' } = {}) => `
  <div class="yandex-auth-metabox">
    <div class="yandex-auth-metabox-label">${esc(label)}</div>
    <div class="yandex-auth-metabox-value">${esc(value)}</div>
  </div>
`;

export const renderSmallListRow = ({ icon = '', title = '', desc = '', attrs = '', style = '' } = {}) => `
  <div class="profile-list-item" ${attrs} ${style ? `style="${esc(style)}"` : ''}>
    ${icon ? `<div style="font-size:22px;width:28px;text-align:center;flex-shrink:0">${esc(icon)}</div>` : ''}
    <div class="log-info">
      <div class="log-title">${esc(title)}</div>
      <div class="log-desc">${esc(desc)}</div>
    </div>
  </div>
`;

export const renderInlineActions = actions => `
  <div class="om-actions">
    ${(actions || []).map(a => `<button type="button" class="modal-action-btn ${a.primary ? 'online' : ''}" ${a.attrs || ''}>${esc(a.text || 'OK')}</button>`).join('')}
  </div>
`;

export const renderSectionCard = ({ title = '', body = '', style = '' } = {}) => `
  <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;${esc(style)}">
    ${title ? `<div style="font-size:11px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${esc(title)}</div>` : ''}
    ${body}
  </div>
`;

export default { esc, fmtDateTime, fmtTime, renderMetaBox, renderSmallListRow, renderInlineActions, renderSectionCard };

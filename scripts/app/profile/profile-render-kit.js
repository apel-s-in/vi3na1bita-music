// Общие безопасные render helpers профиля.
const safeNum = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
export const fmtDateTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleString('ru-RU') : '—';
export const fmtTime = ts => safeNum(ts) > 0 ? new Date(safeNum(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

export const renderMetaBox = ({ label = '', value = '' } = {}) =>
  `<div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">${esc(label)}</div><div class="yandex-auth-metabox-value">${esc(value)}</div></div>`;

export const renderSectionCard = ({ title = '', body = '', style = '' } = {}) =>
  `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;${esc(style)}">${title ? `<div style="font-size:11px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${esc(title)}</div>` : ''}${body}</div>`;
export const renderCloudSectionCard = renderSectionCard;

export const renderKeyValueRow = ({ label = '', value = '', hint = '', valueColor = '#eaf2ff', border = true, wordBreak = true } = {}) =>
  `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;${border ? 'border-bottom:1px solid rgba(255,255,255,.05)' : ''}"><span style="color:#8ea8cc;font-size:12px">${esc(label)}${hint ? `<div style="color:#667;font-size:10px;margin-top:2px">${esc(hint)}</div>` : ''}</span><b style="color:${esc(valueColor)};font-size:12px;text-align:right;${wordBreak ? 'word-break:break-all' : 'white-space:nowrap'}">${esc(value)}</b></div>`;

export const renderWarnList = ({ items = [], empty = 'Критичных предупреждений нет', color = '#ffb74d', emptyColor = '#81c784' } = {}) =>
  items?.length ? `<ul style="margin:0 0 0 18px;color:${esc(color)};font-size:12px;line-height:1.5">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div style="font-size:12px;color:${esc(emptyColor)}">${esc(empty)}</div>`;

export const renderScoreBar = ({ score = 0, status = 'ok', color = '' } = {}) => {
  const c = color || (status === 'suspicious' ? '#ff6b6b' : (status === 'review' ? '#ffb74d' : '#81c784'));
  return `<div style="height:6px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden;margin-top:8px"><div style="height:100%;width:${Math.max(0, Math.min(100, safeNum(score)))}%;background:${esc(c)}"></div></div>`;
};

export const renderStatusPill = ({ text = '', tone = 'info', attrs = '' } = {}) => {
  const c = { ok:'#81c784', warn:'#ffb74d', bad:'#ff6b6b', info:'#8ab8fd', muted:'#7f93b5' }[tone] || '#8ab8fd';
  return `<span ${attrs} style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid ${esc(c)}55;background:${esc(c)}18;color:${esc(c)};font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.6px">${esc(text)}</span>`;
};

export const renderDeviceTitle = d => {
  const p = String(d?.platform || d?.sourcePlatform || '').toLowerCase(), cls = String(d?.class || d?.sourceDeviceClass || '').toLowerCase();
  const ic = /ios|iphone|ipad/.test(`${p} ${cls}`) ? '📱' : (/android/.test(`${p} ${cls}`) ? '🤖' : '💻');
  return `${ic} ${esc(d?.label || d?.sourceDeviceLabel || d?.class || d?.sourceDeviceClass || 'Устройство')}`;
};

export const renderModalNote = ({
  text = '',
  html = '',
  tone = 'info',
  style = ''
} = {}) => {
  if (text && html) {
    throw new Error('render_modal_note_content_conflict');
  }

  const color = {
    info: '#9db7dd',
    warn: '#ffb74d',
    ok: '#81c784',
    bad: '#ff6b6b',
    muted: '#7f93b5'
  }[tone] || '#9db7dd';

  const content = html || esc(text);

  return `<div style="font-size:12px;color:${esc(color)};line-height:1.45;margin-top:10px;${esc(style)}">${content}</div>`;
};

export const renderActionGrid = actions =>
  `<div class="yandex-auth-actions">${(actions || []).map(a => `<button type="button" class="modal-action-btn ${a.primary ? 'online' : ''}" ${a.attrs || ''}>${esc(a.text || 'OK')}</button>`).join('')}</div>`;

export const renderSmallListRow = ({ icon = '', title = '', desc = '', attrs = '', style = '' } = {}) =>
  `<div class="profile-list-item" ${attrs} ${style ? `style="${esc(style)}"` : ''}>${icon ? `<div style="font-size:22px;width:28px;text-align:center;flex-shrink:0">${esc(icon)}</div>` : ''}<div class="log-info"><div class="log-title">${esc(title)}</div><div class="log-desc">${esc(desc)}</div></div></div>`;

export const renderInlineActions = actions =>
  `<div class="modal-choice-actions profile-inline-actions">${(actions || []).map(x => `<button type="button" class="modal-action-btn ${x.primary ? 'online' : ''}" ${x.attrs || ''}>${esc(x.text || 'OK')}</button>`).join('')}</div>`;

export const renderSyncLogRow = r =>
  `<div class="profile-list-item sync-log-row"><div style="font-size:20px">${r?.ok ? '✅' : '⚠️'}</div><div class="log-info"><div class="log-title">${esc(fmtDateTime(r?.timestamp))} · ${esc(r?.reason || 'sync')}</div><div class="log-desc">${esc(r?.ok ? 'успешно' : `ошибка: ${r?.error || 'unknown'}`)}</div><div class="log-desc">hash: ${esc(r?.hash || '—')} · domains: ${esc((r?.domains || []).join(', ') || '—')}</div><div class="log-desc">shared: ${r?.uploadedShared ? 'да' : 'нет'} · archive: ${r?.uploadedEventArchive ? 'да' : 'нет'} · device: ${r?.uploadedDevice ? 'да' : 'нет'}</div></div></div>`;

export default { esc, fmtDateTime, fmtTime, renderMetaBox, renderSectionCard, renderCloudSectionCard, renderKeyValueRow, renderWarnList, renderScoreBar, renderStatusPill, renderDeviceTitle, renderModalNote, renderActionGrid, renderSmallListRow, renderInlineActions, renderSyncLogRow };

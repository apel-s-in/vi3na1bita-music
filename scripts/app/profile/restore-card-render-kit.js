// UID.096_(Helper-first anti-duplication policy)_(fresh restore cards вынесены из модалки)_(hero/version/device/actions)
// UID.112_(Profile command center)_(restore UI использует общий renderer-kit)_(меньше inline HTML без изменения restore logic)

import { esc, fmtDateTime, renderActionGrid, renderDeviceTitle } from './profile-render-kit.js';

const s = v => String(v == null ? '' : v).trim();
const devIcon = d => /iphone|ipad|ios/i.test(`${d?.class || d?.cls || d?.platform || d?.sourcePlatform || ''}`) ? '📱' : (/android/i.test(`${d?.class || d?.cls || d?.platform || d?.sourcePlatform || ''}`) ? '🤖' : '💻');

export const renderFreshHero = ({ currentDeviceInfo: cD = null } = {}) =>
  `<div class="fresh-hero"><div class="fresh-hero-icon">☁️</div><div><div class="fresh-hero-title">Облачная копия найдена</div><div class="fresh-hero-sub">Выберите версию и устройство. Без подтверждения ничего не восстановится.</div></div></div>${cD ? `<div class="fresh-current-device"><div class="fresh-cap">Вы сейчас на</div><div class="fresh-current-title">${esc(cD.osIcon)} ${esc(cD.os)} · ${esc(cD.browser)}</div><div class="fresh-muted">Текущее имя: ${esc(cD.label || 'Моё устройство')}</div></div>` : ''}`;

export const renderBackupVersionCard = (it = {}, idx = 0) =>
  `<label class="fresh-version-card ${idx === 0 ? 'is-picked' : ''}"><input type="radio" name="fresh-ver" value="${idx}" ${idx === 0 ? 'checked' : ''}><span class="fresh-version-mark">${it.isLatest ? '☁️' : '🕘'}</span><span class="fresh-version-main"><b>${it.isLatest ? 'Последняя копия' : 'Архивная версия'}${it.checksum ? ' ✓' : ''}</b><small>${fmtDateTime(it.timestamp)}${it.sizeHuman ? ` · ${esc(it.sizeHuman)}` : ''}${it.appVersion ? ` · v${esc(it.appVersion)}` : ''}${it.eventCount ? ` · событий: ${esc(it.eventCount)}` : ''}</small></span></label>`;

export const renderDeviceChoiceCard = (dv = {}, idx = 0, defaultKey = '') =>
  `<label class="fresh-device-card ${idx === 0 ? 'is-picked' : ''}"><input type="radio" name="fresh-dev" value="${esc(dv.key)}" ${s(dv.key) === s(defaultKey) ? 'checked' : ''}><span class="fresh-device-ic">${devIcon(dv)}</span><span class="fresh-device-main"><b>${renderDeviceTitle(dv)}</b><small>${esc([dv.class || dv.cls, dv.platform, dv.lastSeenAt ? fmtDateTime(dv.lastSeenAt) : ''].filter(Boolean).join(' · '))}</small></span></label>`;

export const renderSpecialDeviceChoices = ({ hasDevices = false } = {}) =>
  `<label class="fresh-device-card ${!hasDevices ? 'is-picked' : ''}"><input type="radio" name="fresh-dev" value="__new__" ${!hasDevices ? 'checked' : ''}><span class="fresh-device-ic">✨</span><span class="fresh-device-main"><b>Новое устройство</b><small>Создать новую запись и задать имя</small></span></label><label class="fresh-device-card"><input type="radio" name="fresh-dev" value="__shared_only__"><span class="fresh-device-ic">👤</span><span class="fresh-device-main"><b>Только общий прогресс</b><small>Без локальных настроек устройства</small></span></label>`;

export const renderRestoreActions = () =>
  renderActionGrid([{ text: 'Восстановить', primary: true, attrs: 'data-fresh-act="restore"' }, { text: 'Напомнить позже', attrs: 'data-fresh-act="later"' }]);

export default { renderFreshHero, renderBackupVersionCard, renderDeviceChoiceCard, renderSpecialDeviceChoices, renderRestoreActions };

import { changeAccountTimezone, getDeviceTimezoneContext, readCachedTimezonePolicy, refreshTimezonePolicy, setAccountTimezone } from '../../core/timezone-policy.js';
import { esc, fmtDateTime, renderMetaBox } from './profile-render-kit.js';

const currentOwner = () => String(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id || '').trim();

export const renderAccountTimezoneBlock = () => {
  const policy = readCachedTimezonePolicy(currentOwner());
  const device = getDeviceTimezoneContext();
  const zone = policy.available ? policy.zone : 'Не закреплён';
  const status = policy.available ? 'Используется для наград и календарных достижений' : 'Подтвердите зону для наград и календарной статистики';
  return `<section class="yandex-auth-note account-timezone-card" id="ya-timezone-block"><div class="account-card-heading"><span>🕒 Часовой пояс аккаунта</span><button type="button" class="om-btn om-btn--ghost" id="ya-timezone-refresh">↻</button></div><div class="account-timezone-status">${esc(status)}</div><div class="yandex-auth-meta">${renderMetaBox({ label: 'Зона аккаунта', value: zone })}${renderMetaBox({ label: 'Текущая зона устройства', value: device.timezone || '—' })}${renderMetaBox({ label: 'Revision', value: policy.revision || '—' })}${renderMetaBox({ label: 'Действует с', value: policy.effectiveFrom ? fmtDateTime(policy.effectiveFrom) : '—' })}</div><div class="account-timezone-note">Путешествия меняют локальную статистику устройства, но не наградную зону аккаунта и не дедлайн «Преданности».</div><button type="button" class="om-btn om-btn--outline om-fullw" id="ya-timezone-change">${policy.available ? 'Изменить на текущую зону устройства' : `Подтвердить ${esc(device.timezone || 'текущую зону')}`}</button></section>`;
};

export const bindAccountTimezoneBlock = (root, rerender) => {
  const block = root?.querySelector('#ya-timezone-block');
  if (!block || block._bound) return;
  block._bound = true;
  block.addEventListener('click', async event => {
    if (event.target.closest('#ya-timezone-refresh')) {
      await refreshTimezonePolicy().catch(() => null);
      rerender?.();
      return;
    }
    if (!event.target.closest('#ya-timezone-change')) return;
    const policy = readCachedTimezonePolicy(currentOwner());
    const device = getDeviceTimezoneContext();
    try {
      if (policy.available) await changeAccountTimezone();
      else await setAccountTimezone(device.timezone);
      window.NotificationSystem?.success?.('Часовой пояс аккаунта сохранён');
      rerender?.();
    } catch (error) {
      window.NotificationSystem?.error?.(`Не удалось сохранить часовой пояс: ${error?.message || 'ошибка'}`);
    }
  });
};

export default { renderAccountTimezoneBlock, bindAccountTimezoneBlock };

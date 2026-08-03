// UID.096_(Helper-first anti-duplication policy)_(Yandex account HTML вынесен из yandex-auth-view)_(connected/loggedOut/sync/actions)
// UID.112_(Profile command center)_(account cloud UI остаётся единым центром backup/sync/claim)_(меньше риска сломать bindings)

import { esc } from './profile-render-kit.js';
import { renderAccountDevicesBlock } from './account-devices-view.js';
import { renderAccountTimezoneBlock } from './account-timezone-view.js';
import { renderAccountBenefitsBlock } from './account-benefits-view.js';
import { renderAccountBottomActions, renderCloudStatusHeader, renderYandexActionGrid } from './cloud-action-render-kit.js';

const schedulerLabel = () => {
  const state = window.BackupSyncEngine?.getSchedulerState?.();
  if (!state?.loaded) return '';
  if (state.blockReason === 'disk_space_exhausted') return 'Яндекс Диск заполнен';
  if (state.blockReason === 'disk_access_unavailable') return 'Нет доступа к Яндекс Диску';
  if (state.deferredReason === 'playback_active') return 'Отложено до завершения воспроизведения';
  if (state.deferredReason === 'game_active') return 'Отложено до закрытия игры';
  if (state.deferredReason === 'voice_call_active') return 'Отложено до завершения звонка';
  if (state.deferredReason === 'quiet_mode') return 'Отложено до возвращения в приложение';
  if (state.deferredReason === 'network_unavailable') return 'Ожидает сеть';
  if (state.deferredReason === 'coordinator_local_busy') return 'Синхронизация уже идёт в другой вкладке';
  if (state.deferredReason === 'coordinator_queued') {
    const position = Number(state.queue?.position || state.queue?.queuePosition || 0);
    const holder = String(state.queue?.activeLease?.holderLabel || state.queue?.holder?.label || '').trim();
    return `В очереди${position > 0 ? `: ${position}` : ''}${holder ? ` · синхронизирует ${holder}` : ''}`;
  }
  if (state.deferredReason === 'coordinator_blocked') return 'Синхронизация аккаунта временно заблокирована';
  if (state.continuationAt > Date.now()) return `Продолжение: ${new Date(state.continuationAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (state.nextSyncAt > 0) return `Ежедневный режим · следующая: ${new Date(state.nextSyncAt).toLocaleString('ru-RU')}`;
  return '';
};

export const renderSyncStatusLine = ({ lastSyncLabel = '', autosaveChecked = '' } = {}) =>
  `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#7f93b5;padding:6px 0;flex-wrap:wrap"><style>.syncPulse{animation:syncPulse 1s infinite}@keyframes syncPulse{0%,to{opacity:1}50%{opacity:.3}}</style><span id="ya-sync-dot" title="Авто-сохранение" style="width:8px;height:8px;border-radius:50%;background:#888;flex-shrink:0;transition:background .3s"></span><span style="flex:1">Авто-сохранение · <span id="ya-last-sync-label">${esc(lastSyncLabel)}</span></span><label class="set-switch" style="flex-shrink:0" title="Вкл/выкл автосохранение"><input type="checkbox" id="ya-autosave-toggle" ${autosaveChecked}><span class="set-slider"></span></label></div><div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#7f93b5;padding:2px 0;margin-bottom:4px"><span style="flex:1;color:#888">V7 передаёт immutable ranges, общие account-data и настройки текущего устройства.</span><span id="ya-scheduler-label" style="color:#888;font-size:11px">${esc(schedulerLabel() || 'Ежедневный режим')}</span></div>`;

export const renderYandexConnectedBlock = ({ profile: pr, statusLabel = '', statusColor = '#4caf50', hasDiskAccess = false, avatarHtml = '', lastSyncLabel = '', autosaveChecked = '', autoRelogin = false } = {}) =>
  `<div class="yandex-auth-block">${renderCloudStatusHeader({ statusLabel, statusColor, profile:pr, hasDiskAccess, avatarHtml })}${renderYandexActionGrid()}<div class="yandex-auth-autologin"><span class="yandex-auth-autologin-text">Автовход при истечении сессии</span><label class="set-switch"><input type="checkbox" id="ya-auto-relogin" ${autoRelogin ? 'checked' : ''}><span class="set-slider"></span></label></div>${renderSyncStatusLine({ lastSyncLabel, autosaveChecked })}${renderAccountTimezoneBlock()}${renderAccountDevicesBlock()}<div class="yandex-auth-note">Облачная копия хранит локальную статистику, события и пользовательские плейлисты. Имя, аватар и оформление пока остаются локальными; Избранное синхронизируется отдельно через сервер. Достижения, Осколки, Преданность, playback ownership и security-настройки устройств также хранятся только на сервере.</div>${renderAccountBottomActions()}${renderAccountBenefitsBlock()}</div>`;

export const renderYandexLoggedOutBlock = ({ statusLabel = 'Не подключено', statusColor = '#888' } = {}) =>
  `<div class="yandex-auth-block">${renderCloudStatusHeader({ statusLabel, statusColor })}<button class="yandex-auth-mainbtn" data-ya-action="login"><span style="font-size:22px;line-height:1">Я</span><span>Войти через Яндекс</span></button>${renderAccountBenefitsBlock()}</div>`;

export default { renderYandexConnectedBlock, renderYandexLoggedOutBlock, renderSyncStatusLine };

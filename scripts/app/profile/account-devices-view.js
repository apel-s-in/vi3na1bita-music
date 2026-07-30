import { requestSocialAction } from '../../core/social-session.js';
import { getDeviceId } from '../../core/device-context.js';
import DeviceRegistry from '../../analytics/device-registry.js';
import { esc, fmtDateTime as fmt, renderMetaBox, renderSmallListRow, renderStatusPill } from './profile-render-kit.js';

const safe = value => String(value == null ? '' : value).trim();
const authorized = () => window.YandexAuth?.getSessionStatus?.() === 'active' && window.YandexAuth?.isTokenAlive?.();
const owner = () => safe(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id);
const icon = device => device?.platform === 'ios' ? '📱' : device?.platform === 'android' ? '🤖' : '💻';
const state = { owner: '', items: [], playback: null, loaded: false, loading: false, error: '', retryAt: 0 };

const resetState = () => {
  state.owner = owner();
  state.items = [];
  state.playback = null;
  state.loaded = false;
  state.loading = false;
  state.error = '';
  state.retryAt = 0;
};

const normalizeDevice = raw => ({
  deviceId: safe(raw?.deviceId),
  label: safe(raw?.label || 'Устройство'),
  deviceClass: safe(raw?.deviceClass || 'Desktop'),
  platform: safe(raw?.platform || 'web'),
  pwa: raw?.pwa === true,
  timezone: safe(raw?.timezone),
  takeoverEnabled: raw?.takeoverEnabled !== false,
  remotePauseEnabled: raw?.remotePauseEnabled !== false,
  alwaysConfirm: raw?.alwaysConfirm !== false,
  initializationPending: raw?.initializationPending === true,
  initializationMode: safe(raw?.initializationMode),
  initializedAt: Math.max(0, Number(raw?.initializedAt || 0)),
  inheritedFromDeviceId: safe(raw?.inheritedFromDeviceId),
  revokedAt: Math.max(0, Number(raw?.revokedAt || 0)),
  firstSeenAt: Math.max(0, Number(raw?.firstSeenAt || 0)),
  lastSeenAt: Math.max(0, Number(raw?.lastSeenAt || 0)),
  updatedAt: Math.max(0, Number(raw?.updatedAt || 0))
});

export const refreshAccountDevices = async ({ force = false } = {}) => {
  const currentOwner = owner();
  if (!authorized() || !currentOwner) {
    resetState();
    return [];
  }
  if (state.owner !== currentOwner) resetState();
  if (state.loading) return state.items;
  if (state.loaded && !force) return state.items;
  if (!force && state.retryAt > Date.now()) return state.items;
  state.loading = true;
  state.error = '';
  try {
    const [devices, playback] = await Promise.all([
      requestSocialAction('account_device_list', {}),
      requestSocialAction('playback_state_get', { deviceId: getDeviceId() }).catch(() => null)
    ]);
    state.owner = currentOwner;
    state.items = (Array.isArray(devices?.items) ? devices.items : []).map(normalizeDevice).filter(item => item.deviceId).sort((left, right) => right.lastSeenAt - left.lastSeenAt);
    state.playback = playback?.playback || null;
    state.loaded = true;
    state.retryAt = 0;
    window.dispatchEvent(new CustomEvent('account:devices-updated', { detail: { count: state.items.length } }));
    return state.items;
  } catch (error) {
    state.error = safe(error?.message || 'account_device_list_failed');
    state.retryAt = Date.now() + (/429|backoff|rate_limit/i.test(state.error) ? 60000 : 15000);
    throw error;
  } finally {
    state.loading = false;
  }
};

const renderServerRow = device => {
  const current = device.deviceId === getDeviceId();
  const ownerDevice = state.playback?.active === true && state.playback?.ownerDeviceId === device.deviceId;
  const revoked = device.revokedAt > 0;
  const suffix = [current ? 'это устройство' : '', ownerDevice ? 'сейчас играет' : '', device.initializationPending ? 'настройка не завершена' : '', revoked ? 'отозвано' : ''].filter(Boolean).join(' · ');
  return renderSmallListRow({
    icon: icon(device),
    title: `${device.label}${suffix ? ` · ${suffix}` : ''}`,
    desc: `${[device.deviceClass, device.pwa ? 'PWA' : 'браузер', device.timezone].filter(Boolean).join(' · ')} · ${fmt(device.lastSeenAt)}`,
    attrs: `data-server-device-open="${esc(device.deviceId)}"`,
    style: `width:100%;text-align:left;cursor:pointer;opacity:${revoked ? '.48' : '1'}`
  });
};

const backupRows = () => DeviceRegistry.normalizeDeviceRegistry(DeviceRegistry.getDeviceRegistry());
const renderBackupHistoryRow = device => renderSmallListRow({
  icon: icon(device),
  title: device.label || 'Историческое устройство',
  desc: `${[device.class, device.platform, device.pwa ? 'PWA' : '', device.lastSeenAt ? fmt(device.lastSeenAt) : ''].filter(Boolean).join(' · ')} · локальная история установки`,
  style: 'width:100%;text-align:left;opacity:.62'
});
const renderLoading = () => state.error ? `<div class="fav-empty">Ошибка загрузки: ${esc(state.error)}</div>` : '<div class="fav-empty">Получаем серверный список…</div>';

export const renderAccountDevicesBlock = () => {
  if (state.owner !== owner()) resetState();
  const active = state.items.filter(item => !item.revokedAt);
  const backup = backupRows();
  const playbackOwner = state.playback?.active ? state.playback.ownerLabel || 'другое устройство' : 'нет активного владельца';
  return `<section class="yandex-auth-note account-devices-card" id="ya-devices-block"><div class="account-card-heading"><span>📱 Playback и безопасность</span><button type="button" class="om-btn om-btn--ghost" id="ya-devices-refresh">↻</button></div><div class="account-device-summary">Активных устройств: <b>${active.length}</b> · серверный owner: <b>${esc(playbackOwner)}</b></div><div class="account-device-list">${state.loaded ? (state.items.length ? state.items.slice(0, 4).map(renderServerRow).join('') : '<div class="fav-empty">Серверные устройства не найдены</div>') : renderLoading()}</div>${state.items.length > 4 ? '<button type="button" class="om-btn om-btn--outline om-fullw" id="ya-devices-open">Показать все серверные устройства</button>' : ''}<div class="account-backup-device-note"><b>Локальная история установок: ${backup.length}</b><br>Эти записи используются только как подписи локальных событий, не дают playback-доступ и не являются доверенными server devices.</div>${backup.length ? `<div class="account-device-list">${backup.slice(0, 6).map(renderBackupHistoryRow).join('')}</div>` : ''}<button type="button" class="om-btn om-btn--ghost om-fullw" id="ya-playback-diagnostics">Диагностика playback</button></section>`;
};

const updateDevice = async (deviceId, patch) => {
  const result = await requestSocialAction('account_device_update', { deviceId, ...patch });
  const next = normalizeDevice(result?.device);
  const index = state.items.findIndex(item => item.deviceId === deviceId);
  if (index >= 0 && next.deviceId) state.items.splice(index, 1, next);
  return next;
};

const openDeviceModal = deviceId => {
  const device = state.items.find(item => item.deviceId === deviceId);
  if (!device || !window.Modals?.open) return;
  const current = device.deviceId === getDeviceId();
  const ownerDevice = state.playback?.active === true && state.playback?.ownerDeviceId === device.deviceId;
  const revoked = device.revokedAt > 0;
  const modal = window.Modals.open({
    title: `${icon(device)} ${esc(device.label)}`,
    maxWidth: 500,
    bodyHtml: `<div class="account-device-modal"><div class="yandex-auth-meta">${renderMetaBox({ label: 'Класс', value: device.deviceClass })}${renderMetaBox({ label: 'Платформа', value: device.platform })}${renderMetaBox({ label: 'Первый вход', value: fmt(device.firstSeenAt) })}${renderMetaBox({ label: 'Последняя активность', value: fmt(device.lastSeenAt) })}</div><div class="account-device-flags">${current ? renderStatusPill({ text: 'текущее устройство', tone: 'info' }) : ''}${ownerDevice ? renderStatusPill({ text: 'playback owner', tone: 'ok' }) : ''}${revoked ? renderStatusPill({ text: 'отозвано', tone: 'bad' }) : ''}</div><label class="account-device-setting ${revoked ? 'is-disabled' : ''}"><span><b>Разрешить продолжать музыку здесь</b><small>Это устройство сможет запросить перенос после явного Play и подтверждения.</small></span><input type="checkbox" data-device-toggle="takeoverEnabled" ${device.takeoverEnabled ? 'checked' : ''} ${revoked ? 'disabled' : ''}></label><label class="account-device-setting ${revoked ? 'is-disabled' : ''}"><span><b>Разрешить удалённую паузу</b><small>После подтверждённого переноса это устройство можно поставить только на паузу без сброса позиции.</small></span><input type="checkbox" data-device-toggle="remotePauseEnabled" ${device.remotePauseEnabled ? 'checked' : ''} ${revoked ? 'disabled' : ''}></label><div class="account-device-setting"><span><b>Всегда спрашивать подтверждение</b><small>Обязательная серверная политика. Отключить её нельзя.</small></span><input type="checkbox" checked disabled></div><div class="account-device-id">deviceId: ${esc(device.deviceId)}</div><div class="yandex-auth-actions"><button type="button" class="modal-action-btn online" data-device-action="rename">✏️ Переименовать</button>${!current && !revoked ? '<button type="button" class="modal-action-btn" data-device-action="revoke">Отозвать устройство</button>' : ''}</div></div>`
  });

  modal?.addEventListener('change', async event => {
    const field = event.target?.dataset?.deviceToggle;
    if (!['takeoverEnabled', 'remotePauseEnabled'].includes(field)) return;
    const value = event.target.checked;
    event.target.disabled = true;
    try {
      await updateDevice(device.deviceId, { [field]: value });
      window.NotificationSystem?.success?.('Разрешение устройства сохранено');
    } catch (error) {
      event.target.checked = !value;
      window.NotificationSystem?.error?.(`Не удалось сохранить: ${error?.message || 'ошибка'}`);
    } finally {
      event.target.disabled = false;
    }
  });

  modal?.addEventListener('click', event => {
    const action = event.target.closest('[data-device-action]')?.dataset.deviceAction;
    if (action === 'rename') {
      window.Utils?.profileModals?.promptName?.({
        title: 'Название устройства',
        value: device.label,
        btnText: 'Сохранить',
        onSubmit: async value => {
          try {
            await updateDevice(device.deviceId, { label: value });
            if (current) localStorage.setItem('yandex:onboarding:device_label', value);
            modal.remove();
            window.dispatchEvent(new CustomEvent('account:devices-updated'));
            window.NotificationSystem?.success?.('Устройство переименовано');
          } catch (error) {
            window.NotificationSystem?.error?.(`Не удалось переименовать: ${error?.message || 'ошибка'}`);
          }
        }
      });
    }
    if (action === 'revoke') {
      window.Modals?.confirm?.({
        title: 'Отозвать устройство?',
        textHtml: 'Устройство больше не сможет получать playback ownership и выполнять защищённые действия. Автоматическое восстановление отключено.',
        confirmText: 'Отозвать',
        cancelText: 'Отмена',
        onConfirm: async () => {
          try {
            await updateDevice(device.deviceId, { revoked: true });
            modal.remove();
            window.dispatchEvent(new CustomEvent('account:devices-updated'));
            window.NotificationSystem?.success?.('Устройство отозвано');
          } catch (error) {
            window.NotificationSystem?.error?.(`Не удалось отозвать: ${error?.message || 'ошибка'}`);
          }
        }
      });
    }
  });
};

const openAllDevices = () => {
  const modal = window.Modals?.open?.({
    title: 'Серверные устройства',
    maxWidth: 500,
    bodyHtml: `<div class="account-device-list">${state.items.length ? state.items.map(renderServerRow).join('') : '<div class="fav-empty">Устройства не найдены</div>'}</div>`
  });
  modal?.addEventListener('click', event => {
    const id = event.target.closest('[data-server-device-open]')?.dataset.serverDeviceOpen;
    if (!id) return;
    modal.remove();
    openDeviceModal(id);
  });
};

export const bindAccountDevicesBlock = (root, rerender) => {
  const block = root?.querySelector('#ya-devices-block');
  if (!block || block._bound) return;
  block._bound = true;

  if (!state.loaded && !state.loading && state.retryAt <= Date.now()) {
    refreshAccountDevices().then(() => rerender?.()).catch(() => {
      if (block.isConnected) {
        const list = block.querySelector('.account-device-list');
        if (list) list.innerHTML = renderLoading();
      }
    });
  }

  block.addEventListener('click', async event => {
    const deviceId = event.target.closest('[data-server-device-open]')?.dataset.serverDeviceOpen;
    if (deviceId) return openDeviceModal(deviceId);
    if (event.target.closest('#ya-devices-open')) return openAllDevices();
    if (event.target.closest('#ya-devices-refresh')) {
      await refreshAccountDevices({ force: true }).catch(error => window.NotificationSystem?.error?.(`Не удалось обновить устройства: ${error?.message || 'ошибка'}`));
      rerender?.();
      return;
    }
    if (event.target.closest('#ya-playback-diagnostics')) {
      const logical = await window.PlaybackOwnership?.getLogicalDiagnostics?.().catch(() => null);
      const text = logical ? JSON.stringify(logical, null, 2) : 'Активная logical listening session не найдена.';
      window.Modals?.open?.({ title: 'Playback diagnostics', maxWidth: 500, bodyHtml: `<pre style="white-space:pre-wrap;word-break:break-word;color:#9db7dd;font-size:10px;line-height:1.4">${esc(text)}</pre>` });
    }
  });
};

window.addEventListener('yandex:auth:changed', event => {
  if (event.detail?.status !== 'active') resetState();
});
window.addEventListener('account:data-switching', resetState);

export default { renderAccountDevicesBlock, bindAccountDevicesBlock, refreshAccountDevices };

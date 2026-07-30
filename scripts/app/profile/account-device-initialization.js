// Инициализация server account device после OAuth.
// Не меняет deviceId, не управляет playback и не восстанавливает физический cache.
import { getSocialSession, requestSocialAction } from '../../core/social-session.js';
import { getDeviceContext } from '../../core/device-context.js';

const safe = value => String(value == null ? '' : value).trim();

const compatibilityKey = raw => {
  const platform = safe(raw?.platform).toLowerCase();
  const deviceClass = safe(raw?.deviceClass).toLowerCase();

  if (platform === 'ios') {
    return deviceClass.includes('ipad') || deviceClass.includes('tablet') ? 'ios-tablet' : 'ios-phone';
  }
  if (platform === 'android') {
    return deviceClass.includes('tablet') ? 'android-tablet' : 'android-mobile';
  }
  return 'desktop';
};

const icon = device => {
  const key = compatibilityKey(device);
  if (key === 'ios-phone') return '📱';
  if (key === 'ios-tablet' || key === 'android-tablet') return '▣';
  if (key === 'android-mobile') return '🤖';
  return '💻';
};

const deviceDescription = device => [
  safe(device?.deviceClass),
  device?.pwa === true ? 'приложение' : 'браузер',
  safe(device?.platform),
  safe(device?.timezone)
].filter(Boolean).join(' · ');

export const accountDevicesAreCompatible = (left, right) => compatibilityKey(left) === compatibilityKey(right);

const chooseInitialization = ({ currentDevice, devices }) => new Promise((resolve, reject) => {
  if (!window.Modals?.open) {
    reject(new Error('account_device_initialization_ui_unavailable'));
    return;
  }

  const esc = window.Utils?.escapeHtml || (value => String(value || ''));
  const compatible = (Array.isArray(devices) ? devices : [])
    .filter(device => device?.deviceId && device.deviceId !== currentDevice.deviceId)
    .filter(device => !device.revokedAt && device.initializationPending !== true)
    .filter(device => accountDevicesAreCompatible(currentDevice, device))
    .sort((left, right) => Number(right.lastSeenAt || 0) - Number(left.lastSeenAt || 0));

  const rows = compatible.map(device => `
    <button type="button" class="account-device-init-choice" data-init-device="${esc(device.deviceId)}">
      <span class="account-device-init-choice__icon">${icon(device)}</span>
      <span class="account-device-init-choice__text">
        <b>${esc(device.label || 'Моё устройство')}</b>
        <small>${esc(deviceDescription(device))}</small>
      </span>
      <span class="account-device-init-choice__arrow">›</span>
    </button>
  `).join('');

  let settled = false;
  const finish = value => {
    if (settled) return;
    settled = true;
    modal?.remove();
    resolve(value);
  };

  const modal = window.Modals.open({
    title: 'Настройка этого устройства',
    maxWidth: 430,
    strictClose: true,
    bodyHtml: `
      <section class="account-device-init">
        <div class="account-device-init__current">
          <span>${icon(currentDevice)}</span>
          <div>
            <b>${esc(currentDevice.label || 'Это устройство')}</b>
            <small>${esc(deviceDescription(currentDevice))}</small>
          </div>
        </div>
        <p>Мы не нашли эту установку среди ранее настроенных устройств вашего аккаунта.</p>
        <button type="button" class="account-device-init-new" data-init-new>
          <span>✨</span>
          <span><b>Создать новое устройство</b><small>Начать с настройками этой установки</small></span>
        </button>
        ${compatible.length ? `
          <div class="account-device-init__caption">Или это одно из ваших прежних устройств</div>
          <div class="account-device-init__list">${rows}</div>
          <div class="account-device-init__note">Будут использованы только подходящие настройки интерфейса и offline-отметки. История устройства и его идентификатор не копируются.</div>
        ` : '<div class="account-device-init__note">Подходящих прежних устройств этого типа не найдено.</div>'}
      </section>
    `
  });

  if (!modal) {
    reject(new Error('account_device_initialization_ui_unavailable'));
    return;
  }

  modal.addEventListener('click', event => {
    if (event.target.closest('[data-init-new]')) {
      finish({ mode: 'new', sourceDeviceId: '' });
      return;
    }

    const sourceDeviceId = safe(event.target.closest('[data-init-device]')?.dataset.initDevice);
    if (sourceDeviceId) finish({ mode: 'inherit', sourceDeviceId });
  });
});

export const resolveAccountDeviceInitialization = async ({ session = null } = {}) => {
  const social = session || await getSocialSession({ force: true });
  const currentDevice = social?.accountDevice || getDeviceContext();

  if (!social?.accountDeviceInitializationRequired && currentDevice?.initializationPending !== true) {
    return {
      session: social,
      wasKnown: social?.accountDeviceWasKnown === true,
      initialized: true,
      mode: safe(currentDevice?.initializationMode || 'legacy'),
      device: currentDevice,
      settingsSourceDeviceId: safe(currentDevice?.inheritedFromDeviceId)
    };
  }

  const result = await requestSocialAction('account_device_list', {});
  const choice = await chooseInitialization({
    currentDevice,
    devices: result?.items || []
  });

  const initialized = await requestSocialAction('account_device_initialize', choice);
  if (!initialized?.device || initialized.device.initializationPending === true) {
    throw new Error('account_device_initialization_incomplete');
  }

  window.dispatchEvent(new CustomEvent('account:device-initialized', {
    detail: {
      mode: choice.mode,
      device: initialized.device,
      settingsSourceDeviceId: safe(initialized.settingsSourceDeviceId)
    }
  }));

  return {
    session: social,
    wasKnown: false,
    initialized: true,
    mode: choice.mode,
    device: initialized.device,
    settingsSourceDeviceId: safe(initialized.settingsSourceDeviceId)
  };
};

export default { accountDevicesAreCompatible, resolveAccountDeviceInitialization };

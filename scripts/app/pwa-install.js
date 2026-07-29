// PWA installation bridge.
// Не управляет playback и подтверждает установку только после standalone-запуска.
import { requestSocialAction } from '../core/social-session.js';
import { getDeviceId, getDevicePlatform, isDevicePwa } from '../core/device-context.js';
import { applyShardRewardResult } from './shards/reward-notifier.js';
const W = window;
const D = document;
const INTENT_PREFIX = 'pwa:installIntent:v1:';
let initialized = false;
let deferredPrompt = null;
let verificationPromise = null;
const safe = value => String(value == null ? '' : value).trim();
const currentOwner = () => safe(W.YandexAuth?.getProfile?.()?.yandexId || W.YandexAuth?.getProfile?.()?.id);
const currentDeviceId = () => getDeviceId();
const isStandalone = () => isDevicePwa();
const platform = () => getDevicePlatform() === 'web' ? 'desktop' : getDevicePlatform();
const intentKey = owner => `${INTENT_PREFIX}${safe(owner)}`;
const readIntent = owner => {
  try {
    const value = JSON.parse(localStorage.getItem(intentKey(owner)) || 'null');
    return value && value.intentId && value.challenge && value.deviceId ? value : null;
  } catch {
    return null;
  }
};
const writeIntent = (owner, intent) => {
  try {
    localStorage.setItem(intentKey(owner), JSON.stringify(intent));
  } catch {}
};
const clearIntent = owner => {
  try {
    localStorage.removeItem(intentKey(owner));
  } catch {}
};
const instructionData = () => {
  const type = platform();
  if (type === 'ios') {
    return {
      icon: '📱',
      title: 'Установка на iPhone или iPad',
      steps: ['Откройте приложение именно в Safari.', 'Нажмите кнопку «Поделиться» в нижней или верхней панели Safari.', 'Прокрутите меню и выберите «На экран Домой».', 'Подтвердите добавление кнопкой «Добавить».', 'Закройте Safari и запустите приложение новым ярлыком с экрана Домой.'],
      note: 'Награда подтверждается только после запуска с созданного ярлыка.'
    };
  }
  if (type === 'android') {
    return {
      icon: '🤖',
      title: 'Установка на Android',
      steps: ['Откройте меню браузера ⋮.', 'Выберите «Установить приложение» или «Добавить на главный экран».', 'Подтвердите установку.', 'Закройте вкладку браузера.', 'Запустите приложение созданным ярлыком с главного экрана.'],
      note: 'Если браузер показывает системное окно установки, подтвердите его.'
    };
  }
  return {
    icon: '💻',
    title: 'Установка на компьютер',
    steps: ['Нажмите значок установки в правой части адресной строки.', 'Если значка нет, откройте меню браузера.', 'Выберите «Установить Витрина Разбита» или «Установить приложение».', 'Подтвердите установку.', 'Закройте эту вкладку и запустите приложение ярлыком с рабочего стола или из меню приложений.'],
    note: 'Награда подтверждается после отдельного запуска установленного окна.'
  };
};
const openInstructions = () => {
  const data = instructionData();
  const escape = W.Utils?.escapeHtml || (value => String(value || ''));
  return W.Modals?.open?.({
    title: data.title,
    maxWidth: 420,
    bodyHtml: `
      <section class="pwa-guide">
        <div class="pwa-guide-icon">${data.icon}</div>
        <ol class="pwa-guide-steps">
          ${data.steps.map(step => `<li>${escape(step)}</li>`).join('')}
        </ol>
        <div class="pwa-guide-note">${escape(data.note)}</div>
        <button class="om-btn om-btn--primary pwa-guide-close" type="button">
          Инструкция понятна
        </button>
      </section>
    `
  });
};
const beginInstallIntent = async () => {
  const owner = currentOwner();
  if (W.YandexAuth?.getSessionStatus?.() !== 'active' || !W.YandexAuth?.isTokenAlive?.() || !owner) {
    W.Modals?.choice?.({
      title: 'Нужен вход через Яндекс',
      textHtml: 'Для подтверждения PWA-достижения сначала войдите через Яндекс.<br><br>' + 'Установка и награда будут привязаны к одному Яндекс ID.',
      actions: [
        { key: 'login', text: 'Войти через Яндекс', primary: true, onClick: () => W.YandexAuth?.login?.() },
        { key: 'cancel', text: 'Позже', onClick: () => {} }
      ]
    });
    return null;
  }
  const result = await requestSocialAction('pwa_install_intent', { deviceId: currentDeviceId(), platform: platform(), launchMode: 'browser' });
  if (result?.alreadyCompleted) return result;
  if (result?.intentId && result?.challenge) {
    writeIntent(owner, { intentId: safe(result.intentId), challenge: safe(result.challenge), deviceId: currentDeviceId(), platform: platform(), createdAt: Date.now(), expiresAt: Number(result.expiresAt || 0) });
  }
  return result;
};
const verifyStandaloneLaunch = async () => {
  if (!isStandalone() || verificationPromise) {
    return verificationPromise;
  }
  const owner = currentOwner();
  if (!owner || W.YandexAuth?.getSessionStatus?.() !== 'active' || !W.YandexAuth?.isTokenAlive?.()) {
    return null;
  }
  const intent = readIntent(owner);
  if (!intent) return null;
  verificationPromise = requestSocialAction('pwa_launch_verify', { intentId: intent.intentId, challenge: intent.challenge, deviceId: intent.deviceId, platform: intent.platform, launchMode: 'standalone' })
    .then(result => {
      clearIntent(owner);
      if (result?.progress) {
        W.ListeningReceipts.lastProgress = result.progress;
      }
      applyShardRewardResult(result);
      queueMicrotask(() => {
        W.ListeningReceipts?.refreshStatus?.().catch(() => null);
      });
      W.NotificationSystem?.success?.(result?.duplicate ? 'PWA уже подтверждено для вашего аккаунта' : '📱 Приложение установлено. Достижение подтверждено!');
      return result;
    })
    .finally(() => {
      verificationPromise = null;
    });
  return verificationPromise;
};
const handleInstallClick = async button => {
  button.disabled = true;
  try {
    const intent = await beginInstallIntent();
    if (!intent) return;
    if (intent.alreadyCompleted) {
      W.NotificationSystem?.info?.('PWA-достижение уже выполнено для этого Яндекс ID');
    }
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') {
        W.NotificationSystem?.success?.('Установка началась. После неё запустите приложение с ярлыка.');
      } else {
        W.NotificationSystem?.info?.('Установка отменена. Можно повторить позже.');
      }
      return;
    }
    const modal = openInstructions();
    modal?.querySelector('.pwa-guide-close')?.addEventListener('click', () => modal.remove());
  } catch (error) {
    W.NotificationSystem?.error?.(`Не удалось начать установку: ${error?.message || 'ошибка'}`);
  } finally {
    button.disabled = false;
  }
};
export const initPwaInstall = () => {
  if (initialized) return;
  initialized = true;
  const button = D.getElementById('install-pwa-btn');
  if (!button) return;
  button.innerHTML = '<span class="pwa-install-icon" aria-hidden="true">📲</span>' + '<span>Установить приложение</span>';
  if (isStandalone()) {
    button.hidden = true;
  } else {
    button.hidden = false;
    button.addEventListener('click', () => handleInstallClick(button));
  }
  W.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
  });
  W.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    button.hidden = true;
    W.NotificationSystem?.success?.('Приложение установлено. Запустите его с нового ярлыка.');
  });
  W.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status === 'active') {
      verifyStandaloneLaunch().catch(() => null);
    }
  });
  if (isStandalone()) {
    verifyStandaloneLaunch().catch(() => null);
  }
};
export default { initPwaInstall };

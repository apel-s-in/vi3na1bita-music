// Настройки push для «Преданности».
// Не управляет playback и не входит в backup.

import { requestSocialAction } from '../../core/social-session.js';
import { getDeviceId } from '../../core/device-context.js';
import { syncWebPushSubscription } from './web-push.js';
import { applyShardRewardResult } from '../shards/reward-notifier.js';

const deviceId = () => getDeviceId();

const pushTransport = {
  isReady: () =>
    window.YandexAuth?.getSessionStatus?.() === 'active' &&
    window.YandexAuth?.isTokenAlive?.(),

  getWebPushConfig: () =>
    requestSocialAction('webpush_config', {}),

  subscribeWebPush: subscription =>
    requestSocialAction('webpush_subscribe', {
      subscription,
      deviceId: deviceId(),
      userAgent: navigator.userAgent
    })
};

const ingest = result => {
  window.ListeningReceipts
    ?.ingestServerResult?.(result);

  applyShardRewardResult(result);

  window.dispatchEvent(new CustomEvent(
    'loyalty:updated',
    {
      detail: {
        loyalty: result?.loyalty || null
      }
    }
  ));

  return result;
};

export const setLoyaltyReminderEnabled = async enabled => {
  const next = enabled === true;

  if (next) {
    const push = await syncWebPushSubscription({
      core: pushTransport,
      ask: true,
      force: false
    });

    if (!push?.ok) {
      const error = new Error(
        push?.reason || 'push_subscription_failed'
      );
      error.pushResult = push;
      throw error;
    }
  }

  return ingest(await requestSocialAction(
    'loyalty_preference_set',
    {
      reminderEnabled: next,
      deviceId: deviceId()
    }
  ));
};

export const setLoyaltyVacationEnabled = async enabled =>
  ingest(await requestSocialAction(
    'loyalty_vacation_set',
    {
      enabled: enabled === true,
      deviceId: deviceId()
    }
  ));

export default {
  setLoyaltyReminderEnabled,
  setLoyaltyVacationEnabled
};

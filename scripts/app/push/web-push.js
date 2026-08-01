import { requestSocialAction } from '../../core/social-session.js';
import { getDeviceId } from '../../core/device-context.js';

const W = window;
const N = navigator;
const LEASE_REFRESH_PREFIX = 'webpush:lease-refresh:v1:';
const LEASE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

const timeout = (promise, ms, reason) => Promise.race([
  promise,
  new Promise(resolve => setTimeout(() => resolve({ __timeout: true, reason }), ms))
]);

const urlBase64ToUint8Array = base64 => {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
};

const b64 = bytes => {
  if (!bytes) return '';
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer || bytes);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const getReadyRegistration = async () => {
  if (!('serviceWorker' in N)) return null;

  let reg = null;
  try {
    reg = await N.serviceWorker.register('./service-worker.js', { scope: './' });
    await reg.update?.().catch(() => null);
  } catch {}

  const ready = await timeout(N.serviceWorker.ready, 10000, 'service_worker_not_ready');
  if (!ready?.__timeout) return ready;

  const regs = await N.serviceWorker.getRegistrations?.().catch(() => []);
  return regs?.find?.(x => x.scope === new URL('./', W.location.href).href) || reg || null;
};

export const syncWebPushSubscription = async ({ core, ask = false, force = false } = {}) => {
  if (!core?.isReady?.()) return { ok: false, reason: 'friends_not_ready' };
  if (!('serviceWorker' in N)) return { ok: false, reason: 'service_worker_not_supported' };
  if (!('PushManager' in W)) return { ok: false, reason: 'push_manager_not_supported' };
  if (!('Notification' in W)) return { ok: false, reason: 'notification_not_supported' };

  let permission = Notification.permission;
  if (permission === 'default' && ask) permission = await Notification.requestPermission();
  if (permission === 'denied') return { ok: false, reason: 'уведомления заблокированы в настройках браузера' };
  if (permission !== 'granted') return { ok: false, reason: `permission_${permission}` };

  const cfg = await core.getWebPushConfig().catch(err => ({ error: err?.message || 'webpush_config_failed' }));
  if (cfg.error) return { ok: false, reason: cfg.error };
  if (!cfg?.enabled || !cfg.vapidPublicKey) return { ok: false, reason: 'web_push_disabled_or_no_vapid_key' };

  const reg = await getReadyRegistration();
  if (!reg?.pushManager) return { ok: false, reason: 'service_worker_not_ready' };

  const appKey = urlBase64ToUint8Array(cfg.vapidPublicKey);
  const appKeyB64 = b64(appKey);
  let sub = await reg.pushManager.getSubscription();

  const oldKeyB64 = sub?.options?.applicationServerKey ? b64(sub.options.applicationServerKey) : '';
  if (sub && (force || (oldKeyB64 && oldKeyB64 !== appKeyB64))) {
    await sub.unsubscribe().catch(() => null);
    sub = null;
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey
      });
    } catch (err) {
      const old = await reg.pushManager.getSubscription().catch(() => null);
      await old?.unsubscribe?.().catch(() => null);
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appKey
        });
      } catch (err2) {
        return { ok: false, reason: err2?.message || err?.message || 'push_subscribe_failed' };
      }
    }
  }

  const saved = await core.subscribeWebPush(sub.toJSON()).catch(err => ({ ok: false, error: err?.message || 'webpush_save_failed' }));
  if (saved?.ok === false) return { ok: false, reason: saved.error || saved.reason || 'webpush_save_failed' };

  return {
    ok: true,
    endpoint: sub.endpoint,
    endpointTail: String(sub.endpoint || '').slice(-18),
    permission,
    saved
  };
};

const currentOwner = () => String(W.YandexAuth?.getProfile?.()?.yandexId || W.YandexAuth?.getProfile?.()?.id || '').trim();

export const refreshExistingWebPushLease = async ({ force = false } = {}) => {
  const owner = currentOwner();
  if (!owner || W.YandexAuth?.getSessionStatus?.() !== 'active' || !W.YandexAuth?.isTokenAlive?.()) return { ok: false, skipped: true, reason: 'auth_required' };
  if (!('Notification' in W) || Notification.permission !== 'granted' || !('serviceWorker' in N)) return { ok: false, skipped: true, reason: 'push_not_enabled' };

  const key = `${LEASE_REFRESH_PREFIX}${owner}`;
  const last = Number(localStorage.getItem(key) || 0);
  if (!force && Date.now() - last < LEASE_REFRESH_MS) return { ok: true, skipped: true, reason: 'lease_fresh' };

  const registration = await N.serviceWorker.getRegistration('./').catch(() => null);
  const subscription = await registration?.pushManager?.getSubscription?.().catch(() => null);
  if (!subscription) return { ok: false, skipped: true, reason: 'subscription_missing' };

  const result = await requestSocialAction('webpush_subscribe', {
    subscription: subscription.toJSON(),
    deviceId: getDeviceId(),
    userAgent: navigator.userAgent
  });

  localStorage.setItem(key, String(Date.now()));
  return result;
};

let leaseRefreshInitialized = false;
export const initWebPushLeaseRefresh = () => {
  if (leaseRefreshInitialized) return;
  leaseRefreshInitialized = true;

  const refresh = () => {
    if (!document.hidden) refreshExistingWebPushLease().catch(() => null);
  };

  W.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status === 'active') setTimeout(refresh, 1200);
  });
  W.addEventListener('account:data-switched', refresh);
  document.addEventListener('visibilitychange', refresh);

  setTimeout(refresh, 1800);
};

const isIosStandalone = () => {
  const ua = String(N.userAgent || '');
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (N.platform === 'MacIntel' && N.maxTouchPoints > 1);
  const standalone = W.matchMedia?.('(display-mode: standalone)')?.matches || N.standalone === true;
  return isIOS && standalone;
};

export const enableWebPush = async core => {
  return syncWebPushSubscription({ core, ask: true, force: isIosStandalone() });
};

export default { syncWebPushSubscription, enableWebPush, refreshExistingWebPushLease, initWebPushLeaseRefresh };

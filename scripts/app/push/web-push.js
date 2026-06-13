const W = window;
const N = navigator;

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

  try {
    if (!N.serviceWorker.controller) {
      await N.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => null);
    }
  } catch {}

  const ready = await timeout(N.serviceWorker.ready, 8000, 'service_worker_not_ready');
  return ready?.__timeout ? null : ready;
};

export const syncWebPushSubscription = async ({ core, ask = false, force = false } = {}) => {
  if (!core?.isReady?.()) return { ok: false, reason: 'friends_not_ready' };
  if (!('serviceWorker' in N)) return { ok: false, reason: 'service_worker_not_supported' };
  if (!('PushManager' in W)) return { ok: false, reason: 'push_manager_not_supported' };
  if (!('Notification' in W)) return { ok: false, reason: 'notification_not_supported' };

  let permission = Notification.permission;
  if (permission === 'default' && ask) permission = await Notification.requestPermission();
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

export const enableWebPush = async core => {
  const res = await syncWebPushSubscription({ core, ask: true, force: true });

  if (res.ok) {
    W.NotificationSystem?.success?.(`Системные уведомления включены · ${res.endpointTail || 'ok'}`);
  } else {
    W.NotificationSystem?.warning?.(`Уведомления не включены: ${res.reason || 'unknown'}`);
  }

  return res;
};

export default { syncWebPushSubscription, enableWebPush };

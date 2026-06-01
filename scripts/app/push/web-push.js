const W = window;
const N = navigator;

const urlBase64ToUint8Array = base64 => {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
};

export const syncWebPushSubscription = async ({ core, ask = false } = {}) => {
  if (!core?.isReady?.()) return { ok: false, reason: 'friends_not_ready' };
  if (!('serviceWorker' in N) || !('PushManager' in W) || !('Notification' in W)) {
    return { ok: false, reason: 'web_push_not_supported' };
  }

  let permission = Notification.permission;
  if (permission === 'default' && ask) permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: `permission_${permission}` };

  const cfg = await core.getWebPushConfig();
  if (!cfg?.enabled || !cfg.vapidPublicKey) return { ok: false, reason: 'web_push_disabled' };

  const reg = await N.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey)
      });
    } catch (err) {
      const old = await reg.pushManager.getSubscription().catch(() => null);
      await old?.unsubscribe?.().catch(() => null);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey)
      });
    }
  }

  await core.subscribeWebPush(sub.toJSON());
  return { ok: true };
};

export const enableWebPush = async core => {
  const res = await syncWebPushSubscription({ core, ask: true });
  if (res.ok) W.NotificationSystem?.success?.('Системные уведомления включены');
  else W.NotificationSystem?.warning?.('Не удалось включить системные уведомления');
  return res;
};

export default { syncWebPushSubscription, enableWebPush };

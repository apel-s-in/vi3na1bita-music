// scripts/app/friends/friends-block.js
// UID.069/070 (Linked providers identity)_(Друзья получают identity сверху, без OAuth-токена)
// UID.094 (No-paralysis rule)_(сбой Друзей не влияет на плеер/Game Center)
// Тонкий адаптер: основное приложение -> внешний модуль /Friends/

const W = window;
const D = document;
const BASE_FRIENDS = 'https://vi3na1bita.website.yandexcloud.net/Friends';
const FRIENDS_CORE_URL = `${BASE_FRIENDS}/friends-core.js`;
const FRIENDS_UI_URL = `${BASE_FRIENDS}/friends-ui.js`;

let _core = null;
let _ui = null;
let _container = null;
let _bound = false;
let _lastFriendId = '';
let _pushTimer = 0;
let _heartbeatTimer = 0;
let _webPushReady = false;

const readYandexProfile = () => {
  const ya = W.YandexAuth;
  const active = ya?.getSessionStatus?.() === 'active' && ya?.isTokenAlive?.();
  const p = active ? (ya?.getProfile?.() || null) : null;
  return {
    active: !!active,
    yandexId: String(p?.yandexId || p?.id || '').trim(),
    displayName: String(p?.displayName || p?.realName || p?.login || 'Слушатель').trim(),
    avatar: String(p?.avatar || '').trim()
  };
};

const handlePushes = async (items) => {
  for (const push of items) {
    if (push.kind === 'CHAT_MESSAGE') {
      let name = 'Друг';
      try {
        const prof = await _core.getProfile(push.fromFriendId);
        if (prof?.displayName) name = prof.displayName;
      } catch {}

      W.NotificationSystem?.info?.(`💬 ${name}: ${String(push.text || '').slice(0, 80)}`, 6000);
      continue;
    }

    if (push.kind === 'GAME_INVITE') {
      let name = 'Друг';
      try {
        const prof = await _core.getProfile(push.fromFriendId);
        if (prof?.displayName) name = prof.displayName;
      } catch {}

      W.Modals?.choice?.({
        title: '🎮 Вызов на дуэль',
        textHtml: `<b>${W.Utils?.escapeHtml?.(name) || name}</b> приглашает вас в игру <b>Война Сердец</b>.<br><br>Принять вызов?`,
        actions: [
          {
            key: 'accept',
            text: 'Принять',
            primary: true,
            onClick: () => {
              const u = new URL(W.location.href);
              u.searchParams.set('gcGame', push.gameId);
              u.searchParams.set('room', push.roomId);
              u.searchParams.set('key', push.roomSecret);
              W.history.pushState(null, '', u.toString());
              W.AlbumsManager?.loadAlbum?.(W.APP_CONFIG?.SPECIAL_GAMES_KEY || '__games__');
              W.NotificationSystem?.success?.('Подключаемся к бою...');
            }
          },
          { key: 'reject', text: 'Позже', onClick: () => {} }
        ]
      });
    }
  }
};

const startPresenceHeartbeat = () => {
  clearInterval(_heartbeatTimer);

  const beat = async () => {
    if (D.hidden || !_core?.isReady?.()) return;
    try {
      await _core.heartbeat({
        gameId: '',
        roomId: ''
      });
    } catch {}
  };

  beat();
  _heartbeatTimer = setInterval(beat, 45000);
};

const syncWebPushIfAllowed = async () => {
  if (_webPushReady || !_core?.isReady?.()) return;
  if (!('Notification' in W) || W.Notification.permission !== 'granted') return;

  try {
    const mod = await import('../push/web-push.js');
    const res = await mod.syncWebPushSubscription({ core: _core, ask: false });
    _webPushReady = !!res?.ok;
  } catch {}
};

const startPushPolling = () => {
  clearInterval(_pushTimer);

  const poll = async () => {
    if (D.hidden || !_core || !_core.isReady()) return;
    try {
      const items = await _core.getPushes();
      if (items.length) handlePushes(items);
    } catch {}
  };

  poll();
  _pushTimer = setInterval(poll, 12000);
};

const applyIdentity = async () => {
  if (!_core) return;
  const prof = readYandexProfile();
  
  const url = new URL(W.location.href);
  const addId = url.searchParams.get('addFriend') || W.sessionStorage.getItem('pending_friend_id');
  const addKey = url.searchParams.get('key') || W.sessionStorage.getItem('pending_friend_key');

  if (!prof.active || !prof.yandexId) {
    _core.setIdentity({ friendId: '', yandexLinked: false });
    W.__vfIdentity = null;
    _lastFriendId = '';
    clearInterval(_pushTimer);
    clearInterval(_heartbeatTimer);
    _ui?.refresh?.();

    if (_container) {
      _container.classList.add('is-unauth');
      let box = _container.querySelector('.custom-ya-unauth');
      if (!box) {
        box = D.createElement('div');
        box.className = 'custom-ya-unauth';
        box.innerHTML = `<div style="font-size:28px;margin-bottom:12px">🔒</div><button class="yandex-auth-mainbtn" id="vf-ya-login-btn" style="width:100%;max-width:260px;margin-bottom:12px;min-height:46px;font-size:15px;font-weight:900;border-radius:12px;border:1px solid rgba(255,255,255,.08);cursor:pointer;background:linear-gradient(135deg,#d50000,#8f0000);color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 8px 22px rgba(213,0,0,.25);transition:opacity .2s,transform .15s"><span style="font-size:20px;line-height:1">Я</span><span>Войти через Яндекс</span></button><div style="font-size:12px;color:#9db7dd;line-height:1.4;text-align:center">Друзья доступны после входа в основном приложении.</div>`;
        box.querySelector('#vf-ya-login-btn').onclick = () => W.YandexAuth?.login?.();
        box.style.cssText = 'padding:30px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;';
        _container.appendChild(box);
      }
      box.style.display = 'flex';
    }
    
    // Если есть инвайт, но юзер не авторизован - показываем окно и ждём входа
    if (addId && addKey && !W.sessionStorage.getItem('pending_friend_id')) {
      try {
        const info = await _core.getInviteInfo(addId, addKey);
        const inviterName = info?.fromProfile?.displayName || 'Пользователь';
        W.Modals?.choice?.({
          title: '👋 Заявка в друзья',
          textHtml: `<b>${W.Utils?.escapeHtml?.(inviterName)}</b> приглашает вас в друзья.<br><br>Авторизуйтесь через Яндекс Аккаунт, чтобы принять заявку.`,
          actions: [
            { key: 'login', text: 'Войти через Яндекс', primary: true, onClick: () => {
                W.sessionStorage.setItem('pending_friend_id', addId);
                W.sessionStorage.setItem('pending_friend_key', addKey);
                W.YandexAuth?.login?.();
            }},
            { key: 'cancel', text: 'Отмена', onClick: () => {} }
          ]
        });
      } catch (e) {
        W.NotificationSystem?.warning?.('Приглашение устарело или недействительно');
      }
      url.searchParams.delete('addFriend');
      url.searchParams.delete('key');
      W.history.replaceState(null, '', url.toString());
    }
    return;
  }

  const id = await _core.setIdentityFromYandex({
    yandexId: prof.yandexId,
    displayName: prof.displayName,
    avatar: prof.avatar
  });
  
  W.__vfIdentity = id;

  if (_container) {
    _container.classList.remove('is-unauth');
    const box = _container.querySelector('.custom-ya-unauth');
    if (box) box.style.display = 'none';
  }

  if (id?.friendId && id.friendId !== _lastFriendId) {
    _lastFriendId = id.friendId;
    try { await _core.register(); } catch {}
    
    // Если есть отложенный или URL инвайт — принимаем
    if (addId && addKey) {
      try {
        await _core.acceptInvite({ inviteId: addId, secret: addKey });
        W.NotificationSystem?.success?.('Друг успешно добавлен! 🤝');
      } catch (e) {
        const msg = e.message === 'self_friend_forbidden' ? 'Нельзя добавить в друзья самого себя' : 'Приглашение устарело или недействительно';
        W.NotificationSystem?.warning?.(msg);
      }
      W.sessionStorage.removeItem('pending_friend_id');
      W.sessionStorage.removeItem('pending_friend_key');
      url.searchParams.delete('addFriend');
      url.searchParams.delete('key');
      W.history.replaceState(null, '', url.toString());
    }

    _ui?.refresh?.({ force: true });
    startPresenceHeartbeat();
    startPushPolling();
    syncWebPushIfAllowed();
    W.Vi3WebPush = {
      enable: () => import('../push/web-push.js').then(m => m.enableWebPush(_core))
    };
  } else {
    _ui?.refresh?.();
  }
};

const enableWebPushFromUi = async () => {
  if (!_core?.isReady?.()) {
    W.NotificationSystem?.warning?.('Сначала войдите через Яндекс');
    return { ok: false, reason: 'friends_not_ready' };
  }

  try {
    const mod = await import('../push/web-push.js');
    const res = await mod.enableWebPush(_core);
    _webPushReady = !!res?.ok;

    if (res?.ok && _core.identity?.friendId) {
      const test = await _core.sendPush({
        toFriendId: _core.identity.friendId,
        kind: 'GENERIC',
        text: '✅ Тест системных уведомлений Витрины'
      }).catch(err => ({ ok: false, error: err?.message || 'test_push_failed' }));

      if (test?.webPush?.sent > 0) {
        W.NotificationSystem?.success?.('Тестовое уведомление отправлено');
      } else {
        W.NotificationSystem?.warning?.(`Подписка есть, но test push не доставлен: ${test?.webPush?.error || test?.webPush?.reason || test?.error || 'sent_0'}`);
      }

      return { ...res, test };
    }

    return res;
  } catch (err) {
    const reason = err?.message || 'enable_failed';
    W.NotificationSystem?.warning?.(`Не удалось включить системные уведомления: ${reason}`);
    return { ok: false, reason };
  }
};

const onGameInvite = async ({ friendId, gameId }) => {
  D.querySelector('.vf-modal-ov')?.remove();
  
  const u = new URL(W.location.href);
  u.searchParams.set('gcGame', gameId);
  u.searchParams.set('inviteFriend', friendId);
  W.history.pushState(null, '', u.toString());
  
  W.AlbumsManager?.loadAlbum?.(W.APP_CONFIG?.SPECIAL_GAMES_KEY || '__games__');
  W.NotificationSystem?.success?.('Запускаем игру...');
};

export const mountFriendsBlock = async ({ container } = {}) => {
  if (!container) return false;
  _container = container;

  const [{ FriendsCore }, { mountFriendsUI }] = await Promise.all([
    import(FRIENDS_CORE_URL),
    import(FRIENDS_UI_URL)
  ]);

  _core = _core || new FriendsCore();
  _ui = mountFriendsUI(container, _core, {
    onGameInvite,
    onEnableWebPush: enableWebPushFromUi
  });

  await applyIdentity();

  if (!_bound) {
    _bound = true;
    W.addEventListener('yandex:auth:changed', () => applyIdentity().catch(() => {}));
    D.addEventListener('visibilitychange', () => {
      if (!D.hidden && _core?.isReady?.()) {
        startPresenceHeartbeat();
        startPushPolling();
      }
    });
  }

  return true;
};

export default { mountFriendsBlock };

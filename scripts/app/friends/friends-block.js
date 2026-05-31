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

const startPushPolling = () => {
  clearInterval(_pushTimer);
  _pushTimer = setInterval(async () => {
    // Останавливаем поллинг, если приложение свёрнуто или модуль не готов
    if (D.hidden || !_core || !_core.isReady()) return;
    try {
      const items = await _core.getPushes();
      if (items.length) handlePushes(items);
    } catch {}
  }, 12000); // Опрос каждые 12 секунд
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
    _ui?.refresh?.();
    
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
    startPushPolling();
  } else {
    _ui?.refresh?.();
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
  _ui = mountFriendsUI(container, _core, { onGameInvite });

  await applyIdentity();

  if (!_bound) {
    _bound = true;
    W.addEventListener('yandex:auth:changed', () => applyIdentity().catch(() => {}));
  }

  return true;
};

export default { mountFriendsBlock };

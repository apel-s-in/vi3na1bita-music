// scripts/app/friends/friends-block.js
// UID.069/070 (Linked providers identity)_(Друзья получают identity сверху, без OAuth-токена)
// UID.094 (No-paralysis rule)_(сбой Друзей не влияет на плеер/Game Center)
// Тонкий адаптер: основное приложение -> внешний модуль /Friends/

const W = window;
const FRIENDS_CORE_URL = '/Friends/friends-core.js';
const FRIENDS_UI_URL = '/Friends/friends-ui.js';

let _core = null;
let _ui = null;
let _container = null;
let _bound = false;
let _lastFriendId = '';

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

const applyIdentity = async () => {
  if (!_core) return;
  const prof = readYandexProfile();

  if (!prof.active || !prof.yandexId) {
    _core.setIdentity({ friendId: '', yandexLinked: false });
    _lastFriendId = '';
    _ui?.refresh?.();
    return;
  }

  const id = await _core.setIdentityFromYandex({
    yandexId: prof.yandexId,
    displayName: prof.displayName,
    avatar: prof.avatar
  });

  // Регистрируем игрока/профиль только при смене аккаунта (экономим вызовы функции).
  if (id?.friendId && id.friendId !== _lastFriendId) {
    _lastFriendId = id.friendId;
    try { await _core.register(); } catch {}
    _ui?.refresh?.({ force: true });
  } else {
    _ui?.refresh?.();
  }
};

const onGameInvite = async ({ friendId, gameId }) => {
  // Фаза A: приглашение в игру — заглушка. Реальный flow (room_create + push) появится в Фазе C.
  W.NotificationSystem?.info?.('Приглашение в игру появится в следующем обновлении.');
  try {
    W.eventLogger?.log?.('FEATURE_USED', 'global', { feature: 'friends_game_invite_intent', gameId: String(gameId || ''), friendId: String(friendId || '') });
  } catch {}
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

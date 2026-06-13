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
let _unread = {};

const loadUnread = () => {
  try { _unread = JSON.parse(localStorage.getItem('vf_unread') || '{}') || {}; } catch { _unread = {}; }
};

const saveUnread = () => {
  try { localStorage.setItem('vf_unread', JSON.stringify(_unread)); } catch {}
};

const addUnread = (friendId, meta = {}) => {
  if (!friendId) return;
  const old = typeof _unread[friendId] === 'object' ? _unread[friendId] : { count: Number(_unread[friendId] || 0) };
  _unread[friendId] = {
    count: Number(old.count || 0) + 1,
    name: String(meta.name || old.name || 'Друг').trim(),
    text: String(meta.text || old.text || '').trim().slice(0, 180),
    at: Date.now()
  };
  saveUnread();
  _ui?.refresh?.();
};

const clearUnread = (friendId, { refresh = true } = {}) => {
  if (!friendId || !_unread[friendId]) return;
  delete _unread[friendId];
  saveUnread();

  try {
    D.querySelectorAll(`[data-unread-chat="${CSS.escape(friendId)}"]`).forEach(node => {
      const small = D.createElement('small');
      small.textContent = 'не в сети';
      node.replaceWith(small);
    });
  } catch {}

  if (refresh && !D.querySelector('.vf-modal-ov')) _ui?.refresh?.();
};

const showMailOverlay = ({ friendId, name = 'Друг' } = {}) => {
  if (!friendId || D.getElementById('vf-mail-ov')) return;

  const ov = D.createElement('div');
  ov.id = 'vf-mail-ov';
  ov.className = 'vf-mail-ov';
  ov.innerHTML = `
    <div class="vf-mail-card" role="dialog" aria-modal="true">
      <div class="vf-mail-icon">💌</div>
      <div class="vf-mail-title">Новое сообщение</div>
      <div class="vf-mail-from">${W.Utils?.escapeHtml?.(name) || name}</div>
      <div class="vf-mail-text">Откройте чат, чтобы прочитать сообщение.</div>
      <div class="vf-mail-actions">
        <button class="vf-btn" type="button" data-vf-read>Прочитать</button>
        <button class="vf-btn vf-sec" type="button" data-vf-later>Позже</button>
      </div>
    </div>
  `;
  D.body.appendChild(ov);

  ov.querySelector('[data-vf-read]')?.addEventListener('click', async () => {
    ov.remove();
    await openFriendsChat(friendId);
  });

  ov.querySelector('[data-vf-later]')?.addEventListener('click', () => ov.remove());
};

const openFriendsVoiceCall = async (friendId, incoming = null) => {
  if (!friendId) return false;
  try {
    const gamesKey = W.APP_CONFIG?.SPECIAL_GAMES_KEY || '__games__';
    if (W.AlbumsManager?.getCurrentAlbum?.() !== gamesKey) {
      await W.AlbumsManager?.loadAlbum?.(gamesKey);
    }
    return !!(await _ui?.openVoiceCall?.(friendId, incoming));
  } catch {
    return false;
  }
};

const openFriendsChat = async friendId => {
  if (!friendId) return false;
  try {
    const gamesKey = W.APP_CONFIG?.SPECIAL_GAMES_KEY || '__games__';
    if (W.AlbumsManager?.getCurrentAlbum?.() !== gamesKey) {
      await W.AlbumsManager?.loadAlbum?.(gamesKey);
    }
    return !!(await _ui?.openChat?.(friendId));
  } catch {
    return false;
  }
};

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

      const text = String(push.text || '').slice(0, 180);
      addUnread(push.fromFriendId, { name, text });
      showMailOverlay({ friendId: push.fromFriendId, name });
      await _core.markChatDelivered?.({ friendId: push.fromFriendId, msgId: push.msgId }).catch(() => null);
      W.NotificationSystem?.info?.(`💬 Новое сообщение от ${name}`, 6000);
      continue;
    }

    if (push.kind === 'VOICE_CALL') {
      let name = 'Друг';
      try {
        const prof = await _core.getProfile(push.fromFriendId);
        if (prof?.displayName) name = prof.displayName;
      } catch {}

      W.Modals?.choice?.({
        title: '📞 Входящий звонок',
        textHtml: `<b>${W.Utils?.escapeHtml?.(name) || name}</b> звонит вам.<br><br>Открыть голосовой чат?`,
        actions: [
          {
            key: 'answer',
            text: 'Ответить',
            primary: true,
            onClick: () => openFriendsVoiceCall(push.fromFriendId, {
              callId: push.callId || push.pushId || '',
              roomId: push.roomId,
              roomSecret: push.roomSecret
            })
          },
          { key: 'reject', text: 'Отклонить', onClick: () => {} }
        ]
      });
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
  if (!_core?.isReady?.()) return;
  if (!('Notification' in W) || W.Notification.permission !== 'granted') return;

  const standalone = W.matchMedia?.('(display-mode: standalone)')?.matches || W.navigator.standalone === true;
  const key = `vf_webpush_sync_${_core.identity?.friendId || 'me'}`;
  const last = Number(localStorage.getItem(key) || 0);
  const force = standalone && Date.now() - last > 24 * 60 * 60 * 1000;

  if (_webPushReady && !force) return;

  try {
    const mod = await import('../push/web-push.js');
    const prev = _webPushReady;
    const res = await mod.syncWebPushSubscription({ core: _core, ask: false, force });
    _webPushReady = !!res?.ok;
    if (res?.ok) localStorage.setItem(key, String(Date.now()));
    if (prev !== _webPushReady) _ui?.refresh?.({ force: true });
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
    _ui?.refresh?.({ force: true });
    return res;
  } catch (err) {
    return { ok: false, reason: err?.message || 'enable_failed' };
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
  loadUnread();
  _ui = mountFriendsUI(container, _core, {
    onGameInvite,
    onEnableWebPush: enableWebPushFromUi,
    getWebPushEnabled: () => _webPushReady,
    getUnread: friendId => {
      const v = _unread[friendId];
      return Number(typeof v === 'object' ? v.count : v || 0);
    },
    getUnreadMeta: friendId => {
      const v = _unread[friendId];
      return typeof v === 'object' ? v : null;
    },
    onUnreadClick: friendId => openFriendsChat(friendId),
    onVoiceOpened: friendId => {},
    onChatOpened: async friendId => {
      await _core.markChatRead?.({ friendId }).catch(() => null);
      clearUnread(friendId, { refresh: false });
    }
  });

  await applyIdentity();

  const url = new URL(W.location.href);
  const chatWith = url.searchParams.get('chatWith');
  const voiceWith = url.searchParams.get('voiceWith');
  const voiceRoom = url.searchParams.get('voiceRoom');
  const voiceKey = url.searchParams.get('key');
  const callId = url.searchParams.get('callId');

  if (chatWith && _core?.isReady?.()) {
    setTimeout(() => openFriendsChat(chatWith), 350);
    url.searchParams.delete('chatWith');
    url.searchParams.delete('openFriends');
    W.history.replaceState(null, '', url.toString());
  }

  if (voiceWith && voiceRoom && voiceKey && _core?.isReady?.()) {
    setTimeout(() => openFriendsVoiceCall(voiceWith, {
      callId,
      roomId: voiceRoom,
      roomSecret: voiceKey
    }), 450);
    ['voiceWith', 'voiceRoom', 'key', 'callId', 'openFriends'].forEach(k => url.searchParams.delete(k));
    W.history.replaceState(null, '', url.toString());
  }

  if (!_bound) {
    _bound = true;
    W.addEventListener('yandex:auth:changed', () => applyIdentity().catch(() => {}));
    D.addEventListener('visibilitychange', () => {
      if (!D.hidden && _core?.isReady?.()) {
        startPresenceHeartbeat();
        startPushPolling();
      }
    });

    const onSwPushClick = e => {
      if (e.data?.type !== 'PUSH_NOTIFICATION_CLICK') return;
      try {
        const u = new URL(e.data.url || W.location.href, W.location.href);
        const voiceWith = u.searchParams.get('voiceWith') || e.data.fromFriendId || '';
        const voiceRoom = u.searchParams.get('voiceRoom') || e.data.roomId || '';
        const voiceKey = u.searchParams.get('key') || e.data.roomSecret || '';
        const callId = u.searchParams.get('callId') || e.data.callId || '';
        if (voiceWith && voiceRoom && voiceKey) {
          openFriendsVoiceCall(voiceWith, { callId, roomId: voiceRoom, roomSecret: voiceKey });
          return;
        }

        const chatWith = u.searchParams.get('chatWith') || e.data.fromFriendId || '';
        if (chatWith) openFriendsChat(chatWith);
      } catch {}
    };

    navigator.serviceWorker?.addEventListener?.('message', onSwPushClick);
    W.addEventListener('message', onSwPushClick);
  }

  return true;
};

export default { mountFriendsBlock };

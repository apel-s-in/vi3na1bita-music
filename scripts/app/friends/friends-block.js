// scripts/app/friends/friends-block.js
// UID.069/070 (Linked providers identity)_(Друзья получают identity сверху, без OAuth-токена)
// UID.094 (No-paralysis rule)_(сбой Друзей не влияет на плеер/Game Center)
// Тонкий адаптер: основное приложение -> внешний модуль /Friends/

import {
  getSocialSession,
  invalidateSocialSession
} from '../../core/social-session.js';

const W = window;
const D = document;
const BASE_FRIENDS =
  'https://vi3na1bita.website.yandexcloud.net/Friends';
const FRIENDS_BUILD = '8.9.2';
const FRIENDS_CORE_URL =
  `${BASE_FRIENDS}/friends-core.js?v=${FRIENDS_BUILD}`;
const FRIENDS_UI_URL =
  `${BASE_FRIENDS}/friends-ui.js?v=${FRIENDS_BUILD}`;

let _socialSessionRetryAt = 0;

let _core = null;
let _ui = null;
let _container = null;
let _bound = false;
let _lastFriendId = '';
let _pushTimer = 0;
let _heartbeatTimer = 0;
let _webPushReady = false;
let _unread = {};
let _pushBusy = false;
let _pushFails = 0;
let _heartbeatBusy = false;
let _heartbeatFails = 0;
const FRIENDS_KEY = '__friends__';

const isFriendsSectionActive = () =>
  W.AlbumsManager?.getCurrentAlbum?.() ===
  (W.APP_CONFIG?.SPECIAL_FRIENDS_KEY || FRIENDS_KEY);

const stopFriendsBackgroundTasks = () => {
  clearTimeout(_pushTimer);
  clearInterval(_heartbeatTimer);
  _pushTimer = 0;
  _heartbeatTimer = 0;
};

const resumeFriendsBackgroundTasks = async () => {
  if (D.hidden || !isFriendsSectionActive()) {
    stopFriendsBackgroundTasks();
    return false;
  }

  if (!_core?.isReady?.()) {
    if (Date.now() < _socialSessionRetryAt) {
      stopFriendsBackgroundTasks();
      return false;
    }

    try {
      await applyIdentity();
    } catch {
      stopFriendsBackgroundTasks();
      return false;
    }
  }

  if (!_core?.isReady?.()) {
    stopFriendsBackgroundTasks();
    return false;
  }

  startPresenceHeartbeat();
  startPushPolling();
  return true;
};

const friendsFeatureCards = () => `
  <div class="friends-feature-grid">
    <div class="friends-feature-card"><span>💬</span><div><b>Личные сообщения</b><small>Чаты, ответы, реакции и отметки доставки.</small></div></div>
    <div class="friends-feature-card"><span>📞</span><div><b>Голосовые звонки</b><small>Прямое общение через WebRTC прямо в приложении.</small></div></div>
    <div class="friends-feature-card"><span>🔔</span><div><b>Push-уведомления</b><small>Сообщения и звонки не потеряются, даже если приложение свёрнуто.</small></div></div>
    <div class="friends-feature-card"><span>🎮</span><div><b>Игровые приглашения</b><small>Приглашайте друзей в «Войну Сердец» одним нажатием.</small></div></div>
    <div class="friends-feature-card"><span>🔗</span><div><b>Добавление по ссылке</b><small>Отправьте защищённое приглашение через мессенджер или почту.</small></div></div>
    <div class="friends-feature-card"><span>📍</span><div><b>Друг рядом</b><small>Добавляйте знакомых коротким временным кодом.</small></div></div>
  </div>
`;

const renderUnauthorizedExperience = () => {
  if (!_container) return;

  _container.classList.add('is-unauth');
  let box = _container.querySelector('.custom-ya-unauth');

  if (!box) {
    box = D.createElement('section');
    box.className = 'custom-ya-unauth';
    _container.appendChild(box);
  }

  box.innerHTML = `
    <div class="friends-hero-icon">👥</div>
    <div class="friends-hero-kicker">Витрина · социальный раздел</div>
    <h3>Музыка становится ближе с друзьями</h3>
    <p class="friends-hero-text">Общайтесь, получайте уведомления и приглашайте друзей играть вместе.</p>
    ${friendsFeatureCards()}
    <div class="friends-privacy-note">🔐 Вход выполняется через Яндекс. Пароль не передаётся приложению.</div>
    <button class="yandex-auth-mainbtn friends-login-btn" type="button" data-friends-login>
      <span class="friends-ya-letter">Я</span>
      <span>Войти через Яндекс</span>
    </button>
    <small class="friends-login-note">Один Яндекс-аккаунт — один постоянный профиль друга.</small>
  `;

  box.querySelector('[data-friends-login]')?.addEventListener('click', () =>
    W.YandexAuth?.login?.()
  );
};

const renderFriendsServiceError = error => {
  if (!_container) return;

  _container.classList.add('is-unauth');
  let box = _container.querySelector('.custom-ya-unauth');

  if (!box) {
    box = D.createElement('section');
    box.className = 'custom-ya-unauth';
    _container.appendChild(box);
  }

  const message = String(error?.message || 'social_service_unavailable');

  box.innerHTML = `
    <div class="friends-hero-icon">⚠️</div>
    <div class="friends-hero-kicker">Временная ошибка соединения</div>
    <h3>Раздел друзей сейчас недоступен</h3>
    <p class="friends-hero-text">Не удалось создать защищённую социальную сессию. Музыка продолжает работать.</p>
    <div class="friends-privacy-note">${W.Utils?.escapeHtml?.(message) || message}</div>
    <button class="yandex-auth-mainbtn friends-login-btn" type="button" data-friends-retry>
      <span>Повторить подключение</span>
    </button>
  `;

  box.querySelector('[data-friends-retry]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Подключаемся...';
    _socialSessionRetryAt = 0;

    try {
      await applyIdentity();
    } catch (retryError) {
      renderFriendsServiceError(retryError);
    }
  });
};

const renderAuthorizedExperience = () => {
  if (!_container) return;

  _container.classList.remove('is-unauth');
  _container.querySelector('.custom-ya-unauth')?.remove();

  let guide = _container.querySelector('.friends-authorized-guide');
  if (!guide) {
    guide = D.createElement('section');
    guide.className = 'friends-authorized-guide';
    _container.prepend(guide);
  }

  guide.innerHTML = `
    <div class="friends-guide-head">
      <div>
        <span>👋 Вы в разделе друзей</span>
        <small>Добавьте знакомого и начните общение.</small>
      </div>
      <span class="friends-guide-status">онлайн</span>
    </div>
    <div class="friends-guide-actions">
      <button type="button" data-friends-add>➕ Добавить друга</button>
      <button type="button" data-friends-notify>🔔 Уведомления</button>
      <button type="button" data-friends-refresh>↻ Обновить</button>
    </div>
    <details class="friends-guide-details">
      <summary>✨ Что здесь можно делать</summary>
      ${friendsFeatureCards()}
    </details>
    <div class="friends-guide-tip">💡 Нажмите на друга, чтобы открыть чат, позвонить или пригласить его в игру.</div>
  `;

  guide.querySelector('[data-friends-add]')?.addEventListener('click', () =>
    _container.querySelector('.vf-wrap [data-act="add"]')?.click()
  );

  guide.querySelector('[data-friends-notify]')?.addEventListener('click', () =>
    enableWebPushFromUi()
  );

  guide.querySelector('[data-friends-refresh]')?.addEventListener('click', () =>
    _ui?.refresh?.({ force: true })
  );
};

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
    const friendsKey = W.APP_CONFIG?.SPECIAL_FRIENDS_KEY || '__friends__';
    if (W.AlbumsManager?.getCurrentAlbum?.() !== friendsKey) await W.AlbumsManager?.loadAlbum?.(friendsKey);
    return !!(await _ui?.openVoiceCall?.(friendId, incoming));
  } catch {
    return false;
  }
};

const openFriendsChat = async friendId => {
  if (!friendId) return false;
  try {
    const friendsKey = W.APP_CONFIG?.SPECIAL_FRIENDS_KEY || '__friends__';
    if (W.AlbumsManager?.getCurrentAlbum?.() !== friendsKey) await W.AlbumsManager?.loadAlbum?.(friendsKey);
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

const isStaleSessionPush = push => {
  const t = Date.now();
  const createdAt = Number(push.createdAt || 0);
  const expiresAt = Number(push.expiresAt || 0);
  const age = createdAt ? t - createdAt : 0;
  if (expiresAt && expiresAt < t) return true;
  if (push.kind === 'GAME_INVITE' && age > 120000) return true;
  if (push.kind === 'VOICE_CALL' && age > 120000) return true;
  return false;
};

const handlePushes = async (items) => {
  for (const push of items) {
    if (isStaleSessionPush(push)) continue;
    if (push.kind === 'CHAT_MESSAGE') {
      const activeChatId = _ui?.getActiveChatFriendId?.() || '';
      if (activeChatId && activeChatId === push.fromFriendId && _ui?.pushIncomingChat?.(push)) {
        await _core.markChatRead?.({ friendId: push.fromFriendId, msgId: push.msgId }).catch(() => null);
        continue;
      }

      let name = 'Друг';
      try {
        const prof = await _core.getProfile(push.fromFriendId);
        if (prof?.displayName) name = prof.displayName;
      } catch {}

      addUnread(push.fromFriendId, {
        name,
        text: 'Новое сообщение'
      });
      showMailOverlay({ friendId: push.fromFriendId, name });
      await _core.markChatDelivered?.({ friendId: push.fromFriendId, msgId: push.msgId }).catch(() => null);
      W.NotificationSystem?.info?.(`💬 ${name}: новое сообщение`, 5000);
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
            onClick: async () => {
              const room = await _core
                .getRoom(push.roomId, push.roomSecret)
                .catch(() => null);
              if (!room?.room || room.room.status === 'closed') {
                W.NotificationSystem?.warning?.('Звонок уже завершён');
                return;
              }
              return openFriendsVoiceCall(push.fromFriendId, {
                callId: push.callId || push.pushId || '',
                roomId: push.roomId,
                roomSecret: push.roomSecret
              });
            }
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
            onClick: async () => {
              const room = await _core
                .getRoom(push.roomId, push.roomSecret)
                .catch(() => null);
              if (!room?.room || room.room.status === 'closed') {
                W.NotificationSystem?.warning?.('Игровое приглашение уже устарело');
                return;
              }

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
    if (
      D.hidden ||
      !isFriendsSectionActive() ||
      !_core?.isReady?.() ||
      _heartbeatBusy
    ) return;

    _heartbeatBusy = true;
    try {
      await _core.heartbeat({ gameId: '', roomId: '' });
      _heartbeatFails = 0;
    } catch {
      _heartbeatFails++;
    } finally {
      _heartbeatBusy = false;
    }
  };

  beat();
  _heartbeatTimer = setInterval(beat, 90000);
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
  clearTimeout(_pushTimer);

  const poll = async () => {
    if (D.hidden || !isFriendsSectionActive() || !_core?.isReady?.() || _pushBusy) return;
    _pushBusy = true;
    try {
      const items = await _core.getPushes();
      _pushFails = 0;
      if (items.length) {
        await handlePushes(items);
        await _core.ackPushes(items.map(x => x.pushId).filter(Boolean));
      }
    } catch {
      _pushFails++;
    } finally {
      _pushBusy = false;
    }
  };

  const loop = async () => {
    if (D.hidden || !isFriendsSectionActive() || !_core?.isReady?.()) {
      stopFriendsBackgroundTasks();
      return;
    }

    await poll();
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(loop, Math.min(60000, 15000 + _pushFails * 10000));
  };
  loop();
};

export const issueSocialSession = async ({
  force = false
} = {}) => {
  const result = await getSocialSession({ force });
  _socialSessionRetryAt = 0;
  return result;
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
    stopFriendsBackgroundTasks();
    _ui?.refresh?.();
    renderUnauthorizedExperience();
    
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

  let session;

  try {
    session = await issueSocialSession();
  } catch (error) {
    invalidateSocialSession();
    _socialSessionRetryAt = Date.now() + 30000;
    _core.setIdentity({ friendId: '', yandexLinked: false });
    W.__vfIdentity = null;
    stopFriendsBackgroundTasks();
    console.error('[Friends] social session failed:', error);
    renderFriendsServiceError(error);
    return false;
  }

  const id = _core.setIdentity({
    friendId: session.friendId,
    displayName: session.profile?.displayName || prof.displayName,
    avatar: session.profile?.avatarUrl || prof.avatar,
    yandexLinked: true,
    socialSession: session.socialSession,
    sessionExpiresAt: session.expiresAt,
    deviceStableId: localStorage.getItem('deviceStableId') || ''
  });

  W.__vfIdentity = {
    friendId: id.friendId,
    displayName: id.displayName,
    avatar: id.avatar,
    yandexLinked: true
  };

  renderAuthorizedExperience();

  if (id?.friendId && id.friendId !== _lastFriendId) {
    try {
      await _core.register();
      _lastFriendId = id.friendId;
    } catch (error) {
      const message = String(error?.message || 'crypto_register_failed');
      console.error('[Friends] registration failed:', error);

      W.NotificationSystem?.warning?.(
        message.includes('chat_e2ee_disabled')
          ? 'Защищённый чат временно отключён на сервере'
          : 'Не удалось зарегистрировать устройство шифрования. Повторим при следующем открытии Friends'
      );
    }

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
    resumeFriendsBackgroundTasks();
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
export const getFriendsCoreService = async () => {
  if (!_core) {
    const { FriendsCore } = await import(FRIENDS_CORE_URL);
    _core = new FriendsCore();
  }

  if (!_core.isReady()) {
    await applyIdentity();
  }

  if (!_core.isReady()) {
    throw new Error('friends_identity_required');
  }

  if (
    _core.identity?.friendId &&
    _core.identity.friendId !== _lastFriendId
  ) {
    await _core.register();
    _lastFriendId = _core.identity.friendId;
  }

  return _core;
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

  if (chatWith && _core?.isReady?.()) {
    setTimeout(() => openFriendsChat(chatWith), 350);
    url.searchParams.delete('chatWith');
    url.searchParams.delete('openFriends');
    W.history.replaceState(null, '', url.toString());
  }

  if (voiceWith && _core?.isReady?.()) {
    resumeFriendsBackgroundTasks();
    ['voiceWith', 'callId', 'openFriends']
      .forEach(key => url.searchParams.delete(key));
    W.history.replaceState(null, '', url.toString());
  }

  if (!_bound) {
    _bound = true;
    W.addEventListener('yandex:auth:changed', () => {
      invalidateSocialSession();
      applyIdentity().catch(() => {});
    });
    D.addEventListener('visibilitychange', () => {
      if (D.hidden) {
        stopFriendsBackgroundTasks();
        return;
      }

      if (isFriendsSectionActive() && _core?.isReady?.()) {
        resumeFriendsBackgroundTasks();
        _ui?.refresh?.();
      }
    });

    W.addEventListener('album:changed', event => {
      const friendsKey = W.APP_CONFIG?.SPECIAL_FRIENDS_KEY || FRIENDS_KEY;
      if (event.detail?.key !== friendsKey) {
        stopFriendsBackgroundTasks();
        return;
      }

      resumeFriendsBackgroundTasks();
      _ui?.refresh?.();
    });

    const onSwPushClick = async event => {
      const data = event.data || {};
      if (data.type !== 'PUSH_NOTIFICATION_CLICK') return;

      try {
        const url = new URL(
          data.url || W.location.href,
          W.location.href
        );
        const kind = String(data.kind || '');

        if (kind === 'CHAT_MESSAGE') {
          const friendId =
            url.searchParams.get('chatWith') ||
            data.fromFriendId ||
            '';

          if (friendId) await openFriendsChat(friendId);
          return;
        }

        if (kind === 'VOICE_CALL' || kind === 'GAME_INVITE') {
          const friendsKey =
            W.APP_CONFIG?.SPECIAL_FRIENDS_KEY ||
            FRIENDS_KEY;

          if (!isFriendsSectionActive()) {
            await W.AlbumsManager?.loadAlbum?.(friendsKey);
          }

          await resumeFriendsBackgroundTasks();
        }
      } catch {}
    };

    navigator.serviceWorker?.addEventListener?.('message', onSwPushClick);
    W.addEventListener('message', onSwPushClick);
  }

  return true;
};

export default { mountFriendsBlock };

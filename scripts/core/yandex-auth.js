const CLIENT_ID = '70c0b7256956440eb5b55866d740ffae';
const REDIRECT_URI = 'https://vi3na1bita.website.yandexcloud.net/oauth-callback.html';
const LS_TOKEN = 'yandex:token';
const LS_TOKEN_EXP = 'yandex:token_exp';
const LS_TOKEN_SCOPE = 'yandex:token_scope';
const LS_PROFILE = 'yandex:profile';
const LS_AUTO_RELOGIN = 'yandex:auto_relogin';
const LS_FORCE_CONFIRM_NEXT = 'yandex:force_confirm_next';
const REQUIRED_SCOPES = ['login:info', 'login:email', 'cloud_api:disk.app_folder'];

const read = key => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const del = key => localStorage.removeItem(key);

const logAuth = (action, data = {}) => {
  try {
    const profile = read(LS_PROFILE) || {};
    window.eventLogger?.log?.('AUTH_EVENT', null, {
      action,
      login: profile.login || '',
      displayName: profile.displayName || '',
      device: [
        localStorage.getItem('yandex:onboarding:device_label') || '',
        localStorage.getItem('deviceStableId') || ''
      ].filter(Boolean).join(' · '),
      ...data
    });
    window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
  } catch {}
};

const avatarUrlFromProfile = profile => {
  const id = String(profile?.default_avatar_id || profile?.avatar_id || '').trim();
  if (!id || profile?.is_avatar_empty === true || id === '0/0-0') return null;
  return `https://avatars.yandex.net/get-yapic/${id.replace(/^\/+/, '')}/islands-200`;
};

export const YandexAuth = {
  getToken: () => localStorage.getItem(LS_TOKEN) || null,
  getExpiry: () => Number(localStorage.getItem(LS_TOKEN_EXP) || 0),

  isTokenAlive() {
    const expiry = this.getExpiry();
    return !!this.getToken() && (expiry === 0 || Date.now() < expiry);
  },

  getSessionStatus() {
    return !this.getToken() ? 'logged_out' : !this.isTokenAlive() ? 'expired' : 'active';
  },

  getProfile: () => read(LS_PROFILE) || null,
  getGrantedScopes: () => String(localStorage.getItem(LS_TOKEN_SCOPE) || '').trim().split(/\s+/).filter(Boolean),

  hasScope(scope) {
    return this.getGrantedScopes().includes(String(scope || '').trim());
  },

  hasDiskAccess() {
    return this.hasScope('cloud_api:disk.app_folder') || this.hasScope('cloud_api:disk.read') || this.hasScope('cloud_api:disk.write');
  },

  isAutoRelogin: () => localStorage.getItem(LS_AUTO_RELOGIN) === '1',

  setAutoRelogin(value) {
    localStorage.setItem(LS_AUTO_RELOGIN, value ? '1' : '0');
  },

  login(options = {}) {
    if (CLIENT_ID === 'YOUR_YANDEX_CLIENT_ID') {
      window.NotificationSystem?.warning('ClientID не настроен.');
      return;
    }

    logAuth('login_start', { forceConfirm: options.forceConfirm === true, status: 'popup_open' });

    const forceConfirm = options.forceConfirm === true || localStorage.getItem(LS_FORCE_CONFIRM_NEXT) === '1' ? '1' : '0';
    const scope = encodeURIComponent(REQUIRED_SCOPES.join(' '));
    const url = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&force_confirm=${forceConfirm}&scope=${scope}`;
    const width = 520;
    const height = 620;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(url, 'yandex_oauth', `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    if (!popup) {
      window.NotificationSystem?.info('Разрешите всплывающие окна для входа через Яндекс.');
      return;
    }

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timeoutId);
      clearInterval(closeCheck);
    };

    const onMessage = async event => {
      if (event.origin !== window.location.origin || event.data?.type !== 'YANDEX_OAUTH_CALLBACK') return;
      cleanup();
      try {
        if (!popup.closed) popup.close();
      } catch {}

      const { token, expiresIn, error, scope: grantedScope } = event.data;
      if (error || !token) {
        window.NotificationSystem?.error(`Ошибка авторизации Яндекс: ${error || 'нет токена'}`);
        return;
      }

      const expiry = Number(expiresIn) > 0 ? Date.now() + Number(expiresIn) * 1000 : 0;
      localStorage.setItem(LS_TOKEN, token);
      localStorage.setItem(LS_TOKEN_EXP, String(expiry));
      if (grantedScope) localStorage.setItem(LS_TOKEN_SCOPE, String(grantedScope).trim());
      else localStorage.removeItem(LS_TOKEN_SCOPE);
      localStorage.removeItem(LS_FORCE_CONFIRM_NEXT);

      const profile = await this.fetchYandexProfile(token);
      if (profile) await this._onFirstLogin(profile);
    };

    window.addEventListener('message', onMessage);

    const timeoutId = setTimeout(() => {
      cleanup();
      try {
        if (!popup.closed) popup.close();
      } catch {}
      window.NotificationSystem?.warning('Время авторизации истекло. Попробуйте снова.');
    }, 300000);

    const closeCheck = setInterval(() => {
      if (!popup.closed) return;
      cleanup();
    }, 1000);
  },

  logout() {
    logAuth('logout', { status: 'logged_out' });
    del(LS_TOKEN);
    del(LS_TOKEN_EXP);
    del(LS_TOKEN_SCOPE);
    del(LS_PROFILE);
    localStorage.setItem(LS_FORCE_CONFIRM_NEXT, '1');
    window.dispatchEvent(new CustomEvent('yandex:auth:changed', { detail: { status: 'logged_out' } }));
    window.NotificationSystem?.info('Вы вышли из аккаунта Яндекс');
  },

  async fetchYandexProfile(token) {
    try {
      const response = await fetch('https://login.yandex.ru/info?format=json', {
        headers: { Authorization: `OAuth ${token}` }
      });
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  },

  async _onFirstLogin(yandexProfile) {
    const yandexId = String(yandexProfile.id || '').trim();
    const realName = String(yandexProfile.real_name || yandexProfile.display_name || yandexProfile.login || '').trim();
    const login = String(yandexProfile.login || '').trim();
    const avatar = avatarUrlFromProfile(yandexProfile);

    write(LS_PROFILE, {
      yandexId,
      displayName: realName || login,
      realName,
      login,
      avatar,
      lastSync: Date.now()
    });

    try {
      const { ensureCurrentDeviceRegistryRow } = await import('./device-linking.js');
      await ensureCurrentDeviceRegistryRow({ authEvent: true });

      const { getSocialSession } = await import('./social-session.js');
      const social = await getSocialSession({ force: true });

      const { resolveAccountDeviceInitialization } = await import('../app/profile/account-device-initialization.js');
      const initialization = await resolveAccountDeviceInitialization({ session: social });

      const { AccountDataContext } = await import('../analytics/account-data-boundary.js');
      // Анонимные данные никогда не принимаются аккаунтом автоматически.
      // Существующий vault этого же Яндекс ID восстановится независимо
      // от adoptLocalData. Для новой установки неподтверждённый __local__
      // профиль удаляется, чтобы не загрязнять статистику аккаунта.
      await AccountDataContext.switchToYandexAccount(yandexId, {
        adoptLocalData: false,
        discardLocalData: initialization.wasKnown !== true
      });

      logAuth('oauth_success', {
        login,
        displayName: realName || login,
        status: 'active',
        deviceInitializationMode: initialization.mode,
        deviceWasKnown: initialization.wasKnown === true
      });

      window.dispatchEvent(new CustomEvent('yandex:auth:changed', {
        detail: {
          status: 'active',
          profile: read(LS_PROFILE),
          isFreshLogin: true,
          phase: 'device_initialized',
          accountDeviceWasKnown: initialization.wasKnown === true,
          accountDeviceInitializationRequired: false,
          accountDevice: initialization.device,
          settingsSourceDeviceId: initialization.settingsSourceDeviceId
        }
      }));

      this._showNamePickModal(realName, login);
    } catch (error) {
      console.error('[YandexAuth] device initialization failed:', error);
      window.NotificationSystem?.error?.(`Не удалось настроить устройство: ${error?.message || 'ошибка'}`);
    }
  },

  _showNamePickModal(realName, login) {
    if (!window.Modals?.open) return;

    const suggested = realName || login || 'Слушатель';
    const esc = value => window.Utils?.escapeHtml?.(String(value || '')) || String(value || '');
    const modal = window.Modals.open({
      title: '👋 Добро пожаловать!',
      maxWidth: 400,
      strictClose: true,
      bodyHtml: `<div style="color:#9db7dd;margin-bottom:16px;line-height:1.5">Устройство подключено к вашему Яндекс-аккаунту.<br>Как вас отображать в приложении?</div><div style="margin-bottom:14px"><label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Ваше имя</label><input type="text" id="ya-display-name" style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:16px;outline:none" maxlength="20" value="${esc(suggested)}" autocomplete="off"></div><div class="modal-choice-actions profile-inline-actions"><button class="modal-action-btn online" id="ya-name-save">Сохранить</button></div>`
    });

    const input = modal?.querySelector('#ya-display-name');
    const save = () => {
      const name = input?.value?.trim() || suggested;
      const profile = read(LS_PROFILE) || {};
      write(LS_PROFILE, { ...profile, displayName: name });
      logAuth('profile_name_saved', { displayName: name, status: 'active' });
      window.dispatchEvent(new CustomEvent('yandex:auth:changed', {
        detail: { status: 'active', profile: read(LS_PROFILE), isFreshLogin: true, phase: 'name_saved' }
      }));
      window.NotificationSystem?.success(`Имя сохранено: ${name} ✅`);
      modal?.remove();
      window.dispatchEvent(new CustomEvent('profile:data:refreshed', { detail: { reason: 'auth_name_saved' } }));
    };

    modal?.querySelector('#ya-name-save')?.addEventListener('click', save);
    input?.addEventListener('keydown', event => {
      if (event.key === 'Enter') save();
    });
    setTimeout(() => input?.focus(), 100);
  },

  updateDisplayName(value) {
    const profile = read(LS_PROFILE);
    if (!profile) return;
    const name = String(value || '').trim() || profile.displayName;
    write(LS_PROFILE, { ...profile, displayName: name });
    logAuth('display_name_updated', { displayName: name, status: 'active' });
    window.dispatchEvent(new CustomEvent('yandex:auth:changed', {
      detail: { status: 'active', profile: read(LS_PROFILE) }
    }));
  },

  checkAutoRelogin() {
    if (this.isAutoRelogin() && this.getSessionStatus() === 'expired') {
      logAuth('session_expired', { status: 'expired', autoRelogin: true });
      window.dispatchEvent(new CustomEvent('yandex:auth:changed', {
        detail: { status: 'expired', needsRelogin: true }
      }));
    }
  }
};

window.YandexAuth = YandexAuth;
export default YandexAuth;

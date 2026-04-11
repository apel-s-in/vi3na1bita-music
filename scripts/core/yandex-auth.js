// scripts/core/yandex-auth.js
// Яндекс OAuth 2.0 (Implicit Flow) — авторизация без бэкенда.
// Хранит токен, профиль, displayName привязанный к yandexId.
// НЕ влияет на воспроизведение, статистику и офлайн-режим.

const CLIENT_ID = '70c0b7256956440eb5b55866d740ffae';
const REDIRECT_URI = 'https://vi3na1bita.website.yandexcloud.net/oauth-callback.html';
const LS_TOKEN = 'yandex:token';
const LS_TOKEN_EXP = 'yandex:token_exp';
const LS_PROFILE = 'yandex:profile';       // { yandexId, displayName, realName, login, avatar }
const LS_AUTO_RELOGIN = 'yandex:auto_relogin';

const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const del = k => localStorage.removeItem(k);

export const YandexAuth = {
  // --- Состояние ---
  getToken() { return localStorage.getItem(LS_TOKEN) || null; },
  getExpiry() { return Number(localStorage.getItem(LS_TOKEN_EXP) || 0); },
  isTokenAlive() { const exp = this.getExpiry(); return !!this.getToken() && (exp === 0 || Date.now() < exp); },
  getSessionStatus() {
    if (!this.getToken()) return 'logged_out';
    if (!this.isTokenAlive()) return 'expired';
    return 'active';
  },
  getProfile() { return read(LS_PROFILE) || null; },
  isAutoRelogin() { return localStorage.getItem(LS_AUTO_RELOGIN) === '1'; },
  setAutoRelogin(v) { localStorage.setItem(LS_AUTO_RELOGIN, v ? '1' : '0'); },

  // --- Авторизация ---
  login() {
    if (CLIENT_ID === 'YOUR_YANDEX_CLIENT_ID') {
      window.NotificationSystem?.warning('ClientID не настроен.');
      return;
    }
    const url = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&force_confirm=0`;

    const w = 520, h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(url, 'yandex_oauth', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    if (!popup) {
      window.NotificationSystem?.info('Разрешите всплывающие окна для входа через Яндекс.');
      return;
    }

    // Слушаем postMessage от oauth-callback.html
    const onMsg = async (e) => {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'YANDEX_OAUTH_CALLBACK') return;

      window.removeEventListener('message', onMsg);
      clearTimeout(timeoutId);
      try { if (!popup.closed) popup.close(); } catch {}

      const { token, expiresIn, error } = e.data;

      if (error || !token) {
        window.NotificationSystem?.error('Ошибка авторизации Яндекс: ' + (error || 'нет токена'));
        return;
      }

      const exp = Number(expiresIn) > 0 ? Date.now() + Number(expiresIn) * 1000 : 0;
      localStorage.setItem(LS_TOKEN, token);
      localStorage.setItem(LS_TOKEN_EXP, String(exp));

      await new Promise(r => setTimeout(r, 200));
      const profile = await this.fetchYandexProfile(token);
      if (profile) await this._onFirstLogin(profile);
    };

    window.addEventListener('message', onMsg);

    // Таймаут 5 минут
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      try { if (!popup.closed) popup.close(); } catch {}
      window.NotificationSystem?.warning('Время авторизации истекло. Попробуйте снова.');
    }, 300000);

    // Если пользователь закрыл popup вручную
    const closedCheck = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedCheck);
        clearTimeout(timeoutId);
        window.removeEventListener('message', onMsg);
      }
    }, 1000);
  },

  logout() {
    del(LS_TOKEN); del(LS_TOKEN_EXP); del(LS_PROFILE);
    window.dispatchEvent(new CustomEvent('yandex:auth:changed', { detail: { status: 'logged_out' } }));
    window.NotificationSystem?.info('Вы вышли из аккаунта Яндекс');
  },

  async fetchYandexProfile(token) {
    try {
      const r = await fetch('https://login.yandex.ru/info?format=json', {
        headers: { 'Authorization': `OAuth ${token}` }
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },

  async _onFirstLogin(yProfile) {
    const yandexId = String(yProfile.id || '').trim();
    const realName = String(yProfile.real_name || yProfile.display_name || yProfile.login || '').trim();
    const login = String(yProfile.login || '').trim();
    const avatar = yProfile.default_avatar_id
      ? `https://avatars.yandex.net/get-yapic/${yProfile.default_avatar_id}/islands-200`
      : null;

    // Если профиль уже есть для этого yandexId — не перезаписываем displayName
    const existing = read(LS_PROFILE);
    if (existing?.yandexId === yandexId && existing?.displayName) {
      // Обновляем только техданные, имя сохраняем
      write(LS_PROFILE, { ...existing, realName, login, avatar, lastSync: Date.now() });
      window.dispatchEvent(new CustomEvent('yandex:auth:changed', { detail: { status: 'active', profile: read(LS_PROFILE) } }));
      window.NotificationSystem?.success(`С возвращением, ${existing.displayName}! 👋`);
      return;
    }

    // Первый вход — показываем модалку выбора имени
    write(LS_PROFILE, { yandexId, displayName: realName || login, realName, login, avatar, lastSync: Date.now() });
    window.dispatchEvent(new CustomEvent('yandex:auth:changed', { detail: { status: 'active', profile: read(LS_PROFILE) } }));
    this._showNamePickModal(yandexId, realName, login);
  },

  _showNamePickModal(yandexId, realName, login) {
    if (!window.Modals?.open) return;
    const suggested = realName || login || 'Слушатель';
    const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
    const m = window.Modals.open({
      title: '👋 Добро пожаловать!',
      maxWidth: 400,
      bodyHtml: `
        <div style="color:#9db7dd;margin-bottom:16px;line-height:1.5">
          Вы вошли через Яндекс.<br>
          Как вас отображать в приложении?
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Ваше имя</label>
          <input type="text" id="ya-display-name" 
            style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:16px;outline:none"
            maxlength="20" placeholder="${esc(suggested)}" value="${esc(suggested)}" autocomplete="off">
          <div style="font-size:11px;color:#666;margin-top:6px">Или оставьте как есть — ${esc(suggested)}</div>
        </div>
        <div class="om-actions">
          <button class="modal-action-btn online" id="ya-name-save" style="flex:1;justify-content:center">Сохранить</button>
        </div>`
    });

    const inp = m.querySelector('#ya-display-name');
    const btn = m.querySelector('#ya-name-save');
    setTimeout(() => inp?.focus(), 100);

    const save = () => {
      const name = inp?.value?.trim() || suggested;
      const profile = read(LS_PROFILE) || {};
      write(LS_PROFILE, { ...profile, displayName: name });
      window.dispatchEvent(new CustomEvent('yandex:auth:changed', { detail: { status: 'active', profile: read(LS_PROFILE) } }));
      window.NotificationSystem?.success(`Имя сохранено: ${name} ✅`);
      m.remove();
    };

    btn?.addEventListener('click', save);
    inp?.addEventListener('keydown', e => e.key === 'Enter' && save());
  },

  updateDisplayName(name) {
    const profile = read(LS_PROFILE);
    if (!profile) return;
    write(LS_PROFILE, { ...profile, displayName: String(name || '').trim() || profile.displayName });
    window.dispatchEvent(new CustomEvent('yandex:auth:changed', { detail: { status: 'active', profile: read(LS_PROFILE) } }));
  },

  // --- Авто-логин ---
  checkAutoRelogin() {
    if (!this.isAutoRelogin()) return;
    if (this.getSessionStatus() === 'expired') {
      // Тихий автологин через popup — только если пользователь взаимодействует
      // Не вызываем автоматически при старте — iOS/Safari блокируют popup без жеста
      window.dispatchEvent(new CustomEvent('yandex:auth:changed', {
        detail: { status: 'expired', needsRelogin: true }
      }));
    }
  }
};

window.YandexAuth = YandexAuth;
export default YandexAuth;

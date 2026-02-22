import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';
import { BackupVault } from './backup-vault.js';

export class CloudSyncManager {
  constructor() {
    // В реальном PWA ключи выносятся в config, здесь Client ID для Implicit Flow
    this.providers = {
      yandex: { clientId: 'YOUR_YANDEX_CLIENT_ID', authUrl: 'https://oauth.yandex.ru/authorize' },
      google: { clientId: 'YOUR_GOOGLE_CLIENT_ID', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth' }
    };
    this.tokens = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
    this._bindUI();
  }

  _bindUI() {
    const btnYandex = document.querySelector('.btn-cloud-yandex');
    const btnGoogle = document.querySelector('.btn-cloud-google');
    
    if (btnYandex) {
       btnYandex.textContent = this.tokens.yandex ? '🔄 Синхронизировать (Яндекс)' : 'Подключить Яндекс.Диск';
       btnYandex.addEventListener('click', () => this.tokens.yandex ? this.sync('yandex') : this.auth('yandex'));
    }
    if (btnGoogle) {
       btnGoogle.textContent = this.tokens.google ? '🔄 Синхронизировать (Google)' : 'Подключить Google Drive';
       btnGoogle.addEventListener('click', () => this.tokens.google ? this.sync('google') : this.auth('google'));
    }
  }

  auth(provider) {
    const p = this.providers[provider];
    if (!p || p.clientId === 'YOUR_YANDEX_CLIENT_ID') return window.NotificationSystem?.warning('Настройте ClientID в cloud-sync.js');
    
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const scope = provider === 'yandex' ? 'cloud_api:disk.app_folder' : 'https://www.googleapis.com/auth/drive.file';
    const url = `${p.authUrl}?response_type=token&client_id=${p.clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
    
    window.location.href = url; // Редирект на OAuth
  }

  // Вызывается при загрузке приложения для перехвата токена из URL
  checkAuthCallback() {
    const hash = window.location.hash.substring(1);
    if (!hash.includes('access_token')) return;
    
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    
    if (token) {
      // Определяем провайдера (костыльно, но надежно: Google присылает длинные токены)
      const provider = token.length > 80 ? 'google' : 'yandex';
      this.tokens[provider] = token;
      localStorage.setItem('cloud_tokens', JSON.stringify(this.tokens));
      window.history.replaceState(null, '', window.location.pathname); // Очищаем URL
      window.NotificationSystem?.success(`${provider} успешно подключен!`);
      this._bindUI();
    }
  }

  async sync(provider) {
    if (!window.NetPolicy?.isNetworkAllowed()) return window.NotificationSystem?.error('Сеть недоступна');
    window.NotificationSystem?.info('Синхронизация...');
    
    try {
      // 1. Создаем локальный бэкап в памяти
      const data = {
        timestamp: Date.now(),
        deviceHash: localStorage.getItem('deviceHash'),
        stats: await metaDB._tx('stats', 'readonly', store => store.getAll())
      };
      const json = JSON.stringify(data);
      const encoded = btoa(unescape(encodeURIComponent(json)));
      const blob = new Blob([encoded], { type: 'application/octet-stream' });

      // 2. Отправляем в выбранное облако (REST API)
      if (provider === 'yandex') await this._uploadYandex(blob);
      if (provider === 'google') await this._uploadGoogle(blob);

      window.NotificationSystem?.success('Синхронизация завершена');
      eventLogger.log('CLOUD_SYNC_SUCCESS', { provider });
    } catch (e) {
      console.error(e);
      window.NotificationSystem?.error('Ошибка синхронизации');
      if (e.status === 401) {
         delete this.tokens[provider];
         localStorage.setItem('cloud_tokens', JSON.stringify(this.tokens));
         this._bindUI();
      }
    }
  }

  async _uploadYandex(blob) {
    const t = this.tokens.yandex;
    // Получаем URL для загрузки в папку приложения
    const getUrlRes = await fetch('https://cloud-api.yandex.net/v1/disk/resources/upload?path=app:/vi3na1bita_sync.vi3bak&overwrite=true', {
      headers: { 'Authorization': `OAuth ${t}` }
    });
    if (!getUrlRes.ok) throw { status: getUrlRes.status };
    const { href } = await getUrlRes.json();
    
    // Загружаем файл
    await fetch(href, { method: 'PUT', body: blob });
  }

  async _uploadGoogle(blob) {
     // Упрощенный POST для Google Drive (требуется multipart/related для production)
     const t = this.tokens.google;
     const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=media', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/octet-stream' },
        body: blob
     });
     if (!res.ok) throw { status: res.status };
  }
}
export const cloudSync = new CloudSyncManager();

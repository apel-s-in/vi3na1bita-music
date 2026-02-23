import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';

export class CloudSyncManager {
  constructor() {
    this.providers = { yandex: { clientId: 'YOUR_YANDEX_CLIENT_ID', authUrl: 'https://oauth.yandex.ru/authorize' }, google: { clientId: 'YOUR_GOOGLE_CLIENT_ID', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth' } };
    this.tokens = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
    this._bindUI();
  }
  _bindUI() {
    const btnYandex = document.querySelector('.btn-cloud-yandex'), btnGoogle = document.querySelector('.btn-cloud-google');
    if (btnYandex) { btnYandex.textContent = this.tokens.yandex ? '🔄 Синхронизировать (Яндекс)' : 'Подключить Яндекс.Диск'; btnYandex.addEventListener('click', () => this.tokens.yandex ? this.sync('yandex') : this.auth('yandex')); }
    if (btnGoogle) { btnGoogle.textContent = this.tokens.google ? '🔄 Синхронизировать (Google)' : 'Подключить Google Drive'; btnGoogle.addEventListener('click', () => this.tokens.google ? this.sync('google') : this.auth('google')); }
  }
  auth(provider) {
    const p = this.providers[provider];
    if (!p || p.clientId === 'YOUR_YANDEX_CLIENT_ID') return window.NotificationSystem?.warning('Настройте ClientID в cloud-sync.js');
    window.location.href = `${p.authUrl}?response_type=token&client_id=${p.clientId}&redirect_uri=${encodeURIComponent(window.location.origin + window.location.pathname)}&scope=${provider === 'yandex' ? 'cloud_api:disk.app_folder' : 'https://www.googleapis.com/auth/drive.file'}`;
  }
  checkAuthCallback() {
    const hash = window.location.hash.substring(1);
    if (!hash.includes('access_token')) return;
    const token = new URLSearchParams(hash).get('access_token');
    if (token) {
      const provider = token.length > 80 ? 'google' : 'yandex';
      this.tokens[provider] = token; localStorage.setItem('cloud_tokens', JSON.stringify(this.tokens));
      window.history.replaceState(null, '', window.location.pathname);
      window.NotificationSystem?.success(`${provider} успешно подключен!`); this._bindUI();
    }
  }
  async sync(provider) {
    if (!window.NetPolicy?.isNetworkAllowed()) return window.NotificationSystem?.error('Сеть недоступна');
    window.NotificationSystem?.info('Синхронизация...');
    try {
      const data = { timestamp: Date.now(), deviceHash: localStorage.getItem('deviceHash'), stats: await metaDB._tx('stats', 'readonly', store => store.getAll()) };
      const blob = new Blob([btoa(unescape(encodeURIComponent(JSON.stringify(data))))], { type: 'application/octet-stream' });
      if (provider === 'yandex') await this._uploadYandex(blob);
      if (provider === 'google') await this._uploadGoogle(blob);
      window.NotificationSystem?.success('Синхронизация завершена');
      eventLogger.log('CLOUD_SYNC_SUCCESS', { provider });
    } catch (e) { window.NotificationSystem?.error('Ошибка синхронизации'); }
  }
  async _uploadYandex(blob) {
    const getUrlRes = await fetch('https://cloud-api.yandex.net/v1/disk/resources/upload?path=app:/vi3na1bita_sync.vi3bak&overwrite=true', { headers: { 'Authorization': `OAuth ${this.tokens.yandex}` } });
    if (!getUrlRes.ok) throw { status: getUrlRes.status };
    await fetch((await getUrlRes.json()).href, { method: 'PUT', body: blob });
  }
  async _uploadGoogle(blob) {
     const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=media', { method: 'POST', headers: { 'Authorization': `Bearer ${this.tokens.google}`, 'Content-Type': 'application/octet-stream' }, body: blob });
     if (!res.ok) throw { status: res.status };
  }
}
export const cloudSync = new CloudSyncManager();

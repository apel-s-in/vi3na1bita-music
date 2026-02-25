import { BackupVault } from './backup-vault.js';
import { eventLogger } from './event-logger.js';

export class CloudSyncManager {
  constructor() {
    this.providers = { yandex: { clientId: 'YOUR_YANDEX_CLIENT_ID', authUrl: 'https://oauth.yandex.ru/authorize' } };
    this.tokens = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
  }

  auth(provider) {
    const p = this.providers[provider];
    if (!p || p.clientId === 'YOUR_YANDEX_CLIENT_ID') return window.NotificationSystem?.warning('Настройте ClientID облака');
    window.location.href = `${p.authUrl}?response_type=token&client_id=${p.clientId}&redirect_uri=${encodeURIComponent(window.location.origin + window.location.pathname)}`;
  }

  checkAuthCallback() {
    const hash = window.location.hash.substring(1);
    const token = new URLSearchParams(hash).get('access_token');
    if (token) {
      this.tokens.yandex = token; localStorage.setItem('cloud_tokens', JSON.stringify(this.tokens));
      window.history.replaceState(null, '', window.location.pathname);
      window.NotificationSystem?.success(`Облако подключено!`);
    }
  }

  async sync(provider) {
    if (!window.NetPolicy?.isNetworkAllowed()) return window.NotificationSystem?.error('Сеть недоступна');
    window.NotificationSystem?.info('Синхронизация с облаком...');
    try {
      const data = await BackupVault.buildBackupObject();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      
      const getUrlRes = await fetch('https://cloud-api.yandex.net/v1/disk/resources/upload?path=app:/vi3na1bita_sync.vi3bak&overwrite=true', { headers: { 'Authorization': `OAuth ${this.tokens.yandex}` } });
      if (!getUrlRes.ok) throw { status: getUrlRes.status };
      await fetch((await getUrlRes.json()).href, { method: 'PUT', body: blob });
      
      window.NotificationSystem?.success('Синхронизация завершена');
      eventLogger.log('CLOUD_SYNC_SUCCESS', null, { provider });
    } catch (e) { window.NotificationSystem?.error('Ошибка синхронизации'); }
  }
}
export const cloudSync = new CloudSyncManager();

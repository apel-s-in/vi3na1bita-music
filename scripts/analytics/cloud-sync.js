// UID.069_(Internal user identity)_(не смешивать provider token и identity модели)_(future cloud sync должен работать поверх provider identity layer) // UID.073_(Hybrid sync orchestrator)_(дать primary/mirror/social роли провайдеров)_(текущий cloud-sync будет legacy transport под future hybrid-sync) // UID.074_(Primary backup provider)_(готовить Yandex как основной backup channel)_(future orchestration вынести в scripts/intel/providers/hybrid-sync.js) // UID.075_(Secondary mirror backup)_(подготовить Google как резервный mirror)_(future mirror backup не должен конфликтовать с primary sync)
import { BackupVault } from './backup-vault.js';
import { eventLogger } from './event-logger.js';

export class CloudSyncManager {
  constructor() {
    this.providers = { yandex: { clientId: 'YOUR_YANDEX_CLIENT_ID', authUrl: 'https://oauth.yandex.ru/authorize', name: 'Яндекс.Диск' }, google: { clientId: 'YOUR_GOOGLE_CLIENT_ID', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', name: 'Google Drive' }, vk: { clientId: 'YOUR_VK_CLIENT_ID', authUrl: 'https://oauth.vk.com/authorize', name: 'VK ID' } };
    this.tokens = JSON.parse(localStorage.getItem('cloud_tokens') || '{}');
  }

  auth(p) {
    const prv = this.providers[p];
    if (!prv || prv.clientId === 'YOUR_YANDEX_CLIENT_ID') return window.NotificationSystem?.warning('Настройте ClientID облака');
    window.location.href = `${prv.authUrl}?response_type=token&client_id=${prv.clientId}&redirect_uri=${encodeURIComponent(window.location.origin + window.location.pathname)}`;
  }

  checkAuthCallback() {
    const t = new URLSearchParams(window.location.hash.substring(1)).get('access_token');
    if (t) { this.tokens.yandex = t; localStorage.setItem('cloud_tokens', JSON.stringify(this.tokens)); window.history.replaceState(null, '', window.location.pathname); window.NotificationSystem?.success(`Облако подключено!`); }
  }

  async sync(provider) {
    if (!window.NetPolicy?.isNetworkAllowed()) return window.NotificationSystem?.error('Сеть недоступна');
    window.NotificationSystem?.info('Синхронизация с облаком...');
    try {
      const b = new Blob([JSON.stringify(await BackupVault.buildBackupObject())], { type: 'application/json' }), req = url => (window.NetPolicy?.guardedFetch?.(url, { headers: { 'Authorization': `OAuth ${this.tokens.yandex}` } }) || fetch(url, { headers: { 'Authorization': `OAuth ${this.tokens.yandex}` } }));
      const r = await req('https://cloud-api.yandex.net/v1/disk/resources/upload?path=app:/vi3na1bita_sync.vi3bak&overwrite=true');
      if (!r.ok) throw { status: r.status };
      await (window.NetPolicy?.guardedFetch?.((await r.json()).href, { method: 'PUT', body: b }) || fetch((await r.json()).href, { method: 'PUT', body: b }));
      window.NotificationSystem?.success('Синхронизация завершена'); eventLogger.log('CLOUD_SYNC_SUCCESS', null, { provider });
    } catch (e) { window.NotificationSystem?.error('Ошибка синхронизации'); }
  }
}
export const cloudSync = new CloudSyncManager();

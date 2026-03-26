// scripts/core/yandex-disk.js
// Сохранение и восстановление бэкапа прогресса на Яндекс Диск.
// Использует папку приложения (app_folder) — пользователь видит её в разделе "Приложения".
// НЕ влияет на playback, статистику и офлайн.

const API = 'https://cloud-api.yandex.net/v1/disk';
const BACKUP_PATH = 'app:/vi3na1bita_backup.vi3bak';
const BACKUP_PATH_VERSIONED = (n) => `app:/vi3na1bita_backup_${n}.vi3bak`;

const authHeader = (token) => ({ 'Authorization': `OAuth ${token}` });

export const YandexDisk = {

  async upload(token, dataObject) {
    if (!token) throw new Error('no_token');
    const blob = new Blob([JSON.stringify(dataObject)], { type: 'application/json' });

    // Получаем URL для загрузки
    const linkRes = await fetch(
      `${API}/resources/upload?path=${encodeURIComponent(BACKUP_PATH)}&overwrite=true`,
      { headers: authHeader(token) }
    );
    if (!linkRes.ok) throw new Error(`upload_link_failed:${linkRes.status}`);
    const { href } = await linkRes.json();

    // Загружаем файл
    const uploadRes = await fetch(href, { method: 'PUT', body: blob });
    if (!uploadRes.ok) throw new Error(`upload_failed:${uploadRes.status}`);
    return true;
  },

  async download(token) {
    if (!token) throw new Error('no_token');
    const linkRes = await fetch(
      `${API}/resources/download?path=${encodeURIComponent(BACKUP_PATH)}`,
      { headers: authHeader(token) }
    );
    if (linkRes.status === 404) return null; // Бэкапа ещё нет
    if (!linkRes.ok) throw new Error(`download_link_failed:${linkRes.status}`);
    const { href } = await linkRes.json();

    const dataRes = await fetch(href);
    if (!dataRes.ok) throw new Error(`download_failed:${dataRes.status}`);
    return await dataRes.json();
  },

  async checkExists(token) {
    if (!token) return false;
    try {
      const r = await fetch(
        `${API}/resources?path=${encodeURIComponent(BACKUP_PATH)}`,
        { headers: authHeader(token) }
      );
      return r.ok;
    } catch { return false; }
  }
};

window.YandexDisk = YandexDisk;
export default YandexDisk;

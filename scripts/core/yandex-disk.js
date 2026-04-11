// scripts/core/yandex-disk.js
// Сохранение и восстановление бэкапа прогресса на Яндекс Диск.
// Использует папку приложения (app_folder) — пользователь видит её в разделе "Приложения".
// НЕ влияет на playback, статистику и офлайн.

const API = 'https://cloud-api.yandex.net/v1/disk';
const BACKUP_PATH = 'app:/vi3na1bita_backup.vi3bak';
const META_PATH = 'app:/vi3na1bita_backup_meta.json';
const BACKUP_PATH_VERSIONED = stamp => `app:/vi3na1bita_backup_${stamp}.vi3bak`;

const authHeader = token => ({ 'Authorization': `OAuth ${token}` });

async function getUploadHref(token, path) {
  const r = await fetch(`${API}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`, { headers: authHeader(token) });
  if (!r.ok) throw new Error(`upload_link_failed:${r.status}`);
  return (await r.json()).href;
}

async function putJsonByPath(token, path, data) {
  const href = await getUploadHref(token, path);
  const res = await fetch(href, { method: 'PUT', body: new Blob([JSON.stringify(data)], { type: 'application/json' }) });
  if (!res.ok) throw new Error(`upload_failed:${res.status}`);
  return true;
}

async function getDownloadJsonByPath(token, path) {
  const r = await fetch(`${API}/resources/download?path=${encodeURIComponent(path)}`, { headers: authHeader(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`download_link_failed:${r.status}`);
  const { href } = await r.json();
  const dataRes = await fetch(href);
  if (!dataRes.ok) throw new Error(`download_failed:${dataRes.status}`);
  return await dataRes.json();
}

export const YandexDisk = {
  async upload(token, dataObject) {
    if (!token) throw new Error('no_token');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const meta = {
      latestPath: BACKUP_PATH,
      historyPath: BACKUP_PATH_VERSIONED(stamp),
      timestamp: Date.now(),
      version: dataObject?.version || 'unknown',
      appVersion: dataObject?.appVersion || null
    };

    await putJsonByPath(token, BACKUP_PATH, dataObject);
    try { await putJsonByPath(token, meta.historyPath, dataObject); } catch {}
    await putJsonByPath(token, META_PATH, meta);
    return meta;
  },

  async download(token) {
    if (!token) throw new Error('no_token');
    return await getDownloadJsonByPath(token, BACKUP_PATH);
  },

  async getMeta(token) {
    if (!token) throw new Error('no_token');
    return await getDownloadJsonByPath(token, META_PATH);
  },

  async checkExists(token) {
    if (!token) return false;
    try {
      const r = await fetch(`${API}/resources?path=${encodeURIComponent(BACKUP_PATH)}`, { headers: authHeader(token) });
      return r.ok;
    } catch { return false; }
  }
};

window.YandexDisk = YandexDisk;
export default YandexDisk;

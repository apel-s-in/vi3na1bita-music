// scripts/core/yandex-disk.js
// Сохранение и восстановление бэкапа прогресса на Яндекс Диск.
// Browser-only режим: metadata через cloud-api, payload restore с graceful fallback.

const API = 'https://cloud-api.yandex.net/v1/disk';
const BACKUP_PATH = 'app:/vi3na1bita_backup.vi3bak';
const META_PATH = 'app:/vi3na1bita_backup_meta.json';
const BACKUP_PATH_VERSIONED = stamp => `app:/vi3na1bita_backup_${stamp}.vi3bak`;

// Yandex Cloud Function proxy для обхода CORS при restore
// Замени URL на свой после деплоя функции
const PROXY_URL = 'https://functions.yandexcloud.net/d4ecdu6kgamevcauajid';

const authHeader = token => ({ 'Authorization': `OAuth ${token}` });
const buildProxyUrl = (mode = 'download', path = BACKUP_PATH) => {
  const u = new URL(PROXY_URL);
  u.searchParams.set('mode', mode);
  if (path) u.searchParams.set('path', path);
  return u.toString();
};

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

async function getResourceMeta(token, path) {
  const r = await fetch(`${API}/resources?path=${encodeURIComponent(path)}`, { headers: authHeader(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`resource_meta_failed:${r.status}`);
  return await r.json();
}

async function getDownloadHref(token, path) {
  const r = await fetch(`${API}/resources/download?path=${encodeURIComponent(path)}`, { headers: authHeader(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`download_link_failed:${r.status}`);
  return (await r.json()).href || null;
}

function humanSize(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export const YandexDisk = {
  async upload(token, dataObject) {
    if (!token) throw new Error('no_token');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const meta = {
      latestPath: BACKUP_PATH,
      historyPath: BACKUP_PATH_VERSIONED(stamp),
      timestamp: Number(dataObject?.revision?.timestamp || dataObject?.createdAt || Date.now()),
      version: dataObject?.version || 'unknown',
      appVersion: dataObject?.revision?.appVersion || dataObject?.appVersion || null,
      ownerYandexId: dataObject?.identity?.ownerYandexId || null,
      checksum: dataObject?.integrity?.payloadHash || null
    };

    await putJsonByPath(token, BACKUP_PATH, dataObject);
    try { await putJsonByPath(token, meta.historyPath, dataObject); } catch {}
    await putJsonByPath(token, META_PATH, meta);
    return meta;
  },

  async getMeta(token) {
    if (!token) throw new Error('no_token');
    const [latestMeta, metaMeta] = await Promise.all([
      getResourceMeta(token, BACKUP_PATH).catch(() => null),
      getResourceMeta(token, META_PATH).catch(() => null)
    ]);
    if (!latestMeta) return null;

    let metaJson = null;
    try {
      const href = await getDownloadHref(token, META_PATH);
      if (href) {
        const res = await fetch(href, { mode: 'cors' });
        if (res.ok) metaJson = await res.json();
      }
    } catch {}

    const size = Number(latestMeta?.size || 0);
    const metaSize = Number(metaMeta?.size || 0);
    return metaJson ? {
      ...metaJson,
      size,
      sizeHuman: humanSize(size),
      diskUsageBytes: size + metaSize,
      diskUsageHuman: humanSize(size + metaSize),
      modified: latestMeta?.modified || null
    } : {
      latestPath: BACKUP_PATH,
      historyPath: null,
      timestamp: latestMeta.modified ? Date.parse(latestMeta.modified) || 0 : 0,
      version: 'unknown',
      appVersion: 'unknown',
      ownerYandexId: null,
      checksum: null,
      size,
      sizeHuman: humanSize(size),
      diskUsageBytes: size + metaSize,
      diskUsageHuman: humanSize(size + metaSize),
      modified: latestMeta?.modified || null
    };
  },

  async checkExists(token) {
    if (!token) return false;
    try {
      const r = await fetch(`${API}/resources?path=${encodeURIComponent(BACKUP_PATH)}`, { headers: authHeader(token) });
      return r.ok;
    } catch { return false; }
  },

  async download(token, path = BACKUP_PATH) {
    if (!token) throw new Error('no_token');

    // Попытка 1: через Cloud Function proxy — latest или конкретная versioned path
    if (PROXY_URL && !PROXY_URL.includes('ВАШ_ID')) {
      const res = await fetch(buildProxyUrl('download', path), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null);

      if (res) {
        let payload = null;
        try { payload = await res.json(); } catch {}

        if (res.status === 404 || payload?.error === 'not_found') return null;
        if (res.ok && payload) return payload;

        if (payload?.error) {
          const err = new Error(String(payload.error));
          err.payload = payload;
          throw err;
        }
      }
    }

    // Попытка 2: прямой fetch с CORS — только для latest/manual fallback
    try {
      const href = await getDownloadHref(token, path);
      if (!href) return null;
      const res = await fetch(href, { mode: 'cors' });
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
    } catch {}

    const href = await getDownloadHref(token, path).catch(() => null);
    const e = new Error('download_cors_fallback_required');
    e.downloadHref = href;
    e.requestedPath = path;
    throw e;
  },

  async listBackups(token) {
    if (!token) throw new Error('no_token');

    if (PROXY_URL && !PROXY_URL.includes('ВАШ_ID')) {
      const res = await fetch(buildProxyUrl('list'), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null);

      if (res) {
        let payload = null;
        try { payload = await res.json(); } catch {}
        if (res.ok && Array.isArray(payload?.items)) return payload.items;
        if (payload?.error) {
          const err = new Error(String(payload.error));
          err.payload = payload;
          throw err;
        }
      }
    }

    const meta = await this.getMeta(token).catch(() => null);
    return meta?.latestPath ? [{
      path: meta.latestPath,
      timestamp: Number(meta.timestamp || 0),
      appVersion: String(meta.appVersion || 'unknown'),
      sizeHuman: String(meta.sizeHuman || 'unknown'),
      isLatest: true
    }] : [];
  },

  async getDownloadLink(token, path = BACKUP_PATH) {
    if (!token) throw new Error('no_token');
    return await getDownloadHref(token, path);
  }

window.YandexDisk = YandexDisk;
export default YandexDisk;

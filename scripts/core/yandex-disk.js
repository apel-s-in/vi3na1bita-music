// scripts/core/yandex-disk.js
// Сохранение прогресса в корень приложения (app:/)
// Без ошибок 409 и с умной ротацией 5 последних файлов

const API = 'https://cloud-api.yandex.net/v1/disk';
const BACKUP_PATH = 'app:/vi3na1bita_backup.vi3bak';
const META_PATH = 'app:/vi3na1bita_backup_meta.json';
const BACKUP_PATH_VERSIONED = stamp => `app:/vi3na1bita_backup_${stamp}.vi3bak`;
const PROXY_URL = 'https://functions.yandexcloud.net/d4ecdu6kgamevcauajid';

const authHeader = token => ({ 'Authorization': `OAuth ${token}` });

async function fetchProxy(url, token, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok && [502, 503, 504].includes(res.status) && i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue;
      }
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function putJsonByPath(token, path, data) {
  const rLink = await fetch(`${API}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`, { headers: authHeader(token) });
  if (!rLink.ok) throw new Error(`upload_link_failed:${rLink.status}`);
  const href = (await rLink.json()).href;
  const res = await fetch(href, { method: 'PUT', body: new Blob([JSON.stringify(data)], { type: 'application/json' }) });
  if (!res.ok) throw new Error(`upload_failed:${res.status}`);
  return true;
}

function humanSize(bytes) {
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
    const rpg = dataObject?.data?.userProfileRpg || {};
    const favs = dataObject?.data?.localStorage?.['__favorites_v2__'] || '[]';
    let favCount = 0; try { favCount = JSON.parse(favs).filter(i=>!i.inactiveAt).length; } catch {}

    const meta = {
      latestPath: BACKUP_PATH,
      historyPath: BACKUP_PATH_VERSIONED(stamp),
      timestamp: Number(dataObject?.revision?.timestamp || dataObject?.createdAt || Date.now()),
      appVersion: dataObject?.revision?.appVersion || 'unknown',
      ownerYandexId: dataObject?.identity?.ownerYandexId || null,
      level: rpg.level || 1,
      xp: rpg.xp || 0,
      achievementsCount: Object.keys(dataObject?.data?.achievements || {}).length,
      favoritesCount: favCount
    };

    await putJsonByPath(token, BACKUP_PATH, dataObject);
    try { await putJsonByPath(token, meta.historyPath, dataObject); } catch {}
    await putJsonByPath(token, META_PATH, meta);

    // Очистка старых версий (оставляем 5)
    this.deleteOldBackups(token, { keep: 5 }).catch(() => {});

    // Запрашиваем реальные метаданные чтобы UI получил точный размер файлов
    const realMeta = await this.getMeta(token).catch(() => null);
    return realMeta || meta;
  },

  async getMeta(token) {
    if (!token) throw new Error('no_token');
    try {
      const [latestMeta, metaRes] = await Promise.all([
        fetch(`${API}/resources?path=${encodeURIComponent(BACKUP_PATH)}`, { headers: authHeader(token) }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/resources/download?path=${encodeURIComponent(META_PATH)}`, { headers: authHeader(token) }).then(r => r.ok ? r.json() : null)
      ]);
      
      let metaJson = null;
      if (metaRes?.href) {
        const fileRes = await fetch(metaRes.href);
        if (fileRes.ok) metaJson = await fileRes.json();
      }

      if (!latestMeta && !metaJson) return null;

      const size = Number(latestMeta?.size || 0);
      return metaJson ? {
        ...metaJson,
        size,
        sizeHuman: humanSize(size),
        timestamp: latestMeta?.modified ? Date.parse(latestMeta.modified) : metaJson.timestamp
      } : null;
    } catch { return null; }
  },

  async download(token, path = BACKUP_PATH) {
    if (!token) throw new Error('no_token');

    // Попытка 1: через прокси Cloud Function
    try {
      const u = new URL(PROXY_URL); u.searchParams.set('mode', 'download'); u.searchParams.set('path', path);
      const res = await fetchProxy(u.toString(), token, 2);
      if (res && res.ok) {
        const data = await res.json();
        if (data && !data.error) return data;
      }
    } catch {}

    // Попытка 2: прямое скачивание через Яндекс Диск API (может работать в некоторых браузерах)
    try {
      const linkRes = await fetch(
        `${API}/resources/download?path=${encodeURIComponent(path)}`,
        { headers: authHeader(token) }
      );
      if (linkRes.ok) {
        const linkData = await linkRes.json();
        if (linkData?.href) {
          const fileRes = await fetch(linkData.href);
          if (fileRes.ok) {
            const data = await fileRes.json();
            if (data && typeof data === 'object') return data;
          }
        }
      }
    } catch {}

    throw new Error('proxy_failed_or_timeout');
  },

  async listBackups(token) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY_URL); u.searchParams.set('mode', 'list');
    const res = await fetchProxy(u.toString(), token);
    if (res && res.ok) {
      const data = await res.json();
      if (data?.items) return data.items;
    }
    return [];
  },

  async deleteOldBackups(token, { keep = 5 } = {}) {
    if (!token) return;
    const r = await fetch(`${API}/resources?path=${encodeURIComponent('app:/')}&limit=200`, { headers: authHeader(token) });
    if (!r.ok) return;
    const items = (await r.json())?._embedded?.items || [];
    const versioned = items.filter(x => /^vi3na1bita_backup_.*\.vi3bak$/i.test(x.name)).sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
    const toDelete = versioned.slice(Math.max(0, keep));
    
    for (const item of toDelete) {
      await fetch(`${API}/resources?path=${encodeURIComponent(item.path)}`, { method: 'DELETE', headers: authHeader(token) }).catch(()=>{});
    }
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

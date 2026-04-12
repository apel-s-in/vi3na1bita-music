// scripts/core/yandex-disk.js
// Работа с папкой Auto-Save, автоматическая очистка и жесткий прокси без fallback на прямые CORS-запросы

const API = 'https://cloud-api.yandex.net/v1/disk';
const BACKUP_DIR = 'app:/Auto-Save';
const BACKUP_PATH = 'app:/Auto-Save/latest.vi3bak';
const META_PATH = 'app:/Auto-Save/meta.json';
const BACKUP_PATH_VERSIONED = stamp => `app:/Auto-Save/backup_${stamp}.vi3bak`;
const PROXY_URL = 'https://functions.yandexcloud.net/d4ecdu6kgamevcauajid';

const authHeader = token => ({ 'Authorization': `OAuth ${token}` });

async function ensureDir(token, path) {
  const r = await fetch(`${API}/resources?path=${encodeURIComponent(path)}`, { method: 'PUT', headers: authHeader(token) });
  return r.ok || r.status === 409;
}

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

export const YandexDisk = {
  async upload(token, dataObject) {
    if (!token) throw new Error('no_token');
    await ensureDir(token, BACKUP_DIR);

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

    // Автоматическая очистка: оставляем только 5 последних файлов
    this.deleteOldBackups(token, { keep: 5 }).catch(() => {});

    return meta;
  },

  async getMeta(token) {
    if (!token) throw new Error('no_token');
    const r = await fetch(`${API}/resources/download?path=${encodeURIComponent(META_PATH)}`, { headers: authHeader(token) });
    if (!r.ok) return null;
    const href = (await r.json()).href;
    if (!href) return null;
    const res = await fetch(href);
    return res.ok ? await res.json() : null;
  },

  async download(token, path = BACKUP_PATH) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY_URL); u.searchParams.set('mode', 'download'); u.searchParams.set('path', path);
    const res = await fetchProxy(u.toString(), token);
    
    if (res && res.ok) {
      const data = await res.json();
      if (data && !data.error) return data;
    }
    
    // Никакого фоллбека на прямые ссылки — только прокси. Если упало, кидаем чистую ошибку.
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
    const r = await fetch(`${API}/resources?path=${encodeURIComponent(BACKUP_DIR)}&limit=200`, { headers: authHeader(token) });
    if (!r.ok) return;
    const items = (await r.json())?._embedded?.items || [];
    const versioned = items.filter(x => /^backup_.*\.vi3bak$/i.test(x.name)).sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
    const toDelete = versioned.slice(Math.max(0, keep));
    
    for (const item of toDelete) {
      await fetch(`${API}/resources?path=${encodeURIComponent(item.path)}`, { method: 'DELETE', headers: authHeader(token) }).catch(()=>{});
    }
  },

  async clearAutoSaveDir(token) {
    if (!token) return;
    // Удаляем саму папку Auto-Save (Яндекс удалит все внутри) и создаем заново
    await fetch(`${API}/resources?path=${encodeURIComponent(BACKUP_DIR)}&permanently=true`, { method: 'DELETE', headers: authHeader(token) });
    await ensureDir(token, BACKUP_DIR);
  }
};

window.YandexDisk = YandexDisk;
export default YandexDisk;

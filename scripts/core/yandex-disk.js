// scripts/core/yandex-disk.js
// Сохранение прогресса в app:/ + стабильное чтение только через Cloud Function proxy.
// Без direct browser fallback на signed Yandex URL.

const API = 'https://cloud-api.yandex.net/v1/disk';
const BACKUP_PATH = 'app:/vi3na1bita_backup.vi3bak';
const META_PATH = 'app:/vi3na1bita_backup_meta.json';
const BACKUP_PATH_VERSIONED = stamp => `app:/vi3na1bita_backup_${stamp}.vi3bak`;
const PROXY_URL = 'https://functions.yandexcloud.net/d4ecdu6kgamevcauajid';

const authHeader = token => ({ 'Authorization': `OAuth ${token}` });

function safeString(v) {
  return String(v == null ? '' : v).trim();
}

function safeNum(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function safeParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function humanSize(bytes) {
  const n = safeNum(bytes);
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

async function fetchProxyJson(url, token, retries = 2) {
  let lastErr = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      const text = await res.text();
      const data = safeParseJson(text);

      if (!res.ok) {
        const errCode = safeString(data?.error || `http_${res.status}`);
        const retryable = [502, 503, 504].includes(res.status);

        if (retryable && i < retries) {
          await new Promise(r => setTimeout(r, 800 * (i + 1)));
          continue;
        }

        const e = new Error(errCode);
        e.status = res.status;
        e.payload = data;
        throw e;
      }

      return data;
    } catch (e) {
      lastErr = e;
      const retryable = [502, 503, 504].includes(Number(e?.status || 0)) || !e?.status;
      if (!retryable || i >= retries) break;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }

  throw lastErr || new Error('proxy_failed');
}

async function putJsonByPath(token, path, data) {
  const rLink = await fetch(`${API}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`, {
    headers: authHeader(token)
  });
  if (!rLink.ok) throw new Error(`upload_link_failed:${rLink.status}`);

  const href = (await rLink.json()).href;
  const res = await fetch(href, {
    method: 'PUT',
    body: new Blob([JSON.stringify(data)], { type: 'application/json' })
  });
  if (!res.ok) throw new Error(`upload_failed:${res.status}`);
  return true;
}

async function getLatestFileMetaDirect(token) {
  const r = await fetch(`${API}/resources?path=${encodeURIComponent(BACKUP_PATH)}`, {
    headers: authHeader(token)
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`latest_meta_failed:${r.status}`);
  const j = await r.json();
  const size = safeNum(j?.size);
  return {
    path: safeString(j?.path || BACKUP_PATH),
    modified: j?.modified || null,
    timestamp: j?.modified ? (Date.parse(j.modified) || 0) : 0,
    size,
    sizeHuman: humanSize(size)
  };
}

export const YandexDisk = {
  async upload(token, dataObject) {
    if (!token) throw new Error('no_token');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rpg = dataObject?.data?.userProfileRpg || {};
    const favs = dataObject?.data?.localStorage?.['__favorites_v2__'] || '[]';
    const pls = dataObject?.data?.localStorage?.['sc3:playlists'] || '[]';
    const stats = Array.isArray(dataObject?.data?.stats) ? dataObject.data.stats : [];
    const warm = Array.isArray(dataObject?.data?.eventLog?.warm) ? dataObject.data.eventLog.warm : [];
    const devices = Array.isArray(dataObject?.devices) ? dataObject.devices : [];
    let favCount = 0, playlistsCount = 0;
    try { favCount = JSON.parse(favs).filter(i => !i?.inactiveAt).length; } catch {}
    try { playlistsCount = JSON.parse(pls).length; } catch {}

    const stableIds = new Set(
      devices.map(d => safeString(d?.deviceStableId || '')).filter(Boolean)
    );

    const meta = {
      latestPath: BACKUP_PATH,
      historyPath: BACKUP_PATH_VERSIONED(stamp),
      timestamp: safeNum(dataObject?.revision?.timestamp || dataObject?.createdAt || Date.now()),
      appVersion: dataObject?.revision?.appVersion || 'unknown',
      ownerYandexId: dataObject?.identity?.ownerYandexId || null,
      level: safeNum(rpg.level || 1),
      xp: safeNum(rpg.xp || 0),
      achievementsCount: Object.keys(dataObject?.data?.achievements || {}).length,
      favoritesCount: safeNum(favCount),
      playlistsCount: safeNum(playlistsCount),
      statsCount: stats.filter(x => x?.uid && x.uid !== 'global').length,
      eventCount: warm.length,
      devicesCount: devices.length,
      deviceStableCount: stableIds.size,
      checksum: safeString(dataObject?.integrity?.payloadHash || ''),
      version: safeString(dataObject?.version || dataObject?.revision?.schemaVersion || 'unknown')
    };

    await putJsonByPath(token, BACKUP_PATH, dataObject);
    try { await putJsonByPath(token, meta.historyPath, dataObject); } catch {}
    await putJsonByPath(token, META_PATH, meta);

    this.deleteOldBackups(token, { keep: 5 }).catch(() => {});

    const realMeta = await this.getMeta(token).catch(() => null);
    return realMeta || meta;
  },

  async getMeta(token) {
    if (!token) throw new Error('no_token');
    const u = new URL(PROXY_URL);
    u.searchParams.set('mode', 'meta');

    try {
      const data = await fetchProxyJson(u.toString(), token, 2);
      if (!data?.exists) return null;
      return data.latest || null;
    } catch (e) {
      if (Number(e?.status || 0) === 404) return null;
      if (Number(e?.status || 0) === 401) throw new Error('disk_auth_error');
      if (Number(e?.status || 0) === 403) throw new Error('disk_forbidden');
      throw new Error(safeString(e?.message || 'meta_proxy_failed'));
    }
  },

  async download(token, path = BACKUP_PATH) {
    if (!token) throw new Error('no_token');

    const u = new URL(PROXY_URL);
    u.searchParams.set('mode', 'download');
    u.searchParams.set('path', safeString(path || BACKUP_PATH) || BACKUP_PATH);

    try {
      const data = await fetchProxyJson(u.toString(), token, 2);
      if (!data || typeof data !== 'object') throw new Error('invalid_backup_payload');
      return data;
    } catch (e) {
      const st = Number(e?.status || 0);
      if (st === 404) throw new Error('backup_not_found');
      if (st === 401) throw new Error('disk_auth_error');
      if (st === 403) throw new Error('disk_forbidden');
      if ([502, 503, 504].includes(st)) throw new Error('proxy_failed_or_timeout');
      throw new Error(safeString(e?.message || 'proxy_failed_or_timeout'));
    }
  },

  async listBackups(token) {
    if (!token) throw new Error('no_token');

    const u = new URL(PROXY_URL);
    u.searchParams.set('mode', 'list');

    try {
      const data = await fetchProxyJson(u.toString(), token, 2);
      return Array.isArray(data?.items) ? data.items : [];
    } catch (e) {
      const st = Number(e?.status || 0);
      if (st === 401) throw new Error('disk_auth_error');
      if (st === 403) throw new Error('disk_forbidden');
      if ([502, 503, 504].includes(st)) throw new Error('list_proxy_failed');
      throw new Error(safeString(e?.message || 'list_proxy_failed'));
    }
  },

  async checkExists(token) {
    if (!token) return false;
    try {
      const meta = await this.getMeta(token);
      return !!meta;
    } catch {
      return false;
    }
  },

  async deleteOldBackups(token, { keep = 5 } = {}) {
    if (!token) return;

    const r = await fetch(`${API}/resources?path=${encodeURIComponent('app:/')}&limit=200`, {
      headers: authHeader(token)
    });
    if (!r.ok) return;

    const items = (await r.json())?._embedded?.items || [];
    const versioned = items
      .filter(x => /^vi3na1bita_backup_.*\.vi3bak$/i.test(safeString(x.name)))
      .sort((a, b) => (Date.parse(b.modified) || 0) - (Date.parse(a.modified) || 0));

    const toDelete = versioned.slice(Math.max(0, keep));
    for (const item of toDelete) {
      await fetch(`${API}/resources?path=${encodeURIComponent(item.path)}`, {
        method: 'DELETE',
        headers: authHeader(token)
      }).catch(() => {});
    }
  }
};

window.YandexDisk = YandexDisk;
export default YandexDisk;

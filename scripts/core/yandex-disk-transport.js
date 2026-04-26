export const YANDEX_DISK_API = 'https://cloud-api.yandex.net/v1/disk';
export const YANDEX_DISK_PROXY = 'https://functions.yandexcloud.net/d4ecdu6kgamevcauajid';

const sS = v => String(v == null ? '' : v).trim();
export const authHeaders = t => ({ Authorization: `OAuth ${t}` });
export const safeParseJson = t => { try { return JSON.parse(t); } catch { return null; } };

export const mapProxyError = (prefix, e) => {
  const status = Number(e?.status || 0);
  const payload = e?.payload && typeof e.payload === 'object' ? e.payload : null;
  const details = [payload?.error, payload?.stage, payload?.path, payload?.raw, payload?.hint].map(sS).filter(Boolean).join(' | ');
  const err = new Error(details ? `${prefix}:${details}` : prefix);
  err.status = status;
  err.payload = payload;
  return err;
};

export async function fetchProxyJson(url, token, retries = 2) {
  const qUrl = url.includes('?') ? `${url}&token=${token}` : `${url}?token=${token}`;
  const headers = { 'X-Yandex-Auth': token, Accept: 'application/json' };
  let lastErr = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(qUrl, { method: 'GET', headers, credentials: 'omit', mode: 'cors' });
      const text = await res.text();
      const data = safeParseJson(text);
      if (res.ok) return data;
      if ([502, 503, 504].includes(res.status) && i < retries) {
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
        continue;
      }
      const err = new Error(sS(data?.error || `http_${res.status}`));
      err.status = res.status;
      err.payload = data || { raw: sS(text).slice(0, 400) };
      if (Number(err.status) && ![502, 503, 504].includes(Number(err.status))) throw err;
      lastErr = err;
    } catch (e) {
      lastErr = e;
      if (Number(e?.status || 0) && ![502, 503, 504].includes(Number(e?.status || 0))) throw e;
    }
  }

  throw lastErr || new Error('proxy_failed');
}

export async function ensureResourceDir(token, path) {
  if (!token || !path) return false;
  const res = await fetch(`${YANDEX_DISK_API}/resources?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: authHeaders(token)
  });
  return res.ok || res.status === 409;
}

export async function uploadJson(token, path, data) {
  const linkRes = await fetch(`${YANDEX_DISK_API}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`, {
    headers: authHeaders(token)
  });
  if (!linkRes.ok) throw new Error(`upload_link_failed:${linkRes.status}`);
  const putRes = await fetch((await linkRes.json()).href, {
    method: 'PUT',
    body: new Blob([JSON.stringify(data)], { type: 'application/json' })
  });
  if (!putRes.ok) throw new Error(`upload_failed:${putRes.status}`);
  return true;
}

export default {
  YANDEX_DISK_API,
  YANDEX_DISK_PROXY,
  authHeaders,
  safeParseJson,
  mapProxyError,
  fetchProxyJson,
  ensureResourceDir,
  uploadJson
};

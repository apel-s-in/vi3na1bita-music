// Backup v7.1 batch transport.
// Один вызов выполняет authorization, push, pull и settings exchange.
import { getSocialSession } from './social-session.js';

export const YANDEX_BACKUP_V7_PROXY = 'https://functions.yandexcloud.net/d4ecdu6kgamevcauajid';
const safe = value => String(value == null ? '' : value).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const readJson = async response => {
  const text = await response.text();
  try {
    return JSON.parse(text || '{}') || {};
  } catch {
    return {};
  }
};

const request = async (mode, data = {}, { retries = 1 } = {}) => {
  const token = window.YandexAuth?.getToken?.();
  if (!token || !window.YandexAuth?.isTokenAlive?.()) throw new Error('yandex_oauth_required');

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const session = await getSocialSession({ force: attempt > 0 && Number(lastError?.status) === 401 });
      const response = await fetch(YANDEX_BACKUP_V7_PROXY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Yandex-Auth': token,
          'X-Vi3-Session': session.socialSession
        },
        credentials: 'omit',
        mode: 'cors',
        body: JSON.stringify({ mode, ...data })
      });
      const result = await readJson(response);

      if (!response.ok || result.ok === false) {
        const error = new Error(safe(result.error || `backup_v7_http_${response.status}`));
        error.status = response.status;
        error.payload = result;
        throw error;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || ![0, 401, 429, 502, 503, 504].includes(Number(error?.status || 0))) break;
      await sleep(700 * (attempt + 1));
    }
  }

  throw lastError || new Error('backup_v7_request_failed');
};

export const syncBackupV7Batch = data => request('v7_sync', data, { retries: 1 });
export const pingBackupV7 = () => fetch(YANDEX_BACKUP_V7_PROXY, { cache: 'no-store' }).then(readJson);

export const YandexBackupV7 = {
  sync: syncBackupV7Batch,
  ping: pingBackupV7
};

window.YandexBackupV7 = YandexBackupV7;
export default YandexBackupV7;

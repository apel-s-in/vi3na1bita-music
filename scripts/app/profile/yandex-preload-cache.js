import { safeNum } from '../../analytics/backup-summary.js';

export const PRELOAD_TIMEOUT_MS = 12000;
export const PRELOAD_RETRY_COUNT = 3;
export const PERSISTENT_CACHE_TTL_MS = 10 * 60 * 1000;
export const PERSISTENT_CACHE_KEY = 'yandex:onboarding:preload_cache:v1';

export const withTimeout = (promise, ms, label = 'op') => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms))
]);

export async function savePreloadToCache(result) {
  try {
    const { metaDB } = await import('../../analytics/meta-db.js');
    await metaDB.setGlobal(PERSISTENT_CACHE_KEY, {
      result,
      savedAt: Date.now(),
      ownerYandexId: String(result?.meta?.ownerYandexId || '').trim()
    });
  } catch {}
}

export async function loadPreloadFromCache(currentYandexId) {
  try {
    const { metaDB } = await import('../../analytics/meta-db.js');
    const rec = await metaDB.getGlobal(PERSISTENT_CACHE_KEY);
    const entry = rec?.value;
    if (!entry) return null;
    const age = Date.now() - safeNum(entry.savedAt);
    if (age > PERSISTENT_CACHE_TTL_MS) return null;
    const cachedOwner = String(entry.ownerYandexId || '').trim();
    const currentOwner = String(currentYandexId || '').trim();
    if (cachedOwner && currentOwner && cachedOwner !== currentOwner) return null;
    console.debug('[YandexPreloadCache] using persistent cache (age:', Math.round(age / 1000), 's)');
    return entry.result;
  } catch {
    return null;
  }
}

export async function invalidatePreloadCache() {
  try {
    const { metaDB } = await import('../../analytics/meta-db.js');
    await metaDB.setGlobal(PERSISTENT_CACHE_KEY, null);
  } catch {}
}

export async function preloadBackupData({ token, disk }) {
  if (!token || !disk) return { meta: null, items: [], backup: null };

  for (let attempt = 0; attempt < PRELOAD_RETRY_COUNT; attempt++) {
    try {
      console.debug(`[YandexPreloadCache] preload attempt ${attempt + 1}/${PRELOAD_RETRY_COUNT}`);

      const meta = await withTimeout(
        disk.getMeta(token).catch(() => null),
        PRELOAD_TIMEOUT_MS,
        'meta'
      ).catch(e => {
        console.warn(`[YandexPreloadCache] meta timeout (attempt ${attempt + 1}):`, e?.message);
        return null;
      });

      if (!meta) {
        if (attempt < PRELOAD_RETRY_COUNT - 1) {
          const delay = 1000 * Math.pow(2, attempt);
          console.debug(`[YandexPreloadCache] no meta, waiting ${delay}ms before retry`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.debug('[YandexPreloadCache] all retries exhausted, giving up');
        return { meta: null, items: [], backup: null };
      }

      const [items, backupData] = await Promise.all([
        withTimeout(
          disk.listBackups(token).catch(() => []),
          PRELOAD_TIMEOUT_MS,
          'list'
        ).catch(() => []),
        meta.path
          ? withTimeout(
              disk.download(token, meta.path).catch(() => null),
              PRELOAD_TIMEOUT_MS * 2,
              'download'
            ).catch(e => {
              console.warn('[YandexPreloadCache] download timeout:', e?.message);
              return null;
            })
          : Promise.resolve(null)
      ]);

      const safeItems = Array.isArray(items) && items.length ? items : [meta];
      console.debug(`[YandexPreloadCache] preload success (attempt ${attempt + 1}): meta=yes, backup=${!!backupData}, items=${safeItems.length}`);
      return { meta, items: safeItems, backup: backupData };
    } catch (e) {
      console.warn(`[YandexPreloadCache] preload attempt ${attempt + 1} error:`, e?.message);
      if (attempt >= PRELOAD_RETRY_COUNT - 1) return { meta: null, items: [], backup: null };
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return { meta: null, items: [], backup: null };
}

export default {
  PRELOAD_TIMEOUT_MS,
  PRELOAD_RETRY_COUNT,
  PERSISTENT_CACHE_TTL_MS,
  PERSISTENT_CACHE_KEY,
  withTimeout,
  savePreloadToCache,
  loadPreloadFromCache,
  invalidatePreloadCache,
  preloadBackupData
};

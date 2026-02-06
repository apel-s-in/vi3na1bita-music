/**
 * track-resolver.js — Резолвер URL аудио с приоритетом офлайн-кэша.
 *
 * ТЗ: П.3 (приоритет: 🔒 → ☁ → online)
 *
 * Возвращает:
 *   { url: string|blobURL, source: 'pinned'|'cloud'|'online', quality: string }
 */

import { getOfflineManager } from './offline-manager.js';
import { getAudioBlobAny, getTrackMeta } from './cache-db.js';

/* Хранилище выданных blobURL для освобождения */
const _blobURLs = new Map();

/**
 * resolveTrackUrl — основная функция.
 *
 * @param {string} uid — UID трека
 * @param {string} onlineUrl — URL для онлайн-воспроизведения
 * @param {object} opts — { quality?, forceOnline? }
 * @returns {Promise<{ url: string, source: string, quality: string }>}
 */
export async function resolveTrackUrl(uid, onlineUrl, opts = {}) {
  const u = String(uid || '').trim();
  const mgr = getOfflineManager();
  const quality = opts.quality || mgr.getCacheQuality();

  /* Принудительно онлайн */
  if (opts.forceOnline) {
    return { url: onlineUrl, source: 'online', quality };
  }

  /* Проверяем кэш */
  try {
    const meta = await getTrackMeta(u);

    if (meta && (meta.type === 'pinned' || meta.type === 'cloud')) {
      const found = await getAudioBlobAny(u, quality);

      if (found && found.blob) {
        /* Освобождаем предыдущий blobURL для этого uid */
        if (_blobURLs.has(u)) {
          URL.revokeObjectURL(_blobURLs.get(u));
        }
        const blobUrl = URL.createObjectURL(found.blob);
        _blobURLs.set(u, blobUrl);

        return {
          url: blobUrl,
          source: meta.type,     // 'pinned' или 'cloud'
          quality: found.quality
        };
      }

      /* Мета есть, но blob нет — нужен re-cache */
      if (meta.type === 'pinned' || meta.type === 'cloud') {
        console.warn(`[Resolver] Meta exists but no blob for ${u}, marking needsReCache`);
        const { setTrackMeta } = await import('./cache-db.js');
        await setTrackMeta(u, { ...meta, needsReCache: true });

        /* Ставим в очередь на докачку */
        mgr.enqueueAudioDownload(u, quality, {
          kind: 'reCache',
          priority: meta.type === 'pinned' ? 9 : 6
        });
      }
    }
  } catch (err) {
    console.warn('[Resolver] Cache lookup failed:', err.message);
  }

  /* Если offline и нет кэша — проблема */
  if (!navigator.onLine) {
    console.error(`[Resolver] Offline and no cache for ${u}`);
    return { url: onlineUrl, source: 'online', quality };
  }

  /* Онлайн fallback */
  return { url: onlineUrl, source: 'online', quality };
}

/**
 * Освободить blobURL трека (при смене трека).
 */
export function revokeBlobUrl(uid) {
  if (_blobURLs.has(uid)) {
    URL.revokeObjectURL(_blobURLs.get(uid));
    _blobURLs.delete(uid);
  }
}

/**
 * Освободить все blobURL.
 */
export function revokeAllBlobUrls() {
  for (const [uid, url] of _blobURLs) {
    URL.revokeObjectURL(url);
  }
  _blobURLs.clear();
}

export default { resolveTrackUrl, revokeBlobUrl, revokeAllBlobUrls };

/**
 * stats-core.js — Подсчёт прослушиваний и статистика для 🔒/☁
 *
 * ТЗ: Приложение «Pinned и Cloud», П.5.2
 *
 * Отвечает за:
 * - Подсчёт cloudFullListenCount (полные прослушивания >90% длительности)
 * - Обновление lastFullListenAt
 * - Продление TTL при каждом full listen (П.5.6)
 * - Автоматическое появление ☁ при достижении порога N (П.5.3)
 * - Обновление globalFullListenCount / globalListenSeconds (не сбрасывается)
 *
 * Зависимости:
 * - CacheDB (getTrackMeta, updateTrackMeta)
 * - OfflineManager (getCloudN, getCloudD, promoteToCloud)
 *
 * Считается во ВСЕХ режимах: R0, R1, R2, R3
 */

import { getTrackMeta, updateTrackMeta } from './cache-db.js';
import { OfflineManager } from './offline-manager.js';

/* ── Константы ────────────────────────────────────────── */

/** Процент прогресса для засчитывания full listen (П.5.2) */
const FULL_LISTEN_THRESHOLD = 0.9;

/* ── Публичный API ────────────────────────────────────── */

/**
 * Регистрирует факт прослушивания трека.
 * Вызывается из PlayerCore при завершении/переключении трека.
 *
 * @param {string} uid — уникальный ID трека
 * @param {number} progress — прогресс воспроизведения 0..1
 * @param {number} duration — длительность трека в секундах
 * @param {number} listenedSec — фактически прослушанные секунды в этой сессии
 */
export async function registerListenProgress(uid, progress, duration, listenedSec) {
  if (!uid || !duration || duration <= 0) return;

  let meta = await getTrackMeta(uid);
  if (!meta) {
    meta = _createDefaultMeta(uid);
  }

  /* Всегда обновляем global stats (П.5.5: global stats НЕ трогается при сбросе cloud) */
  meta.globalListenSeconds = (meta.globalListenSeconds || 0) + (listenedSec || 0);

  /* Проверяем full listen (>90% длительности) */
  const isFullListen = progress >= FULL_LISTEN_THRESHOLD;

  if (isFullListen) {
    const now = Date.now();

    /* Global full listen count */
    meta.globalFullListenCount = (meta.globalFullListenCount || 0) + 1;

    /* Cloud full listen count (П.5.2) */
    meta.cloudFullListenCount = (meta.cloudFullListenCount || 0) + 1;
    meta.lastFullListenAt = now;

    /* Продление TTL для cloud треков (П.5.6) */
    if (meta.cloud) {
      const D = OfflineManager.getCloudD();
      meta.cloudExpiresAt = now + D * 24 * 60 * 60 * 1000;
    }

    /* Автоматическое появление ☁ (П.5.3) */
    if (!meta.cloud && !meta.pinned) {
      const N = OfflineManager.getCloudN();
      if (meta.cloudFullListenCount >= N) {
        /* Промоутим в cloud — OfflineManager решит скачивать или нет */
        await updateTrackMeta(uid, meta);
        await OfflineManager.promoteToCloud(uid);
        return; /* promoteToCloud сам обновит мету */
      }
    }
  }

  await updateTrackMeta(uid, meta);
}

/**
 * Возвращает cloud-статистику для данного uid.
 * Используется в UI (список 🔒/☁, инфо).
 */
export async function getCloudStats(uid) {
  const meta = await getTrackMeta(uid);
  if (!meta) return _createDefaultMeta(uid);
  return {
    cloudFullListenCount: meta.cloudFullListenCount || 0,
    lastFullListenAt: meta.lastFullListenAt || null,
    cloudAddedAt: meta.cloudAddedAt || null,
    cloudExpiresAt: meta.cloudExpiresAt || null,
    cloud: !!meta.cloud,
    pinned: !!meta.pinned,
    globalFullListenCount: meta.globalFullListenCount || 0,
    globalListenSeconds: meta.globalListenSeconds || 0,
  };
}

/* ── Приватные ─────────────────────────────────────────── */

/**
 * Создаёт дефолтный объект метаданных для нового трека.
 */
function _createDefaultMeta(uid) {
  return {
    uid,
    /* Cloud stats (П.5.2) */
    cloudFullListenCount: 0,
    lastFullListenAt: null,
    cloudAddedAt: null,
    cloudExpiresAt: null,
    cloud: false,
    pinned: false,
    expiredPending: false,
    /* Global stats (никогда не сбрасываются) */
    globalFullListenCount: 0,
    globalListenSeconds: 0,
    /* Cache info */
    cachedQuality: null,   /* 'hi' | 'lo' | null */
    cachedComplete: 0,     /* 0..100 */
    needsReCache: false,
    downloading: false,
    type: 'none',          /* 'pinned' | 'cloud' | 'transient' | 'dynamic' | 'fullOffline' | 'none' */
  };
}

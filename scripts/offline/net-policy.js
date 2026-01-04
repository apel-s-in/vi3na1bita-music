// scripts/offline/net-policy.js
// Единая политика сети для OFFLINE (ТЗ_НЬЮ).
// Хранилище: localStorage['offline:netPolicy:v1']
// Значения: 'wifi' | 'cellular' | 'unknown' | 'ask'
//
// Важно:
// - Unknown сеть: confirm обязателен для массовых операций (и для авто-задач, если так настроено).
// - OfflineManager использует этот модуль, чтобы решать: можно ли качать сейчас.

export const NETPOLICY_KEY = 'offline:netPolicy:v1';

export function getNetPolicy() {
  const v = String(localStorage.getItem(NETPOLICY_KEY) || 'ask').toLowerCase().trim();
  if (v === 'wifi') return 'wifi';
  if (v === 'cellular') return 'cellular';
  if (v === 'unknown') return 'unknown';
  return 'ask';
}

export function setNetPolicy(v) {
  const s = String(v || '').toLowerCase().trim();
  const next =
    (s === 'wifi' || s === 'cellular' || s === 'unknown' || s === 'ask') ? s : 'ask';
  try { localStorage.setItem(NETPOLICY_KEY, next); } catch {}
  return next;
}

export function isAllowedByNetPolicy(policy, networkStatus) {
  const p = String(policy || 'ask');
  const kind = String(networkStatus?.kind || 'unknown');

  if (p === 'wifi') return kind === 'wifi';
  if (p === 'cellular') return kind === 'wifi' || kind === 'cellular';
  if (p === 'unknown') return true;
  // ask — решение внешнее (confirm/skip)
  return true;
}

/**
 * shouldConfirmByPolicy
 * Возвращает true если по текущей политике нужно показать confirm перед загрузкой.
 *
 * ТЗ:
 * - Unknown сеть: confirm обязателен для массовых операций.
 * - Ask: всегда confirm.
 *
 * opts:
 * - isMass: boolean (массовая операция: “скачать всё”, 100% offline, updates, и т.п.)
 * - isAuto: boolean (авто-задача очереди, playback cache)
 */
export function shouldConfirmByPolicy(policy, networkStatus, opts = {}) {
  const p = String(policy || 'ask');
  const kind = String(networkStatus?.kind || 'unknown');
  const isMass = !!opts?.isMass;

  if (p === 'ask') return true;

  // Unknown сеть: confirm для массовых операций
  if (kind === 'unknown' && isMass) return true;

  return false;
}

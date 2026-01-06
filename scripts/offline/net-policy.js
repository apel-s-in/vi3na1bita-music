// scripts/offline/net-policy.js
// Net-policy (ESM) — политики сетевого доступа (ТЗ 12)

const LS_KEY = 'offline:netPolicy:v1';

const POLICIES = {
  WIFI_ONLY: 'wifi-only',
  ANY: 'any',
  ASK: 'ask'
};

const DEFAULT_POLICY = POLICIES.ANY;

function normPolicy(v) {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'wifi-only' || s === 'wifi_only' || s === 'wifionly') return POLICIES.WIFI_ONLY;
  if (s === 'ask') return POLICIES.ASK;
  if (s === 'any') return POLICIES.ANY;
  return DEFAULT_POLICY;
}

export function getNetPolicy() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return normPolicy(raw);
  } catch {
    return DEFAULT_POLICY;
  }
}

export function setNetPolicy(policy) {
  const p = normPolicy(policy);
  try {
    localStorage.setItem(LS_KEY, p);
  } catch {}
  return p;
}

/**
 * isAllowedByNetPolicy — проверяет, разрешена ли операция по текущей политике
 * @param {Object} params
 * @param {string} params.policy — текущая политика
 * @param {Object} params.net — { online, kind, saveData }
 * @param {string} params.quality — 'hi' или 'lo'
 * @param {string} params.kind — 'mass' | 'single' | 'playbackCache'
 * @param {boolean} params.userInitiated — инициировано ли пользователем
 * @returns {boolean}
 */
export function isAllowedByNetPolicy(params = {}) {
  const policy = normPolicy(params?.policy);
  const net = params?.net || {};
  const quality = String(params?.quality || 'hi').toLowerCase();
  const kind = String(params?.kind || '').toLowerCase();
  const userInitiated = !!params?.userInitiated;

  const online = net?.online !== false;
  if (!online) return false;

  // Save data mode: блокируем автоматические Hi загрузки
  if (net?.saveData === true && quality === 'hi' && !userInitiated) {
    return false;
  }

  const netKind = String(net?.kind || 'unknown').toLowerCase();
  const isWifi = netKind === 'wifi';
  const isCellular = netKind === 'cellular' || netKind === '4g' || netKind === '3g' || netKind === '2g';

  switch (policy) {
    case POLICIES.WIFI_ONLY:
      // Только WiFi разрешён
      if (isCellular) return false;
      // Unknown трактуем как разрешённое (fallback)
      return true;

    case POLICIES.ASK:
      // Если мобильная сеть + Hi + автоматическая загрузка → блокируем (UI покажет confirm)
      if (isCellular && quality === 'hi' && !userInitiated) {
        return false;
      }
      // Если мобильная + mass → блокируем
      if (isCellular && kind === 'mass' && !userInitiated) {
        return false;
      }
      return true;

    case POLICIES.ANY:
    default:
      // Всё разрешено
      return true;
  }
}

/**
 * shouldConfirmByPolicy — определяет, нужно ли показать confirm диалог
 */
export function shouldConfirmByPolicy(params = {}) {
  const policy = normPolicy(params?.policy);
  const net = params?.net || {};

  if (policy !== POLICIES.ASK) return false;

  const netKind = String(net?.kind || 'unknown').toLowerCase();
  const isCellular = netKind === 'cellular' || netKind === '4g' || netKind === '3g' || netKind === '2g';

  return isCellular;
}

export const NetPolicy = {
  WIFI_ONLY: POLICIES.WIFI_ONLY,
  ANY: POLICIES.ANY,
  ASK: POLICIES.ASK,
  get: getNetPolicy,
  set: setNetPolicy,
  isAllowed: isAllowedByNetPolicy,
  shouldConfirm: shouldConfirmByPolicy
};

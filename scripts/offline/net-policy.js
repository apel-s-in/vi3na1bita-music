// scripts/offline/net-policy.js
// Политика сети для offline-загрузок (ТЗ 11)

const LS_KEY = 'offline:netPolicy:v1';

const DEFAULT_POLICY = {
  wifiOnly: false,
  allowMobile: true,
  confirmOnMobile: false,
  saveDataBlock: true
};

export function getNetPolicy() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_POLICY };
    const j = JSON.parse(raw);
    return { ...DEFAULT_POLICY, ...j };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function setNetPolicy(next) {
  const cur = getNetPolicy();
  const merged = { ...cur, ...next };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(merged));
  } catch {}
  return merged;
}

export function isAllowedByNetPolicy(params = {}) {
  const policy = params.policy || getNetPolicy();
  const net = params.net || { online: true, kind: 'unknown', saveData: false };
  const userInitiated = !!params.userInitiated;

  if (!net.online) return false;

  if (policy.saveDataBlock && net.saveData) {
    return userInitiated;
  }

  const kind = String(net.kind || '').toLowerCase();

  if (policy.wifiOnly && kind !== 'wifi') {
    return userInitiated;
  }

  if (!policy.allowMobile && (kind === 'cellular' || kind === '4g' || kind === '3g' || kind === '2g')) {
    return userInitiated;
  }

  return true;
}

export function shouldConfirmByPolicy(params = {}) {
  const policy = params.policy || getNetPolicy();
  const net = params.net || { online: true, kind: 'unknown' };

  const kind = String(net.kind || '').toLowerCase();
  const isMobile = (kind === 'cellular' || kind === '4g' || kind === '3g' || kind === '2g');

  return !!(policy.confirmOnMobile && isMobile);
}

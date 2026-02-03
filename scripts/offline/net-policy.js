// scripts/offline/net-policy.js
// Политика сети для offline-загрузок (ТЗ 11)
// Использует централизованный Utils.getNet()

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

  // 1. Save Data Block
  if (policy.saveDataBlock && net.saveData) {
    return userInitiated;
  }

  const kind = String(net.kind || '').toLowerCase();

  // 2. WiFi Only
  if (policy.wifiOnly && kind !== 'wifi') {
    // Если требуется WiFi, а у нас cellular или unknown - блокируем фоновые
    return userInitiated;
  }

  // 3. Block Mobile
  if (!policy.allowMobile && kind === 'cellular') {
    return userInitiated;
  }

  return true;
}

export function shouldConfirmByPolicy(params = {}) {
  const policy = params.policy || getNetPolicy();
  const net = params.net || { online: true, kind: 'unknown' };

  const kind = String(net.kind || '').toLowerCase();
  
  // Если политика требует подтверждения на мобильных и мы на мобильной сети
  if (policy.confirmOnMobile && kind === 'cellular') return true;

  // Если тип сети неизвестен (Desktop/Privacy browsers), и включен строгий режим - можно тоже спросить
  // Но по умолчанию считаем unknown за wifi в Utils, так что тут оставляем только явный cellular
  return false;
}

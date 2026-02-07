// scripts/offline/net-policy.js
const LS_KEY = 'offline:netPolicy:v1';
const MODE_KEY = 'offline:mode:v1'; 

const DEFAULT_POLICY = { wifiOnly: false, allowMobile: true, confirmOnMobile: false, saveDataBlock: true };

export function getNetPolicy() {
  try { return { ...DEFAULT_POLICY, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } 
  catch { return { ...DEFAULT_POLICY }; }
}

export function setNetPolicy(next) {
  const merged = { ...getNetPolicy(), ...next };
  localStorage.setItem(LS_KEY, JSON.stringify(merged));
  return merged;
}

export function isAllowedByNetPolicy(params = {}) {
  // v1.0: R2/R3 не реализованы. Только R0/R1 — сеть разрешена по policy.
  const policy = params.policy || getNetPolicy();
  const net = params.net || { online: true, kind: 'unknown', saveData: false };
  const userInitiated = !!params.userInitiated;

  if (!net.online) return false;
  
  // В R0/R1/R2 применяем стандартные политики
  if (policy.saveDataBlock && net.saveData) return userInitiated;

  const kind = String(net.kind || '').toLowerCase();
  if (policy.wifiOnly && kind !== 'wifi') return userInitiated;
  if (!policy.allowMobile && kind === 'cellular') return userInitiated;

  return true;
}

export function shouldConfirmByPolicy(params = {}) {
  const policy = params.policy || getNetPolicy();
  const net = params.net || { online: true, kind: 'unknown' };
  return (policy.confirmOnMobile && String(net.kind).toLowerCase() === 'cellular');
}

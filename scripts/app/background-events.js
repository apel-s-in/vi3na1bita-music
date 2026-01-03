// scripts/app/background-events.js
// ESM. События сети/видимости без изменения UI.
// Использование: import { onAppEvent } from './background-events.js';

const subs = new Map();
// типы: 'net:online' | 'net:offline' | 'app:visible' | 'app:hidden'
function emit(type, payload) {
  (subs.get(type) || []).forEach(fn => { try { fn(payload); } catch {} });
}

export function onAppEvent(type, cb) {
  const arr = subs.get(type) || [];
  arr.push(cb);
  subs.set(type, arr);
  return () => {
    const a = subs.get(type) || [];
    subs.set(type, a.filter(f => f !== cb));
  };
}

// network
window.addEventListener('online', () => emit('net:online'));
window.addEventListener('offline', () => emit('net:offline'));

// visibility
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') emit('app:visible');
  else emit('app:hidden');
});

// экспорт для единообразия
export const BackgroundEvents = { on: onAppEvent };

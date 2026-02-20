/**
 * scripts/offline/offline-playback.js
 * 
 * Оптимизировано (v2.0):
 * 1. Убрано monkey-patching метода PlayerCore.load() (антипаттерн).
 * 2. Удален дублирующий ручной цикл _skipToNextAvailable. PlayerCore уже имеет 
 *    встроенный механизм тихого пропуска треков без src (url === null), 
 *    когда TrackResolver и OfflineManager сообщают о недоступности файла.
 * 3. Оставлена только строгая логика защиты PlaybackCache Window (protect/unprotect) 
 *    согласно сценариям потери сети (ТЗ R1/R2) и Сетевой политики.
 */

let _activeOffline = false;

export function initOfflinePlayback() {
  const toggle = () => _handleNetworkShift();
  
  // Реагируем на физическую сеть и на "Авиарежим" приложения
  window.addEventListener('offline', toggle);
  window.addEventListener('online', toggle);
  window.addEventListener('netPolicy:changed', toggle);
  
  // Инициализация стартового состояния
  if (document.readyState === 'complete') {
    toggle();
  } else {
    window.addEventListener('load', toggle);
  }
}

async function _handleNetworkShift() {
  // Сеть считается недоступной, если нет физического линка ИЛИ она заблокирована юзером
  const isBlocked = !navigator.onLine || (window.NetPolicy && !window.NetPolicy.isNetworkAllowed());
  
  if (isBlocked === _activeOffline) return;
  _activeOffline = isBlocked;

  const mgr = window.OfflineManager || window._offlineManagerInstance;
  
  // Защита окна PlaybackCache применяется в режимах R1 и R2 (согласно ТЗ Q.14.5)
  if (!mgr || !['R1', 'R2'].includes(mgr.getMode())) return;

  try {
    const { protectWindow, unprotectWindow } = await import('../app/playback-cache-bootstrap.js');
    if (_activeOffline) {
      protectWindow();
    } else {
      unprotectWindow();
    }
  } catch (err) {
    console.warn('[OfflinePlayback] failed to toggle window protection', err);
  }
}

export default { initOfflinePlayback };

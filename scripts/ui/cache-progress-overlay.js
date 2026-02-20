/**
 * scripts/ui/cache-progress-overlay.js
 * ОПТИМИЗИРОВАНО: Полное соответствие ТЗ (Раздел 13 "UI ПРОГРЕСС КЭША В ПЛЕЕРЕ").
 * Устаревший плавающий overlay удален. Индикация кэширования теперь встроена
 * вторым слоем (background) напрямую под ползунок прогресс-бара плеера.
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _layer = null;

export function initCacheProgressOverlay() {
  const sync = () => requestAnimationFrame(updateProgressBar);
  
  // Подписываемся на все события, способные изменить статус локального файла или UI плеера
  ['player:trackChanged', 'offline:downloadStart', 'offline:trackCached', 'offline:downloadFailed', 'offline:stateChanged', 'offline:uiChanged'].forEach(ev => 
    window.addEventListener(ev, sync)
  );
  
  // Удаление старого (legacy) всплывающего окна, если оно закэшировалось в старом DOM
  document.getElementById('cache-progress-overlay')?.remove();
}

async function updateProgressBar() {
  const bar = document.getElementById('player-progress-bar');
  if (!bar) return;

  // Если слой еще не создан ИЛИ плеер был перерисован (isConnected === false), создаем заново
  if (!_layer || !_layer.isConnected) {
    _layer = document.createElement('div');
    _layer.className = 'player-cache-layer';
    bar.insertBefore(_layer, bar.firstChild); // Вставляем строго ПОД основной ползунок

    // Изолированно добавляем нужные стили, не ломая main.css
    if (!document.getElementById('cache-layer-styles')) {
      const s = document.createElement('style');
      s.id = 'cache-layer-styles';
      s.textContent = `
        .player-cache-layer {
          position: absolute; inset: 0 auto auto 0; height: 100%;
          background: rgba(255, 255, 255, 0.2); border-radius: 3px;
          pointer-events: none; transition: width 0.3s ease, opacity 0.3s;
          width: 0%; opacity: 0; z-index: 0;
        }
        .player-cache-layer.is-loading {
          background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.05) 100%);
          background-size: 200% 100%; animation: cacheAnim 1.5s infinite linear;
          width: 100%; opacity: 1;
        }
        .player-progress-fill { position: relative; z-index: 1; } /* Гарантируем, что синий бар всегда сверху */
        @keyframes cacheAnim { to { background-position: -200% 0; } }
      `;
      document.head.appendChild(s);
    }
  }

  const uid = window.playerCore?.getCurrentTrackUid?.();
  if (!uid) {
    _layer.style.opacity = '0';
    _layer.classList.remove('is-loading');
    return;
  }

  const state = await getOfflineManager().getTrackOfflineState(uid);

  if (state.cachedComplete) {
    // 100% = Трек полностью загружен (Pinned, Cloud или отработал R1 PlaybackCache)
    _layer.style.width = '100%';
    _layer.style.opacity = '1';
    _layer.classList.remove('is-loading');
    _layer.style.background = 'rgba(255,255,255,0.2)'; 
  } else if (state.downloading) {
    // Трек в процессе загрузки (анимированный indeterminate-индикатор)
    _layer.classList.add('is-loading');
    _layer.style.background = ''; // Возвращаем градиент из CSS-класса
  } else {
    // Трека нет в кэше и не предвидится (стриминг без R1)
    _layer.style.opacity = '0';
    _layer.classList.remove('is-loading');
  }
}

export default { initCacheProgressOverlay };

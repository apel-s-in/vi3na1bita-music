// scripts/ui/sleep.js
// Таймер сна с визуальным обратным отсчётом

(function SleepTimerModule() {
  'use strict';

  const w = window;
  
  let sleepMenu = null;
  let updateInterval = null;

  const PRESETS = [
    { label: '5 минут', minutes: 5 },
    { label: '10 минут', minutes: 10 },
    { label: '15 минут', minutes: 15 },
    { label: '30 минут', minutes: 30 },
    { label: '1 час', minutes: 60 },
    { label: '2 часа', minutes: 120 }
  ];

  function initSleepTimer() {
    const btn = document.getElementById('sleep-timer-btn');
    if (!btn) {
      setTimeout(initSleepTimer, 100);
      return;
    }

    btn.addEventListener('click', toggleSleepMenu);

    // Подписка на событие таймера от PlayerCore
    if (w.playerCore) {
      w.playerCore.on({
        onSleepTriggered: () => {
          w.NotificationSystem?.info('⏰ Таймер сна сработал');
          clearSleepTimer();
        }
      });
    }

    // Восстановление таймера после перезагрузки
    restoreSleepTimer();

    console.log('✅ Sleep timer initialized');
  }

  function toggleSleepMenu(e) {
    if (sleepMenu) {
      closeSleepMenu();
      return;
    }

    openSleepMenu(e.currentTarget);
  }

  function openSleepMenu(anchor) {
    sleepMenu = document.createElement('div');
    sleepMenu.className = 'sleep-menu';

    const items = [];

    // Текущий таймер
    const targetTs = w.playerCore?.getSleepTimerTarget?.() || 0;
    if (targetTs > 0) {
      items.push(`
        <div class="sleep-menu-item active" data-action="cancel">
          ✅ Активен: ${formatRemainingTime(targetTs)}
        </div>
        <div class="sleep-menu-item" data-action="clear">
          🚫 Выключить
        </div>
        <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 6px 0;"></div>
      `);
    }

    // Пресеты
    PRESETS.forEach(preset => {
      items.push(`
        <div class="sleep-menu-item" data-minutes="${preset.minutes}">
          ${preset.label}
        </div>
      `);
    });

    sleepMenu.innerHTML = items.join('');
    anchor.appendChild(sleepMenu);

    // Обработчики
    sleepMenu.querySelectorAll('.sleep-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSleepMenuClick(item);
      });
    });

    // Закрытие при клике вне меню
    setTimeout(() => {
      document.addEventListener('click', closeSleepMenuOutside);
    }, 10);
  }

  function closeSleepMenu() {
    if (sleepMenu && sleepMenu.parentNode) {
      sleepMenu.parentNode.removeChild(sleepMenu);
    }
    sleepMenu = null;
    document.removeEventListener('click', closeSleepMenuOutside);
  }

  function closeSleepMenuOutside(e) {
    if (sleepMenu && !sleepMenu.contains(e.target)) {
      closeSleepMenu();
    }
  }

  function handleSleepMenuClick(item) {
    const action = item.dataset.action;
    const minutes = parseInt(item.dataset.minutes);

    if (action === 'clear') {
      clearSleepTimer();
      closeSleepMenu();
      w.NotificationSystem?.info('⏰ Таймер сна выключен');
      return;
    }

    if (Number.isFinite(minutes) && minutes > 0) {
      setSleepTimer(minutes);
      closeSleepMenu();
      w.NotificationSystem?.success(`⏰ Таймер: ${minutes} мин`);
    }
  }

  function setSleepTimer(minutes) {
    if (!w.playerCore) return;

    const ms = minutes * 60 * 1000;
    w.playerCore.setSleepTimer(ms);

    // Сохранить в localStorage для восстановления
    try {
      localStorage.setItem('sleepTimerTarget', String(Date.now() + ms));
    } catch {}

    updateBadge();
    startUpdateInterval();
  }

  function clearSleepTimer() {
    if (w.playerCore) {
      w.playerCore.clearSleepTimer();
    }

    try {
      localStorage.removeItem('sleepTimerTarget');
    } catch {}

    stopUpdateInterval();
    updateBadge();
  }

  function restoreSleepTimer() {
    try {
      const saved = localStorage.getItem('sleepTimerTarget');
      if (!saved) return;

      const targetTs = parseInt(saved);
      const remaining = targetTs - Date.now();

      if (remaining > 0) {
        w.playerCore?.setSleepTimer(remaining);
        updateBadge();
        startUpdateInterval();
        console.log(`⏰ Sleep timer restored: ${Math.round(remaining / 60000)} min`);
      } else {
        localStorage.removeItem('sleepTimerTarget');
      }
    } catch {}
  }

  function updateBadge() {
    const badge = document.getElementById('sleep-timer-badge');
    if (!badge) return;

    const targetTs = w.playerCore?.getSleepTimerTarget?.() || 0;

    if (targetTs > 0) {
      const remaining = targetTs - Date.now();
      const minutes = Math.ceil(remaining / 60000);
      
      badge.textContent = minutes > 0 ? minutes : '';
      badge.style.display = minutes > 0 ? '' : 'none';
    } else {
      badge.style.display = 'none';
    }
  }

  function startUpdateInterval() {
    stopUpdateInterval();
    
    updateInterval = setInterval(() => {
      updateBadge();
      
      // Проверка истечения таймера
      const targetTs = w.playerCore?.getSleepTimerTarget?.() || 0;
      if (targetTs > 0 && targetTs <= Date.now()) {
        clearSleepTimer();
      }
    }, 10000); // Обновление каждые 10 секунд
  }

  function stopUpdateInterval() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  function formatRemainingTime(targetTs) {
    const remaining = targetTs - Date.now();
    const minutes = Math.ceil(remaining / 60000);
    
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}ч ${mins}м` : `${hours}ч`;
    }
    
    return `${minutes}м`;
  }

  // Публичный API
  w.SleepTimer = {
    setSleepTimer,
    clearSleepTimer,
    updateBadge
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSleepTimer);
  } else {
    initSleepTimer();
  }

  console.log('✅ Sleep timer module loaded');
})();

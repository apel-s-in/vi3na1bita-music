// scripts/ui/sleep.js (ESM)
// Логика таймера сна.

(function(){
  let sleepTimerId = null;
  let remainingTime = 0;
  let intervalId = null;

  function openSleepMenu() {
    const menu = document.getElementById('sleep-menu');
    if (menu) menu.classList.toggle('active');
  }

  function closeSleepMenu() {
    const menu = document.getElementById('sleep-menu');
    if (menu) menu.classList.remove('active');
  }
  
  function updateTimerBadge() {
    const badge = document.getElementById('sleep-timer-badge');
    const btn = document.getElementById('sleep-timer-btn');
    if(!badge || !btn) return;

    if(sleepTimerId) {
        btn.classList.add('active');
        badge.style.display = 'block';
        badge.textContent = `${Math.ceil(remainingTime / 60)}`;
    } else {
        btn.classList.remove('active');
        badge.style.display = 'none';
    }
  }

  function setSleepTimer(minutes) {
    cancelSleepTimer();
    closeSleepMenu();
    if (minutes === 0) return;

    remainingTime = minutes * 60;
    
    sleepTimerId = setTimeout(() => {
      window.playerCore?.stop();
      const overlay = document.getElementById('sleep-overlay');
      if(overlay) overlay.classList.add('active');
      cancelSleepTimer(); // Очистить после срабатывания
    }, remainingTime * 1000);

    intervalId = setInterval(() => {
        remainingTime--;
        updateTimerBadge();
        if(remainingTime <= 0) {
            clearInterval(intervalId);
        }
    }, 1000);
    
    updateTimerBadge();
    window.NotificationSystem?.info(`😴 Таймер сна установлен на ${minutes} минут`);
  }

  function cancelSleepTimer() {
    if (sleepTimerId) {
      clearTimeout(sleepTimerId);
      sleepTimerId = null;
    }
    if(intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    remainingTime = 0;
    updateTimerBadge();
  }

  function extendSleepTimer() {
      const overlay = document.getElementById('sleep-overlay');
      if(overlay) overlay.classList.remove('active');
      setSleepTimer(15); // Продлить на 15 минут
  }
  
  function closeSleepOverlay(){
      const overlay = document.getElementById('sleep-overlay');
      if(overlay) overlay.classList.remove('active');
  }

  // Export
  window.openSleepMenu = openSleepMenu;
  window.closeSleepMenu = closeSleepMenu;
  window.setSleepTimer = setSleepTimer;
  window.cancelSleepTimer = cancelSleepTimer;
  window.extendSleepTimer = extendSleepTimer;
  window.closeSleepOverlay = closeSleepOverlay;
})();

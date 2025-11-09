// scripts/ui/sleep.js (ESM)
// Вынос таймера сна UI из index.html с мостом window.UISleep + глобальные совместимые функции.

function updateSleepTimerUI() {
  const btn = document.getElementById('sleep-timer-btn');
  const badge = document.getElementById('sleep-timer-badge');
  const sleepTimerTarget = window.sleepTimerTarget || null;
  if (!sleepTimerTarget) {
    btn && btn.classList.remove('active');
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
    return;
  }
  btn && btn.classList.add('active');
  const minsLeft = Math.max(0, Math.ceil((sleepTimerTarget - Date.now()) / 60000));
  if (badge) { badge.style.display = ''; badge.textContent = String(minsLeft); }
}

function clearSleepTimer() {
  try { window.playerCore && window.playerCore.clearSleepTimer(); } catch {}
  window.sleepTimerTarget = null;
  if (window.sleepTimerInterval) { try { clearInterval(window.sleepTimerInterval); } catch {} window.sleepTimerInterval = null; }
  updateSleepTimerUI();
  hideSleepOverlay();
  try { window.NotificationSystem && window.NotificationSystem.info('Таймер сна выключен'); } catch {}
}

function showTimePickerForSleep() {
  closeSleepMenu();
  const val = prompt('Через сколько минут выключить воспроизведение?', '30');
  const mins = parseInt(val, 10);
  if (Number.isFinite(mins) && mins > 0) {
    setSleepTimer(mins);
  }
}

function checkSleepTimer() {
  const sleepTimerTarget = window.sleepTimerTarget || null;
  if (!sleepTimerTarget) return;
  const now = Date.now();
  const msLeft = sleepTimerTarget - now;

  if (msLeft <= 0) {
    // PlayerCore поставит на паузу и вызовет onSleepTriggered
    clearSleepTimer();
    return;
  }

  if (!window.ultraEcoEnabled && msLeft <= 10000 && !document.querySelector('#sleep-overlay')) {
    showSleepOverlay();
  }
  updateSleepTimerUI();
}

function showSleepOverlay() {
  let ov = document.getElementById('sleep-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'sleep-overlay';
    ov.className = 'sleep-overlay active';
    ov.innerHTML = `
      <div class="sleep-content">
        <div class="sleep-icon">😴</div>
        <div class="sleep-title">Скоро пауза</div>
        <div class="sleep-message">Воспроизведение будет приостановлено по таймеру сна.</div>
        <div class="sleep-buttons">
          <button class="sleep-btn sleep-btn-secondary" onclick="cancelSleepOverlay()">Отмена</button>
          <button class="sleep-btn sleep-btn-primary" onclick="confirmSleepOverlay()">Оставить</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  } else {
    ov.classList.add('active');
  }
}

function hideSleepOverlay() {
  const ov = document.getElementById('sleep-overlay');
  if (ov) ov.remove();
}

function cancelSleepOverlay() {
  clearSleepTimer();
  hideSleepOverlay();
}

function confirmSleepOverlay() {
  // Ничего не делаем — таймер продолжится
  hideSleepOverlay();
}

function toggleSleepMenu() {
  const menu = document.getElementById('sleep-menu');
  if (!menu) return;
  menu.classList.toggle('active');
  if (menu.classList.contains('active')) {
    setTimeout(() => document.addEventListener('click', closeSleepMenu), 100);
  }
}

function closeSleepMenu(e) {
  if (e && e.target && e.target.closest && e.target.closest('#sleep-timer-btn')) return;
  const el = document.getElementById('sleep-menu');
  if (el) el.classList.remove('active');
  document.removeEventListener('click', closeSleepMenu);
}

function setSleepTimer(minutes) {
  closeSleepMenu();
  if (minutes === 'off') {
    clearSleepTimer();
    return;
  }
  const ms = minutes * 60 * 1000;
  try { window.playerCore && window.playerCore.setSleepTimer(ms); } catch {}
  window.sleepTimerTarget = Date.now() + ms;
  updateSleepTimerUI();
  if (window.sleepTimerInterval) { try { clearInterval(window.sleepTimerInterval); } catch {} }
  window.sleepTimerInterval = setInterval(checkSleepTimer, 1000);
}

// Экспорт фасада и глобал‑совместимость
window.UISleep = {
  updateSleepTimerUI,
  clearSleepTimer,
  showTimePickerForSleep,
  checkSleepTimer,
  showSleepOverlay,
  hideSleepOverlay,
  toggleSleepMenu,
  setSleepTimer
};

// Проброс глобальных имён (до удаления inline onclick)
window.updateSleepTimerUI = updateSleepTimerUI;
window.clearSleepTimer = clearSleepTimer;
window.showTimePickerForSleep = showTimePickerForSleep;
window.checkSleepTimer = checkSleepTimer;
window.showSleepOverlay = showSleepOverlay;
window.hideSleepOverlay = hideSleepOverlay;
window.toggleSleepMenu = toggleSleepMenu;
window.setSleepTimer = setSleepTimer;
window.cancelSleepOverlay = cancelSleepOverlay;
window.confirmSleepOverlay = confirmSleepOverlay;

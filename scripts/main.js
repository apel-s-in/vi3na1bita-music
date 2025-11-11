// scripts/main.js - Точка входа приложения

// Динамическая загрузка Howler.js с CDN
function loadHowler() {
  if (window.Howl) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Загрузка всех модулей приложения
async function loadAppModules() {
  const modules = [
    // UI-модули (визуал)
    './ui/notify.js',
    './ui/gallery.js',
    './ui/lyrics-runtime.js',
    './ui/sleep.js',
    './ui/modals.js',
    './ui/tracks.js',
    './ui/mini.js',
    './ui/offline.js',
    './ui/sysinfo.js',
    
    // Модули логики приложения
    './app/albums.js',
    './app/player-controls.js',
    './ui/favorites.js', // ИСПРАВЛЕН ПУТЬ
    './app/downloads.js',
    './app/navigation.js',
    './app/pwa.js',
    './energy.js',

    // Модули-связки
    './core/bridge.js',
    './core/bootstrap.js',
    './player-adapter.js',
    './ui/bindings.js',
  ];

  for (const path of modules) {
    try {
      await import(path);
    } catch (e) {
      console.error(`Failed to load module: ${path}`, e);
    }
  }
}

// Главная функция инициализации
async function main() {
  try {
    await loadHowler();
  } catch (e) {
    console.error('CRITICAL: Failed to load Howler.js. Player will not work.', e);
    alert('Не удалось загрузить аудиоплеер. Пожалуйста, проверьте интернет-соединение и перезагрузите страницу.');
    return;
  }

  await loadAppModules();

  // После загрузки всех модулей запускаем основную логику, которая раньше была в `window.onload`
  try {
    if (typeof window.initializeMainUi === 'function') {
      const passed = localStorage.getItem('promoPassed') === '1';
      if (passed) {
        document.getElementById('promocode-block')?.classList.add('hidden');
        document.getElementById('main-block')?.classList.remove('hidden');
        window.initializeMainUi();
      } else {
         const promo = document.getElementById('promocode-block');
         if (promo) promo.style.display = 'flex';
      }
    }
  } catch(e) {
    console.error("Failed to run main UI initialization:", e);
  }
}

// Запускаем все после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

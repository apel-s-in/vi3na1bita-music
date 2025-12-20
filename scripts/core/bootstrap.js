// scripts/core/bootstrap.js — Инициализация
(async function() {
  'use strict';
  
  console.log('🚀 Bootstrapping...');
  
  // Проверка совместимости
  const missing = [];
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch { missing.push('LocalStorage'); }
  if (typeof fetch === 'undefined') missing.push('Fetch');
  if (typeof Promise === 'undefined') missing.push('Promises');
  
  if (missing.length) {
    document.body.innerHTML = `<div style="position:fixed;inset:0;background:#181818;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px"><div><h1 style="color:#E80100">⚠️ Браузер не поддерживается</h1><p>Требуются: ${missing.join(', ')}</p></div></div>`;
    return;
  }
  
  // Ждём Howler.js
  let tries = 0;
  while (typeof Howl === 'undefined' && tries++ < 50) await new Promise(r => setTimeout(r, 100));
  if (typeof Howl === 'undefined') {
    console.error('❌ Howler.js не загружен');
    return;
  }
  
  // Платформа
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) document.body.classList.add('ios');
  if (window.matchMedia('(display-mode: standalone)').matches) document.body.classList.add('standalone');
  
  // Загрузка albums.json
  try {
    const r = await fetch('./albums.json', { cache: 'no-cache' });
    const d = await r.json();
    window.albumsIndex = d?.albums || [];
    console.log(`✅ Albums: ${window.albumsIndex.length}`);
  } catch (e) {
    console.error('❌ albums.json:', e);
    window.albumsIndex = [];
  }
  
  // Глобальная обработка ошибок
  window.addEventListener('error', e => console.error('💥', e.error || e.message));
  window.addEventListener('unhandledrejection', e => console.error('💥', e.reason));
  
  console.log('✅ Bootstrap complete');
})();

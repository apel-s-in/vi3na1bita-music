// scripts/player-adapter.js (ESM)
// Адаптер LocalStorage ↔ PlayerCore: первичная инициализация громкости/режимов
// и реакция на изменения LocalStorage (best-effort). Никаких UI-зависимостей.

function initWhenReady() {
  const pc = window.playerCore;
  if (!pc) {
    setTimeout(initWhenReady, 50);
    return;
  }
  try {
    // Применим сохранённые режимы
    const repeat = localStorage.getItem('repeatMode') === '1';
    const shuffle = localStorage.getItem('shuffleMode') === '1';
    pc.setRepeat(!!repeat);
    pc.setShuffle(!!shuffle);

    // Громкость
    const savedVolumeRaw = localStorage.getItem('playerVolume');
    const savedVolume = parseFloat(savedVolumeRaw);
    if (Number.isFinite(savedVolume)) pc.setVolume(savedVolume);

    // Флаг «только избранные» — применится к текущему плейлисту (если есть)
    const favsOnly = localStorage.getItem('favoritesOnlyMode') === '1';
    pc.setFavoritesOnly(!!favsOnly, []); // список индексов будет подставляться UI при смене альбома
  } catch {}
}

// Слежение за внешними изменениями LocalStorage (если открыто несколько вкладок)
window.addEventListener('storage', (e) => {
  const pc = window.playerCore;
  if (!pc) return;
  try {
    if (e.key === 'repeatMode') pc.setRepeat(e.newValue === '1');
    if (e.key === 'shuffleMode') pc.setShuffle(e.newValue === '1');
    if (e.key === 'playerVolume') {
      const v = parseFloat(e.newValue || '1');
      if (Number.isFinite(v)) pc.setVolume(v);
    }
    if (e.key === 'favoritesOnlyMode') {
      const on = e.newValue === '1';
      // Без списка индексов — просто включим флаг; UI актуализирует позже
      pc.setFavoritesOnly(on, []);
    }
  } catch {}
});

function installAutoSave(pc) {
  let last = 0;
  const throttleMs = 5000;
  pc.on({
    onTick: (pos, dur) => {
      const now = Date.now();
      if (now - last >= throttleMs) {
        last = now;
        try {
          localStorage.setItem('pc:pos', String(Math.floor(pos || 0)));
          localStorage.setItem('pc:dur', String(Math.floor(dur || 0)));
          localStorage.setItem('pc:index', String(pc.getIndex ? pc.getIndex() : 0));
        } catch {}
      }
    },
    onTrackChange: () => {
      try { localStorage.setItem('pc:index', String(pc.getIndex ? pc.getIndex() : 0)); } catch {}
    }
  });
}

initWhenReady();
(function waitAndInstall(){
  const pc = window.playerCore;
  if (!pc) { setTimeout(waitAndInstall, 50); return; }
  try { installAutoSave(pc); } catch {}
})();


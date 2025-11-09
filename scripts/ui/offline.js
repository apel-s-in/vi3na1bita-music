// scripts/ui/offline.js (ESM)
// Вынос оффлайн UI/операций c мостом window.UIOffline + глобальные совместимые функции.

function createOfflineUiExtras() {
  const container = document.querySelector('.bottom-controls-center');
  if (!container) return;
  if (!document.getElementById('offline-progress-el')) {
    const prog = document.createElement('div');
    prog.id = 'offline-progress-el';
    prog.className = 'offline-progress';
    prog.innerHTML = '<div class="offline-progress-bar" id="offline-progress-bar" style="width:0%"></div>';
    container.appendChild(prog);
  }
  if (!document.getElementById('offline-desc-el')) {
    const desc = document.createElement('div');
    desc.id = 'offline-desc-el';
    desc.className = 'offline-desc';
    desc.textContent = 'Доступно офлайн: выключено';
    container.appendChild(desc);
  }
}

function setOfflineUIState(state) {
  createOfflineUiExtras();
  const btn = document.getElementById('offline-btn');
  const desc = document.getElementById('offline-desc-el');
  if (state === 'offline') {
    btn && btn.classList.remove('online');
    btn && btn.classList.add('offline');
    if (btn) btn.textContent = 'OFFLINE';
    if (desc) desc.textContent = 'Доступно офлайн: включено';
  } else {
    btn && btn.classList.remove('offline');
    btn && btn.classList.add('online');
    if (btn) btn.textContent = 'ONLINE';
    if (desc) desc.textContent = 'Доступно офлайн: выключено';
  }
}

function syncOfflineState() {
  const ls = localStorage.getItem('offlineMode') === '1';
  window.offlineMode = ls;
  setOfflineUIState(ls ? 'offline' : 'online');
  initOfflineProfileMenu(); // гарантируем меню профилей
}

// ---- Профили OFFLINE ----
function getOfflineProfile() {
  const p = localStorage.getItem('offlineProfile') || 'favorites-webp';
  return p;
}
function setOfflineProfile(p) {
  localStorage.setItem('offlineProfile', String(p || 'favorites-webp'));
  try { if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'OFFLINE_SET_PROFILE', profile: p }); } catch {}
  try { window.NotificationSystem && window.NotificationSystem.info(`Офлайн‑профиль: ${p}`); } catch {}
}

function buildOfflineProfileMenuEl() {
  const menu = document.createElement('div');
  menu.id = 'offline-profile-menu';
  menu.style.cssText = 'position:absolute; z-index:9999; background: var(--modal-bg); border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:8px; display:none; box-shadow:0 6px 24px rgba(0,0,0,.4);';
  const cur = getOfflineProfile();
  const mk = (value, label) => `<div class="profile-item" data-value="${value}" style="padding:8px 10px; border-radius:8px; cursor:pointer; ${cur===value?'background:rgba(255,255,255,.08);':''}">${label}${cur===value?' ✓':''}</div>`;
  menu.innerHTML = [
    '<div style="font-weight:800; font-size:.95em; margin:4px 6px 6px;">Офлайн‑профиль</div>',
    mk('favorites-webp', '⭐ Избранные + webp галерей'),
    mk(`album-current`, 'Текущий альбом (все треки)'),
  ].join('');
  menu.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const item = t.closest('.profile-item');
    if (!item) return;
    const val = item.getAttribute('data-value');
    if (!val) return;
    setOfflineProfile(val);
    hideOfflineProfileMenu();
  });
  document.body.appendChild(menu);
  return menu;
}
function showOfflineProfileMenu(anchor) {
  const menu = document.getElementById('offline-profile-menu') || buildOfflineProfileMenuEl();
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.min(window.innerWidth - 220, Math.max(10, rect.left))}px`;
  menu.style.top  = `${rect.bottom + 6}px`;
  menu.style.display = 'block';
  const onDoc = (ev) => {
    const t = ev.target instanceof Element ? ev.target : null;
    if (!t) return;
    if (!t.closest('#offline-profile-menu') && !t.closest('#offline-btn')) {
      hideOfflineProfileMenu();
    }
  };
  document.addEventListener('click', onDoc, { once: true });
}
function hideOfflineProfileMenu() {
  const menu = document.getElementById('offline-profile-menu');
  if (menu) menu.style.display = 'none';
}
function initOfflineProfileMenu() {
  const btn = document.getElementById('offline-btn');
  if (!btn || btn.__profileMenuReady) return;
  btn.__profileMenuReady = true;
  // Правый клик — открыть меню
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showOfflineProfileMenu(btn);
  });
  // Alt‑клик — тоже открыть меню
  btn.addEventListener('click', (e) => {
    if (e && (e.altKey || e.metaKey)) {
      e.preventDefault();
      showOfflineProfileMenu(btn);
    }
  });
  // Долгое касание (мобайл)
  let touchTimer = null;
  btn.addEventListener('touchstart', () => { touchTimer = setTimeout(() => showOfflineProfileMenu(btn), 600); }, { passive: true });
  btn.addEventListener('touchend',   () => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } }, { passive: true });
  // Экспорт отладочной функции
  window.openOfflineProfileMenu = () => showOfflineProfileMenu(btn);
}

async function buildOfflineResourceListForCurrentView() {
  const out = new Set();
  // Базовые файлы приложения
  ['.', './index.html', './manifest.json', './service-worker.js'].forEach(x => out.add(new URL(x, location.href).toString()));

  // Текущий альбом или «избранное»
  if (window.viewMode === 'album' && window.config) {
    out.add(new URL('config.json', window.albumBase + '/').toString());
    (window.config.tracks || []).forEach(t => {
      if (t.audio) out.add(t.audio);
      if (t.lyrics) out.add(t.lyrics);
      if (t.fulltext) out.add(t.fulltext);
    });

    // Центральная галерея (локальная)
    try {
      const id = window.centralIdForAlbumKey && window.centralIdForAlbumKey(window.currentAlbumKey);
      if (id) {
        out.add(new URL(`./albums/gallery/${id}/index.json`, location.href).toString());
        if (Array.isArray(window.coverGalleryArr)) {
          window.coverGalleryArr.forEach(it => {
            if (it.type === 'img') {
              if (it.formats?.webp) out.add(it.formats.webp);
              if (it.formats?.full) out.add(it.formats.full);
              if (it.src) out.add(it.src);
            } else if (it.type === 'html') {
              out.add(it.src);
            }
          });
        }
      }
    } catch {}
  } else if (window.viewMode === 'favorites' && Array.isArray(window.favoritesRefsModel)) {
    for (const it of window.favoritesRefsModel) {
      if (!it.__active) continue;
      if (it.audio) out.add(it.audio);
      if (it.lyrics) out.add(it.lyrics);
      if (it.fulltext) out.add(it.fulltext);
    }
  }

  // Иконки/картинки интерфейса
  ['img/logo.png','img/star.png','img/star2.png'].forEach(p => out.add(new URL(p, location.href).toString()));
  return Array.from(out);
}

// Оффлайн «Мини»: все избранные треки (всех альбомов) + все webp галерей
async function buildOfflineFavoritesAndGalleriesList() {
  const out = new Set();
  // База UI
  ['.', './index.html', './manifest.json', './service-worker.js',
   './img/logo.png','./img/star.png','./img/star2.png'
  ].forEach(x => out.add(new URL(x, location.href).toString()));

  // Избранные по всем альбомам
  const likesMap = (function(){
    try { return JSON.parse(localStorage.getItem('likedTracks:v2')) || {}; } catch { return {}; }
  })();
  const albumKeys = Object.keys(likesMap);
  for (const akey of albumKeys) {
    const liked = Array.isArray(likesMap[akey]) ? likesMap[akey] : [];
    if (!liked.length) continue;
    const cfg = await (window.getAlbumConfigByKey ? window.getAlbumConfigByKey(akey) : Promise.resolve(null));
    if (!cfg || !Array.isArray(cfg.tracks)) continue;
    liked.forEach(i => {
      const t = cfg.tracks[i];
      if (!t) return;
      if (t.audio) out.add(t.audio);
      if (t.lyrics) out.add(t.lyrics);
      if (t.fulltext) out.add(t.fulltext);
    });
  }

  // Все центральные галереи (webp)
  async function collectAllGalleryWebpUrls() {
    const ids = window.CENTRAL_ALLOWED_IDS ? Array.from(window.CENTRAL_ALLOWED_IDS) : [];
    for (const id of ids) {
      try {
        const baseDir = `./albums/gallery/${id}/`;
        out.add(new URL(baseDir + 'index.json', location.href).toString());
        const r = await fetch(baseDir + 'index.json', { cache: 'force-cache' });
        if (!r.ok) continue;
        const j = await r.json();
        const items = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
        for (const raw of items) {
          const norm = window.normalizeGalleryItem ? window.normalizeGalleryItem(raw, baseDir) : null;
          if (norm && norm.type === 'img') {
            if (norm.formats?.webp) out.add(norm.formats.webp);
          }
        }
      } catch {}
    }
  }
  await collectAllGalleryWebpUrls();

  return Array.from(out);
}

async function offlineUIClick() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    try { window.NotificationSystem && window.NotificationSystem.warning('Service Worker недоступен'); } catch {}
    return;
  }
  if (window.offlineDownloading) {
    try { window.NotificationSystem && window.NotificationSystem.info('Уже идёт подготовка офлайн-данных...'); } catch {}
    return;
  }

  window.offlineMode = !window.offlineMode;
  try { localStorage.setItem('offlineMode', window.offlineMode ? '1' : '0'); } catch {}
  setOfflineUIState(window.offlineMode ? 'offline' : 'online');

  const reg = await navigator.serviceWorker.ready.catch(()=>null);
  if (!reg || !reg.active) return;

  if (window.offlineMode) {
    // Определяем профиль
    const profile = getOfflineProfile();
    try { reg.active.postMessage({ type: 'OFFLINE_SET_PROFILE', profile }); } catch {}

    // Список ресурсов в зависимости от профиля
    let resources = [];
    if (profile === 'album-current' || profile.startsWith('album')) {
      try { resources = await buildOfflineResourceListForCurrentView(); } catch { resources = []; }
      try { window.NotificationSystem && window.NotificationSystem.info('ОФФЛАЙН: будет доступен текущий альбом (и связанные данные).'); } catch {}
    } else {
      resources = await buildOfflineFavoritesAndGalleriesList();
      try { window.NotificationSystem && window.NotificationSystem.info('ОФФЛАЙН: ⭐ избранные треки и webp‑галереи будут доступны без интернета.'); } catch {}
    }

    reg.active.postMessage({ type: 'OFFLINE_CACHE_ADD', resources });
    try { if (reg.sync && reg.sync.register) { await reg.sync.register('offline-favorites-cache'); } } catch {}
    try { window.NotificationSystem && window.NotificationSystem.info(`Кэшируем офлайн (${resources.length} файлов)...`); } catch {}
    window.offlineDownloading = true;
  } else {
    reg.active.postMessage({ type: 'OFFLINE_CACHE_CLEAR_CURRENT' });
    try { window.NotificationSystem && window.NotificationSystem.info('Офлайн-кэш очищается...'); } catch {}
  }
}

// SW: прогресс оффлайна
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', ev => {
    const msg = ev.data || {};
    if (msg.type === 'OFFLINE_PROGRESS') {
      createOfflineUiExtras();
      const bar = document.getElementById('offline-progress-bar');
      if (bar && typeof msg.percent === 'number') {
        bar.style.width = `${Math.max(0, Math.min(100, msg.percent))}%`;
      }
    }
    if (msg.type === 'OFFLINE_DONE') {
      window.offlineDownloading = false;
      try { window.NotificationSystem && window.NotificationSystem.success('Офлайн-кэш готов!'); } catch {}
    }
    if (msg.type === 'OFFLINE_ERROR') {
      window.offlineDownloading = false;
      try { window.NotificationSystem && window.NotificationSystem.error('Ошибка кэширования офлайн'); } catch {}
    }
  });
}

// Экспорт фасада и глобал‑совместимость
window.UIOffline = {
  createOfflineUiExtras,
  setOfflineUIState,
  syncOfflineState,
  offlineUIClick,
  buildOfflineFavoritesAndGalleriesList,
  buildOfflineResourceListForCurrentView
};

window.createOfflineUiExtras = createOfflineUiExtras;
window.setOfflineUIState = setOfflineUIState;
window.syncOfflineState = syncOfflineState;
window.offlineUIClick = offlineUIClick;
window.buildOfflineFavoritesAndGalleriesList = buildOfflineFavoritesAndGalleriesList;
window.buildOfflineResourceListForCurrentView = buildOfflineResourceListForCurrentView;

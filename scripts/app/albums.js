// scripts/app/albums.js (ESM)
// Блок «Альбомы/иконки»: сборка и переключение иконок альбомов, загрузка индекса.
// Экспортирует функции в window.* для совместимости.

(function(){
  function isMobileUA() {
    try { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); } catch { return false; }
  }
  function albumByKey(key) {
    try { return (Array.isArray(window.albumsIndex) ? window.albumsIndex : []).find(a => a.key === key) || null; } catch { return null; }
  }
  function resolveRealAlbumKey(iconKey) {
    const ICON_KEY_ALIASES = window.ICON_KEY_ALIASES || {};
    if (albumByKey(iconKey)) return iconKey;
    const aliases = ICON_KEY_ALIASES[iconKey] || [];
    for (const k of aliases) if (albumByKey(k)) return k;
    const titleMap = window.ICON_TITLE_MAP || {};
    const expectedTitle = titleMap[iconKey];
    if (expectedTitle) {
      const found = (window.albumsIndex || []).find(a => String(a.title).toLowerCase().includes(expectedTitle.toLowerCase()));
      if (found) return found.key;
    }
    return null;
  }

  function buildAlbumIcons(){
    const box = document.getElementById('album-icons'); 
    if (!box) return;

    const order = window.ICON_ALBUMS_ORDER || [];
    const isMob = isMobileUA();
    const html = order.map(it=>{
      let dataKey = it.key;
      if (it.key !== window.SPECIAL_FAVORITES_KEY && it.key !== window.SPECIAL_RELIZ_KEY) {
        const real = resolveRealAlbumKey(it.key);
        dataKey = real || '__unknown__';
      }
      const title = it.title || '';
      const baseIcon = it.icon || 'img/logo.png';
      const path1x = isMob
        ? baseIcon.replace(/icon_album\/(.+)\.png$/i, 'icon_album/mobile/$1@1x.jpg')
        : baseIcon.replace(/\.png$/i, '@1x.png');
      const path2x = isMob
        ? path1x.replace(/@1x\.jpg$/i, '@2x.jpg')
        : path1x.replace(/@1x\.png$/i, '@2x.png');

      return `<div class="album-icon" data-akey="${dataKey}" data-icon="${it.key}" title="${title}">
        <img loading="lazy" src="${path1x}" srcset="${path2x} 2x" alt="${title}" width="60" height="60">
      </div>`;
    }).join('');

    box.innerHTML = html;
    box.querySelectorAll('.album-icon').forEach(el=>{
      el.onclick = ()=> window.onAlbumIconClick && window.onAlbumIconClick(el.getAttribute('data-akey'));
    });

    window.setActiveAlbumIcon && window.setActiveAlbumIcon(window.currentAlbumKey || document.getElementById('album-select')?.value || ((window.albumsIndex||[])[0]?.key || ''));
  }

  // Проброс (используем реализации из index.html, если они уже есть; здесь обеспечиваем наличие buildAlbumIcons)
  window.isMobileUA = window.isMobileUA || isMobileUA;
  window.albumByKey = window.albumByKey || albumByKey;
  window.resolveRealAlbumKey = window.resolveRealAlbumKey || resolveRealAlbumKey;
  window.buildAlbumIcons = window.buildAlbumIcons || buildAlbumIcons;

  // Базовая загрузка индекса (fallback), если в index.html не переопределено
  window.loadAlbumsIndex = window.loadAlbumsIndex || (async function loadAlbumsIndex(){
    try {
      const r = await fetch('./albums.json', { cache:'no-cache' });
      const j = await r.json();
      window.albumsIndex = Array.isArray(j.albums) ? j.albums : [];
      if (!window.albumsIndex.length) throw new Error('empty index');
    } catch(e) {
      window.albumsIndex = (window.ALBUMS_FALLBACK || []).slice();
    }
    const sel = document.getElementById('album-select');
    if (sel) sel.innerHTML = (window.albumsIndex || []).map(a => `<option value="${a.key}">${a.title}</option>`).join('');
    window.buildAlbumIcons && window.buildAlbumIcons();
  });
})();

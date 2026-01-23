// scripts/app/albums/render.js
// Чистый рендер: title / socials / tracklist / icons.
// Никаких сетевых загрузок и никакого воспроизведения.

export function buildAlbumIconSrc(key) {
  // Оставляем поведение как было: иконка альбома по ключу.
  // Если у тебя был иной путь — просто синхронизируй здесь.
  return `img/album-icons/${key}.png`;
}

export function renderAlbumTitle(title, typeClass = '') {
  const el = document.getElementById('album-title');
  if (!el) return;
  el.textContent = title || '';
  if (typeClass) el.setAttribute('data-album-type', typeClass);
  else el.removeAttribute('data-album-type');
}

export function renderSocials(socials = []) {
  const box = document.getElementById('social-links');
  if (!box) return;

  box.innerHTML = '';
  const list = Array.isArray(socials) ? socials : [];
  for (const it of list) {
    const url = String(it?.url || '').trim();
    if (!url) continue;

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'social-link';
    a.textContent = String(it?.label || it?.title || 'link');
    box.appendChild(a);
  }
}

export function renderTrackList(tracks = [], { onRowClick, buildRow } = {}) {
  const list = document.getElementById('track-list');
  if (!list) return;

  list.innerHTML = '';

  const arr = Array.isArray(tracks) ? tracks : [];
  for (const t of arr) {
    const row = (typeof buildRow === 'function')
      ? buildRow(t)
      : defaultBuildRow(t);

    if (!row) continue;

    if (typeof onRowClick === 'function') {
      row.addEventListener('click', (e) => onRowClick(e, t, row));
    }

    list.appendChild(row);
  }
}

function defaultBuildRow(t) {
  const row = document.createElement('div');
  row.className = 'track';

  const uid = String(t?.uid || '').trim();
  if (uid) row.dataset.uid = uid;

  row.innerHTML = `
    <div class="track-num">${t?.num ?? ''}</div>
    <div class="track-title">${String(t?.title || '')}</div>
    <div class="track-actions"></div>
  `;
  return row;
}

export function renderAlbumIcons(albums = [], { onClick } = {}) {
  const wrap = document.getElementById('albums');
  if (!wrap) return;

  wrap.innerHTML = '';
  const arr = Array.isArray(albums) ? albums : [];

  for (const a of arr) {
    const key = String(a?.key || '').trim();
    if (!key) continue;

    const btn = document.createElement('button');
    btn.className = 'album-icon';
    btn.dataset.akey = key;
    btn.title = String(a?.title || key);

    const img = document.createElement('img');
    img.alt = btn.title;
    img.src = a?.icon || buildAlbumIconSrc(key);

    btn.appendChild(img);

    if (typeof onClick === 'function') {
      btn.addEventListener('click', () => onClick(a));
    }

    wrap.appendChild(btn);
  }
}

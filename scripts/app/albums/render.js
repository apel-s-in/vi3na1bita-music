// scripts/app/albums/render.js
// Чистый рендер: title / socials / tracklist / icons.
// Никаких сетевых загрузок и никакого воспроизведения.

const esc = (s) => {
  const fn = window.Utils?.escapeHtml;
  return typeof fn === 'function' ? fn(String(s ?? '')) : String(s ?? '');
};

export function renderAlbumTitle(title, modifier = '') {
  const el = document.getElementById('active-album-title');
  if (!el) return;

  el.textContent = String(title || '');
  el.className = 'active-album-title';
  if (modifier) el.classList.add(String(modifier));
}

export function renderSocials(links = []) {
  const container = document.getElementById('social-links');
  if (!container) return;

  container.innerHTML = '';

  const list = Array.isArray(links) ? links : [];
  for (const link of list) {
    const url = String(link?.url || '').trim();
    if (!url) continue;

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = String(link?.label || link?.title || 'Ссылка');
    container.appendChild(a);
  }
}

/**
 * renderTrackList(tracks, { rowTemplate })
 * rowTemplate(track, index) => string (HTML одного .track)
 *
 * ВАЖНО: rowTemplate должен сохранять текущую разметку 1:1
 * (e2e/подсветка/индикаторы/звёзды).
 */
export function renderTrackList(tracks = [], opts = {}) {
  const container = document.getElementById('track-list');
  if (!container) return;

  const list = Array.isArray(tracks) ? tracks : [];
  const rowTemplate = typeof opts?.rowTemplate === 'function' ? opts.rowTemplate : null;

  if (!rowTemplate) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = list.map((t, i) => rowTemplate(t, i)).join('');
}

/**
 * renderAlbumIcons(items, { onClick })
 * items: Array<{ key, title, icon: {p1,p2} }>
 *
 * ВАЖНО:
 * - контейнер: #album-icons
 * - элементы: .album-icon
 * - data-album + data-akey должны быть и одинаковыми (e2e)
 */
export function renderAlbumIcons(items = [], opts = {}) {
  const container = document.getElementById('album-icons');
  if (!container) return;

  container.innerHTML = '';

  const list = Array.isArray(items) ? items : [];
  const onClick = typeof opts?.onClick === 'function' ? opts.onClick : null;

  for (const it of list) {
    const key = String(it?.key || '').trim();
    if (!key) continue;

    const title = String(it?.title || '');
    const p1 = String(it?.icon?.p1 || '').trim();
    const p2 = String(it?.icon?.p2 || '').trim();

    const el = document.createElement('div');
    el.className = 'album-icon';
    el.dataset.album = key;
    el.dataset.akey = key;
    el.title = title;

    const srcset = p2 ? ` srcset="${esc(p2)} 2x"` : '';
    el.innerHTML = `<img src="${esc(p1)}"${srcset} alt="${esc(title)}" draggable="false" loading="lazy" width="60" height="60">`;

    if (onClick) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(key);
      });
    }

    container.appendChild(el);
  }
}

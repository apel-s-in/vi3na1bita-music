// scripts/ui/news-inline.js
// Рендер новостей внутри основного приложения (альбом __reliz__).
// Только UI/fetch, не трогает воспроизведение.

import { renderNewsCard } from './news-renderer.js';

export function renderNewsInlineSkeleton(container) {
  if (!container) return;

  container.innerHTML = `
    <div class="news-inline__head">
      <div class="news-inline__links">
        <a href="https://t.me/vitrina_razbita" target="_blank" rel="noopener noreferrer">Telegram канал</a>
        <span class="news-inline__dot">·</span>
        <a href="./news.html" target="_blank" rel="noopener noreferrer">Страница новостей</a>
      </div>
      <div id="news-inline-status" class="news-inline__status">Загрузка...</div>
    </div>
    <div id="news-inline-list" class="news-inline__list"></div>
  `;
}

export async function loadAndRenderNewsInline(container) {
  if (!container) return;

  renderNewsInlineSkeleton(container);

  const status = container.querySelector('#news-inline-status');
  const list = container.querySelector('#news-inline-list');
  if (!list) return;

  try {
    const r = await fetch('./news/news.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const j = await r.json();
    const items = Array.isArray(j?.items) ? j.items : [];

    if (!items.length) {
      if (status) status.textContent = 'Пока новостей нет';
      return;
    }

    if (status) status.style.display = 'none';
    list.innerHTML = items.map(renderNewsCard).join('');
  } catch {
    if (status) {
      status.textContent = 'Не удалось загрузить новости';
      status.classList.add('news-inline__status--error');
    }
  }
}

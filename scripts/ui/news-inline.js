// scripts/ui/news-inline.js
// Рендер новостей внутри основного приложения (альбом __reliz__).
// Только UI/fetch, не трогает воспроизведение.

const esc = (s) => {
  const fn = window.Utils?.escapeHtml;
  return typeof fn === 'function' ? fn(String(s ?? '')) : String(s ?? '');
};

function renderCard(it) {
  const title = esc(it?.title || 'Новость');
  const date = esc(it?.date || '');
  const text = esc(it?.text || '');
  const tags = Array.isArray(it?.tags) ? it.tags : [];

  const media = it?.embedUrl
    ? `<div class="news-inline__media"><iframe loading="lazy" src="${esc(it.embedUrl)}" allowfullscreen></iframe></div>`
    : it?.image
      ? `<div class="news-inline__media"><img loading="lazy" src="${esc(it.image)}" alt=""></div>`
      : it?.video
        ? `<div class="news-inline__media"><video controls preload="metadata" src="${esc(it.video)}"></video></div>`
        : '';

  const tagHtml = tags.length
    ? `<div class="news-inline__tags">${tags.map((t) => `<span class="news-inline__tag">#${esc(t)}</span>`).join('')}</div>`
    : '';

  return `
    <article class="news-inline__card">
      <div class="news-inline__title">${title}</div>
      ${date ? `<div class="news-inline__date">${date}</div>` : ''}
      ${media}
      ${text ? `<div class="news-inline__text">${text}</div>` : ''}
      ${tagHtml}
    </article>
  `;
}

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
    list.innerHTML = items.map(renderCard).join('');
  } catch {
    if (status) {
      status.textContent = 'Не удалось загрузить новости';
      status.classList.add('news-inline__status--error');
    }
  }
}

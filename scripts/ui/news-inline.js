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

  const media = it?.youtubeUrl
    ? `
      <div class="news-inline__media news-inline__media--youtube">
        <a
          class="news-inline__youtube-link"
          href="${esc(it.youtubeUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="${title}"
        >
          ${it.youtubeThumb ? `<img loading="lazy" src="${esc(it.youtubeThumb)}" alt="${title}" onerror="this.style.display='none';this.parentElement.classList.add('news-inline__youtube-link--fallback')">` : ''}
          <span class="news-inline__youtube-fallback-title">${title}</span>
          <span class="news-inline__youtube-play">▶</span>
        </a>
      </div>
    `
    : it?.image
      ? `<div class="news-inline__media"><img loading="lazy" src="${esc(it.image)}" alt="${title}"></div>`
      : it?.video
        ? `<div class="news-inline__media"><video controls preload="metadata" src="${esc(it.video)}"></video></div>`
        : '';

  const actions = it?.youtubeUrl
    ? `
      <div class="news-inline__actions">
        <a
          class="news-inline__action-link"
          href="${esc(it.youtubeUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >Смотреть на YouTube</a>
      </div>
    `
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
      ${actions}
      ${tagHtml}
    </article>
  `;
}

export function renderNewsInlineSkeleton(container) {
  if (!container) return;

  container.innerHTML = `
    <div class="news-inline__head">
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
    const j = window.Utils?.fetchCache?.getJson
      ? await window.Utils.fetchCache.getJson({
          key: 'news:inline:v1',
          url: './news/news.json',
          ttlMs: 300000,
          store: 'session',
          fetchInit: { cache: 'force-cache' }
        })
      : await fetch('./news/news.json', { cache: 'force-cache' }).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        });
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

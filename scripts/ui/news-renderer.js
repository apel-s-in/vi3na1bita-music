// scripts/ui/news-renderer.js
// Единый рендер карточек новостей для inline-страницы (app).
// Только HTML-генерация, не трогает воспроизведение.

const esc = (s) => window.Utils.escapeHtml(String(s ?? ''));

export function renderNewsCard(it) {
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

const esc = s => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
const renderCard = (it) => {
  const t = esc(it?.title || 'Новость'), m = it?.youtubeUrl ? `<div class="news-inline__media news-inline__media--youtube"><a class="news-inline__youtube-link" href="${esc(it.youtubeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${t}">${it.youtubeThumb ? `<img loading="lazy" src="${esc(it.youtubeThumb)}" alt="${t}" onerror="this.style.display='none';this.parentElement.classList.add('news-inline__youtube-link--fallback')">` : ''}<span class="news-inline__youtube-fallback-title">${t}</span><span class="news-inline__youtube-play">▶</span></a></div>` : (it?.image ? `<div class="news-inline__media"><img loading="lazy" src="${esc(it.image)}" alt="${t}"></div>` : (it?.video ? `<div class="news-inline__media"><video controls preload="metadata" src="${esc(it.video)}"></video></div>` : ''));
  return `<article class="news-inline__card"><div class="news-inline__title">${t}</div>${it?.date ? `<div class="news-inline__date">${esc(it.date)}</div>` : ''}${m}${it?.text ? `<div class="news-inline__text">${esc(it.text)}</div>` : ''}${it?.youtubeUrl ? `<div class="news-inline__actions"><a class="news-inline__action-link" href="${esc(it.youtubeUrl)}" target="_blank" rel="noopener noreferrer">Смотреть на YouTube</a></div>` : ''}${it?.tags?.length ? `<div class="news-inline__tags">${it.tags.map(tag => `<span class="news-inline__tag">#${esc(tag)}</span>`).join('')}</div>` : ''}</article>`;
};

export const renderNewsInlineSkeleton = c => { if (c) c.innerHTML = `<div class="news-inline__head"><div id="news-inline-status" class="news-inline__status">Загрузка...</div></div><div id="news-inline-list" class="news-inline__list"></div>`; };
export const loadAndRenderNewsInline = async c => {
  if (!c) return; renderNewsInlineSkeleton(c);
  const st = c.querySelector('#news-inline-status'), lst = c.querySelector('#news-inline-list'); if (!lst) return;
  try {
    const j = window.Utils?.fetchCache?.getJson ? await window.Utils.fetchCache.getJson({ key: 'news:inline:v1', url: './news/news.json', ttlMs: 300000, store: 'session', fetchInit: { cache: 'force-cache' } }) : await fetch('./news/news.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : { items: [] });
    if (!j?.items?.length) { if (st) st.textContent = 'Пока новостей нет'; return; }
    if (st) st.style.display = 'none'; lst.innerHTML = j.items.map(renderCard).join('');
  } catch { if (st) { st.textContent = 'Не удалось загрузить новости'; st.classList.add('news-inline__status--error'); } }
};

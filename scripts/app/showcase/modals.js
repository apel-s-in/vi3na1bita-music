export function openShowcaseSheetModal({
  title = '',
  subtitle = '',
  fromSearch = false,
  inPlaylist = false,
  hiddenLabel = '',
  favoriteLabel = '',
  onAction
} = {}) {
  const bg = document.createElement('div');
  bg.className = 'sc-bottom-sheet-bg';
  bg.innerHTML = `<div class="sc-bottom-sheet"><button class="sc-sheet-close">×</button><div class="sc-sheet-title">${title}</div><div class="sc-sheet-sub">${subtitle}</div>
    ${fromSearch ? `<button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><hr class="sc-sheet-sep">` : ''}
    <button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>
    ${inPlaylist ? `<button class="sc-sheet-btn sc-sheet-btn--danger" id="bm-rm">✖ Удалить из плейлиста</button>` : ''}
    <button class="sc-sheet-btn" id="bm-eye">${hiddenLabel}</button>
    <button class="sc-sheet-btn" id="bm-fv">${favoriteLabel}</button>
    <button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Офлайн</button>
    <button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3</button>
    <button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button>
    <button class="sc-sheet-btn" id="bm-sh">📸 Поделиться (Карточка)</button>
    <button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button>
    <button class="sc-sheet-btn sc-sheet-btn--cancel" id="bm-cx">Отмена</button></div>`;

  document.body.appendChild(bg);
  requestAnimationFrame(() => bg.classList.add('active'));

  const close = () => {
    bg.classList.remove('active');
    setTimeout(() => bg.remove(), 200);
  };

  bg.querySelector('.sc-sheet-close')?.addEventListener('click', close);
  bg.addEventListener('click', e => {
    const act = e.target.id;
    if (e.target === bg || act === 'bm-cx') return close();
    if (!act) return;
    close();
    onAction?.(act);
  });

  return { el: bg, close };
}

export function openShowcaseAddToPlaylistModal({ playlists, esc, onPick, modalApi }) {
  if (!playlists?.length) return null;
  const m = modalApi?.open?.({
    title: 'Добавить в плейлист',
    bodyHtml: `<div class="sc-playlist-pick">${playlists.map(p => `<button class="showcase-btn" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>`
  });
  if (!m) return null;
  m.onclick = ev => {
    const b = ev.target.closest('[data-pid]');
    if (!b) return;
    onPick?.(b.dataset.pid, m);
  };
  return m;
}

export function openShowcaseSortModal({ currentSort, options, onPick, modalApi }) {
  const body = `<div class="sc-sort-grid">${options.map(([v, l]) => `<button class="showcase-btn ${currentSort === v ? 'active' : ''} ${v === 'user' ? 'sc-sort-grid-full' : ''}" data-val="${v}">${l}</button>`).join('')}</div>`;
  const m = modalApi?.open?.({ title: 'Сортировка', bodyHtml: body });
  if (!m) return null;
  m.onclick = e => {
    const b = e.target.closest('[data-val]');
    if (!b) return;
    onPick?.(b.dataset.val, m);
  };
  return m;
}

export function openShowcaseSharedPlaylistConfirm({ raw, trk, esc, createPlaylist, notify, modalApi }) {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(String(raw).trim()))));
    if (!d?.n || !Array.isArray(d?.u)) throw 1;
    const u = d.u.filter(trk), miss = d.u.length - u.length;
    modalApi?.confirm?.({
      title: '🎵 Вам прислан плейлист',
      textHtml: `<b>${esc(d.n)}</b><br><br>Доступно треков: ${u.length} из ${d.u.length}.${miss > 0 ? '<br><span class="sc-shared-warn">Часть треков недоступна.</span>' : ''}`,
      confirmText: 'Добавить',
      cancelText: 'Отмена',
      onConfirm: () => createPlaylist(u, false, `${d.n} (Присланный)`)
    });
  } catch {
    notify?.error?.('Ошибка чтения ссылки');
  }
}

export function openShowcasePaletteModal({ title, items, value, resetText, onPick, modalHelper }) {
  return modalHelper?.({
    title,
    items,
    value,
    resetText,
    onPick
  }) || null;
}

export default {
  openShowcaseSheetModal,
  openShowcaseAddToPlaylistModal,
  openShowcaseSortModal,
  openShowcaseSharedPlaylistConfirm,
  openShowcasePaletteModal
};

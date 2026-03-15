export function openShowcaseSheet({
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
    ${fromSearch ? `<button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><hr style="border-color:rgba(255,255,255,.08);margin:8px 0">` : ''}
    <button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>
    ${inPlaylist ? `<button class="sc-sheet-btn" id="bm-rm" style="color:#ff6b6b">✖ Удалить из плейлиста</button>` : ''}
    <button class="sc-sheet-btn" id="bm-eye">${hiddenLabel}</button>
    <button class="sc-sheet-btn" id="bm-fv">${favoriteLabel}</button>
    <button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Офлайн</button>
    <button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3</button>
    <button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button>
    <button class="sc-sheet-btn" id="bm-sh">📸 Поделиться (Карточка)</button>
    <button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button>
    <button class="sc-sheet-btn" id="bm-cx" style="color:#888;justify-content:center">Отмена</button></div>`;

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

export default { openShowcaseSheet };

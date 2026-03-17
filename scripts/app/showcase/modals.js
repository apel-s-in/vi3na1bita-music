// UID.038_(Track profile modal)_(сделать showcase вторичной точкой входа в умные карточки)_(showcase-specific windows могут открывать track/intel/profile surfaces, но не владеть semantic logic)
// UID.056_(Recommendation reasons)_(подготовить modals showcase к reason-aware подаче)_(bottom-sheet и sort/share/pick modals позже смогут принимать reason/explainer fragments извне)
// UID.068_(Public playlist analytics)_(сделать модалки витрины частью social/discovery surface)_(share/import/public playlist confirmations должны быть отмечены как analytics touchpoints)
// UID.080_(Provider actions bridge)_(не тащить external provider logic прямо в showcase modal helpers)_(любые provider/social actions приходят как callbacks через bridge, а не реализуются здесь)
// UID.082_(Local truth vs external telemetry split)_(showcase modal actions не должны сами экспортировать raw data)_(наружу только mapper-safe события из внешнего orchestration слоя)
// UID.094_(No-paralysis rule)_(showcase modal helpers обязаны жить без intel/social/provider слоя)_(эти функции — чистые UI hosts с optional callbacks)
// UID.095_(Ownership boundary: legacy vs intel)_(showcase modals — secondary semantic/social modal surface, но не новый ShowcaseManager)_(этот файл только рендерит showcase-специфичные окна и не владеет rec/semantic/business logic)
export const openShowcaseSheetModal = ({ title: t = '', subtitle: s = '', fromSearch: fS = false, inPlaylist: iP = false, hiddenLabel: hL = '', favoriteLabel: fL = '', onAction: oA } = {}) => {
  const bg = document.createElement('div'); bg.className = 'sc-bottom-sheet-bg';
  bg.innerHTML = `<div class="sc-bottom-sheet"><button class="sc-sheet-close">×</button><div class="sc-sheet-title">${t}</div><div class="sc-sheet-sub">${s}</div>${fS ? `<button class="sc-sheet-btn" id="bm-play">▶ Воспроизвести</button><hr class="sc-sheet-sep">` : ''}<button class="sc-sheet-btn" id="bm-pl">➕ Добавить в плейлист</button>${iP ? `<button class="sc-sheet-btn sc-sheet-btn--danger" id="bm-rm">✖ Удалить из плейлиста</button>` : ''}<button class="sc-sheet-btn" id="bm-eye">${hL}</button><button class="sc-sheet-btn" id="bm-fv">${fL}</button><button class="sc-sheet-btn" id="bm-of">🔒 Скачать / Офлайн</button><button class="sc-sheet-btn" id="bm-dl">⬇️ Сохранить mp3</button><button class="sc-sheet-btn" id="bm-st">📊 Статистика трека</button><button class="sc-sheet-btn" id="bm-sh">📸 Поделиться (Карточка)</button><button class="sc-sheet-btn" id="bm-cl">🎨 Цвет альбома</button><button class="sc-sheet-btn sc-sheet-btn--cancel" id="bm-cx">Отмена</button></div>`;
  document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('active'));
  const cl = () => { bg.classList.remove('active'); setTimeout(() => bg.remove(), 200); };
  bg.querySelector('.sc-sheet-close')?.addEventListener('click', cl);
  bg.addEventListener('click', e => { const a = e.target.id; if (e.target === bg || a === 'bm-cx') return cl(); if (a) { cl(); oA?.(a); } }); return { el: bg, close: cl };
};
export const openShowcaseAddToPlaylistModal = ({ playlists: p, esc, onPick: oP, modalApi: mA }) => {
  if (!p?.length) return null; const m = mA?.open?.({ title: 'Добавить в плейлист', bodyHtml: `<div class="sc-playlist-pick">${p.map(x => `<button class="showcase-btn" data-pid="${x.id}">${esc(x.name)}</button>`).join('')}</div>` });
  if (m) m.addEventListener('click', e => { const b = e.target.closest('[data-pid]'); if (b) oP?.(b.dataset.pid, m); }); return m;
};
export const openShowcaseSortModal = ({ currentSort: cS, options: o, onPick: oP, modalApi: mA }) => {
  const m = mA?.open?.({ title: 'Настройки списка', bodyHtml: `<div class="sc-sort-grid">${o.map(([v, l]) => `<button class="showcase-btn ${cS === v ? 'active' : ''} ${v === 'user' ? 'sc-sort-grid-full' : ''}" data-val="${v}">${l}</button>`).join('')}</div>` });
  if (m) m.addEventListener('click', e => { const b = e.target.closest('[data-val]'); if (b) oP?.(b.dataset.val, m); }); return m;
};
export const openShowcaseSharedPlaylistConfirm = ({ raw: r, trk: t, esc, createPlaylist: cP, notify: n, modalApi: mA }) => {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(String(r).trim())))); if (!d?.n || !Array.isArray(d?.u)) throw 1;
    const u = d.u.filter(t), m = d.u.length - u.length;
    mA?.confirm?.({ title: '🎵 Вам прислан плейлист', textHtml: `<b>${esc(d.n)}</b><br><br>Доступно треков: ${u.length} из ${d.u.length}.${m > 0 ? '<br><span class="sc-shared-warn">Часть треков недоступна.</span>' : ''}`, confirmText: 'Добавить', cancelText: 'Отмена', onConfirm: () => cP(u, false, `${d.n} (Присланный)`) });
  } catch { n?.error?.('Ошибка чтения ссылки'); }
};
export const openShowcasePaletteModal = ({ title: t, items: i, value: v, resetText: r, onPick: o, modalHelper: m }) => m?.({ title: t, items: i, value: v, resetText: r, onPick: o }) || null;
export default { openShowcaseSheetModal, openShowcaseAddToPlaylistModal, openShowcaseSortModal, openShowcaseSharedPlaylistConfirm, openShowcasePaletteModal };

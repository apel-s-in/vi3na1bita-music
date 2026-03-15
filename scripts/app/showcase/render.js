export function renderShowcaseHeader({ edit, query, sortMode, resetAble, dirty, esc }) {
  return `<div class="showcase-header-controls">
    ${edit ? `<div class="showcase-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<div class="sc-edit-actions"><button class="showcase-btn sc-btn-save sc-btn-save-ok">💾 Сохранить</button><button class="showcase-btn sc-btn-create sc-btn-create-accent">✨ Создать</button><button class="showcase-btn sc-btn-reset ${dirty ? '' : 'sc-btn-disabled'} sc-btn-reset-warn" ${dirty ? '' : 'disabled'}>↺ Сброс</button><button class="showcase-btn sc-btn-exit sc-btn-exit-danger">✕ Выйти</button></div></div>` : ''}
    <div class="showcase-search-wrap"><input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему каталогу..." value="${esc(query)}"><button type="button" class="showcase-search-clear" id="sc-search-clear" ${query ? '' : 'hidden'}>✕</button></div>
    ${!edit ? `<div class="showcase-btns-row"><button class="showcase-btn sc-btn-edit">✏️ Редактировать</button>${resetAble ? `<button class="showcase-btn sc-btn-master-reset sc-btn-half">↺ Сброс</button>` : ''}<button class="showcase-btn sc-btn-sort">↕️ ${sortMode !== 'user' ? '●' : ''} Сортировка</button></div><div class="showcase-btns-row"><button class="showcase-btn sc-btn-playall">▶ Играть всё</button><button class="showcase-btn sc-btn-shuffle">🔀 Перемешать</button></div>` : ''}
    <div class="showcase-playlists-actions" id="sc-playlists-actions"></div>
    <div class="showcase-playlists-list" id="sc-playlists"></div>
    <div class="showcase-status-bar" id="sc-status"></div>
  </div><div id="sc-tracks-container"></div>`;
}

export function renderShowcaseRow({ track, index, options, esc, albumTitle, renderFavoriteStar, isFavorite }) {
  const o = options || {};
  const cls = ['showcase-track', o.isH ? 'inactive' : '', o.srh ? 'sc-search-result' : '', o.chk ? 'selected' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-uid="${track.uid}" data-hidden="${o.isH ? '1' : '0'}" style="border-left:3px solid ${o.col || 'transparent'}">
    <div class="tnum" ${o.sN ? '' : 'hidden'}>${index + 1}.</div>
    <img src="${track.cover}" class="showcase-track-thumb" loading="lazy">
    <div class="track-title"><div>${esc(track.title)}</div><div class="showcase-track-meta">${esc(albumTitle(track.sourceAlbum))}${o.bdg ? ` ${o.bdg}` : ''}</div></div>
    ${o.srh ? `<input type="checkbox" class="sc-search-chk" data-uid="${track.uid}" ${o.chk ? 'checked' : ''}>` : `<span class="offline-ind" data-uid="${track.uid}">🔒</span>${renderFavoriteStar(!!isFavorite(track.uid), `data-uid="${track.uid}" data-album="${track.sourceAlbum}"`)}`}
    <button class="showcase-track-menu-btn" data-uid="${track.uid}">···</button>
  </div>`;
}

export function renderShowcaseNormal({ box, uids, hiddenSet, ui, colors, buildTrack, hi, setStatus, esc, albumTitle, renderFavoriteStar, isFavorite, injectOfflineIndicators }) {
  let html = '', grp = null;
  uids.forEach((uid, i) => {
    const t = buildTrack(uid);
    if (!t) return;
    if (ui.viewMode === 'grouped' && grp !== t.sourceAlbum) {
      grp = t.sourceAlbum;
      html += `<div class="showcase-group-header">── ${esc(albumTitle(t.sourceAlbum))} ──</div>`;
    }
    html += renderShowcaseRow({ track: t, index: i, options: { isH: hiddenSet?.has(uid), sN: ui.showNumbers, col: colors[t.sourceAlbum] || 'transparent' }, esc, albumTitle, renderFavoriteStar, isFavorite });
  });
  box.innerHTML = html || '<div class="fav-empty">Треки не найдены</div>';
  injectOfflineIndicators?.(box);
  hi?.();
  setStatus?.(uids.length, false);
}

export function renderShowcaseSearch({ box, res, ctxOrder, ctxHidden, selected, buildTrack, setSelectionBar, setStatus, esc, albumTitle, renderFavoriteStar, isFavorite }) {
  const set = new Set(ctxOrder || []);
  let html = `<div class="sc-search-info">Найдено: ${res.length} треков по всему приложению</div>`;
  res.forEach((uid, i) => {
    const t = buildTrack(uid);
    if (!t) return;
    const inCtx = set.has(uid), isH = !!ctxHidden?.has(uid);
    const bdg = inCtx ? (isH ? '<span class="sc-badge sc-badge-hidden">скрыт</span>' : '<span class="sc-badge sc-badge-active">уже есть</span>') : '<span class="sc-badge sc-badge-missing">добавить?</span>';
    html += renderShowcaseRow({ track: t, index: i, options: { srh: true, chk: selected.has(uid), bdg, isH }, esc, albumTitle, renderFavoriteStar, isFavorite });
  });
  box.innerHTML = html || '<div class="fav-empty">Ничего не найдено</div>';
  setSelectionBar?.();
  setStatus?.(res.length, true);
}

export function renderShowcaseEdit({ box, uids, draft, buildTrack, esc, albumTitle, setSelectionBar, setStatus, bindDrag }) {
  box.innerHTML = uids.map(uid => {
    const t = buildTrack(uid);
    if (!t) return '';
    const isH = draft.hid.has(uid), chk = draft.chk.has(uid), meta = `${esc(albumTitle(t.sourceAlbum))}${isH ? ' · неактивен' : ''}`;
    return `<div class="showcase-track sc-edit-row ${isH ? 'inactive' : ''} ${chk ? 'selected' : ''}" data-uid="${uid}" data-hidden="${isH ? '1' : '0'}" draggable="true">
      <button class="sc-arrow-up">▲</button>
      <div class="showcase-drag-handle">⠿</div>
      <input type="checkbox" class="sc-chk" ${chk ? 'checked' : ''}>
      <img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
      <div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${meta}</div></div>
      <button class="sc-eye-btn" title="Показать/Скрыть">${isH ? '🙈' : '👁'}</button>
      <button class="sc-arrow-down">▼</button>
    </div>`;
  }).join('') || '<div class="fav-empty">Нет треков</div>';
  bindDrag?.(box);
  setSelectionBar?.();
  setStatus?.(uids.length, false);
}

export function renderShowcaseStatus({ root, count, isSearch, ctx, ui, trackExists, checkedCount }) {
  if (!root) return;
  const ord = (ctx?.order || []).filter(trackExists);
  const hid = new Set(ctx?.hidden || []);
  const total = ord.length, hidden = ord.filter(u => hid.has(u)).length;
  root.innerHTML = `<span>📋 ${isSearch ? `${count} найдено` : `${total} всего · ${total - hidden} активных · ${hidden} скрытых`}${checkedCount ? `<span class="sc-status-checked"> · ✓ ${checkedCount}</span>` : ''}</span><span class="sc-status-toggles"><span id="sc-tg-hidden" class="sc-status-toggle sc-status-toggle--icon" title="Показывать скрытые">${ui.showHidden ? '👁' : '🙈'}</span><span id="sc-tg-numbers" class="sc-status-toggle sc-status-toggle--icon ${ui.showNumbers ? '' : 'sc-status-toggle--dim'}" title="Нумерация">1,2,3</span><span id="sc-tg-view" class="sc-status-toggle sc-status-toggle--icon" title="Вид">${ui.viewMode === 'flat' ? '⊞' : '⊟'}</span><span id="sc-tg-placement" class="sc-status-toggle sc-status-toggle--text" title="Скрытые в конце">${ui.hiddenPlacement === 'end' ? '↓скр' : '≡скр'}</span></span>`;
}

export function renderShowcaseSelectionBar({ selectedCount, edit, onClick }) {
  const old = document.getElementById('sc-selection-bar');
  if (old && old._scClick) old.removeEventListener('click', old._scClick);
  old?.remove();
  if (!selectedCount) return null;

  const bar = document.createElement('div');
  bar.id = 'sc-selection-bar';
  bar.className = 'showcase-sticky-bar';
  bar.innerHTML = `<span>Выбрано: ${selectedCount}</span>${!edit ? `<button type="button" class="showcase-btn sc-search-add">➕ Добавить</button>` : ''}<button type="button" class="showcase-btn sc-unified-create sc-unified-create-accent">✨ Создать</button><button type="button" class="showcase-btn sc-unified-share">📸 Карточка</button><button type="button" class="showcase-btn sc-unified-all">✓ Всё</button><button type="button" class="showcase-btn sc-unified-none">✕ Снять</button>`;
  bar.addEventListener('click', bar._scClick = onClick);
  document.body.appendChild(bar);
  return bar;
}

export function renderShowcaseSortModal({ modalApi, currentSort, options, onPick }) {
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

export default {
  renderShowcaseHeader,
  renderShowcaseRow,
  renderShowcaseNormal,
  renderShowcaseSearch,
  renderShowcaseEdit,
  renderShowcaseStatus,
  renderShowcaseSelectionBar,
  renderShowcaseSortModal
};

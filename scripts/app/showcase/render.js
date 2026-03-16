export const renderShowcaseHeader = ({ edit: e, query: q, sortMode: s, resetAble: r, dirty: d, esc }) => `
  <div class="showcase-header-controls">
    ${e ? `<div class="showcase-edit-banner">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ<div class="sc-edit-actions"><button class="showcase-btn sc-btn-save sc-btn-save-ok">💾 Сохранить</button><button class="showcase-btn sc-btn-create sc-btn-create-accent">✨ Создать</button><button class="showcase-btn sc-btn-reset ${d ? '' : 'sc-btn-disabled'} sc-btn-reset-warn" ${d ? '' : 'disabled'}>↺ Сброс</button><button class="showcase-btn sc-btn-exit sc-btn-exit-danger">✕ Выйти</button></div></div>` : ''}
    <div class="showcase-search-wrap"><input type="text" class="showcase-search" id="sc-search" placeholder="🔍 Поиск по всему каталогу..." value="${esc(q)}"><button type="button" class="showcase-search-clear" id="sc-search-clear" ${q ? '' : 'hidden'}>✕</button></div>
    ${!e ? `<div class="showcase-btns-row"><button class="showcase-btn sc-btn-edit">✏️ Редактировать</button>${r ? `<button class="showcase-btn sc-btn-master-reset sc-btn-half">↺ Сброс</button>` : ''}<button class="showcase-btn sc-btn-sort">↕️ ${s !== 'user' ? '●' : ''} Сортировка</button></div><div class="showcase-btns-row"><button class="showcase-btn sc-btn-playall">▶ Играть всё</button><button class="showcase-btn sc-btn-shuffle">🔀 Перемешать</button></div>` : ''}
    <div class="showcase-playlists-actions" id="sc-playlists-actions"></div><div class="showcase-playlists-list" id="sc-playlists"></div><div class="showcase-status-bar" id="sc-status"></div>
  </div><div id="sc-tracks-container"></div>`;

export const renderShowcaseRow = ({ track: t, index: i, options: o = {}, esc, albumTitle: aT, renderFavoriteStar: rFS, isFavorite: iF }) => `
  <div class="showcase-track ${o.isH ? 'inactive ' : ''}${o.srh ? 'sc-search-result ' : ''}${o.chk ? 'selected' : ''}" data-uid="${t.uid}" data-hidden="${o.isH ? '1' : '0'}" style="--sc-left-color:${o.col || 'transparent'}">
    <div class="tnum" ${o.sN ? '' : 'hidden'}>${i + 1}.</div><img src="${t.cover}" class="showcase-track-thumb" loading="lazy">
    <div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${esc(aT(t.sourceAlbum))}${o.bdg ? ` ${o.bdg}` : ''}</div></div>
    ${o.srh ? `<input type="checkbox" class="sc-search-chk" data-uid="${t.uid}" ${o.chk ? 'checked' : ''}>` : `<span class="offline-ind" data-uid="${t.uid}">🔒</span>${rFS(!!iF(t.uid), `data-uid="${t.uid}" data-album="${t.sourceAlbum}"`)}`}
    <button class="showcase-track-menu-btn" data-uid="${t.uid}">···</button>
  </div>`;

export const renderShowcaseNormal = ({ box, uids, hiddenSet: hS, ui, colors: c, buildTrack: bT, hi, setStatus: sS, esc, albumTitle: aT, renderFavoriteStar: rFS, isFavorite: iF, injectOfflineIndicators: iOI }) => {
  let h = '', g = null;
  uids.forEach((uid, i) => {
    const t = bT(uid); if (!t) return;
    if (ui.viewMode === 'grouped' && g !== t.sourceAlbum) h += `<div class="showcase-group-header">── ${esc(aT(g = t.sourceAlbum))} ──</div>`;
    h += renderShowcaseRow({ track: t, index: i, options: { isH: hS?.has(uid), sN: ui.showNumbers, col: c[t.sourceAlbum] || 'transparent' }, esc, albumTitle: aT, renderFavoriteStar: rFS, isFavorite: iF });
  });
  box.innerHTML = h || '<div class="fav-empty">Треки не найдены</div>';
  iOI?.(box); hi?.(); sS?.(uids.length, false);
};

export const renderShowcaseSearch = ({ box, res, ctxOrder: cO, ctxHidden: cH, selected: s, buildTrack: bT, setSelectionBar: sSB, setStatus: sS, esc, albumTitle: aT, renderFavoriteStar: rFS, isFavorite: iF }) => {
  const set = new Set(cO || []);
  let h = `<div class="sc-search-info">Найдено: ${res.length} треков по всему приложению</div>`;
  res.forEach((uid, i) => {
    const t = bT(uid); if (!t) return;
    const isH = !!cH?.has(uid);
    h += renderShowcaseRow({ track: t, index: i, options: { srh: true, chk: s.has(uid), bdg: set.has(uid) ? (isH ? '<span class="sc-badge sc-badge-hidden">скрыт</span>' : '<span class="sc-badge sc-badge-active">уже есть</span>') : '<span class="sc-badge sc-badge-missing">добавить?</span>', isH }, esc, albumTitle: aT, renderFavoriteStar: rFS, isFavorite: iF });
  });
  box.innerHTML = h || '<div class="fav-empty">Ничего не найдено</div>'; sSB?.(); sS?.(res.length, true);
};

export const renderShowcaseEdit = ({ box, uids, draft: d, buildTrack: bT, esc, albumTitle: aT, setSelectionBar: sSB, setStatus: sS, bindDrag: bD }) => {
  box.innerHTML = uids.map(uid => {
    const t = bT(uid); if (!t) return '';
    const isH = d.hid.has(uid), chk = d.chk.has(uid);
    return `<div class="showcase-track sc-edit-row ${isH ? 'inactive ' : ''}${chk ? 'selected' : ''}" data-uid="${uid}" data-hidden="${isH ? '1' : '0'}" draggable="true"><button class="sc-arrow-up">▲</button><div class="showcase-drag-handle">⠿</div><input type="checkbox" class="sc-chk" ${chk ? 'checked' : ''}><img src="${t.cover}" class="showcase-track-thumb" loading="lazy"><div class="track-title"><div>${esc(t.title)}</div><div class="showcase-track-meta">${esc(aT(t.sourceAlbum))}${isH ? ' · неактивен' : ''}</div></div><button class="sc-eye-btn" title="Показать/Скрыть">${isH ? '🙈' : '👁'}</button><button class="sc-arrow-down">▼</button></div>`;
  }).join('') || '<div class="fav-empty">Нет треков</div>';
  bD?.(box); sSB?.(); sS?.(uids.length, false);
};

export const renderShowcaseStatus = ({ root, count: c, isSearch: iS, ctx, ui, trackExists: tE, checkedCount: cC }) => {
  if (!root) return;
  const o = (ctx?.order || []).filter(tE), hS = new Set(ctx?.hidden || []), t = o.length, h = o.filter(u => hS.has(u)).length;
  root.innerHTML = `<span>📋 ${iS ? `${c} найдено` : `${t} всего · ${t - h} активных · ${h} скрытых`}${cC ? `<span class="sc-status-checked"> · ✓ ${cC}</span>` : ''}</span><span class="sc-status-toggles"><span id="sc-tg-hidden" class="sc-status-toggle sc-status-toggle--icon" title="Показывать скрытые">${ui.showHidden ? '👁' : '🙈'}</span><span id="sc-tg-numbers" class="sc-status-toggle sc-status-toggle--icon ${ui.showNumbers ? '' : 'sc-status-toggle--dim'}" title="Нумерация">1,2,3</span><span id="sc-tg-view" class="sc-status-toggle sc-status-toggle--icon" title="Вид">${ui.viewMode === 'flat' ? '⊞' : '⊟'}</span><span id="sc-tg-placement" class="sc-status-toggle sc-status-toggle--text" title="Скрытые в конце">${ui.hiddenPlacement === 'end' ? '↓скр' : '≡скр'}</span></span>`;
};

export const renderShowcaseSelectionBar = ({ selectedCount: sC, edit: e, onClick: oC }) => {
  const old = document.getElementById('sc-selection-bar');
  if (old?.removeEventListener) old.removeEventListener('click', old._scClick); old?.remove();
  if (!sC) return null;
  const b = document.createElement('div');
  b.id = 'sc-selection-bar'; b.className = 'showcase-sticky-bar';
  b.innerHTML = `<span>Выбрано: ${sC}</span>${!e ? `<button type="button" class="showcase-btn sc-search-add">➕ Добавить</button>` : ''}<button type="button" class="showcase-btn sc-unified-create sc-unified-create-accent">✨ Создать</button><button type="button" class="showcase-btn sc-unified-share">📸 Карточка</button><button type="button" class="showcase-btn sc-unified-all">✓ Всё</button><button type="button" class="showcase-btn sc-unified-none">✕ Снять</button>`;
  b.addEventListener('click', b._scClick = oC); document.body.appendChild(b);
  return b;
};

export default { renderShowcaseHeader, renderShowcaseRow, renderShowcaseNormal, renderShowcaseSearch, renderShowcaseEdit, renderShowcaseStatus, renderShowcaseSelectionBar };

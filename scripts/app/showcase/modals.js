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
export const openShowcaseSettingsModal = ({ currentSort: cS, currentUi: cU, options: o, onApply: oA, modalApi: mA }) => {
  let tS = cS, tN = !!cU?.showNumbers, tV = cU?.viewMode || 'flat', tP = cU?.hiddenPlacement || 'inline';
  const draw = bx => {
    let l = [{id:1, t:'Упала Слеза', a:'КРЕВЕツTOCHKA', h:false}, {id:2, t:'Кошки-мышки', a:'Между Злом и Добром', h:true}, {id:3, t:'Принц', a:'КРЕВЕツTOCHKA', h:false}];
    if (tS === 'name-asc') l.sort((x,y) => x.t.localeCompare(y.t));
    if (tS === 'name-desc') l.sort((x,y) => y.t.localeCompare(x.t));
    if (tS.includes('album')) l.sort((x,y) => x.a.localeCompare(y.a) || x.id - y.id);
    if (tS === 'favorites-first') l.reverse();
    if (tP === 'end') l = [...l.filter(x=>!x.h), ...l.filter(x=>x.h)];
    let h = '', cA = null;
    l.forEach((x, i) => {
      if (tV === 'grouped' && cA !== x.a) { h += `<div style="color:var(--secondary-color);font-size:10px;font-weight:800;margin-top:4px;opacity:0.9">── ${x.a} ──</div>`; cA = x.a; }
      h += `<div class="sc-set-prev-tr ${x.h ? 'h' : ''}"><span style="color:var(--secondary-color);font-weight:700;width:22px;display:${tN ? 'block' : 'none'}">${i+1}.</span><div><div style="font-weight:700;color:#eaf2ff">${x.t}</div><div style="font-size:10px;color:#888;margin-top:2px">${x.a}</div></div><div style="margin-left:auto;font-size:14px;opacity:0.5">${x.h ? '🙈' : '⭐'}</div></div>`;
    }); bx.innerHTML = h;
  };
  const m = mA?.open?.({ title: '⚙️ Настройки', maxWidth: 360, bodyHtml: `<div class="sc-set-prev" id="sc-prev"></div><div class="sc-set-sec-title">Внешний вид списка</div><div class="sc-set-tgls"><div class="sc-set-tgl ${tN?'on':''}" data-t="num">1,2,3<span class="sc-set-tgl-desc">Нумерация</span></div><div class="sc-set-tgl ${tV==='grouped'?'on':''}" data-t="view">⊞<span class="sc-set-tgl-desc">По альбомам</span></div><div class="sc-set-tgl ${tP==='end'?'on':''}" data-t="place">≡скр<span class="sc-set-tgl-desc">Скрытые вниз</span></div></div><div class="sc-set-sec-title">Сортировка треков</div><div class="sc-sort-grid" style="margin-bottom:20px">${o.map(([v, l]) => `<button class="showcase-btn ${tS === v ? 'active' : ''} ${v === 'user' ? 'sc-sort-grid-full' : ''}" data-val="${v}" style="padding:8px 10px;font-size:12px">${l}</button>`).join('')}</div><div class="om-actions"><button class="modal-action-btn" data-act="cancel">Отмена</button><button class="modal-action-btn online" data-act="apply">Применить</button></div>`});
  if (!m) return null; const bx = m.querySelector('#sc-prev'); draw(bx);
  m.addEventListener('click', e => {
    const t = e.target.closest('.sc-set-tgl'), b = e.target.closest('.showcase-btn'), a = e.target.closest('.modal-action-btn');
    if (t) { const d = t.dataset.t; if (d === 'num') { tN = !tN; t.classList.toggle('on', tN); } if (d === 'view') { tV = tV === 'flat' ? 'grouped' : 'flat'; t.classList.toggle('on', tV === 'grouped'); } if (d === 'place') { tP = tP === 'inline' ? 'end' : 'inline'; t.classList.toggle('on', tP === 'end'); } draw(bx); }
    if (b && b.dataset.val) { tS = b.dataset.val; m.querySelectorAll('.sc-sort-grid .showcase-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); draw(bx); }
    if (a) { if (a.dataset.act === 'cancel') m.remove(); if (a.dataset.act === 'apply') oA?.({ sortMode: tS, showNumbers: tN, viewMode: tV, hiddenPlacement: tP }, m); }
  }); return m;
};
export const openShowcaseSharedPlaylistConfirm = ({ raw: r, trk: t, esc, createPlaylist: cP, notify: n, modalApi: mA }) => {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(String(r).trim())))); if (!d?.n || !Array.isArray(d?.u)) throw 1;
    const u = d.u.filter(t), m = d.u.length - u.length;
    mA?.confirm?.({ title: '🎵 Вам прислан плейлист', textHtml: `<b>${esc(d.n)}</b><br><br>Доступно треков: ${u.length} из ${d.u.length}.${m > 0 ? '<br><span class="sc-shared-warn">Часть треков недоступна.</span>' : ''}`, confirmText: 'Добавить', cancelText: 'Отмена', onConfirm: () => cP(u, false, `${d.n} (Присланный)`) });
  } catch { n?.error?.('Ошибка чтения ссылки'); }
};
export const openShowcaseSearchSettingsModal = ({ modalApi: mA }) => {
  const m = mA?.open?.({
    title: 'Поиск',
    maxWidth: 400,
    bodyHtml: `<div class="sm-note" style="text-align:left;color:#9db7dd">Сейчас поиск проверяет название трека, название альбома и индекс текста песен.<br><br>Смысловые фильтры будут расширяться по мере заполнения проверенных TrackProfile.</div><div class="om-actions"><button class="modal-action-btn online" data-act="close">Понятно</button></div>`
  });
  m?.addEventListener('click', event => {
    if (event.target.closest('[data-act="close"]')) m.remove();
  });
  return m;
};
export const openShowcasePaletteModal = ({ title: t, items: i, value: v, resetText: r, onPick: o, modalHelper: m }) => m?.({ title: t, items: i, value: v, resetText: r, onPick: o }) || null;
export default { openShowcaseSheetModal, openShowcaseAddToPlaylistModal, openShowcaseSettingsModal, openShowcaseSharedPlaylistConfirm, openShowcaseSearchSettingsModal, openShowcasePaletteModal };

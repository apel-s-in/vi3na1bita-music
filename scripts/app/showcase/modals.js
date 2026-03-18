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
export const openShowcaseSettingsModal = ({ currentSort: cS, currentUi: cU, options: o, onApply: oA, modalApi: mA }) => {
  window.Utils?.dom?.createStyleOnce?.('sc-settings-styles', `.sc-set-prev{background:rgba(0,0,0,0.3);border-radius:10px;padding:8px 10px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.06);font-size:12px;min-height:120px;display:flex;flex-direction:column;gap:4px}.sc-set-prev-tr{display:flex;align-items:center;padding:4px 0;opacity:1;transition:opacity .25s,transform .2s}.sc-set-prev-tr.h{opacity:0.45}.sc-set-sec-title{font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:10px;font-weight:900;letter-spacing:1px}.sc-set-tgls{display:flex;gap:8px;margin-bottom:18px}.sc-set-tgl{flex:1;padding:10px 4px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid transparent;color:rgba(255,255,255,0.6);font-size:13px;font-weight:700;cursor:pointer;text-align:center;transition:.2s;user-select:none}.sc-set-tgl.on{background:rgba(77,170,255,0.15);color:var(--secondary-color);border-color:rgba(77,170,255,0.3)}.sc-set-tgl-desc{font-size:10px;display:block;opacity:0.6;margin-top:4px;font-weight:500}`);
  let tS = cS, tN = !!cU?.showNumbers, tV = cU?.viewMode || 'flat', tP = cU?.hiddenPlacement || 'inline';

  const draw = bx => {
    let l = [ {id:1, t:'Упала Слеза', a:'КРЕВЕツTOCHKA', h:false}, {id:2, t:'Кошки-мышки', a:'Между Злом и Добром', h:true}, {id:3, t:'Принц', a:'КРЕВЕツTOCHKA', h:false} ];
    if (tS === 'name-asc') l.sort((x,y) => x.t.localeCompare(y.t));
    if (tS === 'name-desc') l.sort((x,y) => y.t.localeCompare(x.t));
    if (tS.includes('album')) l.sort((x,y) => x.a.localeCompare(y.a) || x.id - y.id);
    if (tS === 'favorites-first') l.reverse();
    if (tP === 'end') l = [...l.filter(x=>!x.h), ...l.filter(x=>x.h)];

    let h = '', cA = null;
    l.forEach((x, i) => {
      if (tV === 'grouped' && cA !== x.a) { h += `<div style="color:var(--secondary-color);font-size:10px;font-weight:800;margin-top:4px;opacity:0.9">── ${x.a} ──</div>`; cA = x.a; }
      h += `<div class="sc-set-prev-tr ${x.h ? 'h' : ''}"><span style="color:var(--secondary-color);font-weight:700;width:22px;display:${tN ? 'block' : 'none'}">${i+1}.</span><div><div style="font-weight:700;color:#eaf2ff">${x.t}</div><div style="font-size:10px;color:#888;margin-top:2px">${x.a}</div></div><div style="margin-left:auto;font-size:14px;opacity:0.5">${x.h ? '🙈' : '⭐'}</div></div>`;
    });
    bx.innerHTML = h;
  };

  const m = mA?.open?.({ title: '⚙️ Настройки', maxWidth: 360, bodyHtml: `
    <div class="sc-set-prev" id="sc-prev"></div>
    <div class="sc-set-sec-title">Внешний вид списка</div>
    <div class="sc-set-tgls">
      <div class="sc-set-tgl ${tN?'on':''}" data-t="num">1,2,3<span class="sc-set-tgl-desc">Нумерация</span></div>
      <div class="sc-set-tgl ${tV==='grouped'?'on':''}" data-t="view">⊞<span class="sc-set-tgl-desc">По альбомам</span></div>
      <div class="sc-set-tgl ${tP==='end'?'on':''}" data-t="place">≡скр<span class="sc-set-tgl-desc">Скрытые вниз</span></div>
    </div>
    <div class="sc-set-sec-title">Сортировка треков</div>
    <div class="sc-sort-grid" style="margin-bottom:20px">${o.map(([v, l]) => `<button class="showcase-btn ${tS === v ? 'active' : ''} ${v === 'user' ? 'sc-sort-grid-full' : ''}" data-val="${v}" style="padding:8px 10px;font-size:12px">${l}</button>`).join('')}</div>
    <div class="om-actions">
      <button class="modal-action-btn" data-act="cancel">Отмена</button>
      <button class="modal-action-btn online" data-act="apply">Применить</button>
    </div>
  `});

  if (!m) return null;
  const bx = m.querySelector('#sc-prev'); draw(bx);

  m.addEventListener('click', e => {
    const t = e.target.closest('.sc-set-tgl'), b = e.target.closest('.showcase-btn'), a = e.target.closest('.modal-action-btn');
    if (t) {
      const d = t.dataset.t;
      if (d === 'num') { tN = !tN; t.classList.toggle('on', tN); }
      if (d === 'view') { tV = tV === 'flat' ? 'grouped' : 'flat'; t.classList.toggle('on', tV === 'grouped'); }
      if (d === 'place') { tP = tP === 'inline' ? 'end' : 'inline'; t.classList.toggle('on', tP === 'end'); }
      draw(bx);
    }
    if (b && b.dataset.val) {
      tS = b.dataset.val; m.querySelectorAll('.sc-sort-grid .showcase-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
      draw(bx);
    }
    if (a) {
      if (a.dataset.act === 'cancel') m.remove();
      if (a.dataset.act === 'apply') oA?.({ sortMode: tS, showNumbers: tN, viewMode: tV, hiddenPlacement: tP }, m);
    }
  });
  return m;
};
export const openShowcaseSharedPlaylistConfirm = ({ raw: r, trk: t, esc, createPlaylist: cP, notify: n, modalApi: mA }) => {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(String(r).trim())))); if (!d?.n || !Array.isArray(d?.u)) throw 1;
    const u = d.u.filter(t), m = d.u.length - u.length;
    mA?.confirm?.({ title: '🎵 Вам прислан плейлист', textHtml: `<b>${esc(d.n)}</b><br><br>Доступно треков: ${u.length} из ${d.u.length}.${m > 0 ? '<br><span class="sc-shared-warn">Часть треков недоступна.</span>' : ''}`, confirmText: 'Добавить', cancelText: 'Отмена', onConfirm: () => cP(u, false, `${d.n} (Присланный)`) });
  } catch { n?.error?.('Ошибка чтения ссылки'); }
};
export const openShowcaseSearchSettingsModal = ({ modalApi: mA }) => {
  const m = mA?.open?.({ title: 'Настройки поиска', maxWidth: 400, bodyHtml: `<div class="sm-note" style="margin-bottom:18px;text-align:left;color:#9db7dd">Настройте параметры умного поиска. Продвинутые семантические алгоритмы в разработке.</div><div class="sleep-custom-card" style="margin-bottom:20px;display:flex;flex-direction:column;gap:14px"><label class="sleep-check"><input type="checkbox" checked><span>Поиск по тексту песен (Lyrics)</span></label><label class="sleep-check"><input type="checkbox" checked><span>Учитывать жанры и настроения</span></label><label class="sleep-check"><input type="checkbox"><span>Искать только в Избранном</span></label><label class="sleep-check"><input type="checkbox"><span>Строгое совпадение фразы</span></label></div><div class="om-actions"><button class="modal-action-btn" data-act="cancel">Сбросить</button><button class="modal-action-btn online" data-act="apply">Применить</button></div>` });
  if (m) m.addEventListener('click', e => { if (e.target.closest('.modal-action-btn')) m.remove(); }); return m;
};
export const openShowcaseSelectionMenuModal = ({ modalApi: mA, isSearch: iS, isEdit: iE, onAction: oA }) => {
  const acts = `${!iE && iS ? `<button class="sc-sheet-btn" data-act="add">➕ Добавить в текущий плейлист</button>` : ''}<button class="sc-sheet-btn" data-act="create">✨ Создать новый плейлист</button><button class="sc-sheet-btn" data-act="share">📸 Сгенерировать карточку</button><button class="sc-sheet-btn sc-sheet-btn--cancel" data-act="cancel">Отмена</button>`;
  const bg = document.createElement('div'); bg.className = 'sc-bottom-sheet-bg';
  bg.innerHTML = `<div class="sc-bottom-sheet"><button class="sc-sheet-close">×</button><div class="sc-sheet-title">Выбранные треки</div><div class="sc-sheet-sub">Что сделать с выбранными треками?</div>${acts}</div>`;
  document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('active'));
  const cl = () => { bg.classList.remove('active'); setTimeout(() => bg.remove(), 200); };
  bg.querySelector('.sc-sheet-close')?.addEventListener('click', cl);
  bg.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (e.target === bg || b?.dataset.act === 'cancel') return cl(); if (b) { cl(); oA?.(b.dataset.act); } });
  return { el: bg, close: cl };
};
export const openShowcasePaletteModal = ({ title: t, items: i, value: v, resetText: r, onPick: o, modalHelper: m }) => m?.({ title: t, items: i, value: v, resetText: r, onPick: o }) || null;
export default { openShowcaseSheetModal, openShowcaseAddToPlaylistModal, openShowcaseSettingsModal, openShowcaseSharedPlaylistConfirm, openShowcaseSearchSettingsModal, openShowcaseSelectionMenuModal, openShowcasePaletteModal };

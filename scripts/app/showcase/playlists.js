export function renderShowcasePlaylists({ actionsRoot, listRoot, activeId, playlists, isDefaultId, esc }) {
  if (!actionsRoot || !listRoot) return;
  actionsRoot.innerHTML = `<button class="sc-pl-action ${isDefaultId(activeId) ? 'active' : ''}" id="sc-pl-all">Все треки</button><button class="sc-pl-action" id="sc-pl-pst" title="Вставить ссылку">📋</button>`;
  listRoot.innerHTML = !playlists.length ? '<div class="sc-pl-empty">Плейлистов пока нет</div>' : playlists.map(p => `<div class="sc-pl-row ${activeId === p.id ? 'active' : ''}" data-pid="${p.id}" ${p.color ? `style="--pl-color:${p.color};"` : ''}><div class="sc-pl-left"><span class="sc-pl-dot"></span><span class="sc-pl-title" title="${esc(p.name)}">${esc(p.name)}</span></div><div class="sc-pl-right"><button class="sc-pl-btn" data-act="rename" data-pid="${p.id}" title="Переименовать">✏️</button><button class="sc-pl-btn" data-act="shr" data-pid="${p.id}" title="Поделиться">🔗</button><button class="sc-pl-btn" data-act="col" data-pid="${p.id}" title="Цвет">🎨</button><button class="sc-pl-btn danger" data-act="del" data-pid="${p.id}" title="Удалить">✖</button></div></div>`).join('');
}

export function renameShowcasePlaylist({ id, store, promptName, onDone }) {
  const p = store.get(id);
  if (!p) return;
  promptName?.({
    title: 'Переименовать',
    value: p.name,
    btnText: 'Сохранить',
    onSubmit: v => {
      p.name = v;
      store.save(p);
      onDone?.(p);
    }
  });
}

export function shareShowcasePlaylist({ id, store, origin, pathname, notify }) {
  const p = store.get(id);
  if (!p) return;
  const url = `${origin}${pathname}?playlist=${btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, n: p.name, u: p.order || [] }))))}`;
  navigator.share ? navigator.share({ title: p.name, url }).catch(() => {}) : navigator.clipboard.writeText(url).then(() => notify?.success?.('Ссылка скопирована!'));
}

export function createShowcasePlaylist({ uids, fromEdit = false, name = '', draft = null, store, mkPl, trk, setActive, clearUi, renderTab, notify, promptName }) {
  const use = (uids || []).filter(trk);
  if (!use.length) return notify?.warning?.('Отметьте нужные треки чекбоксами');

  const done = n => {
    const id = Date.now().toString(36);
    const hid = (fromEdit && draft) ? use.filter(u => draft.hid.has(u)) : [];
    store.save(mkPl({ id, name: n, order: [...use], hidden: hid }));
    clearUi?.();
    setActive?.(id);
    renderTab?.();
    notify?.success?.(`Плейлист «${n}» создан`);
  };

  return name ? done(name) : promptName?.({
    title: 'Новый плейлист',
    value: `Мой плейлист ${store.pl().length + 1}`,
    btnText: 'Создать',
    onSubmit: done
  });
}

export default {
  renderShowcasePlaylists,
  renameShowcasePlaylist,
  shareShowcasePlaylist,
  createShowcasePlaylist
};

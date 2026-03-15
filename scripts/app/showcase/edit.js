export function handleShowcaseEditClick({ event, draft, toggleSelected, renderEdit, getList, getStatusCount }) {
  const row = event.target.closest('.sc-edit-row');
  const uid = row?.dataset.uid;
  if (!uid || !draft) return false;

  if (event.target.classList.contains('sc-chk')) {
    toggleSelected(uid);
    row.classList.toggle('selected', draft.chk.has(uid));
    getStatusCount?.();
    return true;
  }

  if (event.target.closest('.sc-eye-btn')) {
    draft.toggleHidden(uid);
    renderEdit(getList());
    return true;
  }

  if (event.target.closest('.sc-arrow-up')) {
    draft.move(uid, -1);
    renderEdit(getList());
    return true;
  }

  if (event.target.closest('.sc-arrow-down')) {
    draft.move(uid, 1);
    renderEdit(getList());
    return true;
  }

  return false;
}

export function bindShowcaseDrag({ box, documentRef, uidEsc, draft }) {
  if (!box || box._scDrag) return;
  box._scDrag = 1;

  box.addEventListener('dragstart', e => {
    const r = e.target.closest('.sc-edit-row');
    if (!r) return;
    e.dataTransfer.setData('text/plain', r.dataset.uid);
    r.classList.add('is-dragging');
  });

  box.addEventListener('dragover', e => {
    e.preventDefault();
    e.target.closest('.sc-edit-row')?.classList.add('drag-over');
  });

  box.addEventListener('dragleave', e => e.target.closest('.sc-edit-row')?.classList.remove('drag-over'));

  box.addEventListener('drop', e => {
    e.preventDefault();
    const to = e.target.closest('.sc-edit-row');
    const uid = e.dataTransfer.getData('text/plain');
    documentRef.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
    const from = uid ? box.querySelector(`.sc-edit-row[data-uid="${uidEsc(uid)}"]`) : null;
    if (!to || !from || to === from) return;
    to.before(from);
    draft?.setOrd([...documentRef.querySelectorAll('.sc-edit-row')].map(x => x.dataset.uid).filter(Boolean));
  });

  box.addEventListener('dragend', () => documentRef.querySelectorAll('.is-dragging').forEach(x => x.classList.remove('is-dragging')));
}

export function saveShowcaseEdit({ draft, ctxId, isDefaultId, store, trackExists, leaveEdit, notify }) {
  if (!draft) return;
  const ord = draft.ord.filter(trackExists);
  const hid = [...draft.hid].filter(trackExists);

  if (isDefaultId(ctxId)) {
    const c = store.def();
    c.order = ord;
    c.hidden = hid.filter(u => ord.includes(u));
    store.setDef(c);
  } else {
    const c = store.get(ctxId);
    if (!c) return;
    c.order = ord;
    c.hidden = hid.filter(u => ord.includes(u));
    store.save(c);
  }

  leaveEdit?.();
  notify?.success?.('Сохранено в текущем плейлисте');
}

export function resetShowcaseEdit({ draft, modals, isDefault, renderEdit }) {
  if (!draft?.isDirty()) return;
  modals?.confirm?.({
    title: 'Сброс',
    textHtml: isDefault ? 'Список вернётся к начальному заводскому: упорядочится по альбомам, все треки станут видимыми. Вы уверены?' : 'Плейлист вернётся к состоянию при его создании. Вы уверены?',
    confirmText: 'Да, сбросить',
    cancelText: 'Отмена',
    onConfirm: () => {
      draft.reset();
      renderEdit?.(draft.getList());
    }
  });
}

export function exitShowcaseEdit({ draft, modals, leaveEdit }) {
  if (!draft?.isDirty()) return leaveEdit?.();
  modals?.confirm?.({
    title: 'Вы внесли изменения',
    textHtml: 'Если выйдете, они не сохранятся.',
    confirmText: 'Да, выйти',
    cancelText: 'Отмена',
    onConfirm: () => leaveEdit?.()
  });
}

export default {
  handleShowcaseEditClick,
  bindShowcaseDrag,
  saveShowcaseEdit,
  resetShowcaseEdit,
  exitShowcaseEdit
};

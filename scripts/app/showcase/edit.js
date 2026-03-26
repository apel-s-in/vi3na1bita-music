// Логика редактирования списков showcase. Код минимизирован.
export const handleShowcaseEditClick = ({ event: e, draft: d, toggleSelected: tS, renderEdit: rE, getList: gL, getStatusCount: gSC }) => {
  const r = e.target.closest('.sc-edit-row'), u = r?.dataset.uid; if (!u || !d) return false;
  if (e.target.classList.contains('sc-chk')) { tS(u); r.classList.toggle('selected', d.chk.has(u)); gSC?.(); return true; }
  if (e.target.closest('.sc-eye-btn')) { d.toggleHidden(u); rE(gL()); return true; }
  if (e.target.closest('.sc-arrow-up')) { d.move(u, -1); rE(gL()); return true; }
  if (e.target.closest('.sc-arrow-down')) { d.move(u, 1); rE(gL()); return true; }
  return false;
};
export const bindShowcaseDrag = ({ box: b, documentRef: D, uidEsc: uE, draft: d }) => {
  if (!b || b._scD) return; b._scD = 1;
  b.addEventListener('dragstart', e => { const r = e.target.closest('.sc-edit-row'); if (r) { e.dataTransfer.setData('text/plain', r.dataset.uid); r.classList.add('is-dragging'); } });
  b.addEventListener('dragover', e => { e.preventDefault(); e.target.closest('.sc-edit-row')?.classList.add('drag-over'); });
  b.addEventListener('dragleave', e => e.target.closest('.sc-edit-row')?.classList.remove('drag-over'));
  b.addEventListener('drop', e => { e.preventDefault(); const t = e.target.closest('.sc-edit-row'), u = e.dataTransfer.getData('text/plain'); D.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); const f = u ? b.querySelector(`.sc-edit-row[data-uid="${uE(u)}"]`) : null; if (!t || !f || t === f) return; t.before(f); d?.setOrd([...D.querySelectorAll('.sc-edit-row')].map(x => x.dataset.uid).filter(Boolean)); });
  b.addEventListener('dragend', () => D.querySelectorAll('.is-dragging').forEach(x => x.classList.remove('is-dragging')));
};
export const saveShowcaseEdit = ({ draft: d, ctxId: id, isDefaultId: iD, store: s, trackExists: tE, leaveEdit: lE, notify: n }) => {
  if (!d) return; const o = d.ord.filter(tE), h = [...d.hid].filter(tE).filter(u => o.includes(u));
  if (iD(id)) { const c = s.def(); c.order = o; c.hidden = h; s.setDef(c); } else { const c = s.get(id); if (c) { c.order = o; c.hidden = h; s.save(c); } }
  lE?.(); n?.success?.('Сохранено в текущем плейлисте');
};
export const resetShowcaseEdit = ({ draft: d, modals: m, isDefault: iD, renderEdit: rE }) => d?.isDirty() && m?.confirm?.({ title: 'Сброс', textHtml: iD ? 'Список вернётся к начальному заводскому: упорядочится по альбомам, все треки станут видимыми. Вы уверены?' : 'Плейлист вернётся к состоянию при его создании. Вы уверены?', confirmText: 'Да, сбросить', cancelText: 'Отмена', onConfirm: () => { d.reset(); rE?.(d.getList()); } });
export const exitShowcaseEdit = ({ draft: d, modals: m, leaveEdit: lE }) => d?.isDirty() ? m?.confirm?.({ title: 'Вы внесли изменения', textHtml: 'Если выйдете, они не сохранятся.', confirmText: 'Да, выйти', cancelText: 'Отмена', onConfirm: () => lE?.() }) : lE?.();
export default { handleShowcaseEditClick, bindShowcaseDrag, saveShowcaseEdit, resetShowcaseEdit, exitShowcaseEdit };

const W = window;
const esc = s => W.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

export function openFavoritesOnlyConflictModal({ track, onDisable, onAddFavorite, hidden = false } = {}) {
  if (!W.Modals?.choice || !track) return null;
  return W.Modals.choice({
    title: 'Режим только избранные',
    textHtml: `Плеер работает в режиме <b>только избранные</b>.<br><br><b>${esc(track.title || 'Трек')}</b>${hidden ? ' скрыт.' : ' не отмечен ⭐.'}<br><br>Выберите действие:`,
    actions: [
      {
        key: 'disable',
        text: 'Отключить F и воспроизвести',
        primary: true,
        onClick: () => onDisable?.()
      },
      ...(!hidden ? [{
        key: 'add',
        text: 'Добавить ⭐ и играть в F',
        onClick: () => onAddFavorite?.()
      }] : []),
      {
        key: 'cancel',
        text: 'Отмена',
        onClick: () => {}
      }
    ]
  });
}

export default { openFavoritesOnlyConflictModal };

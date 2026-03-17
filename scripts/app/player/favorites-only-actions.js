const W = window;
const esc = s => W.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

function openFavoritesOnlyConflictModal({ track, onDisable, onAddFavorite, hidden = false } = {}) {
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

function playWithFavoritesOnlyResolution({
  list = [],
  uid,
  albumKey = '',
  track = null,
  hidden = false,
  play,
  addFavorite,
  disableMode,
  afterPlay
} = {}) {
  const pc = W.playerCore;
  const favOn = localStorage.getItem('favoritesOnlyMode') === '1';
  const gate = W.FavoritesOnlyResolver?.canLaunchTrackInFavoritesOnlyContext?.({ uid, albumKey }) || { ok: true };

  const runPlay = () => {
    const ok = play?.(list, uid);
    if (ok !== false) {
      pc?.applyFavoritesOnlyFilter?.({ autoPlayIfNeeded: true });
      afterPlay?.();
    }
    return ok;
  };

  if (!favOn || gate.ok) return runPlay();

  return openFavoritesOnlyConflictModal({
    track,
    hidden: hidden || gate.reason === 'hidden',
    onDisable: () => {
      disableMode?.();
      runPlay();
    },
    onAddFavorite: (hidden || gate.reason === 'hidden') ? null : () => {
      addFavorite?.(uid);
      runPlay();
    }
  });
}

export { openFavoritesOnlyConflictModal, playWithFavoritesOnlyResolution };
export default { openFavoritesOnlyConflictModal, playWithFavoritesOnlyResolution };

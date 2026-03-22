const W = window;
const esc = s => W.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
const isFavOnlyOn = () => localStorage.getItem('favoritesOnlyMode') === '1';

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

function makeFavoritesOnlyAfterPlay({ highlight, ensureBlock } = {}) {
  return ({ index = -1, uid = '', albumKey = '' } = {}) => {
    highlight?.(index, { uid, albumKey });
    ensureBlock?.(index, { userInitiated: true });
    W.PlayerUI?.updatePlaylistFiltering?.();
  };
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
  const gate = W.FavoritesOnlyResolver?.canLaunchTrackInFavoritesOnlyContext?.({ uid, albumKey }) || { ok: true };

  const runPlay = () => {
    const ok = play?.(list, uid);
    if (ok !== false) {
      pc?.applyFavoritesOnlyFilter?.({ autoPlayIfNeeded: true });
      afterPlay?.();
    }
    return ok;
  };

  if (!isFavOnlyOn() || gate.ok) return runPlay();

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

function toggleFavoritesOnlyMode({
  player = W.playerCore,
  storage = localStorage,
  syncUi
} = {}) {
  if (!player) return { ok: false, enabled: isFavOnlyOn(), reason: 'no_player' };
  const next = !isFavOnlyOn();
  storage.setItem('favoritesOnlyMode', next ? '1' : '0');
  const applied = player.applyFavoritesOnlyFilter?.({ autoPlayIfNeeded: true });
  if (next && applied === false) {
    storage.setItem('favoritesOnlyMode', '0');
    syncUi?.();
    return { ok: false, enabled: false, reason: 'empty' };
  }
  syncUi?.();
  return { ok: true, enabled: next };
}

export { openFavoritesOnlyConflictModal, makeFavoritesOnlyAfterPlay, playWithFavoritesOnlyResolution, toggleFavoritesOnlyMode };
export default { openFavoritesOnlyConflictModal, makeFavoritesOnlyAfterPlay, playWithFavoritesOnlyResolution, toggleFavoritesOnlyMode };

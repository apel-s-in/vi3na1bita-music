const SPRITE_PATH = 'icons/ui-sprite.svg';

export function renderFavoriteStar(liked, attrs = '') {
  return `<span class="like-star like-star-svg" data-liked="${liked ? '1' : '0'}" aria-label="★" ${attrs}><svg viewBox="0 0 24 24" aria-hidden="true"><use href="${SPRITE_PATH}#icon-favorite-star"></use></svg></span>`;
}

export function setFavoriteStarState(el, liked) {
  if (!el) return;
  el.dataset.liked = liked ? '1' : '0';
}

window.IconUtils = {
  renderFavoriteStar,
  setFavoriteStarState
};

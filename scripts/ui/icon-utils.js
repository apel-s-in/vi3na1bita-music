const SPRITE_PATH = 'icons/ui-sprite.svg';

export function renderIcon(name, attrs = '', options = {}) {
  const {
    className = '',
    viewBox = '0 0 24 24',
    ariaHidden = true
  } = options;
  return `<svg viewBox="${viewBox}" ${className ? `class="${className}" ` : ''}${ariaHidden ? 'aria-hidden="true" ' : ''}><use href="${SPRITE_PATH}#${name}"></use></svg>`;
}

export function renderFavoriteStar(liked, attrs = '') {
  return `<span class="like-star like-star-svg" data-liked="${liked ? '1' : '0'}" aria-label="★" ${attrs}>${renderIcon('icon-favorite-star')}</span>`;
}

export function setFavoriteStarState(el, liked) {
  if (!el) return;
  el.dataset.liked = liked ? '1' : '0';
}

window.IconUtils = {
  renderIcon,
  renderFavoriteStar,
  setFavoriteStarState
};

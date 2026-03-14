const SPRITE_PATH = 'icons/ui-sprite.svg';

export function renderIcon(name, attrs = '', options = {}) {
  const {
    className = '',
    viewBox = '0 0 24 24',
    ariaHidden = true
  } = options;
  return `<svg viewBox="${viewBox}" ${className ? `class="${className}" ` : ''}${ariaHidden ? 'aria-hidden="true" ' : ''}${attrs}><use href="${SPRITE_PATH}#${name}"></use></svg>`;
}

export function setIconUse(el, name, options = {}) {
  if (!el || !name) return;
  const {
    viewBox = '0 0 24 24',
    className = '',
    ariaHidden = true
  } = options;
  el.innerHTML = `<use href="${SPRITE_PATH}#${name}"></use>`;
  el.setAttribute('viewBox', viewBox);
  if (className) el.setAttribute('class', className);
  if (ariaHidden) el.setAttribute('aria-hidden', 'true');
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
  setIconUse,
  renderFavoriteStar,
  setFavoriteStarState
};

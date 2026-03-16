const SPRITE_PATH = 'icons/ui-sprite.svg';
export const renderIcon = (n, a = '', { className: c = '', viewBox: v = '0 0 24 24', ariaHidden: ah = true } = {}) => `<svg viewBox="${v}" ${c ? `class="${c}" ` : ''}${ah ? 'aria-hidden="true" ' : ''}${a}><use href="${SPRITE_PATH}#${n}"></use></svg>`;
export const setIconUse = (el, n, { viewBox: v = '0 0 24 24', className: c = '', ariaHidden: ah = true } = {}) => { if (el && n) { el.innerHTML = `<use href="${SPRITE_PATH}#${n}"></use>`; el.setAttribute('viewBox', v); if (c) el.setAttribute('class', c); if (ah) el.setAttribute('aria-hidden', 'true'); } };
export const renderFavoriteStar = (l, a = '') => `<span class="like-star like-star-svg" data-liked="${l ? '1' : '0'}" aria-label="★" ${a}>${renderIcon('icon-favorite-star')}</span>`;
export const setFavoriteStarState = (el, l) => { if (el) el.dataset.liked = l ? '1' : '0'; };
window.IconUtils = { renderIcon, setIconUse, renderFavoriteStar, setFavoriteStarState };

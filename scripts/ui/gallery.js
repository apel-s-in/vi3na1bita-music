// scripts/ui/gallery.js (ESM)
// Мост над уже определёнными в index.html функциями галереи.

function wrap(name) {
  return (...args) => {
    const fn = window[name];
    return (typeof fn === 'function') ? fn(...args) : undefined;
  };
}

export const normalizeGalleryItem = wrap('normalizeGalleryItem');
export const buildCentralGalleryList = wrap('buildCentralGalleryList');
export const buildCoverGalleryList = wrap('buildCoverGalleryList');
export const renderCoverItem = wrap('renderCoverItem');
export const setCoverImage = wrap('setCoverImage');
export const prefetchNextCover = wrap('prefetchNextCover');
export const startCoverAutoPlay = wrap('startCoverAutoPlay');
export const ensureQuickCoverForAlbum = wrap('ensureQuickCoverForAlbum');
export const applyAlbumBackgroundFromGallery = wrap('applyAlbumBackgroundFromGallery');
export const setCoverWrapVisible = wrap('setCoverWrapVisible');
export const resetGallery = wrap('resetGallery');

window.UIGallery = {
  normalizeGalleryItem,
  buildCentralGalleryList,
  buildCoverGalleryList,
  renderCoverItem,
  setCoverImage,
  prefetchNextCover,
  startCoverAutoPlay,
  ensureQuickCoverForAlbum,
  applyAlbumBackgroundFromGallery,
  setCoverWrapVisible,
  resetGallery
};

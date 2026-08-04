const isSpecialKey = key => String(key || '').startsWith('__');
const resolveIconSources = ({ icon, mobile, logo }) => {
  const source = String(icon || logo);
  if (!source.includes('icon_album') || source.includes('Fav_logo')) {
    return { src: source, src2x: source };
  }
  const src = mobile ? source.replace(/icon_album\/(.+)\.png$/, 'icon_album/mobile/$1@1x.jpg') : source.replace(/\.png$/, '@1x.png');
  return { src, src2x: mobile ? src.replace(/@1x\.jpg$/, '@2x.jpg') : src.replace(/@1x\.png$/, '@2x.png') };
};
export const getRenderableAlbumIcons = ({ config = {}, albumsIndex = [] } = {}) => {
  const albumKeys = new Set((Array.isArray(albumsIndex) ? albumsIndex : []).map(item => String(item?.key || '')));
  const authorized = window.YandexAuth?.getSessionStatus?.() === 'active' && window.YandexAuth?.isTokenAlive?.();
  const items = (config.ICON_ALBUMS_ORDER || []).filter(item => item?.key && (!item.authOnly || authorized) && (isSpecialKey(item.key) || albumKeys.has(String(item.key))));
  return { albums: items.filter(item => item.row === 'albums' || (!item.row && !isSpecialKey(item.key))), navigation: items.filter(item => item.row === 'nav' || (!item.row && isSpecialKey(item.key))) };
};
export const renderAlbumIcon = ({ item, mobile = false, logo = 'img/logo.png', escapeHtml = value => String(value || '') } = {}) => {
  if (!item?.key) return '';
  const key = escapeHtml(item.key);
  const title = escapeHtml(item.title);
  const { src, src2x } = resolveIconSources({ icon: item.icon, mobile, logo });
  return `<div class="album-icon" data-album="${key}" data-akey="${key}" title="${title}"><img src="${escapeHtml(src)}" srcset="${escapeHtml(src2x)} 2x" alt="${title}" draggable="false" loading="lazy" width="60" height="60"></div>`;
};
export const renderAlbumIconRows = ({ config = {}, albumsIndex = [], mobile = false, logo = 'img/logo.png', escapeHtml } = {}) => {
  const { albums, navigation } = getRenderableAlbumIcons({ config, albumsIndex });
  const render = item => renderAlbumIcon({ item, mobile, logo, escapeHtml });
  return `<div class="album-icons-row album-icons-row--albums" id="album-icons-albums">${albums.map(render).join('')}</div><div class="album-icons-row album-icons-row--nav" id="album-icons-nav">${navigation.map(render).join('')}</div>`;
};
export default { getRenderableAlbumIcons, renderAlbumIcon, renderAlbumIconRows };

// UID.096_(Helper-first anti-duplication policy)_(единая отправка backup dirty domain events)_(убрать локальные dirtyDev/emitPlDirty копии)
// UID.099_(Multi-device sync model)_(domain-driven autosave)_(изменения доменов должны помечаться единообразно)

const sS = v => String(v == null ? '' : v).trim();

export const markBackupDomainDirty = (domain = 'generic', detail = {}) => {
  try {
    window.dispatchEvent(new CustomEvent('backup:domain-dirty', {
      detail: { ...detail, domain: sS(domain) || 'generic' }
    }));
    return true;
  } catch {
    return false;
  }
};

export const markDeviceSettingsDirty = detail => markBackupDomainDirty('deviceSettings', detail);
export const markPlaylistsDirty = detail => markBackupDomainDirty('playlists', detail);
export const markFavoritesDirty = detail => markBackupDomainDirty('favorites', detail);
export const markProfileDirty = detail => markBackupDomainDirty('profile', { immediate: true, ...(detail || {}) });
export const markDevicesDirty = detail => markBackupDomainDirty('devices', detail);

export default {
  markBackupDomainDirty,
  markDeviceSettingsDirty,
  markPlaylistsDirty,
  markFavoritesDirty,
  markProfileDirty,
  markDevicesDirty
};

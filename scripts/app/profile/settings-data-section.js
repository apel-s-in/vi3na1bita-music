import { renderTrashSettingsSections, readDeletedPlaylists, readDeletedFavorites } from './settings-trash-section.js';

export { readDeletedPlaylists, readDeletedFavorites };
export const renderDataSettingsSection = () => `<div class="settings-content" id="set-data">${renderTrashSettingsSections()}</div>`;

export default { readDeletedPlaylists, readDeletedFavorites, renderDataSettingsSection };

import { renderConflictSettingsSection, bindConflictSettingsSection } from './settings-conflict-section.js';
import { renderTrashSettingsSections, readDeletedPlaylists, readDeletedFavorites } from './settings-trash-section.js';

export { readDeletedPlaylists, readDeletedFavorites };

export const bindDataSettingsSection = root => bindConflictSettingsSection(root);

export const renderDataSettingsSection = () => `<div class="settings-content" id="set-data">${renderConflictSettingsSection()}${renderTrashSettingsSections()}</div>`;

export default { readDeletedPlaylists, readDeletedFavorites, renderDataSettingsSection, bindDataSettingsSection };

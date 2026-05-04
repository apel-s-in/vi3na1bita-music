import { renderDownloadSettingsSection, bindDownloadSettingsSection } from './settings-download-section.js';
import { renderInterfaceSettingsSection, bindInterfaceSettingsSection } from './settings-interface-section.js';
import { renderDataSettingsSection, bindDataSettingsSection } from './settings-data-section.js';

const W = window;

export const renderProfileSettings = root => {
  if (!root) return;
  root.innerHTML = `<div class="ach-classic-tabs"><div class="ach-classic-tab active" data-set-tab="general">Общие</div><div class="ach-classic-tab" data-set-tab="interface">Интерфейс</div><div class="ach-classic-tab" data-set-tab="data">Данные</div><div class="ach-classic-tab" data-set-tab="keys" id="set-tab-keys" style="display:none">Клавиатура</div></div>${renderDownloadSettingsSection()}${renderInterfaceSettingsSection()}${renderDataSettingsSection()}<div class="settings-content" id="set-keys"><div class="fav-empty">Раздел в разработке 🛠️</div></div>`;
  const keysTab = root.querySelector('#set-tab-keys');
  if (!W.Utils?.isMobile?.() && keysTab) keysTab.style.display = '';

  root.querySelectorAll('.set-acc-btn').forEach(b => b.onclick = () => {
    const o = b.classList.contains('open');
    root.querySelectorAll('.set-acc-btn').forEach(x => x.classList.remove('open'));
    if (!o) b.classList.add('open');
  });

  bindInterfaceSettingsSection(root);
  bindDownloadSettingsSection(root);
  bindDataSettingsSection(root);
};

export default { renderProfileSettings };

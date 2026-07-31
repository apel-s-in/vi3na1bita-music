import { renderDownloadSettingsSection, bindDownloadSettingsSection } from './settings-download-section.js';
import { renderInterfaceSettingsSection, bindInterfaceSettingsSection } from './settings-interface-section.js';
import { renderDataSettingsSection, bindDataSettingsSection } from './settings-data-section.js';
import { renderConsoleSettingsSection, bindConsoleSettingsSection } from './settings-console-section.js';
import { bindTabStripPhysics } from './tab-strip-physics.js';

export const renderProfileSettings = root => {
  if (!root) return;
  root.innerHTML = `<div class="ach-classic-tabs"><div class="ach-classic-tab active" data-set-tab="general">Общие</div><div class="ach-classic-tab" data-set-tab="interface">Интерфейс</div><div class="ach-classic-tab" data-set-tab="data">Данные</div><div class="ach-classic-tab" data-set-tab="keys" id="set-tab-keys" style="display:none">Клавиатура</div><div class="ach-classic-tab" data-set-tab="console">Консоль</div></div>${renderDownloadSettingsSection()}${renderInterfaceSettingsSection()}${renderDataSettingsSection()}<div class="settings-content" id="set-keys"><div class="fav-empty">Раздел в разработке 🛠️</div></div>${renderConsoleSettingsSection()}`;
  const keyboardTab = root.querySelector('#set-tab-keys');
  if (!window.Utils?.isMobile?.() && keyboardTab) keyboardTab.style.display = '';
  root.querySelectorAll('.set-acc-btn').forEach(button => {
    button.onclick = () => {
      const open = button.classList.contains('open');
      root.querySelectorAll('.set-acc-btn').forEach(item => item.classList.remove('open'));
      if (!open) button.classList.add('open');
    };
  });
  bindTabStripPhysics(root);
  bindInterfaceSettingsSection(root);
  bindDownloadSettingsSection(root);
  bindDataSettingsSection(root);
  bindConsoleSettingsSection(root);
};

export default { renderProfileSettings };

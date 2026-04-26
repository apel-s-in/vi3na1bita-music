import { renderDownloadSettingsSection, bindDownloadSettingsSection } from './settings-download-section.js';
import { renderInterfaceSettingsSection, bindInterfaceSettingsSection } from './settings-interface-section.js';
import { renderDataSettingsSection } from './settings-data-section.js';

const W = window;

const renderBenefitsSection = () => `<div class="settings-content" id="set-benefits">
  <div class="set-row" style="flex-direction:column;align-items:flex-start;gap:10px;background:rgba(77,170,255,.06);border-color:rgba(77,170,255,.2)">
    <div class="set-title" style="color:var(--secondary-color)">☁️ Зачем авторизоваться?</div>
    <div style="display:flex;flex-direction:column;gap:8px;width:100%">
      ${[
        ['💾','Сохранение прогресса','Достижения, XP, стрики и плейлисты не потеряются при очистке браузера'],
        ['📱','Синхронизация устройств','Войдите на телефоне и планшете — прогресс подтянется автоматически'],
        ['🏆','Призовые акции','Только верифицированные пользователи смогут участвовать в розыгрышах'],
        ['🎮','Игры и лидерборд','Будущий режим «Угадай мелодию» и глобальные таблицы лидеров'],
        ['🪙','Коины Vi3N','Будущая валюта за активность — обменивается на мерч и эксклюзивы'],
        ['🔒','Безопасность','Пароль Яндекса нам не передаётся. Мы видим только ваш ID и имя']
      ].map(([ic, t, d]) => `
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:20px;flex-shrink:0">${ic}</span>
          <div><div style="font-size:13px;font-weight:700;color:#fff">${t}</div><div style="font-size:11px;color:#888;margin-top:2px">${d}</div></div>
        </div>`).join('')}
    </div>
  </div>
</div>`;

export const renderProfileSettings = root => {
  if (!root) return;
  root.innerHTML = `<div class="ach-classic-tabs"><div class="ach-classic-tab active" data-set-tab="general">Общие</div><div class="ach-classic-tab" data-set-tab="interface">Интерфейс</div><div class="ach-classic-tab" data-set-tab="data">Данные</div><div class="ach-classic-tab" data-set-tab="benefits">Зачем вход?</div><div class="ach-classic-tab" data-set-tab="keys" id="set-tab-keys" style="display:none">Клавиатура</div></div>${renderDownloadSettingsSection()}${renderInterfaceSettingsSection()}${renderDataSettingsSection()}${renderBenefitsSection()}<div class="settings-content" id="set-keys"><div class="fav-empty">Раздел в разработке 🛠️</div></div>`;
  const keysTab = root.querySelector('#set-tab-keys');
  if (!W.Utils?.isMobile?.() && keysTab) keysTab.style.display = '';

  root.querySelectorAll('.set-acc-btn').forEach(b => b.onclick = () => {
    const o = b.classList.contains('open');
    root.querySelectorAll('.set-acc-btn').forEach(x => x.classList.remove('open'));
    if (!o) b.classList.add('open');
  });

  bindInterfaceSettingsSection(root);
  bindDownloadSettingsSection(root);
};

export default { renderProfileSettings };

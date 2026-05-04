import { esc } from './profile-ui-kit.js';

export const renderAccountBenefitsBlock = () => `<div class="yandex-auth-note account-benefits-block">
  <div style="font-size:12px;font-weight:900;color:#4daaff;margin-bottom:12px">☁️ Зачем авторизоваться?</div>
  <div style="display:flex;flex-direction:column;gap:10px">
    ${[
      ['💾','Сохранение прогресса','Достижения, XP, стрики и плейлисты не потеряются при очистке браузера'],
      ['📱','Синхронизация устройств','Войдите на телефоне и планшете — прогресс подтянется автоматически'],
      ['🏆','Призовые акции','Только верифицированные пользователи смогут участвовать в розыгрышах'],
      ['🎮','Игры и лидерборд','Будущий режим «Угадай мелодию» и глобальные таблицы лидеров'],
      ['🪙','Коины Vi3N','Будущая валюта за активность — обменивается на мерч и эксклюзивы'],
      ['🔒','Безопасность','Пароль Яндекса нам не передаётся. Мы видим только ваш ID и имя']
    ].map(([ic, t, d]) => `<div style="display:flex;gap:10px;align-items:flex-start">
      <span style="font-size:20px;flex-shrink:0">${esc(ic)}</span>
      <div><div style="font-size:13px;font-weight:800;color:#fff">${esc(t)}</div><div style="font-size:11px;color:#888;margin-top:2px;line-height:1.35">${esc(d)}</div></div>
    </div>`).join('')}
  </div>
</div>`;

export default { renderAccountBenefitsBlock };

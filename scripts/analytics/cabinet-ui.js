// scripts/analytics/cabinet-ui.js
import { StatsAggregator, ACHIEVEMENTS, CloudSync, EventLogger } from './engine.js';

const W = window, D = document;

// 1. Инжект Прогресс Бара в главный UI
export const initProgressBar = async () => {
  const container = D.getElementById('achievements-progress-container');
  if (!container) return;
  
  const render = async () => {
    const stats = await StatsAggregator.getStats();
    const unl = stats.unlocked?.length || 0, tot = ACHIEVEMENTS.length;
    const pct = Math.min(100, (unl / tot) * 100);
    const streak = stats.streak || 0;
    
    container.innerHTML = `
      <div class="ach-widget-box">
        <div class="ach-widget-tip">💡 До «Недельный стрик»: ${Math.max(0, 7 - streak)} дней подряд</div>
        <div class="ach-widget-title">ПРОГРЕСС ДОСТИЖЕНИЙ</div>
        <div class="ach-widget-track"><div class="ach-widget-fill" style="width: ${pct}%"></div></div>
        <div class="ach-widget-count">ВЫПОЛНЕНО: ${unl} / ${tot}</div>
        <button class="ach-widget-btn" id="open-cabinet-btn">СОХРАНИТЬ ДОСТИЖЕНИЯ</button>
      </div>
    `;
    D.getElementById('open-cabinet-btn').onclick = openCabinet;
  };
  
  W.addEventListener('analytics:updated', render);
  W.addEventListener('analytics:achieved', render);
  render();
};

// 2. Личный Кабинет
export const openCabinet = async () => {
  const stats = await StatsAggregator.getStats();
  const html = `
    <div class="cabinet-wrap">
      <div class="cab-header">👤 Личный Кабинет</div>
      
      <div class="cab-grid">
        <div class="cab-card"><h3>⏱ Прослушиваний</h3><div class="cab-val">${stats.totalListens||0}</div></div>
        <div class="cab-card"><h3>🔥 Стрик (дней)</h3><div class="cab-val">${stats.streak||0}</div></div>
        <div class="cab-card"><h3>🏆 Достижений</h3><div class="cab-val">${stats.unlocked?.length||0}</div></div>
      </div>

      <div class="cab-section">
        <h3>☁ Синхронизация (Dual-Cloud)</h3>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button class="cab-btn yandex-btn" onclick="alert('OAuth Yandex: В разработке')">Yandex</button>
          <button class="cab-btn google-btn" onclick="alert('OAuth Google: В разработке')">Google</button>
        </div>
      </div>

      <div class="cab-section">
        <h3>🛡 Vault Backup (.vi3bak)</h3>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button class="cab-btn" id="cab-export">💾 Скачать бэкап</button>
          <label class="cab-btn cab-btn-outline" style="text-align:center;cursor:pointer">
            📂 Загрузить бэкап <input type="file" id="cab-import" accept=".vi3bak" style="display:none">
          </label>
        </div>
      </div>
    </div>
  `;
  const m = W.Modals.open({ title: '', bodyHtml: html, maxWidth: 480 });
  m.querySelector('#cab-export').onclick = () => CloudSync.exportBackup();
  m.querySelector('#cab-import').onchange = async (e) => {
    if (!e.target.files.length) return;
    try { 
      await CloudSync.importBackup(e.target.files[0]); 
      W.NotificationSystem.show('Бэкап успешно восстановлен!', 'success');
      m.remove();
    } catch(err) { W.NotificationSystem.show('Ошибка бэкапа (Tamper Detected)', 'error'); }
  };
};
window.openCabinet = openCabinet;

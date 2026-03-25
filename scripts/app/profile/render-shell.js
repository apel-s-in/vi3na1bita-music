// UID.044_(ListenerProfile core)_(подготовить профиль к встраиванию user-intelligence блоков)_(render-shell остаётся legacy host, принимающим optional intel fragments)
// UID.056_(Recommendation reasons)_(позже принимать explainable rec fragments без knowledge об их расчёте)_(shell только размещает future blocks, но не считает причины)
// UID.070_(Linked providers)_(показывать provider shell-поверхность без владения identity truth)_(render-shell рендерит auth/provider area, но данные linked accounts приходят извне)
// UID.072_(Provider consents)_(shell должен уметь принять consent UI блоки)_(но не хранить и не вычислять consent state самостоятельно)
// UID.073_(Hybrid sync orchestrator)_(shell станет host для sync-role/status block)_(но orchestration logic останется в intel/providers layer)
// UID.082_(Local truth vs external telemetry split)_(shell не должен экспортировать profile/raw insights сам)_(это только layout/render host)
// UID.094_(No-paralysis rule)_(profile shell обязан работать без intel fragments)_(если intelligent blocks отсутствуют, legacy profile UI остаётся полноценным)
// UID.095_(Ownership boundary: legacy vs intel)_(жёстко закрепить render-shell как legacy-shell, принимающий optional intel fragments)_(layout/profile navigation/stat shell здесь, а listener/recs/providers/community insights приходят как надстройка)
import { mountProfileCarouselFlat } from './carousel-flat.js';
import { renderProfileSettings } from './settings-view.js';
import { getProfileTemplateHtml } from './template.js';

const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

const renderSourceSelector = (ps) => `
  <div class="prof-src-box">
    <div>
      <div class="prof-src-title">Приоритет источника</div>
      <div class="prof-src-sub">Моментальный резерв включен всегда</div>
    </div>
    <div class="prof-src-switch">
      <button data-src="yandex" class="prof-src-btn prof-src-btn--yandex ${ps === 'yandex' ? 'prof-src-btn--active' : ''}">Yandex</button>
      <button data-src="github" class="prof-src-btn prof-src-btn--github ${ps === 'github' ? 'prof-src-btn--active' : ''}">GitHub</button>
    </div>
  </div>`;

export const renderProfileShell = ({ container: c, profile: p, tokens: tk, totalFull: tF, totalSec: tS, streak: strk, achCount: aC }) => {
  if (!c) return null; c.innerHTML = '';
  const ab = (id, n, ic) => `<button class="auth-btn ${id} ${tk[id] ? 'connected' : ''}" data-auth="${id}"><span>${ic}</span> ${tk[id] ? 'Подключено' : n}</button>`;
  c.innerHTML = getProfileTemplateHtml();

  const avaBtn = c.querySelector('#prof-avatar-btn');
  if (avaBtn) avaBtn.textContent = p.avatar || '😎';

  const nameInp = c.querySelector('#prof-name-inp');
  if (nameInp) nameInp.value = p.name || 'Слушатель';

  const authGrid = c.querySelector('#prof-auth-grid');
  if (authGrid) authGrid.innerHTML = ab('yandex', 'Яндекс', '💽') + ab('google', 'Google', '☁️') + ab('vk', 'VK ID', '🔵');

  const instKey = 'app:first-install-ts';
  if (!localStorage.getItem(instKey)) localStorage.setItem(instKey, String(Date.now()));
  const instTs = Number(localStorage.getItem(instKey) || Date.now());
  const instDate = new Date(instTs).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const daysDiff = Math.max(1, Math.floor((Date.now() - instTs) / 86400000) + 1);

  const sincEl = c.querySelector('#prof-meta-since');
  const dayEl = c.querySelector('#prof-meta-days');
  if (sincEl) sincEl.textContent = `📅 Слушаю с: ${instDate}`;
  if (dayEl) dayEl.textContent = `🎵 Дней с нами: ${daysDiff}`;
  
  const ps = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  
  const tabAccount = c.querySelector('#tab-account');
  if (tabAccount) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderSourceSelector(ps);
    tabAccount.appendChild(wrap.firstElementChild);
  }

  const statTracks = c.querySelector('#prof-stat-tracks');
  const statTime = c.querySelector('#prof-stat-time');
  const statStreak = c.querySelector('#prof-stat-streak');
  const statAch = c.querySelector('#prof-stat-ach');
  if (statTracks) statTracks.textContent = tF;
  if (statTime) statTime.textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(tS) : `${Math.floor(tS/60)}м`;
  if (statStreak) statStreak.textContent = strk;
  if (statAch) statAch.textContent = aC;
  
  mountProfileCarouselFlat({ root: c });
  renderProfileSettings(c.querySelector('#tab-settings'));

  return c;
};
export default { renderProfileShell };

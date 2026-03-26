// UID.044_(ListenerProfile core)_(подготовить профиль к встраиванию user-intelligence блоков)_(render-shell остаётся legacy host, принимающим optional intel fragments) UID.056_(Recommendation reasons)_(позже принимать explainable rec fragments без knowledge об их расчёте)_(shell только размещает future blocks, но не считает причины) UID.070_(Linked providers)_(показывать provider shell-поверхность без владения identity truth)_(render-shell рендерит auth/provider area, но данные linked accounts приходят извне) UID.072_(Provider consents)_(shell должен уметь принять consent UI блоки)_(но не хранить и не вычислять consent state самостоятельно) UID.073_(Hybrid sync orchestrator)_(shell станет host для sync-role/status block)_(но orchestration logic останется в intel/providers layer) UID.082_(Local truth vs external telemetry split)_(shell не должен экспортировать profile/raw insights сам)_(это только layout/render host) UID.094_(No-paralysis rule)_(profile shell обязан работать без intel fragments)_(если intelligent blocks отсутствуют, legacy profile UI остаётся полноценным) UID.095_(Ownership boundary: legacy vs intel)_(жёстко закрепить render-shell как legacy-shell, принимающий optional intel fragments)_(layout/profile navigation/stat shell здесь, а listener/recs/providers/community insights приходят как надстройка)
import { mountProfileCarouselFlat } from './carousel-flat.js';
import { renderProfileSettings } from './settings-view.js';
import { getProfileTemplateHtml } from './template.js';

export const renderProfileShell = ({ container: c, profile: p, tokens: tk, totalFull: tF, totalSec: tS, streak: strk, achCount: aC }) => {
  if (!c) return null;
  c.innerHTML = getProfileTemplateHtml();
  const $ = s => c.querySelector(s);
  
  if ($('#prof-avatar-btn')) $('#prof-avatar-btn').textContent = p.avatar || '😎';
  if ($('#prof-name-inp')) $('#prof-name-inp').value = p.name || 'Слушатель';

  // Яндекс OAuth статус
  const renderAuthBlock = () => {
    const authEl = $('#prof-auth-grid');
    if (!authEl) return;
    const ya = window.YandexAuth;
    if (!ya) return;
    const status = ya.getSessionStatus();
    const profile = ya.getProfile();
    const autoLogin = ya.isAutoRelogin();

    const statusLabel = { active: '🟢 Подключено', expired: '🟡 Сессия истекла', logged_out: '⚪ Не подключено' }[status] || '⚪ Не подключено';
    const statusColor = { active: '#4caf50', expired: '#ff9800', logged_out: '#888' }[status] || '#888';

    authEl.innerHTML = `
      <div class="yandex-auth-block">
        <div class="yandex-auth-status" style="color:${statusColor};font-size:13px;font-weight:700;margin-bottom:12px">${statusLabel}</div>
        ${profile ? `
          <div class="yandex-auth-profile" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:12px;background:rgba(255,255,255,.04);border-radius:12px;border:1px solid rgba(255,255,255,.08)">
            ${profile.avatar ? `<img src="${profile.avatar}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0" loading="lazy">` : '<div style="width:44px;height:44px;border-radius:50%;background:#232b38;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">👤</div>'}
            <div style="min-width:0">
              <div style="font-size:15px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${window.Utils?.escapeHtml?.(profile.displayName || 'Слушатель')}</div>
              <div style="font-size:11px;color:#888;margin-top:2px">@${window.Utils?.escapeHtml?.(profile.login || '')} · ID ${profile.yandexId}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="modal-action-btn" data-ya-action="rename" style="flex:1;font-size:12px;padding:8px">✏️ Изменить имя</button>
            <button class="modal-action-btn" data-ya-action="save-backup" style="flex:1;font-size:12px;padding:8px">☁️ Сохранить</button>
            <button class="modal-action-btn" data-ya-action="restore-backup" style="flex:1;font-size:12px;padding:8px">📥 Восстановить</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:rgba(0,0,0,.2);border-radius:10px;margin-bottom:10px">
            <span style="flex:1;font-size:12px;color:#9db7dd">Автовход при сбросе сессии</span>
            <label class="set-switch"><input type="checkbox" id="ya-auto-relogin" ${autoLogin ? 'checked' : ''}><span class="set-slider"></span></label>
          </div>
          <button class="om-btn om-btn--outline om-fullw" data-ya-action="logout" style="font-size:12px">Выйти из аккаунта Яндекс</button>
        ` : `
          <div style="color:#9db7dd;font-size:13px;line-height:1.55;margin-bottom:16px">
            Войдите через Яндекс, чтобы сохранять прогресс, достижения и плейлисты на всех устройствах.
          </div>
          <button class="auth-btn yandex" data-ya-action="login" style="width:100%;padding:14px;font-size:15px;border-radius:12px">
            <span>💽</span> Войти через Яндекс
          </button>
        `}
      </div>`;

    // Биндим кнопки сразу после рендера
    authEl.querySelectorAll('[data-ya-action]').forEach(btn => {
      btn.onclick = () => window._handleYaAction?.(btn.dataset.yaAction, authEl, renderAuthBlock);
    });
    const autoChk = authEl.querySelector('#ya-auto-relogin');
    if (autoChk) autoChk.onchange = e => ya.setAutoRelogin(e.target.checked);
  };

  renderAuthBlock();
  window.addEventListener('yandex:auth:changed', renderAuthBlock);

  const instTs = Number(localStorage.getItem('app:first-install-ts') || (localStorage.setItem('app:first-install-ts', String(Date.now())), Date.now()));
  if ($('#prof-meta-since')) $('#prof-meta-since').textContent = `📅 Слушаю с: ${new Date(instTs).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if ($('#prof-meta-days')) $('#prof-meta-days').textContent = `🎵 Дней с нами: ${Math.max(1, Math.floor((Date.now() - instTs) / 86400000) + 1)}`;
  
  const ps = localStorage.getItem('sourcePref') === 'github' ? 'github' : 'yandex';
  if ($('#tab-account')) $('#tab-account').insertAdjacentHTML('beforeend', `<div class="prof-src-box"><div><div class="prof-src-title">Приоритет источника</div><div class="prof-src-sub">Моментальный резерв включен всегда</div></div><div class="prof-src-switch"><button data-src="yandex" class="prof-src-btn prof-src-btn--yandex ${ps === 'yandex' ? 'prof-src-btn--active' : ''}">Yandex</button><button data-src="github" class="prof-src-btn prof-src-btn--github ${ps === 'github' ? 'prof-src-btn--active' : ''}">GitHub</button></div></div>`);

  if ($('#prof-stat-tracks')) $('#prof-stat-tracks').textContent = tF;
  if ($('#prof-stat-time')) $('#prof-stat-time').textContent = window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(tS) : `${Math.floor(tS/60)}м`;
  if ($('#prof-stat-streak')) $('#prof-stat-streak').textContent = strk;
  if ($('#prof-stat-ach')) $('#prof-stat-ach').textContent = aC;
  
  mountProfileCarouselFlat({ root: c });
  renderProfileSettings($('#tab-settings'));
  return c;
};
// Глобальный индикатор сессии на кнопке профиля в навбаре
function updateNavSessionDot() {
  const btn = document.getElementById('profile-nav-btn');
  if (!btn) return;

  let dot = btn.querySelector('.ya-session-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'ya-session-dot';
    dot.style.cssText = 'position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;border:2px solid var(--primary-bg);transition:background .3s;pointer-events:none';
    btn.style.position = 'relative';
    btn.appendChild(dot);
  }

  const status = window.YandexAuth?.getSessionStatus?.() || 'logged_out';
  const colors = { active: '#4caf50', expired: '#ff9800', logged_out: 'transparent' };
  dot.style.background = colors[status] || 'transparent';
  dot.title = { active: 'Яндекс подключён', expired: 'Сессия Яндекс истекла — войдите снова', logged_out: '' }[status] || '';
}

window.addEventListener('yandex:auth:changed', updateNavSessionDot);
document.addEventListener('DOMContentLoaded', () => setTimeout(updateNavSessionDot, 500));
export default { renderProfileShell };

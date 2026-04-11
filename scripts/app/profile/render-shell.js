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

  const getLocalBackupSnapshot = () => {
    try {
      const favs = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]');
      const pls = JSON.parse(localStorage.getItem('sc3:playlists') || '[]');
      return {
        appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
        favoritesCount: Array.isArray(favs) ? favs.length            <span class="yandex-auth-autologin-text">Автовход при истечении сессии</span>
            <label class="set-switch"><input type="checkbox" id="ya-auto-relogin" ${autoLogin ? 'checked' : ''}><span class="set-slider"></span></label>
          </div>
          <div class="yandex-auth-note">Что входит в резервную копию: статистика, достижения, локальный профиль, избранное, плейлисты витрины, настройки интерфейса и часть внутренних служебных данных для восстановления прогресса.</div>
          <div class="yandex-auth-bottomactions">
            <button class="om-btn om-btn--ghost" data-ya-action="backup-info">Что сохраняется?</button>
            <button class="om-btn om-btn--outline" data-ya-action="logout">Выйти из Яндекса</button>
          </div>
        ` : `
          <div class="yandex-auth-caption" style="margin-bottom:10px">Подключение Яндекса позволяет безопасно сохранять прогресс в личную папку приложения на Яндекс Диске и восстанавливать его на других устройствах.</div>
          <div class="yandex-auth-note" style="margin-top:0">Мы не получаем пароль Яндекса. Авторизация идёт через официальный OAuth, а доступ даётся только к папке приложения.</div>
          <button class="yandex-auth-mainbtn" data-ya-action="login">
            <span style="font-size:22px;line-height:1">Я</span>
            <span>Войти через Яндекс</span>
          </button>
        `}
      </div>`;
    const authEl = $('#prof-auth-grid');
    if (!authEl) return;
    const ya = window.YandexAuth;
    if (!ya) return;
    const status = ya.getSessionStatus();
    const profile = ya.getProfile();
    const autoLogin = ya.isAutoRelogin();
    const backupMeta = (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || 'null'); } catch { return null; } })();

    const statusLabel = { active: 'Подключено', expired: 'Сессия истекла', logged_out: 'Не подключено' }[status] || 'Не подключено';
    const statusColor = { active: '#4caf50', expired: '#ff9800', logged_out: '#888' }[status] || '#888';

    authEl.innerHTML = `
      <div class="yandex-auth-block">
        <div class="yandex-auth-statusline">
          <span class="yandex-auth-statusdot" style="background:${status === 'logged_out' ? '#888' : statusColor}"></span>
          <div style="font-size:14px;font-weight:900;color:#fff">${statusLabel}</div>
        </div>
        ${profile ? `
          <div class="yandex-auth-profile" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:12px;background:rgba(255,255,255,.04);border-radius:12px;border:1px solid rgba(255,255,255,.08)">
            ${profile.avatar ? `<img src="${profile.avatar}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0" loading="lazy">` : '<div style="width:44px;height:44px;border-radius:50%;background:#232b38;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">👤</div>'}
            <div style="min-width:0;flex:1">
              <div style="font-size:15px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${window.Utils?.escapeHtml?.(profile.displayName || 'Слушатель')}</div>
              <div style="font-size:11px;color:#888;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">@${window.Utils?.escapeHtml?.(profile.login || '')} · ID ${profile.yandexId}</div>
            </div>
          </div>
          <div class="yandex-auth-caption">Безопасно: пароль Яндекса не передаётся приложению. Используется только официальный OAuth-вход и токен доступа к папке приложения на Яндекс Диске.</div>
          ${backupMeta?.timestamp ? `<div class="yandex-auth-note">Последняя облачная копия: ${new Date(backupMeta.timestamp).toLocaleString('ru-RU')}</div>` : `<div class="yandex-auth-note">Облачная копия ещё не создавалась. Вы можете сначала проверить наличие резервной копии или сразу сохранить новую.</div>`}
          <div class="yandex-auth-actions">
            <button class="modal-action-btn" data-ya-action="rename">✏️ Имя</button>
            <button class="modal-action-btn" data-ya-action="save-backup">☁️ Сохранить</button>
            <button class="modal-action-btn" data-ya-action="check-backup">🔎 Проверить</button>
            <button class="modal-action-btn" data-ya-action="restore-backup">📥 Восстановить</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:rgba(0,0,0,.2);border-radius:10px;margin-bottom:10px">
            <span style="flex:1;font-size:12px;color:#9db7dd;line-height:1.35">Автовход при истечении сессии</span>
            <label class="set-switch"><input type="checkbox" id="ya-auto-relogin" ${autoLogin ? 'checked' : ''}><span class="set-slider"></span></label>
          </div>
          <div class="yandex-auth-note">Что входит в резервную копию: статистика, достижения, локальный профиль, избранное, плейлисты витрины, настройки интерфейса и часть внутренних служебных данных для восстановления прогресса.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="om-btn om-btn--ghost" data-ya-action="backup-info" style="flex:1;justify-content:center;font-size:12px">Что сохраняется?</button>
            <button class="om-btn om-btn--outline" data-ya-action="logout" style="flex:1;justify-content:center;font-size:12px">Выйти из Яндекса</button>
          </div>
        ` : `
          <div class="yandex-auth-caption" style="margin-bottom:10px">Подключение Яндекса позволяет безопасно сохранять прогресс в личную папку приложения на Яндекс Диске и восстанавливать его на других устройствах.</div>
          <div class="yandex-auth-note" style="margin-top:0">Мы не получаем пароль Яндекса. Авторизация идёт через официальный OAuth, а доступ даётся только к папке приложения.</div>
          <button class="yandex-auth-mainbtn" data-ya-action="login">
            <span style="font-size:22px;line-height:1">Я</span>
            <span>Войти через Яндекс</span>
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
  if (window.YandexAuth?.getSessionStatus?.() === 'active' && !sessionStorage.getItem('ya:auto-check:done')) {
    sessionStorage.setItem('ya:auto-check:done', '1');
    setTimeout(() => window._handleYaAction?.('check-backup', $('#prof-auth-grid'), renderAuthBlock), 250);
  }

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
export default { renderProfileShell };

const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

function getLocalBackupSnapshot(localProfile) {
  try {
    const favs = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]');
    const pls = JSON.parse(localStorage.getItem('sc3:playlists') || '[]');
    return {
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      favoritesCount: Array.isArray(favs) ? favs.length : 0,
      playlistsCount: Array.isArray(pls) ? pls.length : 0,
      profileName: localProfile?.name || 'Слушатель'
    };
  } catch {
    return {
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      favoritesCount: 0,
      playlistsCount: 0,
      profileName: localProfile?.name || 'Слушатель'
    };
  }
}

function compareBackupMeta(localInfo, cloudInfo) {
  if (!cloudInfo) return { state: 'unknown', label: 'Нет данных о копии' };
  const localTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
  const cloudTs = Number(cloudInfo.timestamp || 0);
  if (!cloudTs && !localTs) return { state: 'unknown', label: 'Сравнение недоступно' };
  if (cloudTs > localTs) return { state: 'cloud_newer', label: 'Облачная копия новее локальной' };
  if (localTs > cloudTs) return { state: 'local_newer', label: 'Локальные данные новее облачной копии' };
  return localInfo.appVersion === (cloudInfo.appVersion || 'unknown')
    ? { state: 'equal', label: 'Локальная и облачная копии совпадают по дате' }
    : { state: 'mixed', label: 'Дата совпадает, но версии приложения отличаются' };
}

function bindYandexActions(root, rerender) {
  root.querySelectorAll('[data-ya-action]').forEach(btn => {
    btn.onclick = async () => {
      const act = btn.dataset.yaAction;
      const prog = root.querySelector('#ya-restore-progress');
      const bar = root.querySelector('#ya-restore-bar');
      const status = root.querySelector('#ya-restore-status');

      if (act === 'restore-backup' && prog) {
        prog.style.display = 'block';
        btn.disabled = true;
        // Симулируем прогресс пока идёт загрузка
        let pct = 0;
        const t = setInterval(() => { pct = Math.min(pct + 3, 85); if (bar) bar.style.width = `${pct}%`; if (status) status.textContent = pct < 30 ? 'Подключение к Яндекс Диску...' : (pct < 60 ? 'Загрузка backup...' : 'Обработка данных...'); }, 200);
        try {
          await window._handleYaAction?.(act, root, rerender);
        } finally {
          clearInterval(t);
          if (bar) bar.style.width = '100%';
          setTimeout(() => { if (prog) prog.style.display = 'none'; if (bar) bar.style.width = '0%'; btn.disabled = false; }, 500);
        }
      } else {
        window._handleYaAction?.(act, root, rerender);
      }
    };
  });
  const ya = window.YandexAuth;
  const autoChk = root.querySelector('#ya-auto-relogin');
  if (ya && autoChk) autoChk.onchange = e => ya.setAutoRelogin(e.target.checked);

  // Индикатор автосинхронизации
  const syncDot = root.querySelector('#ya-sync-dot');
  if (!syncDot || syncDot._syncBound) return;
  syncDot._syncBound = true;
  window.addEventListener('backup:sync:state', e => {
    const s = e.detail?.state;
    const map = { syncing: { title: 'Синхронизируется...', color: '#ff9800', anim: true },
                  ok: { title: 'Синхронизировано ✓', color: '#4caf50', anim: false },
                  idle: { title: 'Авто-сохранение включено', color: '#4caf50', anim: false } };
    const cfg = map[s] || map.idle;
    syncDot.title = cfg.title;
    syncDot.style.background = cfg.color;
    syncDot.style.animation = cfg.anim ? 'syncPulse 1s infinite' : '';
    // Обновляем метку времени после успешного сохранения
    if (s === 'ok') {
      const lbl = root.querySelector('#ya-last-sync-label');
      if (lbl) lbl.textContent = `последнее: ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }
  });
}

export function renderYandexAuthBlock({ root, localProfile }) {
  if (!root) return;
  const ya = window.YandexAuth;
  if (!ya) return;

  const status = ya.getSessionStatus();
  const profile = ya.getProfile();
  const autoLogin = ya.isAutoRelogin();
  const backupMeta = (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || 'null'); } catch { return null; } })();
  const localInfo = getLocalBackupSnapshot(localProfile);
  const cloudInfo = backupMeta || (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; } })();
  const cmp = compareBackupMeta(localInfo, cloudInfo);

  const statusLabel = { active: 'Подключено', expired: 'Сессия истекла', logged_out: 'Не подключено' }[status] || 'Не подключено';
  const statusColor = { active: '#4caf50', expired: '#ff9800', logged_out: '#888' }[status] || '#888';

  root.innerHTML = `
    <div class="yandex-auth-block">
      <div class="yandex-auth-statusline">
        <span class="yandex-auth-statusdot" style="background:${status === 'logged_out' ? '#888' : statusColor}"></span>
        <div class="yandex-auth-statustext">${statusLabel}</div>
      </div>
      ${profile ? `
        <div class="yandex-auth-profile">
          ${profile.avatar ? `<img src="${profile.avatar}" class="yandex-auth-avatar" loading="lazy">` : '<div class="yandex-auth-avatar--fallback">👤</div>'}
          <div class="yandex-auth-profileinfo">
            <div class="yandex-auth-profilename">${esc(profile.displayName || 'Слушатель')}</div>
            <div class="yandex-auth-profilemeta">@${esc(profile.login || '')} · ID ${profile.yandexId}</div>
          </div>
        </div>
        <div class="yandex-auth-caption">Безопасно: пароль Яндекса не передаётся приложению. Используется только официальный OAuth-вход и токен доступа к папке приложения на Яндекс Диске.</div>
        <div class="yandex-auth-meta">
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Облако</div><div class="yandex-auth-metabox-value">${backupMeta?.timestamp ? new Date(backupMeta.timestamp).toLocaleString('ru-RU') : 'копии ещё нет'}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Сравнение</div><div class="yandex-auth-metabox-value">${cmp.label}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Версия app</div><div class="yandex-auth-metabox-value">${esc(String(cloudInfo?.appVersion || localInfo.appVersion || 'unknown'))}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Объём backup</div><div class="yandex-auth-metabox-value">${cloudInfo?.sizeHuman || 'неизвестно'}</div></div>
        </div>
        <div class="yandex-auth-note">${cloudInfo?.diskUsageHuman ? `На Яндекс Диске приложение сейчас занимает примерно ${cloudInfo.diskUsageHuman}.` : 'Размер копии и суммарное место на Яндекс Диске появятся после успешной проверки облака.'}</div>
        <div class="yandex-auth-actions">
          <button class="modal-action-btn" data-ya-action="rename">✏️ Имя</button>
          <button class="modal-action-btn" data-ya-action="save-backup">☁️ В облако</button>
          <button class="modal-action-btn" data-ya-action="check-backup">🔎 Проверить</button>
          <button class="modal-action-btn" data-ya-action="restore-backup" id="ya-restore-btn">📥 Из облака</button>
          <button class="modal-action-btn" data-ya-action="backup-export-manual">💾 В файл</button>
          <button class="modal-action-btn" data-ya-action="backup-import-manual">📂 Из файла</button>
        </div>
        <div id="ya-restore-progress" style="display:none;margin-top:8px">
          <div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden">
            <div id="ya-restore-bar" style="height:100%;width:0%;background:var(--grad-blue);transition:width .3s ease;border-radius:2px"></div>
          </div>
          <div id="ya-restore-status" style="font-size:11px;color:#9db7dd;margin-top:4px;text-align:center">Загрузка...</div>
        </div>
      <div class="yandex-auth-autologin">
          <span class="yandex-auth-autologin-text">Автовход при истечении сессии</span>
          <label class="set-switch"><input type="checkbox" id="ya-auto-relogin" ${autoLogin ? 'checked' : ''}><span class="set-slider"></span></label>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#7f93b5;padding:6px 0">
          <style>.syncPulse{animation:syncPulse 1s infinite}@keyframes syncPulse{0%,to{opacity:1}50%{opacity:.3}}</style>
          <span id="ya-sync-dot" title="Авто-сохранение включено" style="width:8px;height:8px;border-radius:50%;background:#4caf50;flex-shrink:0;transition:background .3s"></span>
          <span>Авто-сохранение в облако · <span id="ya-last-sync-label">${(() => { const ts = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0); return ts > 0 ? `последнее: ${new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'ещё не сохранялось'; })()}</span></span>
        </div>
        <div class="yandex-auth-note">Один backup-файл объединяет прогресс, события, избранное, плейлисты, настройки, локальный профиль и данные устройств. Этот же файл можно сохранить вручную на устройство и перенести на другое своё устройство.</div>
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

  bindYandexActions(root, () => renderYandexAuthBlock({ root, localProfile }));
}

export default { renderYandexAuthBlock };

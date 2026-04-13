const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

function safeNum(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function getLocalBackupSnapshot(localProfile) {
  try {
    const favs = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]');
    const pls = JSON.parse(localStorage.getItem('sc3:playlists') || '[]');
    const reg = JSON.parse(localStorage.getItem('backup:device_registry:v1') || '[]');
    return {
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || 0),
      favoritesCount: Array.isArray(favs) ? favs.filter(i => !i?.inactiveAt).length : 0,
      playlistsCount: Array.isArray(pls) ? pls.length : 0,
      profileName: localProfile?.name || 'Слушатель',
      level: safeNum(window.achievementEngine?.profile?.level || 1),
      xp: safeNum(window.achievementEngine?.profile?.xp || 0),
      achievementsCount: Object.keys(window.achievementEngine?.unlocked || {}).length,
      devicesCount: Array.isArray(reg) ? reg.length : 0,
      deviceStableCount: Array.isArray(reg) ? new Set(reg.map(d => String(d?.deviceStableId || '').trim()).filter(Boolean)).size : 0
    };
  } catch {
    return {
      appVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts') || 0),
      favoritesCount: 0,
      playlistsCount: 0,
      profileName: localProfile?.name || 'Слушатель',
      level: safeNum(window.achievementEngine?.profile?.level || 1),
      xp: safeNum(window.achievementEngine?.profile?.xp || 0),
      achievementsCount: Object.keys(window.achievementEngine?.unlocked || {}).length,
      devicesCount: 0,
      deviceStableCount: 0
    };
  }
}

function getRichnessScore(summary = {}) {
  return (
    safeNum(summary.level) * 1000 +
    safeNum(summary.xp) +
    safeNum(summary.achievementsCount) * 250 +
    safeNum(summary.favoritesCount) * 40 +
    safeNum(summary.playlistsCount) * 60 +
    safeNum(summary.statsCount) * 6 +
    safeNum(summary.eventCount) * 2 +
    safeNum(summary.devicesCount) * 25 +
    safeNum(summary.deviceStableCount) * 30
  );
}

function compareBackupMeta(localInfo, cloudInfo) {
  if (!cloudInfo) return { state: 'unknown', label: 'Нет данных о копии' };

  const localTs = safeNum(localInfo?.timestamp);
  const cloudTs = safeNum(cloudInfo?.timestamp);
  const localScore = getRichnessScore(localInfo);
  const cloudScore = getRichnessScore(cloudInfo);
  const scoreDiff = cloudScore - localScore;
  const tsDiff = cloudTs - localTs;

  if (!cloudTs && cloudScore === 0 && !localTs) return { state: 'unknown', label: 'Сравнение недоступно' };
  if (!cloudTs && cloudScore === 0) return { state: 'local_newer', label: 'Облачная копия отсутствует или пуста' };
  if (cloudTs > localTs && cloudScore >= localScore) return { state: 'cloud_newer', label: 'Облако выглядит богаче и новее локального профиля' };
  if (localTs > cloudTs && localScore >= cloudScore) return { state: 'local_newer', label: 'Локальные данные выглядят богаче облачной копии' };
  if (Math.abs(tsDiff) < 2 * 60000 && Math.abs(scoreDiff) < 300) return { state: 'equal', label: 'Локальная и облачная копии практически эквивалентны' };
  if (cloudScore > localScore && cloudTs >= localTs) return { state: 'cloud_probable', label: 'Облако вероятно богаче локального профиля' };
  if (localScore > cloudScore && localTs >= cloudTs) return { state: 'local_probable', label: 'Локальный профиль вероятно богаче облачного' };
  return { state: 'mixed', label: 'Есть смешанные признаки: требуется ручная проверка' };
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
        let pct = 0;
        const t = setInterval(() => {
          pct = Math.min(pct + 3, 85);
          if (bar) bar.style.width = `${pct}%`;
          if (status) status.textContent = pct < 30
            ? 'Подключение к Яндекс Диску...'
            : (pct < 60 ? 'Загрузка backup...' : 'Обработка данных...');
        }, 200);
        try {
          await window._handleYaAction?.(act, root, rerender);
        } finally {
          clearInterval(t);
          if (bar) bar.style.width = '100%';
          setTimeout(() => {
            if (prog) prog.style.display = 'none';
            if (bar) bar.style.width = '0%';
            btn.disabled = false;
          }, 500);
        }
      } else {
        await window._handleYaAction?.(act, root, rerender);
      }
    };
  });

  const ya = window.YandexAuth;
  const autoChk = root.querySelector('#ya-auto-relogin');
  if (ya && autoChk) autoChk.onchange = e => ya.setAutoRelogin(e.target.checked);

  const autosaveToggle = root.querySelector('#ya-autosave-toggle');
  if (autosaveToggle) {
    autosaveToggle.onchange = async e => {
      try {
        const { setSyncEnabled } = await import('../../analytics/backup-sync-engine.js');
        setSyncEnabled(e.target.checked);
        window.NotificationSystem?.info(e.target.checked ? 'Автосохранение включено' : 'Автосохранение выключено');
      } catch {}
    };
  }

  const autosaveInterval = root.querySelector('#ya-autosave-interval');
  if (autosaveInterval) {
    autosaveInterval.onchange = async e => {
      try {
        const { setSyncInterval } = await import('../../analytics/backup-sync-engine.js');
        setSyncInterval(Number(e.target.value));
        window.NotificationSystem?.info(`Интервал: ${e.target.value} сек`);
      } catch {}
    };
  }
}

async function updateSyncDot(root) {
  const syncDot = root?.querySelector('#ya-sync-dot');
  if (!syncDot) return;

  try {
    const { isSyncReady, isSyncEnabled } = await import('../../analytics/backup-sync-engine.js');
    if (!isSyncEnabled()) {
      syncDot.style.background = '#888';
      syncDot.style.animation = '';
      syncDot.title = 'Автосохранение выключено';
      return;
    }
    if (!isSyncReady()) {
      syncDot.style.background = '#ff9800';
      syncDot.style.animation = '';
      syncDot.title = 'Ожидание подтверждения данных...';
      return;
    }
    syncDot.style.background = '#4caf50';
    syncDot.style.animation = '';
    syncDot.title = 'Автосохранение активно';
  } catch {
    syncDot.style.background = '#888';
    syncDot.style.animation = '';
    syncDot.title = 'Статус синхронизации недоступен';
  }
}

function bindReactiveEvents(root, rerender) {
  if (root._yaReactiveBound) return;
  root._yaReactiveBound = true;

  const rerenderSafe = () => {
    if (!root.isConnected) return;
    rerender();
  };

  const updateDotSafe = () => {
    if (!root.isConnected) return;
    updateSyncDot(root);
  };

  root._yaReactiveHandlers = {
    onAuthChanged: () => rerenderSafe(),
    onBackupMetaUpdated: () => rerenderSafe(),
    onSyncReady: () => {
      rerenderSafe();
      updateDotSafe();
    },
    onSyncSettingsChanged: () => updateDotSafe(),
    onSyncState: e => {
      const dot = root.querySelector('#ya-sync-dot');
      if (!dot) return;
      const s = e.detail?.state;
      const map = {
        syncing: { title: 'Синхронизируется...', color: '#ff9800', anim: true },
        ok: { title: 'Синхронизировано ✓', color: '#4caf50', anim: false },
        idle: { title: 'Авто-сохранение активно', color: '#4caf50', anim: false }
      };
      const cfg = map[s] || map.idle;
      dot.title = cfg.title;
      dot.style.background = cfg.color;
      dot.style.animation = cfg.anim ? 'syncPulse 1s infinite' : '';

      if (s === 'ok') {
        const lbl = root.querySelector('#ya-last-sync-label');
        if (lbl) {
          lbl.textContent = `последнее: ${new Date().toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
          })}`;
        }
      }
    }
  };

  window.addEventListener('yandex:auth:changed', root._yaReactiveHandlers.onAuthChanged);
  window.addEventListener('yandex:backup:meta-updated', root._yaReactiveHandlers.onBackupMetaUpdated);
  window.addEventListener('backup:sync:ready', root._yaReactiveHandlers.onSyncReady);
  window.addEventListener('backup:sync:settings:changed', root._yaReactiveHandlers.onSyncSettingsChanged);
  window.addEventListener('backup:sync:state', root._yaReactiveHandlers.onSyncState);
}

export function renderYandexAuthBlock({ root, localProfile }) {
  if (!root) return;
  const ya = window.YandexAuth;
  if (!ya) return;

  const rerender = () => renderYandexAuthBlock({ root, localProfile });

  const status = ya.getSessionStatus();
  const profile = ya.getProfile();
  const autoLogin = ya.isAutoRelogin();
  const hasDiskAccess = !!ya.hasDiskAccess?.();
  const grantedScopes = ya.getGrantedScopes?.() || [];
  const backupMeta = (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || 'null'); } catch { return null; } })();
  const localInfo = getLocalBackupSnapshot(localProfile);
  const cloudInfo = backupMeta || (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; } })();
  const cmp = compareBackupMeta(localInfo, cloudInfo);

  const statusLabel = {
    active: 'Подключено',
    expired: 'Сессия истекла',
    logged_out: 'Не подключено'
  }[status] || 'Не подключено';

  const statusColor = {
    active: '#4caf50',
    expired: '#ff9800',
    logged_out: '#888'
  }[status] || '#888';

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
        <div class="yandex-auth-note">Права токена: ${hasDiskAccess ? '✅ доступ к папке приложения на Диске' : '⚠️ доступ к Диску не подтверждён'}${grantedScopes.length ? `<br>Scopes: ${esc(grantedScopes.join(' '))}` : ''}</div>
        <div class="yandex-auth-meta">
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Облако</div><div class="yandex-auth-metabox-value">${backupMeta?.timestamp ? new Date(backupMeta.timestamp).toLocaleString('ru-RU') : 'копии ещё нет'}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Сравнение</div><div class="yandex-auth-metabox-value">${cmp.label}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Версия app</div><div class="yandex-auth-metabox-value">${esc(String(cloudInfo?.appVersion || localInfo.appVersion || 'unknown'))}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Объём backup</div><div class="yandex-auth-metabox-value">${cloudInfo?.sizeHuman || 'неизвестно'}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Плейлисты / события</div><div class="yandex-auth-metabox-value">${safeNum(cloudInfo?.playlistsCount || 0)} / ${safeNum(cloudInfo?.eventCount || 0)}</div></div>
          <div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Stats / устройства</div><div class="yandex-auth-metabox-value">${safeNum(cloudInfo?.statsCount || 0)} / ${safeNum(cloudInfo?.devicesCount || 0)}</div></div>
        </div>
        <div class="yandex-auth-note">${cloudInfo?.diskUsageHuman ? `На Яндекс Диске приложение сейчас занимает примерно ${cloudInfo.diskUsageHuman}.` : 'Размер копии и суммарное место на Яндекс Диске появятся после успешной проверки облака.'}</div>
        ${cmp.state === 'cloud_newer' || cmp.state === 'cloud_probable' ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,152,0,.1);border:1px solid rgba(255,152,0,.3);border-radius:10px;margin-bottom:10px">
          <span style="font-size:18px">⚠️</span>
          <div style="flex:1;font-size:12px;color:#ffb74d;line-height:1.4">
            В облаке есть более богатая или более новая копия.<br>Рекомендуем восстановить или сравнить.
          </div>
          <button class="modal-action-btn" data-ya-action="restore-backup" style="font-size:11px;padding:6px 10px;flex-shrink:0">📥 Загрузить</button>
        </div>` : ''}
        <div class="yandex-auth-actions">
          <button class="modal-action-btn" data-ya-action="rename">✏️ Имя</button>
          <button class="modal-action-btn" data-ya-action="save-backup">☁️ Сохранить</button>
          <button class="modal-action-btn" data-ya-action="check-backup">🔎 Сравнить</button>
          <button class="modal-action-btn" data-ya-action="restore-backup">📥 Из облака</button>
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
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#7f93b5;padding:6px 0;flex-wrap:wrap">
          <style>.syncPulse{animation:syncPulse 1s infinite}@keyframes syncPulse{0%,to{opacity:1}50%{opacity:.3}}</style>
          <span id="ya-sync-dot" title="Авто-сохранение" style="width:8px;height:8px;border-radius:50%;background:#888;flex-shrink:0;transition:background .3s"></span>
          <span style="flex:1">Авто-сохранение · <span id="ya-last-sync-label">${(() => {
            const ts = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
            return ts > 0
              ? `последнее: ${new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : 'ещё не сохранялось';
          })()}</span></span>
          <label class="set-switch" style="flex-shrink:0" title="Вкл/выкл автосохранение"><input type="checkbox" id="ya-autosave-toggle" ${(() => {
            try { return localStorage.getItem('backup:autosync:enabled') !== '0' ? 'checked' : ''; } catch { return 'checked'; }
          })()}><span class="set-slider"></span></label>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#7f93b5;padding:2px 0;margin-bottom:4px">
          <span style="flex:1;color:#888">Интервал автосохранения</span>
          <span style="color:#888;font-size:11px">Cooldown: 1 мин после изменения</span>
        </div>
        <div class="yandex-auth-note">Один backup-файл объединяет прогресс, события, избранное, плейлисты, настройки, локальный профиль и данные устройств. Этот же файл можно сохранить вручную на устройство и перенести на другое своё устройство.</div>
        <div class="yandex-auth-bottomactions">
          <button class="om-btn om-btn--ghost" data-ya-action="backup-info">Что сохраняется?</button>
          <button class="om-btn om-btn--ghost" data-ya-action="delete-old-backups">Удалить старые backup</button>
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

  bindYandexActions(root, rerender);
  bindReactiveEvents(root, rerender);
  updateSyncDot(root);
}

export default { renderYandexAuthBlock };

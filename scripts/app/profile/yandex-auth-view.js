import { safeNum, getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';

const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

const compareBackupMeta = (l, c) => {
  if (!c) return { state: 'unknown', label: 'Нет данных о копии' };
  const cmp = compareLocalVsCloud(l || {}, c || {}), stateMap = { no_cloud: 'local_newer', cloud_richer_new_device: 'cloud_newer', cloud_richer: 'cloud_newer', cloud_probably_richer: 'cloud_probable', local_richer: 'local_newer', local_probably_richer: 'local_probable', equivalent: 'equal', conflict: 'mixed' };
  return { state: stateMap[cmp.state] || 'mixed', label: getBackupCompareLabel(l, c), compare: cmp };
};

const bindYandexActions = (root, rerender) => {
  root.querySelectorAll('[data-ya-action]').forEach(btn => btn.onclick = async () => {
    const act = btn.dataset.yaAction, prog = root.querySelector('#ya-restore-progress'), bar = root.querySelector('#ya-restore-bar'), status = root.querySelector('#ya-restore-status');
    if (act === 'restore-backup' && prog) {
      prog.style.display = 'block'; btn.disabled = true; let pct = 0;
      const t = setInterval(() => { pct = Math.min(pct + 3, 85); if (bar) bar.style.width = `${pct}%`; if (status) status.textContent = pct < 30 ? 'Подключение к Яндекс Диску...' : (pct < 60 ? 'Загрузка backup...' : 'Обработка данных...'); }, 200);
      try { await window._handleYaAction?.(act, root, rerender); } finally { clearInterval(t); if (bar) bar.style.width = '100%'; setTimeout(() => { if (prog) prog.style.display = 'none'; if (bar) bar.style.width = '0%'; btn.disabled = false; }, 500); }
    } else await window._handleYaAction?.(act, root, rerender);
  });
  const ya = window.YandexAuth, autoChk = root.querySelector('#ya-auto-relogin'), autosaveToggle = root.querySelector('#ya-autosave-toggle');
  if (ya && autoChk) autoChk.onchange = e => ya.setAutoRelogin(e.target.checked);
  if (autosaveToggle) autosaveToggle.onchange = async e => { try { const { setSyncEnabled } = await import('../../analytics/backup-sync-engine.js'); setSyncEnabled(e.target.checked); window.NotificationSystem?.info(e.target.checked ? 'Автосохранение включено' : 'Автосохранение выключено'); } catch {} };
};

const updateSyncDot = async root => {
  const syncDot = root?.querySelector('#ya-sync-dot'); if (!syncDot) return;
  try {
    const { isSyncReady, isSyncEnabled } = await import('../../analytics/backup-sync-engine.js');
    Object.assign(syncDot.style, { background: !isSyncEnabled() ? '#888' : (!isSyncReady() ? '#ff9800' : '#4caf50'), animation: '' });
    syncDot.title = !isSyncEnabled() ? 'Автосохранение выключено' : (!isSyncReady() ? 'Ожидание подтверждения данных...' : 'Автосохранение активно');
  } catch { Object.assign(syncDot.style, { background: '#888', animation: '' }); syncDot.title = 'Статус синхронизации недоступен'; }
};

const bindReactiveEvents = (root, rerender) => {
  if (root._yaReactiveBound) return; root._yaReactiveBound = true;
  const s = async () => {
    if (!root.isConnected) return;
    try {
      const isProfileOpen = window.AlbumsManager?.getCurrentAlbum?.() === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__');
      const isPlaying = !!window.playerCore?.isPlaying?.();
      if (isProfileOpen && isPlaying) {
        const mod = await import('./view.js');
        const ok = await mod.refreshProfileViewSoft?.(window.AlbumsManager).catch(() => false);
        if (ok) return;
      }
    } catch {}
    rerender();
  }, d = () => root.isConnected && updateSyncDot(root);
  root._yaReactiveHandlers = {
    onAuthChanged: s,
    onBackupMetaUpdated: s,
    onSyncReady: () => { s(); d(); },
    onSyncSettingsChanged: d,
    onCloudNewer: e => {
      if (!root.isConnected) return;
      s();
      const dt = e.detail || {}, meta = dt.meta || null, cmpState = String(dt.compareState || ''), k = `yandex:cloud:newer:prompt:${safeNum(meta?.timestamp)}:${cmpState}`;
      if (!meta || sessionStorage.getItem(k) === '1') return;
      sessionStorage.setItem(k, '1');
      setTimeout(() => {
        if (!root.isConnected) return;
        const ask = window.Modals?.confirm;
        if (!ask) return;
        ask({
          title: dt.isFreshLogin ? 'Восстановить прогресс из облака?' : 'Облачная копия найдена',
          textHtml: `${esc(dt.isNewDevice ? 'Это похоже на основную копию для нового устройства.' : 'В облаке есть более богатая или более новая копия.')}<br><br>${esc(meta?.profileName || 'Слушатель')} · ${meta?.timestamp ? new Date(meta.timestamp).toLocaleString('ru-RU') : 'без даты'}<br><br>${dt.isFreshLogin ? 'Рекомендуется сразу проверить и восстановить прогресс.' : 'Открыть восстановление из облака?'}`,
          confirmText: dt.isFreshLogin ? 'Восстановить' : 'Открыть',
          cancelText: 'Позже',
          onConfirm: () => window._handleYaAction?.('restore-backup', root, rerender),
          onCancel: async () => {
            try {
              const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
              markSyncReady('user_skipped_restore');
            } catch {}
          }
        });
      }, dt.isFreshLogin ? 80 : 250);
    },
    onSyncState: e => {
      const dot = root.querySelector('#ya-sync-dot'); if (!dot) return;
      const st = e.detail?.state, map = { syncing: { title: 'Синхронизируется...', color: '#ff9800', anim: true }, ok: { title: 'Синхронизировано ✓', color: '#4caf50', anim: false }, idle: { title: 'Авто-сохранение активно', color: '#4caf50', anim: false } }, cfg = map[st] || map.idle;
      Object.assign(dot.style, { background: cfg.color, animation: cfg.anim ? 'syncPulse 1s infinite' : '' }); dot.title = cfg.title;
      if (st === 'ok') { const lbl = root.querySelector('#ya-last-sync-label'); if (lbl) lbl.textContent = `последнее: ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`; }
    }
  };
  window.addEventListener('yandex:auth:changed', root._yaReactiveHandlers.onAuthChanged);
  window.addEventListener('yandex:backup:meta-updated', root._yaReactiveHandlers.onBackupMetaUpdated);
  window.addEventListener('backup:sync:ready', root._yaReactiveHandlers.onSyncReady);
  window.addEventListener('backup:sync:settings:changed', root._yaReactiveHandlers.onSyncSettingsChanged);
  window.addEventListener('yandex:cloud:newer', root._yaReactiveHandlers.onCloudNewer);
  window.addEventListener('backup:sync:state', root._yaReactiveHandlers.onSyncState);
};

export function renderYandexAuthBlock({ root, localProfile }) {
  if (!root || !window.YandexAuth) return;
  const ya = window.YandexAuth, rr = () => renderYandexAuthBlock({ root, localProfile });
  const st = ya.getSessionStatus(), pr = ya.getProfile(), aL = ya.isAutoRelogin();
  const hDA = !!ya.hasDiskAccess?.(), gS = ya.getGrantedScopes?.() || [];
  const bM = (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || 'null'); } catch { return null; } })();
  const lI = getLocalBackupUiSnapshot(localProfile);
  const cI = bM || (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; } })();
  const cmp = compareBackupMeta(lI, cI);
  const sL = { active: 'Подключено', expired: 'Сессия истекла', logged_out: 'Не подключено' }[st] || 'Не подключено';
  const sC = { active: '#4caf50', expired: '#ff9800', logged_out: '#888' }[st] || '#888';

  const lastSyncLabel = (() => {
    const ts = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
    return ts > 0 ? `последнее: ${new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'ещё не сохранялось';
  })();

  const autosaveChecked = (() => { try { return localStorage.getItem('backup:autosync:enabled') !== '0' ? 'checked' : ''; } catch { return 'checked'; } })();

  if (st === 'active' && pr) {
    const avatarHtml = pr.avatar
      ? `<img class="yandex-auth-avatar" src="${esc(pr.avatar)}" alt="avatar">`
      : `<div class="yandex-auth-avatar--fallback">Я</div>`;

    let restoreDone = false;
    try { restoreDone = localStorage.getItem('backup:restore_or_skip_done') === '1'; } catch {}

    const cloudNewerHtml = (!restoreDone && (cmp.state === 'cloud_newer' || cmp.state === 'cloud_probable'))
      ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,152,0,.1);border:1px solid rgba(255,152,0,.3);border-radius:10px;margin-bottom:10px"><span style="font-size:18px">⚠️</span><div style="flex:1;font-size:12px;color:#ffb74d;line-height:1.4">В облаке есть более богатая или более новая копия.<br>При желании можно восстановить её вручную.</div><button class="modal-action-btn" data-ya-action="restore-backup" style="font-size:11px;padding:6px 10px;flex-shrink:0">📥 Загрузить</button></div>`
      : '';

    root.innerHTML = `<div class="yandex-auth-block">
      <div class="yandex-auth-statusline"><div class="yandex-auth-statusdot" style="background:${sC}"></div><div class="yandex-auth-statustext">${esc(sL)}</div></div>
      <div class="yandex-auth-profile">${avatarHtml}<div class="yandex-auth-profileinfo"><div class="yandex-auth-profilename">${esc(pr.displayName || pr.login || 'Пользователь')}</div><div class="yandex-auth-profilemeta">${esc(pr.login || '')}${hDA ? ' · Диск ✓' : ''}</div></div></div>
      <div class="yandex-auth-meta"><div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Облако</div><div class="yandex-auth-metabox-value">${cI ? (cI.timestamp ? new Date(cI.timestamp).toLocaleString('ru-RU') : 'есть копия') : 'копии ещё нет'}</div></div><div class="yandex-auth-metabox"><div class="yandex-auth-metabox-label">Сравнение</div><div class="yandex-auth-metabox-value">${esc(cmp.label)}</div></div></div>
      ${cloudNewerHtml}
      <div class="yandex-auth-actions"><button class="modal-action-btn" data-ya-action="rename">✏️ Имя</button><button class="modal-action-btn" data-ya-action="save-backup">☁️ Сохранить</button><button class="modal-action-btn" data-ya-action="check-backup">🔎 Сравнить</button><button class="modal-action-btn" data-ya-action="restore-backup">📥 Из облака</button><button class="modal-action-btn" data-ya-action="backup-export-manual">💾 В файл</button><button class="modal-action-btn" data-ya-action="backup-import-manual">📂 Из файла</button></div>
      <div id="ya-restore-progress" style="display:none;margin-top:8px"><div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden"><div id="ya-restore-bar" style="height:100%;width:0%;background:var(--grad-blue);transition:width .3s ease;border-radius:2px"></div></div><div id="ya-restore-status" style="font-size:11px;color:#9db7dd;margin-top:4px;text-align:center">Загрузка...</div></div>
      <div class="yandex-auth-autologin"><span class="yandex-auth-autologin-text">Автовход при истечении сессии</span><label class="set-switch"><input type="checkbox" id="ya-auto-relogin" ${aL ? 'checked' : ''}><span class="set-slider"></span></label></div>
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#7f93b5;padding:6px 0;flex-wrap:wrap"><style>.syncPulse{animation:syncPulse 1s infinite}@keyframes syncPulse{0%,to{opacity:1}50%{opacity:.3}}</style><span id="ya-sync-dot" title="Авто-сохранение" style="width:8px;height:8px;border-radius:50%;background:#888;flex-shrink:0;transition:background .3s"></span><span style="flex:1">Авто-сохранение · <span id="ya-last-sync-label">${lastSyncLabel}</span></span><label class="set-switch" style="flex-shrink:0" title="Вкл/выкл автосохранение"><input type="checkbox" id="ya-autosave-toggle" ${autosaveChecked}><span class="set-slider"></span></label></div>
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#7f93b5;padding:2px 0;margin-bottom:4px"><span style="flex:1;color:#888">Автосохранение срабатывает пакетно по значимым изменениям профиля</span><span style="color:#888;font-size:11px">Умный режим</span></div>
      <div class="yandex-auth-note">Облачная копия хранит общий прогресс аккаунта: события, достижения, избранное, плейлисты, профиль и данные устройств. Восстановление выполняется вручную через предпросмотр, чтобы не затирать локальные данные без подтверждения.</div>
      <div class="yandex-auth-bottomactions"><button class="om-btn om-btn--ghost" data-ya-action="backup-info">Что сохраняется?</button><button class="om-btn om-btn--ghost" data-ya-action="delete-old-backups">Удалить старые backup</button><button class="om-btn om-btn--ghost" data-ya-action="reconnect-rights">Переподключить права</button><button class="om-btn om-btn--outline" data-ya-action="logout">Выйти из Яндекса</button></div>
    </div>`;
  } else {
    root.innerHTML = `<div class="yandex-auth-block">
      <div class="yandex-auth-statusline"><div class="yandex-auth-statusdot" style="background:${sC}"></div><div class="yandex-auth-statustext">${esc(sL)}</div></div>
      <div class="yandex-auth-caption" style="margin-bottom:10px">Подключение Яндекса позволяет безопасно сохранять прогресс в личную папку приложения на Яндекс Диске и восстанавливать его на других устройствах.</div>
      <div class="yandex-auth-note" style="margin-top:0">Мы не получаем пароль Яндекса. Авторизация идёт через официальный OAuth, а доступ даётся только к папке приложения.</div>
      <button class="yandex-auth-mainbtn" data-ya-action="login"><span style="font-size:22px;line-height:1">Я</span><span>Войти через Яндекс</span></button>
    </div>`;
  }

  bindYandexActions(root, rr);
  bindReactiveEvents(root, rr);
  updateSyncDot(root);
}

export default { renderYandexAuthBlock };

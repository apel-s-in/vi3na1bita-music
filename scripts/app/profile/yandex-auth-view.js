import { safeNum, getLocalBackupUiSnapshot } from '../../analytics/backup-summary.js';
import { getCloudCompareViewModel, formatCloudTimeOnly } from './cloud-ui-helpers.js';
import { esc } from './profile-render-kit.js';
import { bindAccountDevicesBlock } from './account-devices-view.js';
import { getSyncStatusLine } from '../../analytics/sync-revisions.js';
import { renderYandexConnectedBlock, renderYandexLoggedOutBlock } from './account-cloud-renderers.js';

const bindYandexActions = (rt, r) => {
  rt.querySelectorAll('[data-ya-action]').forEach(b => b.onclick = async () => {
    const a = b.dataset.yaAction, p = rt.querySelector('#ya-restore-progress'), br = rt.querySelector('#ya-restore-bar'), s = rt.querySelector('#ya-restore-status');
    if (a === 'restore-backup' && p) {
      p.style.display = 'block'; b.disabled = true; let c = 0;
      const t = setInterval(() => { c = Math.min(c + 3, 85); if (br) br.style.width = `${c}%`; if (s) s.textContent = c < 30 ? 'Подключение к Яндекс Диску...' : (c < 60 ? 'Загрузка backup...' : 'Обработка данных...'); }, 200);
      try { await window._handleYaAction?.(a, rt, r); } finally { clearInterval(t); if (br) br.style.width = '100%'; setTimeout(() => { if (p) p.style.display = 'none'; if (br) br.style.width = '0%'; b.disabled = false; }, 500); }
    } else await window._handleYaAction?.(a, rt, r);
  });
  const ya = window.YandexAuth, aC = rt.querySelector('#ya-auto-relogin'), aT = rt.querySelector('#ya-autosave-toggle');
  if (ya && aC) aC.onchange = e => ya.setAutoRelogin(e.target.checked);
  if (aT) aT.onchange = async e => { try { const { setSyncEnabled } = await import('../../analytics/backup-sync-engine.js'); setSyncEnabled(e.target.checked); window.NotificationSystem?.info(e.target.checked ? 'Автосохранение включено' : 'Автосохранение выключено'); } catch {} };
};

const updateSyncDot = async rt => {
  const s = rt?.querySelector('#ya-sync-dot'); if (!s) return;
  try {
    const { isSyncReady, isSyncEnabled } = await import('../../analytics/backup-sync-engine.js');
    Object.assign(s.style, { background: !isSyncEnabled() ? '#888' : (!isSyncReady() ? '#ff9800' : '#4caf50'), animation: '' });
    s.title = !isSyncEnabled() ? 'Автосохранение выключено' : (!isSyncReady() ? 'Ожидание подтверждения данных...' : 'Автосохранение активно');
  } catch { Object.assign(s.style, { background:'#888', animation:'' }); s.title = 'Статус синхронизации недоступен'; }
};

const bindReactiveEvents = (rt, r) => {
  if (rt._yaReactiveBound) return; rt._yaReactiveBound = true;
  const s = async () => { if (!rt.isConnected) return; try { if (window.AlbumsManager?.getCurrentAlbum?.() === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__')) { const m = await import('./view.js'), ok = await m.refreshProfileViewSoft?.(window.AlbumsManager).catch(() => false); if (ok) return; } } catch {} r(); };
  const d = () => rt.isConnected && updateSyncDot(rt);
  rt._yaReactiveHandlers = {
    onAuthChanged:s, onBackupMetaUpdated:s, onSyncReady:()=>{s();d();}, onSyncSettingsChanged:d,
    onCloudNewer:e=>{ if (!rt.isConnected) return; s(); const m = e.detail?.meta || null; if (!m || e.detail?.isFreshLogin) return; try { const l = safeNum(localStorage.getItem('yandex:last_backup_local_ts')), c = safeNum(m?.timestamp); if (localStorage.getItem('backup:restore_or_skip_done') === '1' && c > 0 && l > 0 && Math.abs(c - l) < 5000) return; } catch {} },
    onSyncRevision:()=>{ const l = rt.querySelector('#ya-last-sync-label'); if (l) l.textContent = getSyncStatusLine(); },
    onSyncState:e=>{ const d = rt.querySelector('#ya-sync-dot'); if (!d) return; const st = e.detail?.state, m = { syncing:{title:'Синхронизируется...',color:'#ff9800',anim:true}, ok:{title:'Синхронизировано ✓',color:'#4caf50',anim:false}, idle:{title:'Авто-сохранение активно',color:'#4caf50',anim:false} }, c = m[st] || m.idle; Object.assign(d.style, { background:c.color, animation:c.anim ? 'syncPulse 1s infinite' : '' }); d.title = c.title; if (st === 'ok') { const l = rt.querySelector('#ya-last-sync-label'); if (l) l.textContent = getSyncStatusLine(); } }
  };
  window.addEventListener('yandex:auth:changed', rt._yaReactiveHandlers.onAuthChanged);
  window.addEventListener('yandex:backup:meta-updated', rt._yaReactiveHandlers.onBackupMetaUpdated);
  window.addEventListener('backup:sync:ready', rt._yaReactiveHandlers.onSyncReady);
  window.addEventListener('backup:sync:settings:changed', rt._yaReactiveHandlers.onSyncSettingsChanged);
  window.addEventListener('yandex:cloud:newer', rt._yaReactiveHandlers.onCloudNewer);
  window.addEventListener('backup:sync:state', rt._yaReactiveHandlers.onSyncState);
  window.addEventListener('backup:sync:revision', rt._yaReactiveHandlers.onSyncRevision);
};

export function renderYandexAuthBlock({ root, localProfile }) {
  if (!root || !window.YandexAuth) return;
  const ya = window.YandexAuth, rr = () => renderYandexAuthBlock({ root, localProfile }), st = ya.getSessionStatus(), pr = ya.getProfile(), aL = ya.isAutoRelogin(), hDA = !!ya.hasDiskAccess?.();
  const bM = (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_meta') || 'null'); } catch { return null; } })();
  const lI = getLocalBackupUiSnapshot(localProfile), cI = bM || (() => { try { return JSON.parse(localStorage.getItem('yandex:last_backup_check') || 'null'); } catch { return null; } })(), cmp = getCloudCompareViewModel(lI, cI);
  const sL = { active:'Подключено', expired:'Сессия истекла', logged_out:'Не подключено' }[st] || 'Не подключено', sC = { active:'#4caf50', expired:'#ff9800', logged_out:'#888' }[st] || '#888';
  const lSL = (() => { const t = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0); return getSyncStatusLine() || (t > 0 ? `последнее: ${formatCloudTimeOnly(t)}` : 'ещё не сохранялось'); })();
  const aCh = (() => { try { return localStorage.getItem('backup:autosync:enabled') !== '0' ? 'checked' : ''; } catch { return 'checked'; } })();

  if (st === 'active' && pr) {
    const avatarHtml = pr.avatar ? `<img class="yandex-auth-avatar" src="${esc(pr.avatar)}" alt="avatar" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'yandex-auth-avatar--fallback',textContent:'Я'}))">` : `<div class="yandex-auth-avatar--fallback">Я</div>`;
    let restoreDone = false; try { restoreDone = localStorage.getItem('backup:restore_or_skip_done') === '1'; } catch {}
    root.innerHTML = renderYandexConnectedBlock({ profile:pr, statusLabel:sL, statusColor:sC, hasDiskAccess:hDA, avatarHtml, cloudInfo:cI, compareVm:cmp, restoreDone, lastSyncLabel:lSL, autosaveChecked:aCh, autoRelogin:aL });
  } else root.innerHTML = renderYandexLoggedOutBlock({ statusLabel:sL, statusColor:sC });

  bindYandexActions(root, rr);
  bindAccountDevicesBlock(root, rr);
  bindReactiveEvents(root, rr);
  updateSyncDot(root);
}

export default { renderYandexAuthBlock };

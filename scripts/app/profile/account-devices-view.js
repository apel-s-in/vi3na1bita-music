import DeviceRegistry from '../../analytics/device-registry.js';
import { markDevicesDirty } from '../../analytics/sync-dirty-events.js';
import { ensureCurrentDeviceRegistryRow } from '../../core/device-linking.js';
import { esc, fmtDateTime as fmt, renderMetaBox, renderSmallListRow, renderInlineActions } from './profile-ui-kit.js';

const sS = v => String(v == null ? '' : v).trim();
const icon = d => d?.platform === 'ios' ? '📱' : d?.platform === 'android' ? '🤖' : '💻';
const curId = () => localStorage.getItem('deviceStableId') || '';

const rows = () => DeviceRegistry.normalizeDeviceRegistry(DeviceRegistry.getDeviceRegistry()).sort((a,b)=>(b.lastSeenAt||0)-(a.lastSeenAt||0));

const renderMiniRow = d => {
  const isCur = DeviceRegistry.isCurrentDevice(d), retired = Number(d.retiredAt || 0) > 0;
  return renderSmallListRow({
    icon: icon(d),
    title: `${d.label || 'Устройство'}${isCur ? ' · это устройство' : ''}${retired ? ' · скрыто' : ''}`,
    desc: `${[d.class, d.browser, d.pwa ? 'PWA' : 'браузер'].filter(Boolean).join(' · ')} · ${fmt(d.lastSeenAt)}`,
    attrs: `data-dev-open="${esc(d.deviceStableId || d.deviceHash || '')}"`,
    style: `width:100%;text-align:left;cursor:pointer;opacity:${retired ? '.48' : '1'}`
  });
};

export const renderAccountDevicesBlock = () => {
  const r = rows(), active = r.filter(d => !Number(d.retiredAt || 0));
  return `<div class="yandex-auth-note" id="ya-devices-block" style="margin-top:8px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:900;color:#eaf2ff;text-transform:uppercase;letter-spacing:.7px">📱 Устройства пользователя</div>
      <button type="button" class="om-btn om-btn--ghost" id="ya-devices-refresh" style="font-size:11px;padding:5px 9px">↻</button>
    </div>
    <div style="font-size:11px;color:#7f93b5;margin-bottom:8px">Активных: ${active.length} · всего в истории: ${r.length}. Данные обновляются через общий backup.</div>
    <div style="display:flex;flex-direction:column;gap:6px">${r.length ? r.slice(0,3).map(renderMiniRow).join('') : '<div class="fav-empty">Устройства ещё не зарегистрированы</div>'}</div>
    ${r.length > 3 ? `<button type="button" class="om-btn om-btn--outline" id="ya-devices-open" style="width:100%;margin-top:8px">Показать все устройства</button>` : ''}
  </div>`;
};

const renderAuthHistory = d => {
  const a = Array.isArray(d.authHistory) ? d.authHistory : [];
  return a.length ? a.slice(0,10).map(x => renderSmallListRow({
    title: [x.os, x.browser, x.pwa ? 'PWA' : 'браузер'].filter(Boolean).join(' · ') || 'Авторизация',
    desc: [fmt(x.ts), x.lang, x.timezone].filter(Boolean).join(' · '),
    style: 'padding:9px 10px'
  })).join('') : '<div class="fav-empty">История авторизаций пока пуста</div>';
};

const openDeviceModal = async ({ stableId = '', rerender } = {}) => {
  const all = rows(), d = all.find(x => x.deviceStableId === stableId || x.deviceHash === stableId) || all[0];
  if (!d || !window.Modals?.open) return;
  let deviceMetaHtml = '<div style="font-size:11px;color:#667">Device-settings в облаке: проверяется при необходимости</div>';
  try {
    const ya = window.YandexAuth, disk = window.YandexDisk;
    const t = ya?.getToken?.();
    if (t && ya?.isTokenAlive?.() && d.deviceStableId) {
      const idx = disk?.getDeviceSettingsIndex ? await disk.getDeviceSettingsIndex(t).catch(() => null) : null;
      const fromIdx = (idx?.items || []).find(x => String(x?.deviceStableId || '') === String(d.deviceStableId));
      const m = fromIdx || (disk?.getDeviceSettingsMeta ? await disk.getDeviceSettingsMeta(t, d.deviceStableId).catch(() => null) : null);
      deviceMetaHtml = `<div style="font-size:11px;color:#7f93b5">Device-settings в облаке: ${m ? `есть · ${fmt(m.timestamp)}${m.keysCount ? ` · ключей: ${m.keysCount}` : ''}` : 'не найдено'}</div>`;
    }
  } catch {}

  const isCur = DeviceRegistry.isCurrentDevice(d);
  const m = window.Modals.open({
    title: `${icon(d)} ${esc(d.label || 'Устройство')}`,
    maxWidth: 500,
    bodyHtml: `<div style="display:flex;flex-direction:column;gap:10px">
      <div class="profile-list-item"><div style="font-size:28px">${icon(d)}</div><div class="log-info"><div class="log-title">${esc(d.label || 'Устройство')}${isCur ? ' · это устройство' : ''}</div><div class="log-desc">${esc([d.class, d.platform, d.browser, d.pwa ? 'PWA' : 'браузер'].filter(Boolean).join(' · '))}</div></div></div>
      <div class="yandex-auth-meta" style="grid-template-columns:1fr 1fr">
        ${renderMetaBox({ label: 'Первый вход', value: fmt(d.firstSeenAt) })}
        ${renderMetaBox({ label: 'Последний раз', value: fmt(d.lastSeenAt) })}
        ${renderMetaBox({ label: 'Экран', value: d.screen || '—' })}
        ${renderMetaBox({ label: 'Язык', value: d.lang || '—' })}
      </div>
      ${deviceMetaHtml}
      <div style="font-size:10px;color:#556;word-break:break-all">stableId: ${esc(d.deviceStableId || '—')}<br>hash: ${esc(d.deviceHash || '—')}<br>aliases: ${(d.seenHashes || []).length}</div>
      <div style="font-size:12px;font-weight:900;color:#eaf2ff;text-transform:uppercase;letter-spacing:.7px;margin-top:4px">История авторизаций</div>
      <div style="display:flex;flex-direction:column;gap:6px">${renderAuthHistory(d)}</div>
      ${renderInlineActions([
        { text: '✏️ Переименовать', primary: true, attrs: 'data-dev-act="rename"' },
        isCur ? { text: '↻ Обновить', attrs: 'data-dev-act="refresh"' } : { text: '🗑 Удалить из списка', attrs: 'data-dev-act="retire"' }
      ])}
    </div>`
  });

  m?.addEventListener('click', async e => {
    const act = e.target.closest('[data-dev-act]')?.dataset.devAct;
    if (!act) return;
    if (act === 'rename') {
      window.Utils?.profileModals?.promptName?.({
        title: 'Название устройства',
        value: d.label || '',
        btnText: 'Сохранить',
        onSubmit: val => {
          const next = rows().map(x => (x.deviceStableId === d.deviceStableId || x.deviceHash === d.deviceHash) ? DeviceRegistry.normalizeDeviceRow({ ...x, label: val, retiredAt: 0, lastSeenAt: Date.now() }) : x);
          DeviceRegistry.saveDeviceRegistry(next);
          if (isCur) localStorage.setItem('yandex:onboarding:device_label', val);
          markDevicesDirty({ immediate: true });
          window.NotificationSystem?.success('Устройство переименовано');
          m.remove(); rerender?.();
        }
      });
    } else if (act === 'refresh') {
      await ensureCurrentDeviceRegistryRow({ label: d.label || '', authEvent: true }).catch(() => null);
      markDevicesDirty({ immediate: true });
      window.NotificationSystem?.success('Устройство обновлено');
      m.remove(); rerender?.();
    } else if (act === 'retire') {
      const next = DeviceRegistry.retireDevicesInRegistry(rows(), [d]);
      DeviceRegistry.saveDeviceRegistry(next);
      markDevicesDirty({ immediate: true });
      window.NotificationSystem?.success('Устройство скрыто из активных');
      m.remove(); rerender?.();
    }
  });
};

export const bindAccountDevicesBlock = (root, rerender) => {
  const block = root?.querySelector('#ya-devices-block');
  if (!block || block._bound) return;
  block._bound = true;
  block.addEventListener('click', async e => {
    const open = e.target.closest('[data-dev-open]')?.dataset.devOpen;
    if (open) return openDeviceModal({ stableId: open, rerender });
    if (e.target.closest('#ya-devices-open')) return openDeviceModal({ stableId: curId(), rerender });
    if (e.target.closest('#ya-devices-refresh')) {
      await ensureCurrentDeviceRegistryRow({ authEvent: true }).catch(() => null);
      markDevicesDirty({ immediate: true });
      window.NotificationSystem?.success('Список устройств обновлён');
      rerender?.();
    }
  });
};

export default { renderAccountDevicesBlock, bindAccountDevicesBlock };

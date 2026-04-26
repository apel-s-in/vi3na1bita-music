import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';
import { renderCloudStatPair } from './cloud-ui-helpers.js';
import { renderRestoreDiffHtml } from './restore-diff.js';

const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
const sS = v => String(v == null ? '' : v).trim();

const deviceLabel = d => sS(d?.label || d?.sourceDeviceLabel || d?.class || d?.sourceDeviceClass || 'Устройство');
const deviceClass = d => sS(d?.class || d?.sourceDeviceClass || d?.platform || d?.sourcePlatform || '');

const collectRestoreDevices = ({ backup, items = [], meta = null } = {}) => {
  const map = new Map();
  const add = d => {
    const key = sS(d?.deviceStableId || d?.sourceDeviceStableId || '');
    if (!key || map.has(key)) return;
    map.set(key, {
      key,
      label: deviceLabel(d),
      cls: deviceClass(d),
      platform: sS(d?.platform || d?.sourcePlatform || ''),
      lastSeenAt: Number(d?.lastSeenAt || d?.timestamp || 0)
    });
  };
  (Array.isArray(backup?.devices) ? backup.devices : []).forEach(add);
  [meta, ...(Array.isArray(items) ? items : [])].filter(Boolean).forEach(add);
  return [...map.values()].sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
};

export const openFreshLoginRestoreModal = ({
  meta,
  items = [],
  backup = null,
  onRestore,
  onNewDevice,
  onLater,
  currentDeviceInfo = null
} = {}) => {
  const safe = Array.isArray(items) && items.length ? items : (meta ? [meta] : []);
  const localSnap = getLocalBackupUiSnapshot({ name: 'Слушатель' });
  const cloudSnap = meta || safe[0] || {};
  const cmp = compareLocalVsCloud(localSnap, cloudSnap);
  const cL = getBackupCompareLabel(localSnap, cloudSnap);
  const devices = collectRestoreDevices({ backup, items: safe, meta });
  const diffHtml = renderRestoreDiffHtml({ backup, localSummary: localSnap, cloudSummary: cloudSnap, devices });

  const currentDeviceHtml = currentDeviceInfo ? `
    <div style="background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.25);border-radius:10px;padding:10px 12px;margin-bottom:12px">
      <div style="font-size:10px;color:#8ab8fd;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">🔧 Вы сейчас на</div>
      <div style="font-size:12px;color:#eaf2ff;font-weight:700">${esc(currentDeviceInfo.osIcon)} ${esc(currentDeviceInfo.os)} · ${esc(currentDeviceInfo.browser)}</div>
      <div style="font-size:11px;color:#888;margin-top:2px">По умолчанию — «${esc(currentDeviceInfo.label)}»</div>
    </div>` : '';

  const renderItems = () => safe.map((it, i) => `
    <label class="fresh-row" data-path="${esc(it.path || '')}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:10px;cursor:pointer;margin-bottom:6px">
      <input type="radio" name="fresh-ver" value="${i}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--secondary-color)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#fff">${it.isLatest ? '☁ Latest' : '🕘 Архив'} · ${it.timestamp ? new Date(it.timestamp).toLocaleString('ru-RU') : '—'}</div>
        <div style="font-size:11px;color:#9db7dd">${esc(it.sizeHuman || '')}${it.appVersion ? ` · v${esc(it.appVersion)}` : ''}</div>
      </div>
    </label>`).join('') || '<div class="fav-empty">Облачных версий пока нет</div>';

  const renderDevices = () => devices.length
    ? devices.map((d, i) => `
      <label class="fresh-dev" data-key="${esc(d.key)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.25);border-radius:999px;margin:0 6px 6px 0;cursor:pointer">
        <input type="radio" name="fresh-dev" value="${i}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--secondary-color)">
        <span style="font-size:12px;color:#eaf2ff">${esc(d.label)}${d.cls ? ` · ${esc(d.cls)}` : ''}</span>
      </label>`).join('')
    : '<div style="font-size:12px;color:#9db7dd">Для этой облачной копии нет отдельного device-layer. Можно восстановить shared-прогресс.</div>';

  const bodyHtml = `
    <div style="font-size:13px;color:#9db7dd;margin-bottom:10px">Мы нашли облачную копию аккаунта. Что сделать?</div>
    ${currentDeviceHtml}
    ${renderCloudStatPair({ localSummary: localSnap, cloudSummary: cloudSnap })}
    <div style="font-size:11px;color:#9db7dd;margin-bottom:10px">Сравнение: ${esc(cL)} (${esc(cmp.state)})</div>
    ${diffHtml}

    <div style="font-size:12px;font-weight:700;color:#eaf2ff;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.8px">Версия backup</div>
    <div id="fresh-list">${renderItems()}</div>

    <div style="font-size:12px;font-weight:700;color:#eaf2ff;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.8px">Устройства в облаке</div>
    <div id="fresh-dev-list" style="display:flex;flex-wrap:wrap">${renderDevices()}</div>

    <div class="modal-choice-actions" style="margin-top:14px">
      <button type="button" class="modal-action-btn online" data-fresh-act="restore">Восстановить shared + выбранное устройство</button>
      <button type="button" class="modal-action-btn" data-fresh-act="shared-only">Восстановить только shared</button>
      ${devices.length ? `<button type="button" class="modal-action-btn" data-fresh-act="new-device">📱 Создать новое устройство</button>` : ''}
      <button type="button" class="modal-action-btn" data-fresh-act="later">🔕 Напомнить позже</button>
    </div>`;

  const m = window.Modals?.open?.({ title: 'Обнаружена облачная копия', maxWidth: 500, strictClose: true, bodyHtml });
  if (!m) return;

  const pickPath = () => {
    const sel = m.querySelector('input[name="fresh-ver"]:checked');
    const idx = sel ? Number(sel.value) : 0;
    return sS(safe[idx]?.path || safe[0]?.path || '');
  };
  const pickDeviceKey = () => {
    const sel = m.querySelector('input[name="fresh-dev"]:checked');
    const idx = sel ? Number(sel.value) : 0;
    return devices[idx]?.key || null;
  };

  m.addEventListener('click', e => {
    const btn = e.target.closest('[data-fresh-act]');
    if (!btn) return;
    const act = btn.dataset.freshAct;
    m.remove();
    try {
      if (act === 'later') onLater?.();
      else if (act === 'shared-only') onRestore?.({ pickedPath: pickPath(), inheritDeviceKey: null, skipDeviceSettings: true });
      else if (act === 'restore') onRestore?.({ pickedPath: pickPath(), inheritDeviceKey: pickDeviceKey(), skipDeviceSettings: false });
      else if (act === 'new-device') (onNewDevice || onRestore)?.({ pickedPath: pickPath(), inheritDeviceKey: pickDeviceKey(), asNewDevice: true });
    } catch {}
  });
};

export default { openFreshLoginRestoreModal };

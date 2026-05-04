import { getLocalBackupUiSnapshot, compareLocalVsCloud, getBackupCompareLabel } from '../../analytics/backup-summary.js';
import { renderCloudStatPair } from './cloud-ui-helpers.js';
import { renderRestoreDiffHtml } from './restore-diff.js';
import { esc, fmtDateTime } from './profile-ui-kit.js';

const DEVICE_LABEL_KEY = 'yandex:onboarding:device_label';
const sS = v => String(v == null ? '' : v).trim();

const deviceLabel = d => sS(d?.label || d?.sourceDeviceLabel || d?.class || d?.sourceDeviceClass || 'Устройство');
const deviceClass = d => sS(d?.class || d?.sourceDeviceClass || d?.platform || d?.sourcePlatform || '');
const deviceIcon = d => /iphone|ipad|ios/i.test(`${d?.cls || d?.class || d?.platform || ''}`) ? '📱' : (/android/i.test(`${d?.cls || d?.class || d?.platform || ''}`) ? '🤖' : '💻');

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

const askNewDeviceName = currentDeviceInfo => new Promise(resolve => {
  const fallback = sS(currentDeviceInfo?.label || localStorage.getItem(DEVICE_LABEL_KEY) || 'Моё устройство');
  const prompt = window.Utils?.profileModals?.promptName;
  if (!prompt) return resolve(fallback);
  prompt({
    title: 'Название нового устройства',
    value: fallback,
    btnText: 'Продолжить',
    onSubmit: v => resolve(sS(v) || fallback)
  });
});

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
  const defaultDeviceValue = devices.length ? devices[0].key : '__new__';

  const currentDeviceHtml = currentDeviceInfo ? `
    <div class="fresh-current-device">
      <div class="fresh-cap">Вы сейчас на</div>
      <div class="fresh-current-title">${esc(currentDeviceInfo.osIcon)} ${esc(currentDeviceInfo.os)} · ${esc(currentDeviceInfo.browser)}</div>
      <div class="fresh-muted">Текущее имя: ${esc(currentDeviceInfo.label || 'Моё устройство')}</div>
    </div>` : '';

  const renderItems = () => safe.map((it, i) => `
    <label class="fresh-version-card ${i === 0 ? 'is-picked' : ''}">
      <input type="radio" name="fresh-ver" value="${i}" ${i === 0 ? 'checked' : ''}>
      <span class="fresh-version-mark">${it.isLatest ? '☁️' : '🕘'}</span>
      <span class="fresh-version-main">
        <b>${it.isLatest ? 'Последняя копия' : 'Архивная версия'}</b>
        <small>${fmtDateTime(it.timestamp)}${it.sizeHuman ? ` · ${esc(it.sizeHuman)}` : ''}${it.appVersion ? ` · v${esc(it.appVersion)}` : ''}</small>
      </span>
    </label>`).join('') || '<div class="fav-empty">Облачных версий пока нет</div>';

  const renderDeviceOptions = () => `
    ${devices.map((d, i) => `
      <label class="fresh-device-card ${i === 0 ? 'is-picked' : ''}">
        <input type="radio" name="fresh-dev" value="${esc(d.key)}" ${d.key === defaultDeviceValue ? 'checked' : ''}>
        <span class="fresh-device-ic">${deviceIcon(d)}</span>
        <span class="fresh-device-main">
          <b>${esc(d.label)}</b>
          <small>${esc([d.cls, d.platform, d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : ''].filter(Boolean).join(' · '))}</small>
        </span>
      </label>`).join('')}
    <label class="fresh-device-card ${!devices.length ? 'is-picked' : ''}">
      <input type="radio" name="fresh-dev" value="__new__" ${!devices.length ? 'checked' : ''}>
      <span class="fresh-device-ic">✨</span>
      <span class="fresh-device-main">
        <b>Новое устройство</b>
        <small>Создать новую запись и задать имя</small>
      </span>
    </label>
    <label class="fresh-device-card">
      <input type="radio" name="fresh-dev" value="__shared_only__">
      <span class="fresh-device-ic">👤</span>
      <span class="fresh-device-main">
        <b>Только общий прогресс</b>
        <small>Без локальных настроек устройства</small>
      </span>
    </label>`;

  const bodyHtml = `
    <div class="fresh-restore-card">
      <div class="fresh-hero">
        <div class="fresh-hero-icon">☁️</div>
        <div>
          <div class="fresh-hero-title">Облачная копия найдена</div>
          <div class="fresh-hero-sub">Выберите версию и устройство. Без подтверждения ничего не восстановится.</div>
        </div>
      </div>

      ${currentDeviceHtml}
      ${renderCloudStatPair({ localSummary: localSnap, cloudSummary: cloudSnap })}

      <div class="fresh-compare ${cmp.state === 'conflict' ? 'is-warn' : ''}">
        <b>Сравнение</b>
        <span>${esc(cL)} · ${esc(cmp.state)}</span>
      </div>

      <details class="fresh-details">
        <summary>Что будет объединено</summary>
        ${diffHtml}
      </details>

      <div class="fresh-section-title">Версия backup</div>
      <div class="fresh-scroll fresh-version-list" id="fresh-list">${renderItems()}</div>

      <div class="fresh-section-title">Устройство из облака</div>
      <div class="fresh-scroll fresh-device-list" id="fresh-dev-list">${renderDeviceOptions()}</div>

      <div class="fresh-actions">
        <button type="button" class="modal-action-btn online" data-fresh-act="restore">Восстановить</button>
        <button type="button" class="modal-action-btn" data-fresh-act="later">Напомнить позже</button>
      </div>
    </div>`;

  const m = window.Modals?.open?.({ title: '', maxWidth: 390, strictClose: true, bodyHtml });
  if (!m) return;

  const refreshPicked = () => {
    m.querySelectorAll('.fresh-version-card').forEach(x => x.classList.toggle('is-picked', !!x.querySelector('input')?.checked));
    m.querySelectorAll('.fresh-device-card').forEach(x => x.classList.toggle('is-picked', !!x.querySelector('input')?.checked));
  };
  m.addEventListener('change', refreshPicked);
  refreshPicked();

  const pickPath = () => {
    const sel = m.querySelector('input[name="fresh-ver"]:checked');
    const idx = sel ? Number(sel.value) : 0;
    return sS(safe[idx]?.path || safe[0]?.path || '');
  };
  const pickDeviceMode = () => sS(m.querySelector('input[name="fresh-dev"]:checked')?.value || defaultDeviceValue);

  m.addEventListener('click', async e => {
    const btn = e.target.closest('[data-fresh-act]');
    if (!btn) return;
    const act = btn.dataset.freshAct;
    m.remove();

    try {
      if (act === 'later') return onLater?.();

      const pickedPath = pickPath();
      const dev = pickDeviceMode();

      if (dev === '__shared_only__') {
        return onRestore?.({ pickedPath, inheritDeviceKey: null, skipDeviceSettings: true });
      }

      if (dev === '__new__') {
        const label = await askNewDeviceName(currentDeviceInfo);
        try { localStorage.setItem(DEVICE_LABEL_KEY, label); } catch {}
        return (onNewDevice || onRestore)?.({ pickedPath, inheritDeviceKey: null, asNewDevice: true, skipDeviceSettings: true });
      }

      return onRestore?.({ pickedPath, inheritDeviceKey: dev, skipDeviceSettings: false });
    } catch {}
  });
};

export default { openFreshLoginRestoreModal };

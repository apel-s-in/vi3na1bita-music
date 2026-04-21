// scripts/app/profile/auth-onboarding-orchestrator.js
// Единый оркестратор авторизации + восстановления backup.
// Решает race condition между OAuth popup и YandexDisk.getMeta через активное ожидание.

import { YandexDisk } from '../../core/yandex-disk.js';
import { safeNum } from '../../analytics/backup-summary.js';

const SKIP_REMINDER_KEY = 'yandex:onboarding:skip:until';
const DEVICE_LABEL_KEY = 'yandex:onboarding:device_label';
const PRELOAD_TIMEOUT_MS = 12000;
const PRELOAD_RETRY_COUNT = 3;

// Кэш предзагрузки в памяти
let _preloadPromise = null;
let _preloadResult = null;
let _onboardingActive = false;
let _currentModal = null;

const sessionKey = (ts) => `yandex:onboarding:shown:${Number(ts || 0)}`;
const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

// ─── Детектор устройства ────────────────────────────────────────────────────
function detectDeviceInfo() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || '';
  const lang = navigator.language || '';

  let os = 'Unknown OS';
  let osIcon = '💻';
  if (/iPhone/.test(ua)) { os = 'iPhone'; osIcon = '📱'; }
  else if (/iPad/.test(ua)) { os = 'iPad'; osIcon = '📱'; }
  else if (/Android/.test(ua)) { os = 'Android'; osIcon = '📱'; }
  else if (/Mac OS X/.test(ua) || /Macintosh/.test(ua)) { os = 'macOS'; osIcon = '🖥'; }
  else if (/Windows/.test(ua)) { os = 'Windows'; osIcon = '🖥'; }
  else if (/Linux/.test(ua)) { os = 'Linux'; osIcon = '🖥'; }

  let browser = 'Browser';
  if (/YaBrowser\/([\d.]+)/.test(ua)) browser = 'Яндекс Браузер';
  else if (/OPR\//.test(ua) || /Opera\//.test(ua)) browser = 'Opera';
  else if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  const screen = `${window.screen.width || 0}×${window.screen.height || 0}`;
  const lastActive = new Date().toLocaleDateString('ru-RU');

  // Список устройств по умолчанию по возрастанию
  const existingReg = window.DeviceRegistry?.getDeviceRegistry?.() || [];
  const deviceNumber = existingReg.length + 1;

  const savedLabel = localStorage.getItem(DEVICE_LABEL_KEY) || '';
  const defaultLabel = savedLabel || `Моё устройство №${deviceNumber}`;

  return {
    os,
    osIcon,
    browser,
    screen,
    lang,
    platform,
    userAgent: ua,
    label: defaultLabel,
    deviceNumber,
    lastActive
  };
}

function getSystemInstallDate() {
  const ts = Number(localStorage.getItem('app:first-install-ts') || 0);
  return ts > 0 ? new Date(ts).toLocaleDateString('ru-RU') : '—';
}

// ─── Предзагрузка backup с retry и таймаутом ─────────────────────────────────
// Обёртка с таймаутом (AbortController не пробрасывается через YandexDisk методы, поэтому используем Promise.race).
function withTimeout(promise, ms, label = 'op') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms))
  ]);
}

async function preloadBackupData(token) {
  if (!token) return { meta: null, items: [], backup: null };

  for (let attempt = 0; attempt < PRELOAD_RETRY_COUNT; attempt++) {
    try {
      console.debug(`[AuthOnboarding] preload attempt ${attempt + 1}/${PRELOAD_RETRY_COUNT}`);

      // Сначала ТОЛЬКО meta с таймаутом — самый критичный шаг.
      // listBackups и download делаются ПОСЛЕ того, как мы убедились, что meta есть.
      const meta = await withTimeout(
        YandexDisk.getMeta(token).catch(() => null),
        PRELOAD_TIMEOUT_MS,
        'meta'
      ).catch(e => { console.warn(`[AuthOnboarding] meta timeout (attempt ${attempt + 1}):`, e?.message); return null; });

      if (!meta) {
        // Нет meta — пробуем retry с экспоненциальным backoff
        if (attempt < PRELOAD_RETRY_COUNT - 1) {
          const delay = 1000 * Math.pow(2, attempt);
          console.debug(`[AuthOnboarding] no meta, waiting ${delay}ms before retry`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.debug('[AuthOnboarding] all retries exhausted, giving up');
        return { meta: null, items: [], backup: null };
      }

      // Meta есть — параллельно грузим items + backup (оба с таймаутами)
      const [items, backupData] = await Promise.all([
        withTimeout(
          YandexDisk.listBackups(token).catch(() => []),
          PRELOAD_TIMEOUT_MS,
          'list'
        ).catch(() => []),
        meta.path
          ? withTimeout(
              YandexDisk.download(token, meta.path).catch(() => null),
              PRELOAD_TIMEOUT_MS * 2, // download может быть долгим для больших backup
              'download'
            ).catch(e => { console.warn('[AuthOnboarding] download timeout:', e?.message); return null; })
          : Promise.resolve(null)
      ]);

      const safeItems = Array.isArray(items) && items.length ? items : [meta];

      console.debug(`[AuthOnboarding] preload success (attempt ${attempt + 1}): meta=yes, backup=${!!backupData}, items=${safeItems.length}`);
      return { meta, items: safeItems, backup: backupData };
    } catch (e) {
      console.warn(`[AuthOnboarding] preload attempt ${attempt + 1} error:`, e?.message);
      if (attempt >= PRELOAD_RETRY_COUNT - 1) return { meta: null, items: [], backup: null };
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  return { meta: null, items: [], backup: null };
}

function isReminderSuppressedForSnapshot(cloudTs) {
  try {
    const localTs = safeNum(localStorage.getItem('yandex:last_backup_local_ts'));
    const sameSnapshot = cloudTs > 0 && localTs > 0 && Math.abs(cloudTs - localTs) < 5000;
    const restoreDone = localStorage.getItem('backup:restore_or_skip_done') === '1';
    return restoreDone && sameSnapshot;
  } catch { return false; }
}

function isSnoozedUntilNow() {
  try {
    const until = safeNum(localStorage.getItem(SKIP_REMINDER_KEY));
    return until > 0 && Date.now() < until;
  } catch { return false; }
}

function snoozeReminder(hours = 24) {
  try {
    localStorage.setItem(SKIP_REMINDER_KEY, String(Date.now() + hours * 3600000));
  } catch {}
}

// ─── Главная точка входа ──────────────────────────────────────────────────────
export async function runOnboardingFlow({ token, profile, isFirstLogin = true } = {}) {
  if (_onboardingActive) {
    console.debug('[AuthOnboarding] already active, skipping');
    return;
  }
  _onboardingActive = true;

  try {
    // Ждём завершения предзагрузки (максимум PRELOAD_TIMEOUT_MS).
    // Если предзагрузка не запущена (например, вызов напрямую из профиля), запускаем её сейчас.
    if (!_preloadPromise) {
      console.debug('[AuthOnboarding] no active preload, starting one now');
      _preloadPromise = preloadBackupData(token);
    }

    const result = await _preloadPromise;
    _preloadResult = result;

    const meta = result?.meta || null;
    const items = result?.items || [];
    const backup = result?.backup || null;

    if (!meta) {
      console.debug('[AuthOnboarding] no cloud backup found, showing welcome');
      if (isFirstLogin) showWelcomeNoBackupModal(profile);
      _onboardingActive = false;
      return;
    }

    const cloudTs = safeNum(meta?.timestamp);
    if (isReminderSuppressedForSnapshot(cloudTs)) {
      console.debug('[AuthOnboarding] same snapshot already applied, skipping');
      _onboardingActive = false;
      return;
    }

    if (sessionStorage.getItem(sessionKey(cloudTs)) === '1') {
      console.debug('[AuthOnboarding] already shown in this session');
      _onboardingActive = false;
      return;
    }
    sessionStorage.setItem(sessionKey(cloudTs), '1');

    if (isSnoozedUntilNow() && !isFirstLogin) {
      console.debug('[AuthOnboarding] snoozed until later');
      _onboardingActive = false;
      return;
    }

    await new Promise(r => setTimeout(r, 150));
    showRestoreChoiceModal({ token, meta, items, profile, preloadedBackup: backup });
  } catch (e) {
    console.warn('[AuthOnboarding] flow failed:', e?.message);
  } finally {
    _onboardingActive = false;
  }
}

// ─── Welcome модалка нового устройства с device-picker ────────────────────────
function showWelcomeNoBackupModal(profile) {
  if (!window.Modals?.open) return;
  const name = profile?.displayName || profile?.name || 'Слушатель';
  const device = detectDeviceInfo();
  const installDate = getSystemInstallDate();

  const m = window.Modals.open({
    title: `👋 Добро пожаловать, ${esc(name)}!`,
    maxWidth: 420,
    bodyHtml: `
      <div style="color:#9db7dd;line-height:1.5;margin-bottom:14px">
        Вы подключили Яндекс аккаунт. В облаке пока нет сохранений прогресса — это ваше первое устройство.
      </div>
      <div style="background:rgba(77,170,255,.06);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:14px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">
          🔧 Ваше текущее устройство
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#eaf2ff">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <span style="color:#888">Операционная система:</span>
            <span style="font-weight:700">${esc(device.osIcon)} ${esc(device.os)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:10px">
            <span style="color:#888">Браузер:</span>
            <span style="font-weight:700">${esc(device.browser)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:10px">
            <span style="color:#888">Экран:</span>
            <span style="font-weight:700">${esc(device.screen)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:10px">
            <span style="color:#888">Язык системы:</span>
            <span style="font-weight:700">${esc(device.lang)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:10px">
            <span style="color:#888">Установлено:</span>
            <span style="font-weight:700">${esc(installDate)}</span>
          </div>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">
          📝 Как назвать это устройство? (для понимания на других устройствах)
        </label>
        <input type="text" id="ao-device-label"
          maxlength="25"
          value="${esc(device.label)}"
          placeholder="${esc(device.label)}"
          style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:14px;outline:none;transition:border-color .2s"
          autocomplete="off"
        >
        <div style="font-size:11px;color:#666;margin-top:4px">По умолчанию — «Моё устройство №${device.deviceNumber}»</div>
      </div>
      <div style="background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:12px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:8px">💡 Что дальше?</div>
        <ul style="margin:0;padding-left:20px;color:#9db7dd;font-size:11px;line-height:1.6">
          <li>Слушайте музыку — прогресс автоматически сохранится</li>
          <li>На другом устройстве войдите тем же Яндексом — всё синхронизируется</li>
          <li>Включите автосохранение в настройках профиля</li>
        </ul>
      </div>
      <div class="om-actions">
        <button class="modal-action-btn online" id="ao-welcome-ok" style="flex:1;justify-content:center">Понятно</button>
      </div>`
  });

  _currentModal = m;

  const inp = m?.querySelector('#ao-device-label');
  const okBtn = m?.querySelector('#ao-welcome-ok');

  const saveLabelAndClose = () => {
    const val = inp?.value?.trim() || device.label;
    try {
      localStorage.setItem(DEVICE_LABEL_KEY, val);
      // Обновляем device registry с новым label
      const reg = window.DeviceRegistry?.getDeviceRegistry?.() || [];
      const currentId = window.DeviceRegistry?.getCurrentDeviceIdentity?.();
      if (currentId && reg.length) {
        const updated = reg.map(d => {
          if ((d.deviceStableId && d.deviceStableId === currentId.deviceStableId) ||
              (d.deviceHash && d.deviceHash === currentId.deviceHash)) {
            return { ...d, label: val };
          }
          return d;
        });
        window.DeviceRegistry?.saveDeviceRegistry?.(updated);
      }
    } catch {}
    m.remove();
    _currentModal = null;
  };

  okBtn?.addEventListener('click', saveLabelAndClose);
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') saveLabelAndClose(); });
}

// ─── Модалка выбора backup (restore flow) ────────────────────────────────────
async function showRestoreChoiceModal({ token, meta, items, profile, preloadedBackup }) {
  const mod = await import('./yandex-modals.js');
  const openFn = mod?.openFreshLoginRestoreModal;
  if (typeof openFn !== 'function') return;

  const device = detectDeviceInfo();

  openFn({
    meta,
    items,
    currentDeviceInfo: device, // новое поле — передаём в yandex-modals.js
    onLater: async () => {
      console.debug('[AuthOnboarding] user chose later');
      snoozeReminder(24);
      try {
        const se = await import('../../analytics/backup-sync-engine.js');
        se.markSyncReady('user_skipped_restore');
        try { se.markRestoreOrSkipDone('user_skipped_restore'); } catch {}
      } catch {}
      window.NotificationSystem?.info?.('Можно восстановить позже из Личного кабинета');
    },
    onRestore: async ({ pickedPath, inheritDeviceKey, asNewDevice } = {}) => {
      await executeRestore({
        token, pickedPath, inheritDeviceKey, asNewDevice: !!asNewDevice, profile,
        preloadedBackup
      });
    },
    onNewDevice: async ({ pickedPath, inheritDeviceKey } = {}) => {
      await executeRestore({
        token, pickedPath, inheritDeviceKey, asNewDevice: true, profile,
        preloadedBackup
      });
    }
  });
}

async function executeRestore({ token, pickedPath, inheritDeviceKey, asNewDevice, profile, preloadedBackup }) {
  const nSys = window.NotificationSystem;

  nSys?.info?.('Применяем прогресс из облака...');

  try {
    // Приоритет: используем предзагруженный backup если путь совпадает
    const canUseCache = preloadedBackup && (!pickedPath || _preloadResult?.meta?.path === pickedPath);

    if (canUseCache) {
      console.debug('[AuthOnboarding] using preloaded backup for restore');
      await applyPreloadedBackup({ backup: preloadedBackup, token, asNewDevice, profile });
      return;
    }

    // Fallback: грузим через стандартный flow (двойной запрос getMeta + download)
    const { openYandexRestoreFlow } = await import('./yandex-restore-flow.js');
    await openYandexRestoreFlow({
      token,
      disk: YandexDisk,
      notify: nSys,
      autoPickedPath: pickedPath,
      inheritDeviceKey: inheritDeviceKey || null,
      asNewDevice: !!asNewDevice,
      skipPreview: true,
      applyMode: 'all',
      localProfile: profile || { name: 'Слушатель' }
    });
  } catch (err) {
    console.warn('[AuthOnboarding] restore failed:', err?.message);
    nSys?.error?.('Ошибка восстановления: ' + String(err?.message || ''));
  } finally {
    // Инвалидируем кэш после применения (следующий вход получит свежие данные)
    _preloadResult = null;
    _preloadPromise = null;
  }
}

async function applyPreloadedBackup({ backup, token, asNewDevice, profile }) {
  const nSys = window.NotificationSystem;
  try {
    const { BackupVault } = await import('../../analytics/backup-vault.js');
    await BackupVault.importData(new Blob([JSON.stringify(backup)]), 'all');

    // Принудительная дедупликация device registry после restore (чистит накопленные дубли)
    try {
      const { default: DeviceRegistry } = await import('../../analytics/device-registry.js');
      const before = DeviceRegistry.getDeviceRegistry();
      const cleaned = DeviceRegistry.normalizeDeviceRegistry(before);
      if (cleaned.length < before.length) {
        DeviceRegistry.saveDeviceRegistry(cleaned);
        console.debug(`[AuthOnboarding] device registry deduplicated: ${before.length} → ${cleaned.length}`);
      }
    } catch (e) {
      console.warn('[AuthOnboarding] device dedup failed:', e?.message);
    }

    try {
      const meta = await YandexDisk.getMeta(token).catch(() => null);
      if (meta) {
        localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
        localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
      }
      localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
    } catch {}

    try {
      const se = await import('../../analytics/backup-sync-engine.js');
      se.markSyncReady('restore_completed');
      try { se.markRestoreOrSkipDone('restore_completed'); } catch {}
    } catch {}

    try {
      const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
      await runPostRestoreRefresh({
        reason: asNewDevice ? 'cloud_restore_new_device' : 'cloud_restore',
        keepCurrentAlbum: true
      });
    } catch {}

    nSys?.success?.(`Прогресс восстановлен ✅${asNewDevice ? ' (новое устройство)' : ''}`);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('restore_owner_mismatch')) nSys?.error?.('Backup принадлежит другому Яндекс-аккаунту.');
    else if (msg.includes('backup_integrity_failed')) nSys?.error?.('Файл backup повреждён.');
    else nSys?.error?.('Ошибка применения backup: ' + msg);
    throw e;
  }
}

/**
 * Вызывается из yandex-auth.js СРАЗУ после OAuth, до показа имени.
 * Инициирует предзагрузку и возвращает promise (не блокирует UI).
 */
export function startPreload(token) {
  if (!token) {
    _preloadPromise = Promise.resolve({ meta: null, items: [], backup: null });
    return _preloadPromise;
  }

  _preloadPromise = preloadBackupData(token);
  return _preloadPromise;
}

export function clearPreloadCache() {
  _preloadPromise = null;
  _preloadResult = null;
  _onboardingActive = false;
  try { _currentModal?.remove?.(); } catch {}
  _currentModal = null;
}

export async function openManualRestoreFlow({ token, profile } = {}) {
  if (!token) return;
  try {
    // Всегда делаем свежую предзагрузку для ручного запуска
    _preloadPromise = preloadBackupData(token);
    const result = await _preloadPromise;
    _preloadResult = result;

    const meta = result?.meta || null;
    if (!meta) {
      window.NotificationSystem?.warning?.('Облачная копия не найдена');
      return;
    }
    showRestoreChoiceModal({
      token,
      meta,
      items: result?.items || [],
      profile: profile || { name: 'Слушатель' },
      preloadedBackup: result?.backup || null
    });
  } catch (e) {
    window.NotificationSystem?.error?.('Не удалось открыть восстановление: ' + String(e?.message || ''));
  }
}

// Внутренний метод для UI-статуса в модалке имени: возвращает результат текущей предзагрузки.
export async function _waitForPreload() {
  if (_preloadPromise) return await _preloadPromise;
  return { meta: null, items: [], backup: null };
}

export default {
  startPreload,
  runOnboardingFlow,
  clearPreloadCache,
  openManualRestoreFlow,
  _waitForPreload
};

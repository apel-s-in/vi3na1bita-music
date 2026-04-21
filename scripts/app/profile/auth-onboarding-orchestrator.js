// scripts/app/profile/auth-onboarding-orchestrator.js
// Единый оркестратор авторизации + восстановления backup.
// Отвечает за правильную последовательность модалок и предварительную загрузку backup-данных.

import { YandexDisk } from '../../core/yandex-disk.js';
import { safeNum } from '../../analytics/backup-summary.js';

const STATE_KEY = 'yandex:onboarding:state:v1';
const SKIP_REMINDER_KEY = 'yandex:onboarding:skip:until';

// Кэш предзагруженных данных backup в памяти (не в localStorage, чтобы не раздувать)
let _preloadedBackup = null;
let _preloadedMeta = null;
let _preloadedItems = null;
let _onboardingActive = false;

const sessionKey = (ts) => `yandex:onboarding:shown:${Number(ts || 0)}`;
const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

/**
 * Предзагрузка backup-meta и списка версий СРАЗУ после OAuth.
 * Вызывается до показа модалки имени, чтобы к моменту восстановления данные уже были готовы.
 */
async function preloadBackupData(token) {
  if (!token) return { meta: null, items: [], backup: null };
  try {
    const [meta, items] = await Promise.all([
      YandexDisk.getMeta(token).catch(() => null),
      YandexDisk.listBackups(token).catch(() => [])
    ]);
    _preloadedMeta = meta;
    _preloadedItems = Array.isArray(items) && items.length ? items : (meta ? [meta] : []);

    // Скачиваем сам backup в фоне, чтобы при согласии пользователя он был мгновенно доступен
    if (meta?.path) {
      YandexDisk.download(token, meta.path)
        .then(data => { _preloadedBackup = data; })
        .catch(() => { _preloadedBackup = null; });
    }

    console.debug('[AuthOnboarding] preloaded meta:', !!meta, 'items:', _preloadedItems.length);
    return { meta, items: _preloadedItems, backup: null };
  } catch (e) {
    console.warn('[AuthOnboarding] preload failed:', e?.message);
    return { meta: null, items: [], backup: null };
  }
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

/**
 * Главная точка входа: показывает очередь модалок после получения имени.
 * Вызывается из yandex-auth.js после сохранения имени.
 */
export async function runOnboardingFlow({ token, profile, isFirstLogin = true } = {}) {
  if (_onboardingActive) {
    console.debug('[AuthOnboarding] already active, skipping');
    return;
  }
  _onboardingActive = true;

  try {
    const meta = _preloadedMeta;
    const items = _preloadedItems || [];

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

    await new Promise(r => setTimeout(r, 250));
    showRestoreChoiceModal({ token, meta, items, profile });
  } catch (e) {
    console.warn('[AuthOnboarding] flow failed:', e?.message);
  } finally {
    _onboardingActive = false;
  }
}

function showWelcomeNoBackupModal(profile) {
  if (!window.Modals?.open) return;
  const name = profile?.displayName || profile?.name || 'Слушатель';
  const m = window.Modals.open({
    title: `👋 Добро пожаловать, ${esc(name)}!`,
    maxWidth: 400,
    bodyHtml: `
      <div style="color:#9db7dd;line-height:1.5;margin-bottom:16px">
        Вы подключили Яндекс аккаунт. В облаке пока нет сохранений прогресса — это ваше первое устройство.
      </div>
      <div style="background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:12px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px">💡 Что дальше?</div>
        <ul style="margin:0;padding-left:20px;color:#9db7dd;font-size:12px;line-height:1.6">
          <li>Слушайте музыку — прогресс автоматически сохранится</li>
          <li>На другом устройстве войдите тем же Яндексом — всё синхронизируется</li>
          <li>Включите автосохранение в настройках профиля</li>
        </ul>
      </div>
      <div class="om-actions">
        <button class="modal-action-btn online" data-act="ok" style="flex:1;justify-content:center">Понятно</button>
      </div>`
  });
  m?.addEventListener('click', e => {
    if (e.target.closest('[data-act="ok"]')) m.remove();
  });
}

async function showRestoreChoiceModal({ token, meta, items, profile }) {
  const mod = await import('./yandex-modals.js');
  const openFn = mod?.openFreshLoginRestoreModal;
  if (typeof openFn !== 'function') return;

  openFn({
    meta,
    items,
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
        token, pickedPath, inheritDeviceKey, asNewDevice: !!asNewDevice, profile
      });
    },
    onNewDevice: async ({ pickedPath, inheritDeviceKey } = {}) => {
      await executeRestore({
        token, pickedPath, inheritDeviceKey, asNewDevice: true, profile
      });
    }
  });
}

async function executeRestore({ token, pickedPath, inheritDeviceKey, asNewDevice, profile }) {
  const nSys = window.NotificationSystem;
  try {
    const { openYandexRestoreFlow } = await import('./yandex-restore-flow.js');

    // Если backup уже предзагружен и путь совпадает — используем кэш
    const useCache = _preloadedBackup && _preloadedMeta?.path === pickedPath;

    if (useCache) {
      console.debug('[AuthOnboarding] using preloaded backup');
      await applyPreloadedBackup({ backup: _preloadedBackup, token, asNewDevice, profile });
    } else {
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
    }
  } catch (err) {
    console.warn('[AuthOnboarding] restore failed:', err?.message);
    nSys?.error?.('Ошибка восстановления: ' + String(err?.message || ''));
  } finally {
    _preloadedBackup = null;
    _preloadedMeta = null;
    _preloadedItems = null;
  }
}

async function applyPreloadedBackup({ backup, token, asNewDevice, profile }) {
  const nSys = window.NotificationSystem;
  nSys?.info?.('Применяем прогресс из облака...');
  try {
    const { BackupVault } = await import('../../analytics/backup-vault.js');
    await BackupVault.importData(new Blob([JSON.stringify(backup)]), 'all');

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
 * Возвращает promise, который не блокирует UI (предзагрузка в фоне).
 */
export function startPreload(token) {
  if (!token) return Promise.resolve({ meta: null, items: [] });
  return preloadBackupData(token);
}

/**
 * Очистка кэша (например, при logout).
 */
export function clearPreloadCache() {
  _preloadedBackup = null;
  _preloadedMeta = null;
  _preloadedItems = null;
  _onboardingActive = false;
}

/**
 * Ручной запуск восстановления из Личного кабинета ("Из облака").
 * Использует тот же flow, но без привязки к first-login логике.
 */
export async function openManualRestoreFlow({ token, profile } = {}) {
  if (!token) return;
  try {
    if (!_preloadedMeta) {
      await preloadBackupData(token);
    }
    const meta = _preloadedMeta;
    const items = _preloadedItems || [];
    if (!meta) {
      window.NotificationSystem?.warning?.('Облачная копия не найдена');
      return;
    }
    showRestoreChoiceModal({ token, meta, items, profile });
  } catch (e) {
    window.NotificationSystem?.error?.('Не удалось открыть восстановление: ' + String(e?.message || ''));
  }
}

export default {
  startPreload,
  runOnboardingFlow,
  clearPreloadCache,
  openManualRestoreFlow
};

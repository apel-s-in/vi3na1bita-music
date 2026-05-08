// Единый оркестратор авторизации + восстановления backup. Решает race condition между OAuth popup и YandexDisk.getMeta через активное ожидание.

import { YandexDisk } from '../../core/yandex-disk.js';
import { safeNum } from '../../analytics/backup-summary.js';
import { detectCurrentDeviceProfile, getSystemInstallDateLabel } from '../../core/device-profile.js';
import { loadPreloadFromCache, savePreloadToCache, invalidatePreloadCache, preloadBackupData } from './yandex-preload-cache.js';
import { runBackupRestore } from './restore-backup-runner.js';
import { sessionKeyForCloudSnapshot, isReminderSuppressedForSnapshot, isSnoozedUntilNow, snoozeReminder } from './restore-decision.js';

const DEVICE_LABEL_KEY = 'yandex:onboarding:device_label', NEW_DEVICE_CONFIRMED_KEY = 'yandex:onboarding:new_device_confirmed';
let _preloadPromise = null, _preloadResult = null, _onboardingActive = false, _currentModal = null;
const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

const detectDeviceInfo = () => detectCurrentDeviceProfile({ registry: window.DeviceRegistry?.getDeviceRegistry?.() || [], savedLabel: localStorage.getItem(DEVICE_LABEL_KEY) || '' });
const getSystemInstallDate = () => getSystemInstallDateLabel();

export async function runOnboardingFlow({ token, profile, isFirstLogin = true } = {}) {
  if (_onboardingActive) return; _onboardingActive = true;
  try {
    if (!_preloadPromise) _preloadPromise = preloadBackupData({ token, disk: YandexDisk });
    const result = await _preloadPromise; _preloadResult = result;
    const meta = result?.meta || null, items = result?.items || [], backup = result?.backup || null;

    if (!meta) {
      if (sessionStorage.getItem(NEW_DEVICE_CONFIRMED_KEY) === '1') {
        sessionStorage.removeItem(NEW_DEVICE_CONFIRMED_KEY);
        try { const { ensureCurrentDeviceRegistryRow } = await import('../../core/device-linking.js'); await ensureCurrentDeviceRegistryRow({ authEvent: true }).catch(() => null); const se = await import('../../analytics/backup-sync-engine.js'); se.markSyncReady?.('no_cloud_backup'); se.markRestoreOrSkipDone?.('no_cloud_backup'); } catch {}
        window.NotificationSystem?.success?.('Новое устройство подключено ✅');
      } else if (isFirstLogin) showWelcomeNoBackupModal(profile);
      return void (_onboardingActive = false);
    }

    const cloudTs = safeNum(meta?.timestamp);
    if (isReminderSuppressedForSnapshot(cloudTs)) return void (_onboardingActive = false);

    const shownKey = sessionKeyForCloudSnapshot(cloudTs);
    if (sessionStorage.getItem(shownKey) === '1') return void (_onboardingActive = false);
    sessionStorage.setItem(shownKey, '1');

    if (isSnoozedUntilNow() && !isFirstLogin) return void (_onboardingActive = false);

    await new Promise(r => setTimeout(r, 150));
    showRestoreChoiceModal({ token, meta, items, profile, preloadedBackup: backup });
  } catch (e) { console.warn('[AuthOnboarding] flow failed:', e?.message); } finally { _onboardingActive = false; }
}

function showWelcomeNoBackupModal(profile) {
  if (!window.Modals?.open) return;
  const name = profile?.displayName || profile?.name || 'Слушатель', device = detectDeviceInfo(), installDate = getSystemInstallDate();
  const m = window.Modals.open({
    title: `👋 Добро пожаловать, ${esc(name)}!`, maxWidth: 420, strictClose: true,
    bodyHtml: `<div style="color:#9db7dd;line-height:1.5;margin-bottom:14px">Вы подключили Яндекс аккаунт. В облаке пока нет сохранений прогресса — это ваше первое устройство.</div><div style="background:rgba(77,170,255,.06);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:14px;margin-bottom:14px"><div style="font-size:12px;font-weight:900;color:#8ab8fd;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">🔧 Ваше текущее устройство</div><div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#eaf2ff"><div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#888">ОС:</span><span style="font-weight:700">${esc(device.osIcon)} ${esc(device.os)}</span></div><div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#888">Браузер:</span><span style="font-weight:700">${esc(device.browser)}</span></div><div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#888">Экран:</span><span style="font-weight:700">${esc(device.screen)}</span></div><div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#888">Язык:</span><span style="font-weight:700">${esc(device.lang)}</span></div><div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#888">Установлено:</span><span style="font-weight:700">${esc(installDate)}</span></div></div></div><div style="margin-bottom:14px"><label style="font-size:12px;color:#888;display:block;margin-bottom:6px">📝 Как назвать это устройство?</label><input type="text" id="ao-device-label" maxlength="25" value="${esc(device.label)}" placeholder="${esc(device.label)}" style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:14px;outline:none" autocomplete="off"><div style="font-size:11px;color:#666;margin-top:4px">По умолчанию — «Моё устройство №${device.deviceNumber}»</div></div><div style="background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:12px;margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:8px">💡 Что дальше?</div><ul style="margin:0;padding-left:20px;color:#9db7dd;font-size:11px;line-height:1.6"><li>Слушайте музыку — прогресс автоматически сохранится</li><li>На другом устройстве войдите тем же Яндексом — всё синхронизируется</li><li>Включите автосохранение в настройках профиля</li></ul></div><div class="modal-choice-actions profile-inline-actions"><button class="modal-action-btn online" id="ao-welcome-ok">Понятно</button></div>`
  });
  _currentModal = m;
  const inp = m?.querySelector('#ao-device-label'), okBtn = m?.querySelector('#ao-welcome-ok');
  const saveLabelAndClose = async () => { const val = inp?.value?.trim() || device.label; try { localStorage.setItem(DEVICE_LABEL_KEY, val); const { ensureCurrentDeviceRegistryRow } = await import('../../core/device-linking.js'); await ensureCurrentDeviceRegistryRow({ label: val }); } catch {} m.remove(); _currentModal = null; };
  okBtn?.addEventListener('click', saveLabelAndClose); inp?.addEventListener('keydown', e => { if (e.key === 'Enter') saveLabelAndClose(); });
}

async function showRestoreChoiceModal({ token, meta, items, profile, preloadedBackup }) {
  const mod = await import('./fresh-restore-modal.js'); if (typeof mod?.openFreshLoginRestoreModal !== 'function') return;
  mod.openFreshLoginRestoreModal({
    meta, items, backup: preloadedBackup || null, currentDeviceInfo: detectDeviceInfo(), disk: YandexDisk, token,
    onLater: async () => { snoozeReminder(24); try { const se = await import('../../analytics/backup-sync-engine.js'); se.markSyncReady('user_skipped_restore'); try { se.markRestoreOrSkipDone('user_skipped_restore'); } catch {} } catch {} window.NotificationSystem?.info?.('Можно восстановить позже из Личного кабинета'); },
    onRestore: async ({ pickedPath, inheritDeviceKey, asNewDevice, skipDeviceSettings } = {}) => await executeRestore({ token, pickedPath, inheritDeviceKey, asNewDevice: !!asNewDevice, skipDeviceSettings: !!skipDeviceSettings, profile, preloadedBackup }),
    onNewDevice: async ({ pickedPath, inheritDeviceKey } = {}) => await executeRestore({ token, pickedPath, inheritDeviceKey, asNewDevice: true, profile, preloadedBackup })
  });
}

async function executeRestore({ token, pickedPath, inheritDeviceKey, asNewDevice, skipDeviceSettings = false, profile, preloadedBackup }) {
  const nSys = window.NotificationSystem; nSys?.info?.('Применяем прогресс из облака...');
  try {
    if (preloadedBackup && (!pickedPath || _preloadResult?.meta?.path === pickedPath)) return await applyPreloadedBackup({ backup: preloadedBackup, token, asNewDevice, profile, inheritDeviceKey, skipDeviceSettings });
    const { BackupVault } = await import('../../analytics/backup-vault.js'), data = await YandexDisk.download(token, pickedPath || _preloadResult?.meta?.path || null);
    if (!data) throw new Error('backup_not_found');
    await runBackupRestore({ BackupVault, disk: YandexDisk, token, backup: data, mode: 'all', inheritDeviceKey: inheritDeviceKey || null, asNewDevice: !!asNewDevice, skipDeviceSettings: !!skipDeviceSettings, allowPlaybackSensitive: false, refreshReason: asNewDevice ? 'cloud_restore_new_device' : 'cloud_restore', keepCurrentAlbum: true });
  } catch (err) { const msg = String(err?.message || ''); if (!msg.includes('device_settings_not_found') && !msg.includes('device_settings_conflict')) nSys?.error?.('Ошибка восстановления: ' + msg); } finally { _preloadResult = null; _preloadPromise = null; }
}

async function applyPreloadedBackup({ backup, token, asNewDevice, profile, inheritDeviceKey = null, skipDeviceSettings = false }) {
  const nSys = window.NotificationSystem;
  try {
    const { BackupVault } = await import('../../analytics/backup-vault.js');
    await runBackupRestore({ BackupVault, disk: YandexDisk, token, backup, mode: 'all', inheritDeviceKey, asNewDevice, skipDeviceSettings, allowPlaybackSensitive: false, refreshReason: asNewDevice ? 'cloud_restore_new_device' : 'cloud_restore', keepCurrentAlbum: true });
    try { const { default: DeviceRegistry } = await import('../../analytics/device-registry.js'); const before = DeviceRegistry.getDeviceRegistry(), cleaned = DeviceRegistry.normalizeDeviceRegistry(before); if (cleaned.length < before.length) DeviceRegistry.saveDeviceRegistry(cleaned); } catch {}
    try { await new Promise(r => setTimeout(r, 100)); window.dispatchEvent(new CustomEvent('profile:data:refreshed', { detail: { reason: 'cloud_restore_final' } })); window.dispatchEvent(new CustomEvent('stats:updated', { detail: { source: 'cloud_restore' } })); window.dispatchEvent(new CustomEvent('achievements:updated', { detail: { total: window.achievementEngine?.achievements?.length || 0, unlocked: Object.keys(window.achievementEngine?.unlocked || {}).length, items: window.achievementEngine?.unlocked || {}, unlockMeta: window.achievementEngine?.unlockMeta || {}, profile: window.achievementEngine?.profile || { xp: 0, level: 1 }, source: 'cloud_restore' } })); window.dispatchEvent(new CustomEvent('favorites:updated', { detail: { source: 'cloud_restore' } })); window.dispatchEvent(new CustomEvent('devices:updated', { detail: { source: 'cloud_restore' } })); window.PlayerUI?.updateMiniHeader?.(); window.PlayerUI?.updatePlaylistFiltering?.(); } catch {}
    nSys?.success(`Прогресс восстановлен ✅${asNewDevice ? ' (новое устройство)' : ''}`);
  } catch (e) { const msg = String(e?.message || ''); if (msg.includes('restore_owner_mismatch')) nSys?.error?.('Backup принадлежит другому Яндекс-аккаунту.'); else if (msg.includes('backup_integrity_failed')) nSys?.error?.('Файл backup повреждён.'); else nSys?.error?.('Ошибка применения backup: ' + msg); throw e; }
}

export function startPreload(token) {
  if (!token) return _preloadPromise = Promise.resolve({ meta: null, items: [], backup: null });
  return _preloadPromise = (async () => {
    try { const profile = window.YandexAuth?.getProfile?.(), cached = await loadPreloadFromCache(profile?.yandexId); if (cached?.meta) return cached; } catch {}
    const result = await preloadBackupData({ token, disk: YandexDisk }); if (result?.meta) savePreloadToCache(result).catch(() => {}); return result;
  })();
}

export function clearPreloadCache() { _preloadPromise = null; _preloadResult = null; _onboardingActive = false; try { _currentModal?.remove?.(); } catch {} _currentModal = null; invalidatePreloadCache().catch(() => {}); }

export async function openManualRestoreFlow({ token, profile } = {}) {
  if (!token) return;
  try {
    _preloadPromise = preloadBackupData({ token, disk: YandexDisk }); const result = await _preloadPromise; _preloadResult = result;
    const meta = result?.meta || null; if (!meta) return window.NotificationSystem?.warning?.('Облачная копия не найдена');
    showRestoreChoiceModal({ token, meta, items: result?.items || [], profile: profile || { name: 'Слушатель' }, preloadedBackup: result?.backup || null });
  } catch (e) { window.NotificationSystem?.error?.('Не удалось открыть восстановление: ' + String(e?.message || '')); }
}

export async function _waitForPreload() { if (_preloadPromise) return await _preloadPromise; return { meta: null, items: [], backup: null }; }

export default { startPreload, runOnboardingFlow, clearPreloadCache, openManualRestoreFlow, _waitForPreload };

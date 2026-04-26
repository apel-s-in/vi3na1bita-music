import { safeNum } from '../../analytics/backup-summary.js';

export const RESTORE_SKIP_REMINDER_KEY = 'yandex:onboarding:skip:until';

const sS = v => String(v == null ? '' : v).trim();

export const sessionKeyForCloudSnapshot = ts => `yandex:onboarding:shown:${Number(ts || 0)}`;

export const isReminderSuppressedForSnapshot = cloudTs => {
  try {
    const localTs = safeNum(localStorage.getItem('yandex:last_backup_local_ts'));
    const sameSnapshot = cloudTs > 0 && localTs > 0 && Math.abs(cloudTs - localTs) < 5000;
    const restoreDone = localStorage.getItem('backup:restore_or_skip_done') === '1';
    return restoreDone && sameSnapshot;
  } catch {
    return false;
  }
};

export const isSnoozedUntilNow = () => {
  try {
    const until = safeNum(localStorage.getItem(RESTORE_SKIP_REMINDER_KEY));
    return until > 0 && Date.now() < until;
  } catch {
    return false;
  }
};

export const snoozeReminder = (hours = 24) => {
  try {
    localStorage.setItem(RESTORE_SKIP_REMINDER_KEY, String(Date.now() + Math.max(1, safeNum(hours) || 24) * 3600000));
  } catch {}
};

export const shouldTryDeviceSettingsRestore = ({ backup, inheritDeviceKey = null, asNewDevice = false } = {}) => {
  if (asNewDevice) return false;
  const explicitKey = sS(inheritDeviceKey);
  const backupKey = sS(backup?.revision?.sourceDeviceStableId);
  const hasDevices = Array.isArray(backup?.devices) && backup.devices.length > 0;
  if (explicitKey) return true;
  return !!(backupKey && hasDevices);
};

export const pickDeviceSettingsRestoreKey = ({ backup, inheritDeviceKey = null, asNewDevice = false } = {}) =>
  shouldTryDeviceSettingsRestore({ backup, inheritDeviceKey, asNewDevice })
    ? sS(inheritDeviceKey || backup?.revision?.sourceDeviceStableId || '')
    : '';

export default {
  RESTORE_SKIP_REMINDER_KEY,
  sessionKeyForCloudSnapshot,
  isReminderSuppressedForSnapshot,
  isSnoozedUntilNow,
  snoozeReminder,
  shouldTryDeviceSettingsRestore,
  pickDeviceSettingsRestoreKey
};

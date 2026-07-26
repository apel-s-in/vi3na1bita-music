// Read-only серверное состояние «Преданности».
// Не управляет playback и не входит в пользовательский backup.

const n = value =>
  Number.isFinite(Number(value))
    ? Math.max(0, Number(value))
    : 0;

const authorized = () =>
  window.YandexAuth?.getSessionStatus?.() === 'active' &&
  window.YandexAuth?.isTokenAlive?.();

export const normalizeLoyaltyState = raw => {
  const source =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw)
      ? raw
      : {};

  return {
    version: Math.max(1, Math.floor(n(source.version) || 1)),
    source: 'server_confirmed',
    available: source.available === true,
    pending: authorized() && source.available !== true,
    cycleId: String(source.cycleId || ''),
    currentDays: Math.floor(n(source.currentDays)),
    longestDays: Math.floor(n(source.longestDays)),
    lastQualifiedAt: Math.floor(n(source.lastQualifiedAt)),
    deadlineAt: Math.floor(n(source.deadlineAt)),
    nextDailyAmount: Math.floor(n(source.nextDailyAmount)),
    nextMilestone: source.nextMilestone
      ? {
          day: Math.floor(n(source.nextMilestone.day)),
          amount: Math.floor(n(source.nextMilestone.amount))
        }
      : null,
    trust: {
      status: String(source.trust?.status || 'ok'),
      flags: Array.isArray(source.trust?.flags)
        ? source.trust.flags.map(flag => ({ ...flag }))
        : []
    },
    updatedAt: Math.floor(n(source.updatedAt))
  };
};

export const getLoyaltyState = () =>
  normalizeLoyaltyState(
    window.ListeningReceipts?.lastLoyalty
  );

export const formatLoyaltyDeadline = loyalty => {
  const state = normalizeLoyaltyState(loyalty);

  if (!state.available || !state.deadlineAt) return '—';

  const remainingMs = Math.max(
    0,
    state.deadlineAt - Date.now()
  );
  const hours = Math.floor(remainingMs / 3600000);
  const minutes = Math.floor(
    (remainingMs % 3600000) / 60000
  );

  return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
};

export default {
  normalizeLoyaltyState,
  getLoyaltyState,
  formatLoyaltyDeadline
};

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
    daysToNextMilestone: Math.floor(
      n(source.daysToNextMilestone)
    ),
    reminderEnabled: source.reminderEnabled === true,
    vacation: {
      active: source.vacation?.active === true,
      startedAt: Math.floor(n(source.vacation?.startedAt)),
      endsAt: Math.floor(n(source.vacation?.endsAt)),
      resumeDeadlineAt: Math.floor(
        n(source.vacation?.resumeDeadlineAt)
      ),
      allowanceMs: Math.floor(
        n(source.vacation?.allowanceMs)
      ),
      usedMs: Math.floor(n(source.vacation?.usedMs)),
      remainingMs: Math.floor(
        n(source.vacation?.remainingMs)
      )
    },
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
export const formatLoyaltyVacation = loyalty => {
  const state = normalizeLoyaltyState(loyalty);
  const remainingMs = state.vacation.active
    ? Math.max(0, state.vacation.endsAt - Date.now())
    : state.vacation.remainingMs;
  const days = Math.floor(remainingMs / 86400000);
  const hours = Math.floor(
    (remainingMs % 86400000) / 3600000
  );

  return `${days}д ${String(hours).padStart(2, '0')}ч`;
};
export default {
  normalizeLoyaltyState,
  getLoyaltyState,
  formatLoyaltyDeadline,
  formatLoyaltyVacation
};

// Единая обработка результатов серверных reward channels.
// Не управляет playback, Favorites или backup.

const num = value =>
  Number.isFinite(Number(value))
    ? Number(value)
    : 0;

export const applyShardRewardResult = (
  result,
  {
    rewardsKey = 'rewards',
    refreshWallet = true,
    showToast = true
  } = {}
) => {
  const grants = Array.isArray(result?.[rewardsKey])
    ? result[rewardsKey]
    : [];

  if (
    refreshWallet &&
    (result?.wallet || grants.length)
  ) {
    window.ShardWallet
      ?.refresh?.({ force: true })
      .catch(() => null);
  }

  const amount = grants.reduce(
    (sum, grant) =>
      sum + Math.max(0, num(grant?.amount)),
    0
  );

  if (showToast && amount > 0) {
    window.NotificationSystem?.success?.(
      `♦ Начислено ${amount} Осколков`
    );
  }

  return {
    grants,
    amount,
    walletUpdated:
      !!result?.wallet || grants.length > 0
  };
};

export default {
  applyShardRewardResult
};

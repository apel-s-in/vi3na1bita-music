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
  const achievementGrants = Array.isArray(result?.[rewardsKey])
    ? result[rewardsKey]
    : [];
  const loyaltyGrants = Array.isArray(result?.loyaltyRewards)
    ? result.loyaltyRewards
    : [];
  const grants = [
    ...achievementGrants,
    ...loyaltyGrants
  ];

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

  if (showToast && loyaltyGrants.length) {
    const loyaltyAmount = loyaltyGrants.reduce(
      (sum, grant) =>
        sum + Math.max(0, num(grant?.amount)),
      0
    );
    const day = Math.max(
      0,
      ...loyaltyGrants.map(grant => num(grant?.day))
    );
    const details = loyaltyGrants.map(grant =>
      grant.kind === 'milestone'
        ? `Рубеж ${num(grant.day)} дней: +${num(grant.amount)} ♦`
        : `Ежедневный бонус: +${num(grant.amount)} ♦`
    );

    window.Modals?.open?.({
      title: '⚡ Преданность',
      maxWidth: 390,
      bodyHtml: `<div class="sm-center"><div style="font-size:48px;margin-bottom:8px">⚡</div><div style="font-size:20px;font-weight:900;color:#fff">${day} день подряд</div><div class="sm-note">${details.join('<br>')}</div><div class="shards-wallet-card" style="margin-top:12px"><span class="shards-wallet-icon">♦</span><div><small>Получено</small><b>${loyaltyAmount}</b><span>Осколков за Преданность</span></div></div></div>`
    });
  } else if (showToast && amount > 0) {
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

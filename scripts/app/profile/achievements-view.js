import { fmtAchTimerText } from '../../ui/progress-formatters.js';

export const createProfileAchievementsView = ({ ctx, container: c, engine: e }) => {
  const esc = v => CSS.escape(String(v || '')), hEsc = v => window.Utils?.escapeHtml?.(String(v || '')) || String(v || ''), eng = () => window.achievementEngine || e;
  const rewardText = a => {
    if (a?.isHidden && !a?.isUnlocked) return 'Секретное';
    if (a?.rewardAwarded) return `+${a.shardReward} ♦ получено`;

    if (a?.rewardEligible) {
      return a?.rewardsEnabled
        ? `+${a.shardReward} ♦ · начисляется`
        : `+${a.shardReward} ♦ · подтверждено`;
    }

    if (a?.localUnlocked) {
      return a?.hasServerReward
        ? `+${a.shardReward} ♦ · проверяется`
        : `+${a.shardReward} ♦ · награда готовится`;
    }

    return a?.hasServerReward
      ? `+${a.shardReward} ♦`
      : `+${a.shardReward} ♦ · награда готовится`;
  };
  const unlockInfo = a => { const m = a?.unlockMeta || {}, ts = Number(m.unlockedAt || a?.unlockedAt || 0), dt = ts > 0 ? new Date(ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—', dev = [m.deviceLabel, m.deviceClass || m.platform, m.devicePwa ? 'PWA' : ''].filter(Boolean).join(' · '); return hEsc(`Открыто: ${dt}${dev ? ` · ${dev}` : ''}`); };
  const tH = a => {
    const text = fmtAchTimerText(a);
    return text
      ? `<span class="ach-timer" data-ach-timer-view="${hEsc(a.id)}">${hEsc(text)}</span>`
      : '';
  };
  const flt = f => (eng()?.achievements || []).filter(a => f === 'secret' ? (a.isSecret || a.isHidden) : f === 'done' ? a.isUnlocked : f === 'available' ? !a.isUnlocked && !a.isHidden : !a.isHidden || a.isUnlocked);

  return {
    render: (f = 'available') => {
      if (!c || !eng()?.achievements) return;
      const it = flt(ctx._achCurrentFilter = f);
      c.innerHTML = it.length ? it.map(a => `<div class="ach-item ${a.isUnlocked ? 'done' : ''}" data-ach="${a.id}"><div class="ach-top"><div class="ach-title" style="color:${a.isUnlocked ? '#fff' : a.color || '#fff'}">${hEsc(a.icon)} ${hEsc(a.name)}</div></div><div class="ach-sub">${a.isUnlocked && a.unlockedAt ? unlockInfo(a) : a.isHidden ? 'Откроется при особых условиях' : hEsc(a.short)}</div>${!a.isUnlocked && !a.isHidden && a.progress ? `<div class="ach-progress"><div class="ach-mini-bar"><div class="ach-mini-fill" data-ach-fill="${a.id}" style="width:${a.progress.pct}%"></div></div></div>` : ''}<div class="ach-bottom"><div class="ach-reward">${rewardText(a)}</div><div class="ach-remaining" data-ach-remaining="${a.id}">${tH(a)}</div><button class="ach-more" type="button">Подробнее</button></div><div class="ach-details" style="display:none"><div class="ach-details-title">Как выполнить</div><div class="ach-details-how">${hEsc(a.howTo || 'Выполните условия.')}</div>${a.desc ? `<div class="ach-details-desc">${hEsc(a.desc)}</div>` : ''}</div></div>`).join('') : '<div class="fav-empty">По данному фильтру ничего нет</div>';
    },
    updateLiveNodes: () => {
      if (!c || !eng()?.achievements) return;

      flt(ctx._achCurrentFilter || 'all').forEach(a => {
        const remaining = c.querySelector(
          `[data-ach-remaining="${esc(a.id)}"]`
        );
        const fill = c.querySelector(
          `[data-ach-fill="${esc(a.id)}"]`
        );

        if (remaining) remaining.innerHTML = tH(a);
        if (fill && a.progress) {
          fill.style.width = `${a.progress.pct}%`;
        }
      });
    }
  };
};

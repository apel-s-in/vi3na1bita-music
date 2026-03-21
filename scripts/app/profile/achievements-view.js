import { fmtAchTimerText } from '../../ui/progress-formatters.js';

export const createProfileAchievementsView = ({ ctx, container: c, engine: e }) => {
  const tM = ctx._achTimerMode || (ctx._achTimerMode = new Map()), esc = v => CSS.escape(String(v || ''));
  const gM = id => tM.get(id) || 'remaining';
  const tH = a => { const t = fmtAchTimerText(a, gM(a.id)); return t ? `<button class="ach-timer" type="button" data-ach-timer="${a.id}" title="Нажмите для переключения режима">${t}</button>` : ''; };
  const flt = f => (e?.achievements || []).filter(a => f === 'secret' ? a.isHidden : (f === 'done' ? a.isUnlocked : (f === 'available' ? !a.isUnlocked && !a.isHidden : (!a.isHidden || a.isUnlocked))));

  return {
    render: (f = 'available') => {
      if (!c || !e?.achievements) return;
      const it = flt(ctx._achCurrentFilter = f);
      c.innerHTML = it.length ? it.map(a => `<div class="ach-item ${a.isUnlocked ? 'done' : ''}" data-ach="${a.id}"><div class="ach-top"><div class="ach-title" style="color:${a.isUnlocked ? '#fff' : (a.color || '#fff')}">${a.icon} ${a.name}</div></div><div class="ach-sub">${a.isUnlocked && a.unlockedAt ? `Открыто: ${new Date(a.unlockedAt).toLocaleDateString()}` : (a.isHidden ? 'Откроется при особых условиях' : a.short)}</div>${(!a.isUnlocked && !a.isHidden && a.progress) ? `<div class="ach-progress"><div class="ach-mini-bar"><div class="ach-mini-fill" data-ach-fill="${a.id}" style="width:${a.progress.pct}%"></div></div></div>` : ''}<div class="ach-bottom"><div class="ach-xp">${a.isUnlocked ? `+${a.xpReward} XP` : (a.isHidden ? 'Секретное' : `${a.xpReward} XP`)}</div><div class="ach-remaining" data-ach-remaining="${a.id}">${tH(a)}</div><button class="ach-more" type="button">Подробнее</button></div><div class="ach-details" style="display:none"><div class="ach-details-title">Как выполнить</div><div class="ach-details-how">${a.howTo || 'Выполните условия.'}</div>${a.desc ? `<div class="ach-details-desc">${a.desc}</div>` : ''}</div></div>`).join('') : '<div class="fav-empty">По данному фильтру ничего нет</div>';
    },
    updateLiveNodes: () => {
      if (!c || !e?.achievements) return;
      flt(ctx._achCurrentFilter || 'all').forEach(a => {
        const rem = c.querySelector(`[data-ach-remaining="${esc(a.id)}"]`), fil = c.querySelector(`[data-ach-fill="${esc(a.id)}"]`);
        if (rem) rem.innerHTML = tH(a);
        if (fil && a.progress) fil.style.width = `${a.progress.pct}%`;
      });
    },
    toggleTimerMode: id => { tM.set(id, gM(id) === 'remaining' ? 'elapsed' : 'remaining'); ctx._achCurrentFilter && flt(ctx._achCurrentFilter).length; c && c.querySelector(`[data-ach-remaining="${esc(id)}"]`) && (c.querySelector(`[data-ach-remaining="${esc(id)}"]`).innerHTML = tH(e.achievements.find(a=>a.id===id))); }
  };
};

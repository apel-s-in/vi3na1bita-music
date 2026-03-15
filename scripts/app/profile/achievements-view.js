import { fmtAchTimerText } from '../../ui/progress-formatters.js';

/**
 * scripts/app/profile/achievements-view.js
 * Мини-модуль профиля: отвечает только за рендер, live-обновление и toggle таймеров достижений.
 * Вся логика карточек achievements профиля теперь находится здесь.
 */

export function createProfileAchievementsView({ ctx, container, engine }) {
  const timerMode = ctx._achTimerMode || (ctx._achTimerMode = new Map());
  const escId = (v) => CSS.escape(String(v || ''));
  const getMode = (id) => timerMode.get(id) || 'remaining';

  const timerHtml = (a) => {
    const txt = fmtAchTimerText(a, getMode(a.id));
    return txt ? `<button class="ach-timer" type="button" data-ach-timer="${a.id}" title="Нажмите для переключения режима">${txt}</button>` : '';
  };

  const filterItems = (f) => (engine?.achievements || []).filter(a => f === 'secret' ? a.isHidden : (f === 'done' ? a.isUnlocked : (f === 'available' ? !a.isUnlocked && !a.isHidden : (!a.isHidden || a.isUnlocked))));

  const render = (f = 'all') => {
    if (!container || !engine?.achievements) return;
    ctx._achCurrentFilter = f;
    const it = filterItems(f);
    container.innerHTML = it.length ? it.map(a => `<div class="ach-item ${a.isUnlocked ? 'done' : ''}" data-ach="${a.id}"><div class="ach-top"><div class="ach-title" style="color:${a.isUnlocked ? '#fff' : (a.color || '#fff')}">${a.icon} ${a.name}</div></div><div class="ach-sub">${a.isUnlocked && a.unlockedAt ? `Открыто: ${new Date(a.unlockedAt).toLocaleDateString()}` : (a.isHidden ? 'Откроется при особых условиях' : a.short)}</div>${(!a.isUnlocked && !a.isHidden && a.progress) ? `<div class="ach-progress"><div class="ach-mini-bar"><div class="ach-mini-fill" data-ach-fill="${a.id}" style="width:${a.progress.pct}%"></div></div></div>` : ``}<div class="ach-bottom"><div class="ach-xp">${a.isUnlocked ? `+${a.xpReward} XP` : (a.isHidden ? `Секретное` : `${a.xpReward} XP`)}</div><div class="ach-remaining" data-ach-remaining="${a.id}">${timerHtml(a)}</div><button class="ach-more" type="button">Подробнее</button></div><div class="ach-details" style="display:none"><div class="ach-details-title">Как выполнить</div><div class="ach-details-how">${a.howTo || 'Выполните условия.'}</div>${a.desc ? `<div class="ach-details-desc">${a.desc}</div>` : ''}</div></div>`).join('') : '<div class="fav-empty">По данному фильтру ничего нет</div>';
  };

  const updateLiveNodes = () => {
    if (!container || !engine?.achievements) return;
    filterItems(ctx._achCurrentFilter || 'all').forEach(a => {
      const rem = container.querySelector(`[data-ach-remaining="${escId(a.id)}"]`);
      const fill = container.querySelector(`[data-ach-fill="${escId(a.id)}"]`);
      if (rem) rem.innerHTML = timerHtml(a);
      if (fill && a.progress) fill.style.width = `${a.progress.pct}%`;
    });
  };

  const toggleTimerMode = (id) => {
    const prev = getMode(id);
    timerMode.set(id, prev === 'remaining' ? 'elapsed' : 'remaining');
    updateLiveNodes();
  };

  return { render, updateLiveNodes, toggleTimerMode };
}

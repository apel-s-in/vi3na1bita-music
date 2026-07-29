import {
  formatLoyaltyCountdown,
  formatLoyaltyTime,
  formatLoyaltyVacation,
  getLoyaltyState
} from '../../analytics/loyalty-state.js';
import {
  setLoyaltyReminderEnabled,
  setLoyaltyVacationEnabled
} from '../push/loyalty-reminders.js';

const esc = value =>
  window.Utils?.escapeHtml?.(String(value || '')) ||
  String(value || '');

const rewards = [
  { day: '1 день', reward: '10 ♦', daily: '' },
  { day: '2 дня', reward: '20 ♦', daily: '' },
  { day: '3 дня', reward: '30 ♦', daily: 'далее +5 ♦ ежедневно' },
  { day: '7 дней', reward: '100 ♦', daily: 'далее +10 ♦ ежедневно' },
  { day: '14 дней', reward: '200 ♦', daily: 'далее +20 ♦ ежедневно' },
  { day: '30 дней', reward: '500 ♦', daily: 'далее +30 ♦ ежедневно' },
  { day: '100 дней', reward: '1000 ♦', daily: 'далее +50 ♦ ежедневно' },
  { day: '365 дней', reward: '10000 ♦', daily: 'далее +100 ♦ ежедневно' }
];

const rewardTable = () =>
  `<div class="loyalty-reward-grid">${rewards.map(item =>
    `<div class="loyalty-reward-cell"><span>${esc(item.day)}</span><b>${esc(item.reward)}</b>${item.daily ? `<small>${esc(item.daily)}</small>` : '<small>&nbsp;</small>'}</div>`
  ).join('')}</div>`;

export const updateLoyaltyCardTimers = root => {
  root?.querySelectorAll('[data-loyalty-countdown-at]')
    .forEach(element => {
      const target = Number(
        element.dataset.loyaltyCountdownAt || 0
      );
      const prefix =
        element.dataset.loyaltyCountdownPrefix || '';

      element.textContent =
        `${prefix}${formatLoyaltyCountdown(target)}`;
    });
};

export const renderLoyaltyCard = ({
  expanded = false
} = {}) => {
  const state = getLoyaltyState();

  if (state.pending) {
    return `<div class="ach-item loyalty-card"><div class="ach-title">⚡ Преданность</div><div class="ach-sub">Получаем подтверждённое состояние с сервера…</div></div>`;
  }

  if (!state.available) return '';

  const vacationDisabled =
    state.currentDays <= 0 ||
    (
      !state.vacation.active &&
      state.vacation.remainingMs <= 0
    );
  const accountTimezone = window.TimezonePolicy?.getCached?.()?.zone || '';
  const changeTime = formatLoyaltyTime(state.cycleStartedAt || state.dayChangeAt, accountTimezone);
  const changeTimeLabel = accountTimezone ? `${changeTime} · ${accountTimezone}` : changeTime;
  const activityText = state.vacation.active
    ? 'Преданность на паузе'
    : state.activityAccounted
      ? 'Активность текущего дня учтена'
      : `До ${changeTime} нужна активность`;
  const countdownAt = state.activityAccounted
    ? state.nextMilestoneAt
    : state.deadlineAt;
  const countdownPrefix = state.activityAccounted
    ? 'До крупной награды: '
    : 'До потери серии: ';
  const milestoneText = state.nextMilestone
    ? `${state.nextMilestone.day} дней · ${state.nextMilestone.amount} ♦`
    : 'Все крупные рубежи пройдены';
  const currentReward = state.currentDayRewardAmount > 0
    ? `+${state.currentDayRewardAmount} ♦`
    : `+${state.nextDailyAmount} ♦ далее`;

  return `<div class="ach-item loyalty-card ${state.vacation.active ? 'is-paused' : ''}" data-ach="loyalty" data-loyalty-card><div class="ach-top"><div class="ach-title">⚡ Преданность · ${state.currentDays} день</div></div><div class="loyalty-summary"><div><span>Текущий день</span><b>${state.currentDays}</b></div><div><span>Лучший стрик</span><b>${state.longestDays}</b></div><div><span>Смена дня</span><b>${esc(changeTimeLabel)}</b></div><div><span>Ежедневный бонус</span><b>+${state.nextDailyAmount} ♦</b></div></div><div class="loyalty-activity ${state.activityAccounted ? 'is-accounted' : 'is-required'}"><b>${state.activityAccounted ? '✓' : '!'}</b><span>${esc(activityText)}</span></div><div class="loyalty-next"><b>Следующая крупная награда</b><span>${esc(milestoneText)}</span><strong data-loyalty-countdown-at="${Number(countdownAt || 0)}" data-loyalty-countdown-prefix="${esc(countdownPrefix)}">${esc(countdownPrefix)}${esc(formatLoyaltyCountdown(countdownAt))}</strong></div><div class="ach-bottom"><div class="ach-reward">${esc(currentReward)}</div><div class="ach-remaining">${state.activityAccounted ? 'Сегодня продлено' : `Рубеж ${esc(changeTimeLabel)}`}</div><button class="ach-more" type="button" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? 'Свернуть' : 'Подробнее'}</button></div><div class="ach-details" style="display:${expanded ? 'block' : 'none'}"><div class="ach-details-title">Как сохранить Преданность</div><div class="ach-details-how">Время смены вашего дня зафиксировано при начале цикла: <b>${esc(changeTimeLabel)}</b>. Проявите хотя бы одну подтверждённую активность в каждом новом 24-часовом окне. Дополнительная активность не сдвигает время смены дня.</div>${rewardTable()}<label class="loyalty-control"><span><b>🔔 Напоминать о Преданности</b><small>Push придёт за один час до ${esc(changeTimeLabel)}, только если активность текущего дня ещё не учтена.</small></span><input type="checkbox" data-loyalty-reminder ${state.reminderEnabled ? 'checked' : ''}></label><label class="loyalty-control ${vacationDisabled ? 'is-disabled' : ''}"><span><b>🛡️ Пауза Преданности</b><small>${state.vacation.active ? `Активна · осталось ${formatLoyaltyVacation(state)}` : `Доступно ${formatLoyaltyVacation(state)} за скользящие 365 дней`}</small></span><input type="checkbox" data-loyalty-vacation ${state.vacation.active ? 'checked' : ''} ${vacationDisabled ? 'disabled' : ''}></label><div class="ach-details-desc">Во время паузы фиксированный цикл замораживается, стрик не растёт и награды не начисляются. После продолжения границы цикла сдвигаются ровно на длительность паузы.</div></div></div>`;
};

export const handleLoyaltyControl = async element => {
  if (element?.matches?.('[data-loyalty-reminder]')) {
    element.disabled = true;

    try {
      await setLoyaltyReminderEnabled(element.checked);
      window.NotificationSystem?.success?.(
        element.checked
          ? '🔔 Напоминание за час до рубежа включено'
          : 'Напоминания Преданности выключены'
      );
    } catch (error) {
      element.checked = !element.checked;
      window.NotificationSystem?.error?.(
        `Не удалось изменить напоминание: ${error?.message || 'ошибка'}`
      );
    } finally {
      element.disabled = false;
    }

    return true;
  }

  if (element?.matches?.('[data-loyalty-vacation]')) {
    const enabled = element.checked;
    element.disabled = true;

    try {
      await setLoyaltyVacationEnabled(enabled);
      window.NotificationSystem?.success?.(
        enabled
          ? '🛡️ Преданность поставлена на паузу'
          : '⚡ Преданность продолжена'
      );
    } catch (error) {
      element.checked = !enabled;
      window.NotificationSystem?.error?.(
        `Не удалось изменить паузу: ${error?.message || 'ошибка'}`
      );
    } finally {
      element.disabled = false;
    }

    return true;
  }

  return false;
};

export default {
  renderLoyaltyCard,
  updateLoyaltyCardTimers,
  handleLoyaltyControl
};

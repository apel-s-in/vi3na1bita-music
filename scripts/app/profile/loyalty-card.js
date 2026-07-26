import {
  formatLoyaltyDeadline,
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
  ['1 день', '10 ♦'],
  ['2 дня', '20 ♦'],
  ['3 дня', '30 ♦'],
  ['4–7 дней', '+5 ♦ ежедневно'],
  ['7 дней', '100 ♦'],
  ['8–14 дней', '+10 ♦ ежедневно'],
  ['14 дней', '200 ♦'],
  ['15–30 дней', '+20 ♦ ежедневно'],
  ['30 дней', '500 ♦'],
  ['31–100 дней', '+30 ♦ ежедневно'],
  ['100 дней', '1000 ♦'],
  ['101–365 дней', '+50 ♦ ежедневно'],
  ['365 дней', '10000 ♦'],
  ['366+ дней', '+100 ♦ ежедневно']
];

export const renderLoyaltyCard = () => {
  const state = getLoyaltyState();

  if (state.pending) {
    return `<div class="ach-item loyalty-card"><div class="ach-title">⚡ Преданность</div><div class="ach-sub">Получаем подтверждённое состояние с сервера…</div></div>`;
  }

  if (!state.available) {
    return '';
  }

  const vacationDisabled =
    state.currentDays <= 0 ||
    (
      !state.vacation.active &&
      state.vacation.remainingMs <= 0
    );
  const timer = state.vacation.active
    ? `Пауза: ${formatLoyaltyVacation(state)}`
    : `До потери streak: ${formatLoyaltyDeadline(state)}`;
  const next = state.nextMilestone
    ? `${state.daysToNextMilestone} дн. до ${state.nextMilestone.day}-го дня и ${state.nextMilestone.amount} ♦`
    : 'Ежедневная серия продолжается без ограничения';

  return `<div class="ach-item loyalty-card ${state.vacation.active ? 'is-paused' : ''}" data-loyalty-card><div class="ach-top"><div class="ach-title">⚡ Преданность · ${state.currentDays} день</div></div><div class="ach-sub">${esc(timer)}</div><div class="loyalty-next"><b>Следующий ежедневный бонус: +${state.nextDailyAmount} ♦</b><span>${esc(next)}</span></div><div class="ach-bottom"><div class="ach-reward">Лучший streak: ${state.longestDays}</div><div class="ach-remaining">${esc(timer)}</div></div><div class="ach-details" style="display:block"><div class="ach-details-title">Как сохранить Преданность</div><div class="ach-details-how">Заходите в приложение каждый день и пользуйтесь им: слушайте музыку, отмечайте любимые треки или создавайте плейлисты и сохраняйте прогресс.</div><div class="loyalty-grid">${rewards.map(([day, reward]) => `<div><span>${esc(day)}</span><b>${esc(reward)}</b></div>`).join('')}</div><label class="loyalty-control"><span><b>🔔 Напоминать о Преданности</b><small>Уведомление придёт на авторизованные устройства перед окончанием срока.</small></span><input type="checkbox" data-loyalty-reminder ${state.reminderEnabled ? 'checked' : ''}></label><label class="loyalty-control ${vacationDisabled ? 'is-disabled' : ''}"><span><b>🛡️ Пауза Преданности</b><small>${state.vacation.active ? `Активна · осталось ${formatLoyaltyVacation(state)}` : `Доступно ${formatLoyaltyVacation(state)} за скользящие 365 дней`}</small></span><input type="checkbox" data-loyalty-vacation ${state.vacation.active ? 'checked' : ''} ${vacationDisabled ? 'disabled' : ''}></label><div class="ach-details-desc">Во время паузы streak не растёт и ежедневные награды не начисляются. После окончания у вас будет 24 часа, чтобы продолжить серию.</div></div></div>`;
};

export const handleLoyaltyControl = async element => {
  if (element?.matches?.('[data-loyalty-reminder]')) {
    element.disabled = true;

    try {
      await setLoyaltyReminderEnabled(element.checked);
      window.NotificationSystem?.success?.(
        element.checked
          ? '🔔 Напоминания Преданности включены'
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
          : '⚡ Преданность продолжена. У вас есть 24 часа.'
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
  handleLoyaltyControl
};

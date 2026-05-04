export const createResetActionHandlers = ({ metaDB: db, reloadProfile: rP } = {}) => [{
  sel: '#stats-reset-open-btn',
  run: async () => {
    if (!window.Modals?.confirm || !db) return;
    window.Utils?.profileModals?.resetProfileData?.({
      onAction: async act => {
        try {
          if (act === 'stats' || act === 'all') {
            await db.tx('stats', 'readwrite', s => s.clear());
            await db.clearEvents?.('events_hot').catch(() => {});
            await db.clearEvents?.('events_warm').catch(() => {});
            await db.setGlobal('global_streak', { current: 0, longest: 0, lastActiveDate: '' }).catch(() => {});
          }
          if (act === 'ach' || act === 'all') {
            await db.setGlobal('unlocked_achievements', {});
            await db.setGlobal('achievement_unlock_meta', {});
            await db.setGlobal('user_profile_rpg', { xp: 0, level: 1 });
          }
          if (act === 'all') await db.setGlobal('listener_profile_summary', null).catch(() => {});
          try {
            const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
            await runPostRestoreRefresh({ reason: `profile_reset:${act}`, keepCurrentAlbum: true });
          } catch {}
          window.NotificationSystem?.success(act === 'stats' ? 'Статистика очищена ✅' : act === 'ach' ? 'Достижения сброшены ✅' : 'Профиль статистики сброшен ✅');
          rP?.();
        } catch (e) {
          window.NotificationSystem?.error('Ошибка: ' + String(e?.message || ''));
        }
      }
    });
  }
}];

export default { createResetActionHandlers };

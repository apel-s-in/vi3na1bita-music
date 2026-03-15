export function bindProfileActions({
  ctx,
  container,
  achView,
  profile,
  metaDB,
  cloudSync,
  tokens,
  reloadProfile
}) {
  if (!container || ctx._profBound) return;
  ctx._profBound = true;

  container.addEventListener('click', e => {
    const t = e.target, c = s => t.closest(s); let el;

    if (el = c('.profile-tab-btn')) {
      container.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      container.querySelector(`#tab-${el.dataset.tab}`)?.classList.add('active');
    } else if (el = c('.ach-classic-tab')) {
      container.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      achView.render(el.dataset.filter);
    } else if (el = c('.ach-more') || c('.ach-main')) {
      const d = el.closest('.ach-item')?.querySelector('.ach-details'), b = el.closest('.ach-item')?.querySelector('.ach-more');
      if (d) {
        const h = d.style.display === 'none';
        d.style.display = h ? 'block' : 'none';
        if (b) b.textContent = h ? 'Свернуть' : 'Подробнее';
      }
    } else if (el = c('[data-ach-timer]')) {
      achView.toggleTimerMode(el.dataset.achTimer);
    } else if (el = c('.chart-title')) {
      const b = container.querySelector('#'+el.dataset.tg);
      if (b) {
        const v = b.style.display !== 'none';
        b.style.display = v ? 'none' : '';
        localStorage.setItem(el.dataset.ls, v ? '0' : '1');
      }
    } else if (el = c('.auth-btn')) {
      const id = el.dataset.auth;
      if (tokens[id]) id==='yandex'&&cloudSync?.sync?cloudSync.sync(id):window.NotificationSystem?.info('Синхронизация...');
      else id==='yandex'&&cloudSync?.auth?cloudSync.auth(id):window.NotificationSystem?.info('Недоступно');
    } else if (c('#prof-avatar-btn')) {
      const av = ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎'];
      window.Utils?.profileModals?.avatarPicker?.({
        title: 'Аватар',
        items: av,
        onPick: async (val, modal) => {
          profile.avatar = val;
          container.querySelector('#prof-avatar-btn').textContent = val;
          metaDB && await metaDB.setGlobal('user_profile', profile).catch(()=>{});
          modal?.remove?.();
        }
      });
    } else if (c('#prof-name-edit')) {
      container.querySelector('#prof-name-inp')?.focus();
    } else if (el = c('[data-src]')) {
      if (['yandex','github'].includes(el.dataset.src)) {
        localStorage.setItem('sourcePref', el.dataset.src);
        window.TrackRegistry?.resetSourceCache?.();
        window.TrackRegistry?.ensurePopulated?.().catch(()=>{});
        window.NotificationSystem?.success(`Приоритет: ${el.dataset.src}`);
        reloadProfile?.();
      }
    } else if (el = c('.rec-play-btn')) {
      window.ShowcaseManager?.playContext?.(el.dataset.playuid);
      window.NotificationSystem?.info('Запуск рекомендации');
    } else if (c('#stats-reset-open-btn') && window.Modals?.confirm) {
      window.Utils?.profileModals?.resetProfileData?.({
        onAction: async (act) => {
          if (act === 'stats') await metaDB.tx('stats','readwrite',s=>s.clear());
          else if (act === 'ach') {
            await metaDB.setGlobal('unlocked_achievements',{});
            await metaDB.setGlobal('user_profile_rpg',{xp:0,level:1});
          } else if (act === 'all') {
            await metaDB.tx('stats','readwrite',s=>s.clear());
            await metaDB.setGlobal('unlocked_achievements',{});
            await metaDB.setGlobal('user_profile_rpg',{xp:0,level:1});
            await metaDB.setGlobal('global_streak',{current:0,longest:0});
          }
          window.location.reload();
        }
      });
    }
  });
}

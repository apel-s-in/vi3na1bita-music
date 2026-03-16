export const bindProfileActions = ({ ctx, container: c, achView: aV, profile: p, metaDB: db, cloudSync: cs, tokens: tk, reloadProfile: rP }) => {
  if (!c || ctx._pB) return; ctx._pB = true;
  c.addEventListener('click', async e => {
    const t = e.target, f = s => t.closest(s); let el;
    if (el = f('.profile-tab-btn')) {
      c.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active'));
      el.classList.add('active'); c.querySelector(`#tab-${el.dataset.tab}`)?.classList.add('active');
    } else if (el = f('.ach-classic-tab')) {
      c.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active'));
      el.classList.add('active'); aV.render(el.dataset.filter);
    } else if (el = f('.ach-more') || f('.ach-main')) {
      const d = el.closest('.ach-item')?.querySelector('.ach-details'), b = el.closest('.ach-item')?.querySelector('.ach-more');
      if (d) { const h = d.style.display === 'none'; d.style.display = h ? 'block' : 'none'; if (b) b.textContent = h ? 'Свернуть' : 'Подробнее'; }
    } else if (el = f('[data-ach-timer]')) aV.toggleTimerMode(el.dataset.achTimer);
    else if (el = f('.chart-title')) {
      const b = c.querySelector('#' + el.dataset.tg);
      if (b) { const v = b.style.display !== 'none'; b.style.display = v ? 'none' : ''; localStorage.setItem(el.dataset.ls, v ? '0' : '1'); }
    } else if (el = f('.auth-btn')) {
      const id = el.dataset.auth;
      tk[id] ? (id==='yandex'&&cs?.sync?cs.sync(id):window.NotificationSystem?.info('Синхронизация...')) : (id==='yandex'&&cs?.auth?cs.auth(id):window.NotificationSystem?.info('Недоступно'));
    } else if (f('#prof-avatar-btn')) {
      window.Utils?.profileModals?.avatarPicker?.({
        title: 'Аватар', items: ['😎','🎧','🎸','🦄','🦇','👽','🤖','🐱','🦊','🐼','🔥','💎'],
        onPick: async (v, m) => { p.avatar = v; c.querySelector('#prof-avatar-btn').textContent = v; db && await db.setGlobal('user_profile', p).catch(()=>{}); m?.remove?.(); }
      });
    } else if (f('#prof-name-edit')) c.querySelector('#prof-name-inp')?.focus();
    else if (el = f('[data-src]')) {
      if (['yandex','github'].includes(el.dataset.src)) { localStorage.setItem('sourcePref', el.dataset.src); window.TrackRegistry?.resetSourceCache?.(); window.TrackRegistry?.ensurePopulated?.().catch(()=>{}); window.NotificationSystem?.success(`Приоритет: ${el.dataset.src}`); rP?.(); }
    } else if (el = f('.rec-play-btn')) { window.ShowcaseManager?.playContext?.(el.dataset.playuid); window.NotificationSystem?.info('Запуск рекомендации'); }
    else if (f('#stats-reset-open-btn') && window.Modals?.confirm) {
      window.Utils?.profileModals?.resetProfileData?.({ onAction: async (act) => {
        if (act === 'stats') await db.tx('stats','readwrite',s=>s.clear());
        else if (act === 'ach') { await db.setGlobal('unlocked_achievements',{}); await db.setGlobal('user_profile_rpg',{xp:0,level:1}); }
        else if (act === 'all') { await db.tx('stats','readwrite',s=>s.clear()); await db.setGlobal('unlocked_achievements',{}); await db.setGlobal('user_profile_rpg',{xp:0,level:1}); await db.setGlobal('global_streak',{current:0,longest:0}); }
        window.location.reload();
      }});
    }
  });
};

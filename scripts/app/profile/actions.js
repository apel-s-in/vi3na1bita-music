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
      window.Utils?.dom?.createStyleOnce?.('profile-avatar-picker-styles', `.prof-ava-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.prof-ava-btn{font-size:24px;background:#232b38}`);
      const m = window.Modals.open({ title:'Аватар', bodyHtml:`<div class="prof-ava-grid">${av.map(a=>`<button class="showcase-color-dot prof-ava-btn" data-ava="${a}">${a}</button>`).join('')}</div>` });
      m.onclick = async ev => {
        const b = ev.target.closest('[data-ava]');
        if (b) {
          profile.avatar = b.dataset.ava;
          container.querySelector('#prof-avatar-btn').textContent = b.dataset.ava;
          metaDB && await metaDB.setGlobal('user_profile', profile).catch(()=>{});
          m.remove();
        }
      };
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
      window.Utils?.dom?.createStyleOnce?.('profile-reset-modal-styles', `.prof-reset-btn{width:100%}.prof-reset-btn--mb{margin-bottom:8px}`);
      const m = window.Modals.confirm({
        title:'Очистка',
        textHtml:`<button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="stats">Только статистику</button><button class="om-btn om-btn--outline prof-reset-btn prof-reset-btn--mb" data-act="ach">Только достижения</button><button class="om-btn om-btn--danger prof-reset-btn" data-act="all">Сбросить всё</button>`,
        confirmText:'Закрыть',
        cancelText:'Отмена'
      });
      m.onclick = async ev => {
        const act = ev.target.closest('.om-btn')?.dataset?.act;
        if (!act) return;
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
      };
    }
  });
}

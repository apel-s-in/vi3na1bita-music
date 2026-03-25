export const bindProfileActions = ({ ctx, container: c, achView: aV, metaDB: db, cloudSync: cs, tokens: tk, reloadProfile: rP }) => {
  if (!c || ctx._pB) return;
  ctx._pB = true;

  const handlers = [
    {
      sel: '.profile-tab-btn',
      run: ({ el }) => {
        c.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        c.querySelector(`#tab-${el.dataset.tab}`)?.classList.add('active');
      }
    },
    {
      sel: '.ach-classic-tab',
      run: ({ el }) => {
        const p = el.closest('.profile-tab-content');
        if (!p) return;
        p.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        if (p.id === 'tab-achievements') aV.render(el.dataset.filter);
        else if (p.id === 'tab-settings') {
          p.querySelectorAll('.settings-content').forEach(x => x.classList.remove('active'));
          p.querySelector(`#set-${el.dataset.setTab}`)?.classList.add('active');
        }
      }
    },
    {
      sel: '.ach-more, .ach-main',
      run: ({ el }) => {
        const item = el.closest('.ach-item');
        const d = item?.querySelector('.ach-details');
        const b = item?.querySelector('.ach-more');
        if (!d) return;
        const open = d.style.display === 'none';
        d.style.display = open ? 'block' : 'none';
        if (b) b.textContent = open ? 'Свернуть' : 'Подробнее';
      }
    },
    {
      sel: '[data-ach-timer]',
      run: ({ el }) => aV.toggleTimerMode(el.dataset.achTimer)
    },
    {
      sel: '.chart-title',
      run: ({ el }) => {
        const box = c.querySelector('#' + el.dataset.tg);
        if (!box) return;
        const visible = box.style.display !== 'none';
        box.style.display = visible ? 'none' : '';
        localStorage.setItem(el.dataset.ls, visible ? '0' : '1');
      }
    },
    {
      sel: '.auth-btn',
      run: ({ el }) => {
        const id = el.dataset.auth;
        tk[id]
          ? (id === 'yandex' && cs?.sync ? cs.sync(id) : window.NotificationSystem?.info('Синхронизация...'))
          : (id === 'yandex' && cs?.auth ? cs.auth(id) : window.NotificationSystem?.info('Недоступно'));
      }
    },
    {
      sel: '[data-src]',
      run: ({ el }) => {
        const src = el.dataset.src;
        if (!['yandex', 'github'].includes(src)) return;
        localStorage.setItem('sourcePref', src);
        window.TrackRegistry?.resetSourceCache?.();
        window.TrackRegistry?.ensurePopulated?.().catch(() => {});
        window.NotificationSystem?.success(`Приоритет: ${src}`);
        rP?.();
      }
    },
    {
      sel: '.rec-play-btn',
      run: ({ el }) => {
        window.ShowcaseManager?.playContext?.(el.dataset.playuid);
        window.NotificationSystem?.info('Запуск рекомендации');
      }
    },
    {
      sel: '#stats-reset-open-btn',
      run: async () => {
        if (!window.Modals?.confirm) return;
        window.Utils?.profileModals?.resetProfileData?.({
          onAction: async act => {
            if (act === 'stats') await db.tx('stats', 'readwrite', s => s.clear());
            else if (act === 'ach') {
              await db.setGlobal('unlocked_achievements', {});
              await db.setGlobal('user_profile_rpg', { xp: 0, level: 1 });
            } else if (act === 'all') {
              await db.tx('stats', 'readwrite', s => s.clear());
              await db.setGlobal('unlocked_achievements', {});
              await db.setGlobal('user_profile_rpg', { xp: 0, level: 1 });
              await db.setGlobal('global_streak', { current: 0, longest: 0 });
            }
            window.location.reload();
          }
        });
      }
    }
  ];

  c.addEventListener('click', async e => {
    const t = e.target;
    for (const h of handlers) {
      const el = t.closest(h.sel);
      if (!el) continue;
      await h.run({ el, event: e });
      break;
    }
  });
};

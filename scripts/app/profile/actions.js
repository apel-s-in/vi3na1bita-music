// UID.096_(Helper-first anti-duplication policy)_(actions.js должен быть router-слоем)_(reset/trash вынесены в отдельные modules)
// UID.094_(No-paralysis rule)_(profile actions не должны влиять на playback)_(клики профиля не стопают и не сбрасывают плеер)

import { createTrashActionHandlers } from './actions-trash.js';
import { createResetActionHandlers } from './actions-reset.js';
import { bindTabStripPhysics } from './tab-strip-physics.js';

export const bindProfileActions = ({ ctx, container: c, achView: aV, metaDB: db, tokens: tk, reloadProfile: rP }) => {
  if (!c || ctx._pB) return;
  ctx._pB = true;

  bindTabStripPhysics(c);

  const handlers = [
    { sel: '.profile-tab-btn', run: ({ el }) => { c.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active')); el.classList.add('active'); c.querySelector(`#tab-${el.dataset.tab}`)?.classList.add('active'); } },
    { sel: '.ach-classic-tab', run: ({ el }) => { const p = el.closest('.profile-tab-content'); if (!p) return; p.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active')); el.classList.add('active'); if (p.id === 'tab-achievements') aV.render(el.dataset.filter); else if (p.id === 'tab-settings') { p.querySelectorAll('.settings-content').forEach(x => x.classList.remove('active')); p.querySelector(`#set-${el.dataset.setTab}`)?.classList.add('active'); } bindTabStripPhysics(p); setTimeout(() => el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 30); } },
    { sel: '.ach-more, .ach-main', run: ({ el }) => { const d = el.closest('.ach-item')?.querySelector('.ach-details'), b = el.closest('.ach-item')?.querySelector('.ach-more'); if (!d) return; const open = d.style.display === 'none'; d.style.display = open ? 'block' : 'none'; if (b) b.textContent = open ? 'Свернуть' : 'Подробнее'; } },
    { sel: '[data-ach-timer]', run: ({ el }) => aV.toggleTimerMode(el.dataset.achTimer) },
    { sel: '.chart-title', run: ({ el }) => { const box = c.querySelector('#' + el.dataset.tg); if (!box) return; const vis = box.style.display !== 'none'; box.style.display = vis ? 'none' : ''; localStorage.setItem(el.dataset.ls, vis ? '0' : '1'); } },
    { sel: '.auth-btn', run: () => window.NotificationSystem?.info('Используйте кнопки Яндекс выше') },
    { sel: '[data-src]', run: ({ el }) => { const src = el.dataset.src; if (!['yandex', 'github'].includes(src)) return; localStorage.setItem('sourcePref', src); window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'deviceSettings' } })); window.TrackRegistry?.resetSourceCache?.(); window.TrackRegistry?.ensurePopulated?.().catch(()=>{}); window.NotificationSystem?.success(`Приоритет: ${src}`); rP?.(); } },
    { sel: '.rec-play-btn', run: ({ el }) => { window.ShowcaseManager?.playContext?.(el.dataset.playuid); window.NotificationSystem?.info('Запуск рекомендации'); } },
    ...createTrashActionHandlers({ reloadProfile: rP }),
    ...createResetActionHandlers({ metaDB: db, reloadProfile: rP })
  ];

  c.addEventListener('click', async e => {
    for (const h of handlers) {
      const el = e.target.closest(h.sel);
      if (el) { await h.run({ el, event: e }); break; }
    }
  });
};

export default { bindProfileActions };

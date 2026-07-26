// UID.096_(Helper-first anti-duplication policy)_(actions.js должен быть router-слоем)_(reset/trash вынесены в отдельные modules) UID.094_(No-paralysis rule)_(profile actions не должны влиять на playback)_(клики профиля не стопают и не сбрасывают плеер)

import { createTrashActionHandlers } from './actions-trash.js';
import { handleLoyaltyControl } from './loyalty-card.js';
import { bindTabStripPhysics } from './tab-strip-physics.js';

export const bindProfileActions = ({ ctx, container: c, achView: aV, reloadProfile: rP }) => {
  if (!c) return;
  ctx._profileAchievementsView = aV;
  if (ctx._pB) return;
  ctx._pB = true;
  bindTabStripPhysics(c);

  const handlers = [
    { sel: '.ach-classic-tab', run: ({ el }) => { const p = el.closest('.profile-tab-content'); if (!p) return; p.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active')); el.classList.add('active'); if (p.id === 'tab-achievements') ctx._profileAchievementsView?.render?.(el.dataset.filter); else if (p.id === 'tab-settings') { p.querySelectorAll('.settings-content').forEach(x => x.classList.remove('active')); p.querySelector(`#set-${el.dataset.setTab}`)?.classList.add('active'); } bindTabStripPhysics(p); setTimeout(() => el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 20); } },
    { sel: '.ach-more, .ach-main', run: ({ el }) => { const id = el.closest('.ach-item')?.dataset.ach; if (id) ctx._profileAchievementsView?.toggleDetails?.(id); } },
    { sel: '.chart-title', run: ({ el }) => { const box = c.querySelector('#' + el.dataset.tg); if (!box) return; const vis = box.style.display !== 'none'; box.style.display = vis ? 'none' : ''; localStorage.setItem(el.dataset.ls, vis ? '0' : '1'); } },
    { sel: '[data-src]', run: ({ el }) => { const src = el.dataset.src; if (!['yandex', 'github'].includes(src)) return; localStorage.setItem('sourcePref', src); window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'deviceSettings' } })); window.TrackRegistry?.resetSourceCache?.(); window.TrackRegistry?.ensurePopulated?.().catch(()=>{}); window.NotificationSystem?.success(`Приоритет: ${src}`); rP?.(); } },
    { sel: '.rec-play-btn', run: ({ el }) => { window.ShowcaseManager?.playContext?.(el.dataset.playuid); window.NotificationSystem?.info('Запуск рекомендации'); } },
    ...createTrashActionHandlers({ reloadProfile: rP })
  ];

  c.addEventListener('click', async e => { for (const h of handlers) { const el = e.target.closest(h.sel); if (el) { await h.run({ el, event: e }); break; } } });
  c.addEventListener('change', event => {
    handleLoyaltyControl(event.target)
      .then(handled => {
        if (!handled) return;

        setTimeout(() => {
          ctx._profileAchievementsView
            ?.render?.(ctx._achCurrentFilter || 'available');
        }, 80);
      })
      .catch(() => null);
  });
};

export default { bindProfileActions };

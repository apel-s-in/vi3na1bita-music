// UID.070_(Linked providers)_(сделать profile actions точкой управления связками аккаунтов)_(future link/unlink/set-primary flows будут входить здесь, но храниться в intel provider layer) UID.072_(Provider consents)_(здесь будут user-facing consent toggles)_(analytics/personalization/social/cloud/AI switches должны жить в profile actions UI) UID.073_(Hybrid sync orchestrator)_(profile actions станут control surface для primary/mirror sync roles)_(текущий cloud sync buttons — временный legacy bridge) UID.080_(Provider actions bridge)_(социальные/provider действия из профиля должны идти через единый bridge)_(не вызывать provider API напрямую из view) UID.083_(Yandex Metrica safe export)_(profile interactions можно маппить наружу только через mapper)_(не писать external telemetry напрямую из action handlers) UID.094_(No-paralysis rule)_(profile actions должны сохранять старое поведение при отсутствии intel layer)_(новые provider/consent controls strictly optional)
export const bindProfileActions = ({ ctx, container: c, achView: aV, metaDB: db, tokens: tk, reloadProfile: rP }) => {
  if (!c || ctx._pB) return;
  ctx._pB = true;

  c.addEventListener('wheel', e => {
    const tabs = e.target.closest?.('.ach-classic-tabs');
    if (!tabs || tabs.scrollWidth <= tabs.clientWidth) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY || e.deltaX;
  }, { passive: false });

  const handlers = [
    { sel: '.profile-tab-btn', run: ({ el }) => { c.querySelectorAll('.profile-tab-btn, .profile-tab-content').forEach(x => x.classList.remove('active')); el.classList.add('active'); c.querySelector(`#tab-${el.dataset.tab}`)?.classList.add('active'); } },
    { sel: '.ach-classic-tab', run: ({ el }) => { const p = el.closest('.profile-tab-content'); if (!p) return; p.querySelectorAll('.ach-classic-tab').forEach(x => x.classList.remove('active')); el.classList.add('active'); if (p.id === 'tab-achievements') aV.render(el.dataset.filter); else if (p.id === 'tab-settings') { p.querySelectorAll('.settings-content').forEach(x => x.classList.remove('active')); p.querySelector(`#set-${el.dataset.setTab}`)?.classList.add('active'); } } },
    { sel: '.ach-more, .ach-main', run: ({ el }) => { const d = el.closest('.ach-item')?.querySelector('.ach-details'), b = el.closest('.ach-item')?.querySelector('.ach-more'); if (!d) return; const open = d.style.display === 'none'; d.style.display = open ? 'block' : 'none'; if (b) b.textContent = open ? 'Свернуть' : 'Подробнее'; } },
    { sel: '[data-ach-timer]', run: ({ el }) => aV.toggleTimerMode(el.dataset.achTimer) },
    { sel: '.chart-title', run: ({ el }) => { const box = c.querySelector('#' + el.dataset.tg); if (!box) return; const vis = box.style.display !== 'none'; box.style.display = vis ? 'none' : ''; localStorage.setItem(el.dataset.ls, vis ? '0' : '1'); } },
    { sel: '.auth-btn', run: ({ el }) => { window.NotificationSystem?.info('Используйте кнопки Яндекс выше'); } },
    { sel: '[data-src]', run: ({ el }) => { const src = el.dataset.src; if (!['yandex', 'github'].includes(src)) return; localStorage.setItem('sourcePref', src); try { window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'deviceSettings' } })); } catch {} window.TrackRegistry?.resetSourceCache?.(); window.TrackRegistry?.ensurePopulated?.().catch(()=>{}); window.NotificationSystem?.success(`Приоритет: ${src}`); rP?.(); } },
    { sel: '.rec-play-btn', run: ({ el }) => { window.ShowcaseManager?.playContext?.(el.dataset.playuid); window.NotificationSystem?.info('Запуск рекомендации'); } },
    { sel: '[data-pl-restore]', run: async ({ el }) => {
      try {
        const id = String(el.dataset.plRestore || '').trim();
        const rows = JSON.parse(localStorage.getItem('sc3:playlists') || '[]') || [];
        const i = rows.findIndex(p => p?.id === id);
        if (i < 0) return;
        rows[i] = { ...rows[i], deletedAt: 0, updatedAt: Date.now() };
        localStorage.setItem('sc3:playlists', JSON.stringify(rows));
        try { window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'playlists' } })); } catch {}
        try { window.eventLogger?.log?.('PLAYLIST_CHANGED', null, { action: 'restore', playlistId: id, name: rows[i]?.name || '' }); } catch {}
        window.NotificationSystem?.success?.('Плейлист восстановлен ✅');
        rP?.();
      } catch (e) { window.NotificationSystem?.error?.('Ошибка: ' + String(e?.message || '')); }
    }},
    { sel: '[data-pl-purge]', run: async ({ el }) => {
      try {
        const id = String(el.dataset.plPurge || '').trim();
        const rows = JSON.parse(localStorage.getItem('sc3:playlists') || '[]') || [];
        const p = rows.find(x => x?.id === id);
        localStorage.setItem('sc3:playlists', JSON.stringify(rows.filter(x => x?.id !== id)));
        try { window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'playlists' } })); } catch {}
        try { window.eventLogger?.log?.('PLAYLIST_CHANGED', null, { action: 'purge', playlistId: id, name: p?.name || '' }); } catch {}
        window.NotificationSystem?.success?.('Плейлист удалён окончательно');
        rP?.();
      } catch (e) { window.NotificationSystem?.error?.('Ошибка: ' + String(e?.message || '')); }
    }},
    { sel: '[data-fav-restore]', run: async ({ el }) => {
      try {
        const uid = String(el.dataset.favRestore || '').trim();
        if (!uid) return;
        window.playerCore?.restoreInactive?.(uid);
        try { window.eventLogger?.log?.('FAVORITE_CHANGED', uid, { liked: true, source: 'favorites_trash_restore' }); } catch {}
        window.NotificationSystem?.success?.('Трек возвращён в избранное ✅');
        rP?.();
      } catch (e) { window.NotificationSystem?.error?.('Ошибка: ' + String(e?.message || '')); }
    }},
    { sel: '[data-fav-purge]', run: async ({ el }) => {
      try {
        const uid = String(el.dataset.favPurge || '').trim();
        if (!uid) return;
        window.FavoritesManager?.purge?.(uid);
        try { window.eventLogger?.log?.('FAVORITE_CHANGED', uid, { liked: false, source: 'favorites_trash_purge', purged: true }); } catch {}
        window.NotificationSystem?.success?.('След избранного удалён окончательно');
        rP?.();
      } catch (e) { window.NotificationSystem?.error?.('Ошибка: ' + String(e?.message || '')); }
    }},
    {
      sel: '#stats-reset-open-btn',
      run: async () => {
        if (!window.Modals?.confirm) return;
        window.Utils?.profileModals?.resetProfileData?.({
          onAction: async act => {
            try {
              if (act === 'stats') {
                await db.tx('stats', 'readwrite', s => s.clear());
                await db.clearEvents?.('events_hot').catch(() => {});
                await db.clearEvents?.('events_warm').catch(() => {});
                await db.setGlobal('global_streak', { current: 0, longest: 0, lastActiveDate: '' }).catch(() => {});
              } else if (act === 'ach') {
                await db.setGlobal('unlocked_achievements', {});
                await db.setGlobal('user_profile_rpg', { xp: 0, level: 1 });
              } else if (act === 'all') {
                await db.tx('stats', 'readwrite', s => s.clear());
                await db.clearEvents?.('events_hot').catch(() => {});
                await db.clearEvents?.('events_warm').catch(() => {});
                await db.setGlobal('unlocked_achievements', {});
                await db.setGlobal('user_profile_rpg', { xp: 0, level: 1 });
                await db.setGlobal('global_streak', { current: 0, longest: 0, lastActiveDate: '' });
                await db.setGlobal('listener_profile_summary', null).catch(() => {});
              }

              try {
                const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
                await runPostRestoreRefresh({ reason: `profile_reset:${act}`, keepCurrentAlbum: true });
              } catch {}

              window.NotificationSystem?.success(
                act === 'stats'
                  ? 'Статистика очищена ✅'
                  : act === 'ach'
                    ? 'Достижения сброшены ✅'
                    : 'Профиль статистики сброшен ✅'
              );

              rP?.();
            } catch (e) {
              window.NotificationSystem?.error('Ошибка: ' + String(e?.message || ''));
            }
          }
        });
      }
    }
  ];

  c.addEventListener('click', async e => {
    for (const h of handlers) { const el = e.target.closest(h.sel); if (el) { await h.run({ el, event: e }); break; } }
  });
};

export const runPostRestoreRefresh = async ({ reason = 'restore', keepCurrentAlbum = true } = {}) => {
  const W = window;
  try {
    const { metaDB } = await import('../../analytics/meta-db.js');
    const [u, r, p] = await Promise.all([
      metaDB.getGlobal('unlocked_achievements').catch(() => null),
      metaDB.getGlobal('user_profile_rpg').catch(() => null),
      metaDB.getGlobal('user_profile').catch(() => null)
    ]);

    if (W.achievementEngine) {
      W.achievementEngine.unlocked = u?.value || {};
      W.achievementEngine.profile = r?.value || { xp: 0, level: 1 };
      // Пересчитать достижения из свежих данных stats/events, чтобы UI-массив собрался корректно
      try { await W.achievementEngine.check?.(); } catch {}
      W.achievementEngine.achievements = W.achievementEngine._buildUIArray?.() || W.achievementEngine.achievements || [];
    }

    if (p?.value && typeof p.value === 'object') {
      try { localStorage.setItem('profile:last_snapshot', JSON.stringify(p.value)); } catch {}
    }

    // Перезагрузить FavoritesManager из обновлённого localStorage после restore
    // ВАЖНО: не триггерим onFavoritesChanged callbacks если плеер играет, чтобы не вызвать applyFavoritesOnlyFilter → unload звука
    try {
      if (W.FavoritesManager?._m) {
        const isPlaying = !!W.playerCore?.isPlaying?.();
        W.FavoritesManager._m.clear();
        const raw = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]');
        raw.forEach(i => i?.uid && W.FavoritesManager._m.set(String(i.uid).trim(), i));
        if (!isPlaying) {
          W.FavoritesManager._s?.forEach?.(cb => { try { cb({ uid: null, liked: null, restored: true }); } catch {} });
        }
      }
    } catch {}

    ['stats:updated', 'analytics:logUpdated', 'favorites:changed'].forEach(e => W.dispatchEvent(new CustomEvent(e)));
    W.dispatchEvent(new CustomEvent('achievements:updated', {
      detail: {
        total: W.achievementEngine?.achievements?.length || 0,
        unlocked: Object.keys(W.achievementEngine?.unlocked || {}).length,
        items: W.achievementEngine?.unlocked || {},
        streak: 0,
        profile: W.achievementEngine?.profile || { xp: 0, level: 1 },
        reason
      }
    }));
  } catch (e) {
    console.warn('[PostRestoreRefresh] failed:', e?.message);
  }

  try {
    const ts = Number(localStorage.getItem('yandex:last_backup_local_ts') || Date.now());
    const m = JSON.parse(localStorage.getItem('yandex:last_backup_meta') || 'null');
    localStorage.setItem('yandex:last_backup_check', JSON.stringify((m && typeof m === 'object') ? m : { timestamp: ts }));
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith('yandex:cloud:newer:prompt:')).forEach(k => sessionStorage.removeItem(k));
    } catch {}
    W.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
  } catch {}

  try {
    ['intel:listener-profile:rebuild-request', 'intel:recommendations:refresh-request', 'intel:collection:refresh-request', 'intel:runtime:refresh-request']
      .forEach(n => W.dispatchEvent(new CustomEvent(n, { detail: { reason, at: Date.now() } })));
  } catch {}

  try {
    const { listenerProfile } = await import('../../intel/listener/listener-profile.js');
    await listenerProfile?.build?.().catch(() => null);
  } catch {}

  try {
    const cA = keepCurrentAlbum ? (W.AlbumsManager?.getCurrentAlbum?.() || null) : null;
    const isPlaying = !!W.playerCore?.isPlaying?.();
    const currentPlayingAlbum = W.AlbumsManager?.getPlayingAlbum?.();

    if (cA === (W.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__')) {
      const mod = await import('./view.js');
      const softOk = await mod.refreshProfileViewSoft?.(W.AlbumsManager).catch(() => false);
      if (!softOk && !isPlaying) await mod.loadProfileView?.(W.AlbumsManager);
      else {
        W.PlayerUI?.updatePlaylistFiltering?.();
        W.PlayerUI?.updateMiniHeader?.();
      }
    } else if (cA && !isPlaying) {
      // Перезагружаем альбом ТОЛЬКО если плеер не играет — иначе сломается звук
      await W.AlbumsManager?.loadAlbum?.(cA);
    } else if (cA && isPlaying && cA !== currentPlayingAlbum) {
      // Плеер играет, а пользователь смотрит другой альбом — безопасно перерендерить
      await W.AlbumsManager?.loadAlbum?.(cA);
    } else {
      // Плеер играет и смотрит на играющий альбом — только обновим UI без перезагрузки
      W.PlayerUI?.updatePlaylistFiltering?.();
      W.PlayerUI?.updateMiniHeader?.();
    }
  } catch {
    W.PlayerUI?.updatePlaylistFiltering?.();
    W.PlayerUI?.updateMiniHeader?.();
  }

  try {
    ['backup:restore:applied', 'profile:data:refreshed'].forEach(e =>
      W.dispatchEvent(new CustomEvent(e, { detail: { reason, at: Date.now() } }))
    );
  } catch {}

  return true;
};

export default { runPostRestoreRefresh };

export async function runPostRestoreRefresh({ reason = 'restore', keepCurrentAlbum = true } = {}) {
  try {
    window.dispatchEvent(new CustomEvent('stats:updated'));
    window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    window.dispatchEvent(new CustomEvent('achievements:updated', {
      detail: {
        total: window.achievementEngine?.achievements?.length || 0,
        unlocked: Object.keys(window.achievementEngine?.unlocked || {}).length,
        items: window.achievementEngine?.unlocked || {},
        streak: 0,
        profile: window.achievementEngine?.profile || { xp: 0, level: 1 }
      }
    }));
  } catch {}

  try {
    const ts = Number(localStorage.getItem('yandex:last_backup_local_ts') || Date.now());
    const meta = JSON.parse(localStorage.getItem('yandex:last_backup_meta') || 'null');
    if (meta && typeof meta === 'object') {
      localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
    } else {
      localStorage.setItem('yandex:last_backup_check', JSON.stringify({ timestamp: ts }));
    }
    window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
  } catch {}

  try {
    const intelEvents = [
      'intel:listener-profile:rebuild-request',
      'intel:recommendations:refresh-request',
      'intel:collection:refresh-request',
      'intel:runtime:refresh-request'
    ];
    intelEvents.forEach(name => window.dispatchEvent(new CustomEvent(name, {
      detail: { reason, at: Date.now() }
    })));
  } catch {}

  try {
    const { listenerProfile } = await import('../../intel/listener/listener-profile.js');
    await listenerProfile?.build?.().catch(() => null);
  } catch {}

  try {
    const currentAlbum = keepCurrentAlbum ? (window.AlbumsManager?.getCurrentAlbum?.() || null) : null;
    if (currentAlbum === (window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__')) {
      const mod = await import('./view.js');
      await mod.loadProfileView?.(window.AlbumsManager);
    } else if (currentAlbum) {
      await window.AlbumsManager?.loadAlbum?.(currentAlbum);
    } else {
      window.PlayerUI?.updatePlaylistFiltering?.();
      window.PlayerUI?.updateMiniHeader?.();
    }
  } catch (e) {
    console.debug('[YandexRuntimeRefresh] soft refresh fallback:', e?.message);
    window.PlayerUI?.updatePlaylistFiltering?.();
    window.PlayerUI?.updateMiniHeader?.();
  }

  try {
    window.dispatchEvent(new CustomEvent('backup:restore:applied', {
      detail: { reason, at: Date.now() }
    }));
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('profile:data:refreshed', {
      detail: { reason, at: Date.now() }
    }));
  } catch {}

  return true;
}

export default { runPostRestoreRefresh };

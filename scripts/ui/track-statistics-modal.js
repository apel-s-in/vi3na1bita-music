import { metaDB } from '../analytics/meta-db.js';

const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

export async function openTrackStatisticsModal(uid) {
  const safeUid = String(uid || window.playerCore?.getCurrentTrackUid?.() || '').trim();
  if (!safeUid) return false;

  const t = window.TrackRegistry?.getTrackByUid(safeUid);
  const stat = await metaDB.getStat(safeUid);
  const plays = stat?.globalFullListenCount || 0;
  const totalStarts = stat?.globalValidListenCount || 0;
  const skips = Math.max(0, totalStarts - plays);
  const time = Math.floor((stat?.globalListenSeconds || 0) / 60);
  const lyricsUsed = stat?.featuresUsed?.lyrics || 0;
  const { trackProfiles } = await import('../intel/track/track-profiles.js');
  await trackProfiles.ensureIndex().catch(() => null);
  const profilePreview = trackProfiles.getPreview(safeUid);
  const hasProfile = !!profilePreview;

  const m = window.Modals?.open?.({
    title: 'Статистика трека',
    maxWidth: 340,
    bodyHtml: `<div class="sm-center sm-mb20"><div class="sm-cover"><img src="${esc(t?.cover || 'img/logo.png')}"></div><h3 class="sm-title">${esc(t?.title || 'Без названия')}</h3><div class="sm-sub">${esc(t?.album || '')}</div></div><div class="stats-grid-compact sm-mb20"><div class="stat-box"><b>${plays}</b><span>Дослушано</span></div><div class="stat-box"><b>${skips}</b><span>Пропущено</span></div><div class="stat-box"><b>${time}м</b><span>Время</span></div><div class="stat-box"><b>${lyricsUsed}</b><span>Текст (раз)</span></div></div>${hasProfile ? '<button class="om-btn om-btn--outline sm-fullw sm-mb20" id="open-track-profile">🧠 Паспорт трека</button>' : ''}<button class="om-btn om-btn--primary sm-fullw" id="share-track-stat">📸 Создать карточку трека</button>`
  });

  m?.querySelector('#open-track-profile')?.addEventListener('click', async () => {
    const { trackProfileModal } = await import('../intel/ui/track-profile-modal.js');
    m.remove();
    await trackProfileModal.open(safeUid);
  });

  m?.querySelector('#share-track-stat')?.addEventListener('click', () =>
    import('../analytics/share-generator.js').then(mod => {
      m.remove();
      mod.ShareGenerator.generateAndShare('track', t, stat);
    })
  );

  return true;
}

export default { openTrackStatisticsModal };

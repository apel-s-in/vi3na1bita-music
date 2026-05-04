// UID.038_(Track profile modal)_(track statistics вынесены из общей statistics-modal)_(statistics-modal остаётся profile renderer)
// UID.094_(No-paralysis rule)_(track modal только читает stats)_(не влияет на playback)

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

  const m = window.Modals?.open?.({
    title: 'Статистика трека',
    maxWidth: 340,
    bodyHtml: `<div class="sm-center sm-mb20"><div class="sm-cover"><img src="${esc(t?.cover || 'img/logo.png')}"></div><h3 class="sm-title">${esc(t?.title || 'Без названия')}</h3><div class="sm-sub">${esc(t?.album || '')}</div></div><div class="stats-grid-compact sm-mb20"><div class="stat-box"><b>${plays}</b><span>Дослушано</span></div><div class="stat-box"><b>${skips}</b><span>Пропущено</span></div><div class="stat-box"><b>${time}м</b><span>Время</span></div><div class="stat-box"><b>${lyricsUsed}</b><span>Текст (раз)</span></div></div><button class="om-btn om-btn--primary sm-fullw" id="share-track-stat">📸 Создать карточку трека</button>`
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

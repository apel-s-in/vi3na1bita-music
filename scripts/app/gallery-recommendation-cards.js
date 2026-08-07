// Общие рекомендательные квадраты для галереи обычных альбомов.
// Модуль только вычисляет и отображает данные: playback изменяет GalleryManager
// исключительно после явного пользовательского нажатия.
import { metaDB } from '../analytics/meta-db.js';
import { getConfirmedListeningStats } from '../analytics/confirmed-listening-stats.js';
import { listenerProfile } from '../intel/listener/listener-profile.js';
import { trackProfiles } from '../intel/track/track-profiles.js';
import { trackSimilarity } from '../intel/track/track-similarity.js';
import { getIntelFlags } from '../intel/flags.js';
import { recommendationMemory } from '../analytics/backup-domain-state.js';

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const esc = value => window.Utils?.escapeHtml?.(safe(value)) || safe(value);
const DAY_MS = 24 * 60 * 60 * 1000;
const FORGOTTEN_AFTER_MS = 21 * DAY_MS;

const hash32 = value => {
  const text = safe(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const weightedMap = raw => raw && typeof raw === 'object' && !Array.isArray(raw)
  ? Object.fromEntries(Object.entries(raw).map(([key, value]) => [safe(key), num(value)]).filter(([key, value]) => key && value > 0))
  : {};

const section = (preview, key) => weightedMap(preview?.finalProfile?.[key] || preview?.[key] || {});
const track = uid => window.TrackRegistry?.getTrackByUid?.(uid) || null;
const albumTitle = key => window.TrackRegistry?.getAlbumTitle?.(key) || window.albumsIndex?.find(album => album.key === key)?.title || key;
const trackCover = uid => {
  const row = track(uid);
  return window.AlbumsManager?.covers?.get?.(row?.sourceAlbum)
    || window.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(item => item.key === row?.sourceAlbum)?.icon
    || 'img/logo.png';
};

const canonicalStats = localRows => {
  const local = new Map((localRows || []).filter(row => row?.uid && row.uid !== 'global').map(row => [safe(row.uid), row]));
  const serverSnapshot = getConfirmedListeningStats();
  const serverAvailable = serverSnapshot.available === true;
  const server = new Map((serverSnapshot.tracks || []).map(row => [safe(row.uid), {
    uid: safe(row.uid),
    globalListenSeconds: num(row.listenMs) / 1000,
    globalValidListenCount: num(row.validPlays),
    globalFullListenCount: num(row.fullPlays)
  }]));
  return {
    authority: serverAvailable ? 'server_confirmed' : 'local_rebuildable',
    serverAvailable,
    local,
    canonical: serverAvailable ? server : local,
    row(uid) {
      return (serverAvailable ? server.get(uid) : local.get(uid)) || {};
    }
  };
};

const previewItems = index => Object.entries(index?.items || {})
  .map(([uid, preview]) => ({ uid, preview }))
  .filter(item => track(item.uid));

const sortCandidates = (items, score) => items
  .map(item => ({ ...item, score: num(score(item)) }))
  .filter(item => item.score > 0)
  .sort((left, right) => right.score - left.score || left.uid.localeCompare(right.uid));

const cardItems = (items, limit = 3) => items.slice(0, limit).map(item => {
  const row = track(item.uid);
  return {
    uid: item.uid,
    title: row?.title || item.preview?.title || item.uid,
    albumKey: row?.sourceAlbum || item.preview?.album || '',
    albumTitle: albumTitle(row?.sourceAlbum || item.preview?.album || ''),
    cover: trackCover(item.uid),
    score: num(item.score)
  };
});

const makeCard = ({ id, title, icon, subtitle, reasonCode, items = [], album = null, emptyText = 'Недостаточно данных для этой подборки' }) => ({
  type: 'recommendation',
  id,
  title,
  icon,
  subtitle,
  reasonCode,
  items,
  album,
  emptyText
});

const dominantMood = listener => safe(listener?.preferences?.moods?.[0]?.key);
const axisDistance = (axes, centroid) => {
  const keys = new Set([...Object.keys(axes), ...Object.keys(centroid)]);
  if (!keys.size) return 0;
  return Math.sqrt([...keys].reduce((sum, key) => sum + Math.pow(num(axes[key]) - num(centroid[key]), 2), 0) / keys.size);
};

const albumOfWeek = source => {
  const albums = (window.albumsIndex || []).filter(album => album?.key && !album.key.startsWith('__'));
  if (!albums.length) return null;

  const scores = albums.map(album => ({
    ...album,
    seconds: (window.TrackRegistry?.getTracksForAlbum?.(album.key) || []).reduce((sum, row) => sum + num(source.row(row.uid).globalListenSeconds), 0)
  }));
  const active = scores.filter(item => item.seconds > 0).sort((left, right) => right.seconds - left.seconds || left.key.localeCompare(right.key));
  const week = Math.floor(Date.now() / (7 * DAY_MS));
  const pool = active.length ? active.slice(0, Math.min(3, active.length)) : scores;
  const selected = pool[hash32(`album-week:${week}`) % pool.length];

  return {
    key: selected.key,
    title: selected.title,
    cover: window.AlbumsManager?.covers?.get?.(selected.key)
      || window.APP_CONFIG?.ICON_ALBUMS_ORDER?.find(item => item.key === selected.key)?.icon
      || 'img/logo.png',
    subtitle: active.length ? 'Один из ваших самых активных альбомов' : 'Еженедельная ротация каталога'
  };
};

export const buildGalleryRecommendationCards = async () => {
  const flags = getIntelFlags();
  if (!flags.recommendationsEnabled || window.APP_CONFIG?.INTEL_GALLERY_CARDS_ENABLED === false) return [];

  await window.TrackRegistry?.ensurePopulated?.();
  const [index, localRows, listener] = await Promise.all([
    trackProfiles.ensureIndex().catch(() => ({ items: {}, testData: false })),
    metaDB.getAllStats().catch(() => []),
    listenerProfile.get().catch(() => null)
  ]);

  const source = canonicalStats(localRows);
  const previews = previewItems(index);
  const currentUid = safe(window.playerCore?.getCurrentTrackUid?.());

  const forgotten = [...source.local.entries()]
    .map(([uid, row]) => ({ uid, preview: index?.items?.[uid] || null, row }))
    .filter(item => num(item.row.globalListenSeconds) > 0 && num(item.row.lastPlayedAt) > 0 && Date.now() - num(item.row.lastPlayedAt) >= FORGOTTEN_AFTER_MS)
    .sort((left, right) => num(right.row.globalListenSeconds) - num(left.row.globalListenSeconds) || num(left.row.lastPlayedAt) - num(right.row.lastPlayedAt));

  const evening = sortCandidates(previews, item => {
    const time = section(item.preview, 'time_of_day');
    const moods = section(item.preview, 'moods');
    const axes = section(item.preview, 'axes');
    return num(time.evening) * 10 + num(moods.calm) * 3 + num(moods.dreamy) * 3 + num(moods.romantic) * 2 + (1 - num(axes.tension)) * 0.4;
  });

  const walking = sortCandidates(previews, item => {
    const useCases = section(item.preview, 'use_cases');
    const axes = section(item.preview, 'axes');
    return num(useCases.walking) * 10 + num(axes.energy) * 1.5 + num(axes.valence);
  });

  const mood = dominantMood(listener);
  const favoriteMood = mood ? sortCandidates(previews, item => num(section(item.preview, 'moods')[mood]) * 10) : [];

  const unfinished = [...source.local.entries()]
    .map(([uid, row]) => ({ uid, preview: index?.items?.[uid] || null, row }))
    .filter(item => {
      const attempts = num(item.row.analysisEligibleSessions) + num(item.row.earlySkips) + num(item.row.partialEnds);
      return attempts > 0 && num(item.row.globalFullListenCount) === 0 && num(item.row.averageCompletionRate) < 0.95;
    })
    .sort((left, right) => num(right.row.averageCompletionRate) - num(left.row.averageCompletionRate) || num(right.row.globalListenSeconds) - num(left.row.globalListenSeconds));

  const axesRows = previews.map(item => ({ ...item, axes: section(item.preview, 'axes') })).filter(item => Object.keys(item.axes).length);
  const axisKeys = [...new Set(axesRows.flatMap(item => Object.keys(item.axes)))];
  const centroid = Object.fromEntries(axisKeys.map(key => [key, axesRows.reduce((sum, item) => sum + num(item.axes[key]), 0) / Math.max(1, axesRows.length)]));
  const unusual = axesRows
    .map(item => ({ ...item, score: axisDistance(item.axes, centroid) }))
    .sort((left, right) => right.score - left.score || left.uid.localeCompare(right.uid));

  const similar = currentUid
    ? await trackSimilarity.getSimilar(currentUid, { limit: 3, index }).catch(() => [])
    : [];

  const weeklyAlbum = albumOfWeek(source);

  return [
    makeCard({
      id: 'forgotten-hits',
      title: 'Забытые хиты',
      icon: '🕰️',
      subtitle: 'Треки, к которым вы давно не возвращались',
      reasonCode: 'rediscovery',
      items: cardItems(forgotten),
      emptyText: 'Забытые хиты появятся после накопления истории прослушиваний'
    }),
    makeCard({
      id: 'evening',
      title: 'Для вечера',
      icon: '🌆',
      subtitle: 'Спокойный подбор по смысловым признакам',
      reasonCode: 'evening_fit',
      items: cardItems(evening),
      emptyText: 'Вечерняя подборка появится после заполнения TrackProfile'
    }),
    makeCard({
      id: 'walking',
      title: 'Для прогулки',
      icon: '🚶',
      subtitle: 'Ритм и настроение для движения',
      reasonCode: 'walking_fit',
      items: cardItems(walking),
      emptyText: 'Подборка для прогулки пока не сформирована'
    }),
    makeCard({
      id: 'favorite-mood',
      title: 'Любимое настроение',
      icon: '💙',
      subtitle: mood ? `Ваш ведущий mood: ${mood}` : 'Определяется по фактическому времени прослушивания',
      reasonCode: 'mood_fit',
      items: cardItems(favoriteMood),
      emptyText: 'Любимое настроение появится после накопления статистики'
    }),
    makeCard({
      id: 'unfinished',
      title: 'Не дослушано',
      icon: '◔',
      subtitle: 'Треки с реальными незавершёнными сессиями',
      reasonCode: 'unfinished',
      items: cardItems(unfinished),
      emptyText: 'Сейчас нет честно определённых незавершённых треков'
    }),
    makeCard({
      id: 'unusual',
      title: 'Самый необычный трек',
      icon: '✦',
      subtitle: 'Наибольшее отличие от центра доступных TrackProfile',
      reasonCode: 'unusual_semantic',
      items: cardItems(unusual, 1),
      emptyText: 'Необычный трек появится после заполнения смысловых профилей'
    }),
    makeCard({
      id: 'similar-current',
      title: 'Похожее на текущий трек',
      icon: '≈',
      subtitle: currentUid ? `Основа: ${track(currentUid)?.title || currentUid}` : 'Сначала включите любой трек',
      reasonCode: 'current_track_similarity',
      items: cardItems(similar),
      emptyText: currentUid ? 'Для текущего трека ещё нет проверенных связей' : 'Включите трек, чтобы увидеть похожие'
    }),
    makeCard({
      id: 'album-week',
      title: 'Альбом недели',
      icon: '💿',
      subtitle: weeklyAlbum?.subtitle || 'Еженедельная подборка',
      reasonCode: 'album_week',
      album: weeklyAlbum,
      emptyText: 'Альбом недели пока недоступен'
    })
  ];
};

const recommendationContext = card => `gallery:${safe(card?.id || 'generic')}`;

export const recordGalleryRecommendationShown = card => {
  if (!card?.items?.length) return Promise.resolve([]);
  return Promise.allSettled(card.items.map(item => recommendationMemory.shown({
    uid: item.uid,
    context: recommendationContext(card),
    reasonCode: card.reasonCode
  })));
};

export const recordGalleryRecommendationClicked = (card, uid) => {
  const cleanUid = safe(uid);
  if (!cleanUid || !card) return Promise.resolve(null);
  return recommendationMemory.clicked({
    uid: cleanUid,
    context: recommendationContext(card),
    reasonCode: card.reasonCode
  });
};

const renderTrackRows = card => card.items.map((item, index) => `
  <button type="button" class="gallery-rec-row" data-gallery-open="${esc(item.uid)}">
    <span>${index + 1}</span>
    <span><b>${esc(item.title)}</b><small>${esc(item.albumTitle)}</small></span>
  </button>
`).join('');

export const renderGalleryRecommendationCard = card => {
  const primary = card.items?.[0] || null;
  const album = card.album || null;
  const cover = primary?.cover || album?.cover || 'img/logo.png';
  const mainTitle = primary?.title || album?.title || '';
  const mainMeta = primary?.albumTitle || (album ? 'Открыть альбом' : '');

  return `<article class="gallery-rec-card" data-gallery-card="${esc(card.id)}" aria-label="${esc(card.title)}">
    <div class="gallery-rec-card__head"><span>${esc(card.icon)}</span><b>${esc(card.title)}</b></div>
    <div class="gallery-rec-card__subtitle">${esc(card.subtitle)}</div>
    ${primary || album ? `
      <div class="gallery-rec-card__hero">
        <img src="${esc(cover)}" alt="" draggable="false">
        <div><strong>${esc(mainTitle)}</strong><small>${esc(mainMeta)}</small></div>
      </div>
      ${card.items.length > 1 ? `<div class="gallery-rec-card__list">${renderTrackRows(card)}</div>` : ''}
      <div class="gallery-rec-card__actions">
        ${primary ? `<button type="button" data-gallery-play="${esc(primary.uid)}">▶ Воспроизвести</button><button type="button" data-gallery-open="${esc(primary.uid)}">Открыть трек</button>` : ''}
        ${album ? `<button type="button" data-gallery-album="${esc(album.key)}">Открыть альбом</button>` : ''}
      </div>
    ` : `<div class="gallery-rec-card__empty">${esc(card.emptyText)}</div>`}
    <div class="gallery-rec-card__foot">Локальный расчёт · без нового серверного запроса</div>
  </article>`;
};

export default { buildGalleryRecommendationCards, renderGalleryRecommendationCard, recordGalleryRecommendationShown, recordGalleryRecommendationClicked };

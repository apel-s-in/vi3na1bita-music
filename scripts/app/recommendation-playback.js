// Канонические пользовательские действия для рекомендаций.
// Не создаёт playlist и не обходит Favorites Only: запуск выполняет обычная строка альбома.
const safe = value => String(value == null ? '' : value).trim();

const waitForTrackRow = async (uid, attempts = 30) => {
  const selector = `.track[data-uid="${CSS.escape(uid)}"]`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const row = document.querySelector(selector);
    if (row) return row;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
};

export const openRecommendedTrack = async uid => {
  const cleanUid = safe(uid);
  const track = window.TrackRegistry?.getTrackByUid?.(cleanUid);
  if (!cleanUid || !track?.sourceAlbum) return false;

  await window.AlbumsManager?.loadAlbum?.(track.sourceAlbum);
  const row = await waitForTrackRow(cleanUid);
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !!row;
};

export const playRecommendedTrack = async uid => {
  const cleanUid = safe(uid);
  if (!cleanUid) return false;

  if (window.playerCore?.getCurrentTrackUid?.() === cleanUid) {
    window.PlayerUI?.togglePlayPause?.();
    return true;
  }

  const track = window.TrackRegistry?.getTrackByUid?.(cleanUid);
  if (!track?.sourceAlbum) return false;

  await window.AlbumsManager?.loadAlbum?.(track.sourceAlbum);
  const row = await waitForTrackRow(cleanUid);
  if (!row) return false;

  row.click();
  return true;
};

export default { openRecommendedTrack, playRecommendedTrack };

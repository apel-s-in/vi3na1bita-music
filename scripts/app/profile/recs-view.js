// UID.054_(Recommendation engine core)_(profile view остаётся thin renderer)_(до готовности engine используется стабильный дневной fallback)
// UID.094_(No-paralysis rule)_(fallback не управляет playback)_(только отображает кандидатов)

const esc = value =>
  window.Utils?.escapeHtml?.(String(value || '')) ||
  String(value || '');

const dailyKey = () =>
  new Date().toISOString().slice(0, 10);

const stableScore = (uid, seed) => {
  const text = `${seed}:${String(uid || '')}`;
  let hash = 2166136261;

  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const renderProfileRecs = ({ container, all }) => {
  const root = container?.querySelector('#prof-recs-list');
  if (!root) return;

  const played = new Set(
    (all || [])
      .filter(stat =>
        Number(stat?.globalFullListenCount || 0) > 0
      )
      .map(stat => String(stat.uid || ''))
  );

  const seed = dailyKey();
  const recommendations = (
    window.TrackRegistry?.getAllUids?.() || []
  )
    .filter(uid => !played.has(uid))
    .map(uid => ({
      uid,
      score: stableScore(uid, seed)
    }))
    .sort((left, right) =>
      left.score - right.score ||
      left.uid.localeCompare(right.uid)
    )
    .slice(0, 4)
    .map(item => item.uid);

  root.innerHTML = recommendations.length
    ? recommendations.map(uid => {
        const track =
          window.TrackRegistry?.getTrackByUid?.(uid);

        return `<div class="profile-list-item" data-uid="${esc(uid)}"><div class="log-info"><div class="log-title">${esc(track?.title)}</div><div class="log-desc">${esc(track?.album)}</div></div><button class="rec-play-btn" data-playuid="${esc(uid)}">▶</button></div>`;
      }).join('')
    : '<div class="fav-empty">Вы прослушали абсолютно всё! 🏆</div>';
};

// Детерминированный fallback рекомендаций с persistent recommendation memory.
// Модуль только показывает предложения и не управляет playback.
import { recommendationMemory } from '../../analytics/backup-domain-state.js';

const CONTEXT = 'profile_daily';
const esc = value => window.Utils?.escapeHtml?.(String(value || '')) || String(value || '');
const dailyKey = () => new Date().toISOString().slice(0, 10);

const stableScore = (uid, seed) => {
  const text = `${seed}:${String(uid || '')}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const renderProfileRecs = async ({ container, all }) => {
  const root = container?.querySelector('#prof-recs-list');
  if (!root) return;

  await recommendationMemory.init();
  const played = new Set((all || []).filter(stat => Number(stat?.globalFullListenCount || 0) > 0).map(stat => String(stat.uid || '')));
  const seed = dailyKey();
  const candidates = (window.TrackRegistry?.getAllUids?.() || [])
    .filter(uid => !played.has(uid))
    .map(uid => ({ uid, score: stableScore(uid, seed) }))
    .sort((left, right) => left.score - right.score || left.uid.localeCompare(right.uid));

  const recommendations = [];
  for (const candidate of candidates) {
    if (recommendations.length >= 4) break;
    if (await recommendationMemory.canShow(candidate.uid, CONTEXT)) recommendations.push(candidate.uid);
  }

  root.innerHTML = recommendations.length
    ? recommendations.map(uid => {
        const track = window.TrackRegistry?.getTrackByUid?.(uid);
        return `<div class="profile-list-item" data-uid="${esc(uid)}"><div class="log-info"><div class="log-title">${esc(track?.title || uid)}</div><div class="log-desc">${esc(track?.album || '')} · ещё не прослушано полностью</div></div><button class="rec-play-btn" data-playuid="${esc(uid)}" data-rec-context="${CONTEXT}" data-rec-reason="daily_unplayed">▶</button><button class="rec-dismiss-btn" type="button" data-rec-dismiss="${esc(uid)}" aria-label="Скрыть рекомендацию">×</button></div>`;
      }).join('')
    : '<div class="fav-empty">Новых рекомендаций сейчас нет</div>';

  recommendations.forEach(uid => recommendationMemory.shown({ uid, context: CONTEXT, reasonCode: 'daily_unplayed' }).catch(() => null));

  if (!root._recommendationMemoryBound) {
    root._recommendationMemoryBound = true;
    root.addEventListener('click', event => {
      const play = event.target.closest('[data-playuid]');
      if (play) {
        recommendationMemory.clicked({ uid: play.dataset.playuid, context: play.dataset.recContext || CONTEXT, reasonCode: play.dataset.recReason || 'daily_unplayed' }).catch(() => null);
        return;
      }
      const dismiss = event.target.closest('[data-rec-dismiss]');
      if (!dismiss) return;
      event.preventDefault();
      event.stopPropagation();
      recommendationMemory.dismissed({ uid: dismiss.dataset.recDismiss, context: CONTEXT, reasonCode: 'user_dismissed' }).then(() => dismiss.closest('.profile-list-item')?.remove()).catch(() => null);
    });
  }
};

export default { renderProfileRecs };

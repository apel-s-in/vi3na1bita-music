// Тонкий renderer опционального Recommendation Engine.
// Playback возможен только после явного клика по существующей кнопке.
const CONTEXT = 'profile_daily';
const esc = value => window.Utils?.escapeHtml?.(String(value || '')) || String(value || '');

export const renderProfileRecs = async ({ container } = {}) => {
  const root = container?.querySelector('#prof-recs-list');
  if (!root) return;

  const { getIntelFlags } = await import('../../intel/flags.js');
  const flags = getIntelFlags();
  if (!flags.recommendationsEnabled) {
    root.innerHTML = '<div class="fav-empty">Рекомендации отключены. Остальные функции приложения работают как обычно.</div>';
    return;
  }

  try {
    const [{ recommendationMemory }, { recommendationEngine }] = await Promise.all([
      import('../../analytics/backup-domain-state.js'),
      import('../../intel/recs/recommendation-engine.js')
    ]);
    const result = await recommendationEngine.recommend({ limit: 4, context: CONTEXT });

    const sourceNote = result.mode === 'account_server_pending'
      ? '<div class="stat-card"><div class="stat-sub">Подтверждённая статистика загружается. Пока используется локальная semantic-модель.</div></div>'
      : result.mode === 'local_compatible'
        ? '<div class="stat-card"><div class="stat-sub">Локальная semantic-модель. После входа серверная статистика сможет уточнить результат.</div></div>'
        : '';
    root.innerHTML = `${sourceNote}${result.testData ? '<div class="stat-card"><div class="stat-sub">Тестовый режим: смысловые профили пока демонстрационные.</div></div>' : ''}${
      result.items.length
        ? result.items.map(item => {
            const track = window.TrackRegistry?.getTrackByUid?.(item.uid);
            return `<div class="profile-list-item" data-uid="${esc(item.uid)}"><div class="log-info"><div class="log-title">${esc(track?.title || item.uid)}${item.testProfile ? ' · TEST' : ''}</div><div class="log-desc">${esc(item.reasonText)}</div></div><button class="rec-play-btn" data-playuid="${esc(item.uid)}" data-rec-context="${CONTEXT}" data-rec-reason="${esc(item.reasonCode)}">▶</button><button class="rec-dismiss-btn" type="button" data-rec-dismiss="${esc(item.uid)}" aria-label="Скрыть рекомендацию">×</button></div>`;
          }).join('')
        : '<div class="fav-empty">Новых рекомендаций сейчас нет</div>'
    }`;

    result.items.forEach(item => {
      recommendationMemory.shown({ uid: item.uid, context: CONTEXT, reasonCode: item.reasonCode }).catch(() => null);
    });

    if (root._recommendationMemoryBound) return;
    root._recommendationMemoryBound = true;
    root.addEventListener('click', event => {
      const play = event.target.closest('[data-playuid]');
      if (play) {
        recommendationMemory.clicked({
          uid: play.dataset.playuid,
          context: play.dataset.recContext || CONTEXT,
          reasonCode: play.dataset.recReason || 'discovery_unplayed'
        }).catch(() => null);
        return;
      }

      const dismiss = event.target.closest('[data-rec-dismiss]');
      if (!dismiss) return;
      event.preventDefault();
      event.stopPropagation();
      recommendationMemory.dismissed({
        uid: dismiss.dataset.recDismiss,
        context: CONTEXT,
        reasonCode: 'user_dismissed'
      }).then(() => dismiss.closest('.profile-list-item')?.remove()).catch(() => null);
    });
  } catch {
    root.innerHTML = '<div class="fav-empty">Рекомендации временно недоступны. Музыка и статистика продолжают работать.</div>';
  }
};

export default { renderProfileRecs };

// UID.056_(Recommendation reasons)_(объяснять почему показан трек)_(держать reason-code -> human text отдельно от scorer logic)
// UID.085_(AI explanation layer)_(в будущем легко строить богатые объяснения)_(сначала ввести детерминированный словарь причин)

const REASON_TEXTS_RU = Object.freeze({
  taste_fit: 'подходит под ваш вкус',
  audio_similarity: 'похож по звучанию',
  lyric_theme_similarity: 'близок по смыслу и теме',
  mood_fit: 'совпадает по настроению',
  use_case_fit: 'подходит под ситуацию',
  event_season_fit: 'подходит по сезону или событию',
  session_next: 'хорошо продолжает текущую сессию',
  community_fit: 'нравится похожим слушателям',
  collection_fit: 'закрывает коллекционный прогресс',
  rediscovery: 'давно не слушали, но раньше любили'
});

export function getRecommendationReasonText(code) {
  return REASON_TEXTS_RU[code] || 'подходит по вашему профилю';
}

export default { getRecommendationReasonText };

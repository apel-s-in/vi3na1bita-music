// Детерминированные объяснения Recommendation Engine.
const REASON_TEXTS_RU = Object.freeze({
  taste_fit: 'похож на то, что вы слушаете чаще',
  lyric_theme_similarity: 'близок по смыслу и теме',
  mood_fit: 'совпадает по настроению',
  use_case_fit: 'подходит под выбранную ситуацию',
  session_next: 'может продолжить текущую сессию',
  taste_discovery: 'может ненавязчиво расширить привычное звучание',
  semantic_preview: 'подходит по доступному смысловому профилю',
  discovery_unplayed: 'вы ещё не дослушивали этот трек полностью',
  rediscovery: 'вы давно не возвращались к этому треку'
});

export function getRecommendationReasonText(code) {
  return REASON_TEXTS_RU[code] || 'может подойти по вашему профилю';
}

export default { getRecommendationReasonText };

// UID.054_(Recommendation engine core)_(не держать подбор в UI)_(выносить логику scorer-ов в отдельный слой)
// UID.055_(Recommendation strategies)_(легко добавлять новые типы рекомендаций)_(каждая стратегия должна быть маленькой независимой функцией)
// UID.057_(Audio similarity strategy)_(подбирать по звучанию)_(держать отдельный scorer для audio profile)
// UID.058_(Lyric and theme strategy)_(подбирать по смыслу)_(держать отдельный scorer для lyrics/themes/scenes/entities)
// UID.059_(Mood/use-case/event/season strategy)_(подбирать по контексту жизни)_(держать отдельные scorer hooks для mood/use-case/event/season)

function zero(code) {
  return { score: 0, reasonCode: code };
}

export const recommendationStrategies = Object.freeze({
  tasteFit() { return zero('taste_fit'); },
  audioSimilarity() { return zero('audio_similarity'); },
  lyricThemeSimilarity() { return zero('lyric_theme_similarity'); },
  moodFit() { return zero('mood_fit'); },
  useCaseFit() { return zero('use_case_fit'); },
  eventSeasonFit() { return zero('event_season_fit'); },
  sessionNext() { return zero('session_next'); },
  communityFit() { return zero('community_fit'); },
  collectionFit() { return zero('collection_fit'); }
});

export default recommendationStrategies;

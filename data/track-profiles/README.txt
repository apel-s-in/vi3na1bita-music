Полные TrackProfile хранятся отдельно от компактного индекса.

Каноническая структура:

data/track-profiles/
  track-profile.template.json
  <album-key>/
    <UID>.json

Примеры:

data/track-profiles/v-ssore/VS-01.json
data/track-profiles/golos-dushi/GD-01.json
data/track-profiles/mezhdu-zlom-i-dobrom/MZD-01.json

Правила:

1. Имя папки всегда равно каноническому album key из albums.json.
2. Имя файла всегда равно UID трека с расширением .json.
3. track-profile.template.json — единственный эталон структуры.
4. Полный профиль загружается лениво.
5. data/track-profiles-index.json хранит компактный preview и profilePath.
6. Неизвестные характеристики нельзя придумывать.
7. testData=true допускается только для явно обозначенных test fixtures.
8. Погода, текущая дата, праздник и другие изменяемые условия не входят в TrackProfile. Они относятся к RecommendationContext.

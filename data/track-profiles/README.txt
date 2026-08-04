Полные TrackProfile хранят постоянный результат однократного анализа конкретной версии трека.

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
4. TrackProfile создаётся один раз для конкретного trackVersion.
5. trackVersion берётся из data/listen-track-catalog.json.
6. Если аудиофайл и trackVersion не изменились, TrackProfile не редактируется.
7. Полный профиль загружается лениво.
8. data/track-profiles-index.json является автоматически создаваемой компактной проекцией TrackProfile.
9. Неизвестные характеристики нельзя придумывать.
10. testData=true допускается только для явно обозначенных test fixtures.
11. Похожие UID и другие отношения между треками не входят в TrackProfile.
12. Сходство вычисляется отдельно по постоянным признакам всего каталога.
13. Календарные праздники, даты и сезонные подборки не входят в TrackProfile.
14. Пользовательская статистика, популярность, Избранное и recommendation feedback не входят в TrackProfile.

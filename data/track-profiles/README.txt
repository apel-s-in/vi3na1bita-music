TrackProfile хранит только UID и постоянный результат содержательного анализа трека.

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

1. Имя папки равно каноническому album key из data/listen-track-catalog.json.
2. Имя файла равно UID трека с расширением .json.
3. Единственный идентификатор трека внутри TrackProfile — uid.
4. Название трека, альбом, длительность, URL и trackVersion берутся из других канонических файлов.
5. TrackProfile не хранит название модели, analyzer, source, даты анализа и provenance.
6. TrackProfile не хранит relations, similar_tracks и ссылки на другие UID.
7. TrackProfile не хранит пользовательскую статистику, популярность, Избранное и recommendation feedback.
8. Машинные taxonomy ID берутся только из data/taxonomy.json.
9. Машинные аудиопризнаки берутся только из data/track-profile-vocabulary.json.
10. Машинные значения записываются на английском языке в snake_case.
11. Свободный текст записывается только на русском языке в полях с суффиксом _ru.
12. BPM, key, loudnessLufs и dynamicRange сопровождаются отдельным technicalConfidence.
13. Неизвестные технические значения записываются как null, а их technicalConfidence равен 0.
14. loudnessLufs является оценкой интегральной громкости в диапазоне -40..0.
15. dynamicRange является оценкой динамического диапазона в децибелах в диапазоне 0..30.
16. Неизвестные sparse-признаки не записываются.
17. Нулевое значение axis означает подтверждённое отсутствие признака, а не неизвестное значение.
18. Полный профиль загружается лениво.
19. data/track-profiles-index.json создаётся автоматически из всех полных профилей.
20. Фиктивные и автоматически создаваемые TrackProfile запрещены.
21. Каждый сохранённый профиль имеет status=analyzed и testData=false.
22. Каталог может быть заполнен частично: в индекс входят только существующие production-профили.
23. Отсутствие TrackProfile для других UID не блокирует уже заполненные профили.

Production workflow:

1. Один трек анализируется три раза независимо.
2. Владелец передаёт три результата, точный текст песни и авторские уточнения для ручного сопоставления.
3. Итоговый профиль составляется вручную с учётом taxonomy, vocabulary и фактического смысла песни.
4. Финальный JSON сохраняется в data/track-profiles/<album>/<UID>.json.
5. Допускается заменить все профили одного альбома до пересборки индекса.
6. После завершения серии профилей workflow Generate TrackProfile index пересобирает производный индекс.
7. Validate application contracts проверяет структуру, canonical ID, profileHash и соответствие индекса полным профилям.

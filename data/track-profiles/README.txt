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
14. Нулевое значение axis означает подтверждённое отсутствие признака, а не неизвестное значение.
15. Полный профиль загружается лениво.
16. data/track-profiles-index.json создаётся автоматически из всех полных профилей.
17. Фиктивные и автоматически создаваемые TrackProfile запрещены.
18. Каждый сохранённый профиль имеет status=analyzed и testData=false.
19. Каталог может быть заполнен частично: в индекс входят только существующие production-профили.
20. Отсутствие TrackProfile для других UID не блокирует уже заполненные профили.


Production workflow:

1. Один трек анализируется три раза в разных последовательностях альбома.
2. Черновики сохраняются в:
   .analysis/track-profiles/<UID>/run-1.json
   .analysis/track-profiles/<UID>/run-2.json
   .analysis/track-profiles/<UID>/run-3.json
3. Точный текст сохраняется в lyrics.txt.
4. Авторские уточнения сохраняются в notes.txt.
5. Workflow Generate TrackProfile review context создаёт один точечный файл.
6. Три результата сводятся по FINALIZE-PROMPT.txt.
7. Финальный JSON сохраняется в data/track-profiles/<album>/<UID>.json.
8. Workflow Generate TrackProfile index пересобирает производный индекс.
9. Validate application contracts проверяет профиль.

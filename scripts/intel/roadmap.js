export const INTEL_ROADMAP_VERSION = '2026-08-04';

export const INTEL_ROADMAP_TEXT = String.raw`
INTEL — опциональная локальная интеллектуальная надстройка.

АРХИТЕКТУРНЫЕ ГАРАНТИИ

- PlayerCore остаётся единственным владельцем playback.
- INTEL не вызывает play, pause, stop, seek, next, prev, setVolume или setMuted.
- Рекомендации не изменяют очередь без явного действия пользователя.
- INTEL можно полностью отключить, не затрагивая музыку, статистику, Backup, Friends, Game Center, Offline и Осколки.
- Single active playback owner.
- No PIN transfer policy.
- Track UID является единственным долговременным ключом трека.
- Event log остаётся локальной восстанавливаемой правдой.
- Stats являются rebuildable-проекцией.
- TrackProfile и ListenerProfile являются производными данными, а не источником playback truth.

СЕЙЧАС

1. Сохранить отключаемый INTEL bootstrap.
2. Проверить TrackProfile на десяти явно помеченных test fixtures альбома «В Ссоре».
3. Проверить цепочку TrackProfile → ListenerProfile → Recommendation Engine.
4. Показывать честные reason codes.
5. Сохранять recommendation shown/clicked/accepted/dismissed.
6. Не выполнять ListenerProfile rebuild во время воспроизведения.

СЛЕДУЮЩИЙ ЭТАП

1. Заменить тестовые профили VS-01–VS-10 правдивыми данными.
2. Создать TrackProfile для остальных UID.
3. Добавить CI-проверку taxonomy, весов, relations и presentation.
4. Добавить правдивые audio characteristics.
5. Добавить правдивый lyric analysis.
6. Подключить паспорт трека к статистике.
7. Добавить semantic filters только после заполнения каталога.
8. Добавить reason chips и score breakdown.
9. Добавить отдельную versioned semantic projection для долгосрочного rebuild.
10. Сохранить дневной deterministic fallback для треков без профиля.

ОСКОЛКИ

Рабочий серверный магазин сохраняется:
- кошелёк Осколков;
- награды за достижения и Преданность;
- ranked escrow;
- покупка аватаров;
- отображение купленных аватаров в профиле.

ДАЛЬНИЙ BACKLOG — НЕ АКТИВНЫЙ RUNTIME

- Privacy-safe Community aggregates после появления достаточной аудитории.
- Google mirror только при появлении реального transport adapter.
- VK provider actions только при появлении реального API и consent UI.
- Внешний prize claim только при появлении настоящих внешних призов; магазин аватаров к нему не относится.
- AI assistant и natural-language search только как отдельный отключаемый модуль после завершения детерминированных рекомендаций.
`;

export default {
  INTEL_ROADMAP_VERSION,
  INTEL_ROADMAP_TEXT
};

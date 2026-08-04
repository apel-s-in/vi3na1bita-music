export const INTEL_ROADMAP_VERSION = '2026-08-04.2';

export const INTEL_ROADMAP_TEXT = String.raw`
INTEL — опциональная локальная интеллектуальная надстройка.

АРХИТЕКТУРНЫЕ ГАРАНТИИ

- PlayerCore остаётся единственным владельцем playback.
- INTEL не вызывает play, pause, stop, seek, next, prev, setVolume или setMuted.
- Рекомендации не изменяют очередь без явного действия пользователя.
- INTEL можно отключить без влияния на музыку, статистику, Backup, Friends, Game Center, Offline и Осколки.
- Single active playback owner.
- No PIN transfer policy.
- Track UID является долговременным ключом трека.
- Event log остаётся локальной восстанавливаемой правдой.
- Stats являются rebuildable-проекцией.
- TrackProfile и ListenerProfile являются производными данными.

ТЕКУЩЕЕ ТЕСТОВОЕ СОСТОЯНИЕ

- TrackProfile test fixtures VS-01–VS-10.
- Альбомная структура full profiles и компактный profilePath index.
- Локальный ListenerProfile.
- Детерминированный Recommendation Engine.
- Серверная статистика как необязательная корректировка.
- Safety controls и dismiss cooldown.
- Recommendation shown, clicked, accepted и dismissed.
- Профиль рекомендаций.
- Паспорт трека.
- Восемь общих рекомендательных карточек галереи.
- Никаких праздничных, календарных или сезонных подборок.

ДЛЯ ПЕРЕХОДА В PRODUCTION

1. Заменить VS-01–VS-10 правдивыми профилями.
2. Создать TrackProfile для остальных UID.
3. Добавить проверенные audio characteristics.
4. Добавить проверенный lyric analysis.
5. Заполнить genres, styles, moods, themes, use_cases, time_of_day, axes и warnings.
6. Создать проверенные similar_tracks.
7. Убрать testData после редакторской проверки.
8. Включить semantic filters только после заполнения всего каталога.
9. Добавить versioned semantic projection для долгосрочного rebuild.

ОСКОЛКИ

Рабочий серверный магазин сохраняется:
- кошелёк;
- награды;
- Преданность;
- ranked escrow;
- покупка и отображение аватаров.

ОТЛОЖЕНО — НЕ АКТИВНЫЙ RUNTIME

- Transient queue и действие «Играть следующей» не реализуются на текущем этапе.
- Перед очередью обязательны отдельный PlayerCore contract и E2E для Repeat, Shuffle, Favorites Only, Stop, ownership и iOS lockscreen.
- Community aggregates.
- Google mirror.
- VK provider actions.
- Внешний prize claim.
- AI assistant и natural-language search.
`;

export default { INTEL_ROADMAP_VERSION, INTEL_ROADMAP_TEXT };

export const INTEL_ROADMAP_VERSION = '2026-08-07.2';

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

ТЕКУЩЕЕ PRODUCTION-СОСТОЯНИЕ

- TrackProfile создаются только из трёх независимых анализов, точного текста и авторских уточнений.
- Фиктивные TrackProfile и их автоматическая генерация запрещены.
- Каталог TrackProfile может быть заполнен частично.
- Каждый доступный production-профиль сразу участвует в рекомендациях и сходстве.
- Отсутствие профилей других альбомов не блокирует уже заполненные треки.
- Альбомная структура full profiles и компактный производный profilePath index.
- Локальный ListenerProfile.
- Детерминированный Recommendation Engine.
- Серверная статистика как необязательная корректировка.
- Safety controls и dismiss cooldown.
- Recommendation shown, clicked, accepted и dismissed.
- Профиль рекомендаций.
- Паспорт трека.
- Галерея показывает только непустые рекомендательные карточки, подтверждённые доступными профилями или реальной статистикой.
- Никаких праздничных, календарных или сезонных подборок.

ДАЛЬНЕЙШЕЕ ЗАПОЛНЕНИЕ

1. Последовательно заполнить production TrackProfile альбома «В Ссоре».
2. После завершения согласованной серии профилей пересобрать производный индекс.
3. Проверять канонические audio features и lyric analysis.
4. Проверять genres, styles, moods, themes, use_cases, time_of_day, axes и warnings.
5. Проверять instrumentation, vocalRoles, vocalDelivery, arrangementTags и productionTags.
6. Вычислять сходство по всем доступным production-профилям без хранения UID-связей.
7. После завершения альбома перейти к следующему альбому без изменения уже проверенных профилей.
8. Добавить versioned semantic projection для долгосрочного rebuild.

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

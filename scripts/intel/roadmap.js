UID.001_(Playback safety invariant)_(не допустить скрытых остановок плеера)_(intel-слой, sync, backup, recommendations, providers и UI никогда не стопают playback кроме Pause/Stop/SleepTimer и единственного разрешённого favorites-view сценария)
UID.001.01_(Favorites-view stop exception)_(сохранить единственный допустимый stop-case)_(если текущий трек стал inactive в favorites view и это был последний active, только тогда разрешён STOP)
UID.001.02_(No volume reset invariant)_(не ломать звук побочными функциями)_(ни sync, ни modals, ни provider actions, ни recommendation UI не имеют права сбрасывать mute/volume)
UID.001.03_(No playlist hijack invariant)_(не дать новым слоям подменять playing playlist)_(рекомендации, community и semantic UI только предлагают, но не меняют очередь молча)

UID.002_(UID-first core)_(сделать uid единым ключом всей системы)_(все связи track/listener/recs/sync/prizes/backups строить только по uid)
UID.002.01_(UID canonical storage key)_(избежать дублирования сущностей)_(favorite/state/stats/profile/cache/trust/collection всегда адресуются через uid)
UID.002.02_(UID over filename/url rule)_(защитить систему от смены файлов и источников)_(никакая долговременная логика не должна зависеть от src/url/track index/title)

UID.003_(Event log truth)_(иметь честную восстанавливаемую историю)_(долгие пользовательские состояния выводить из событий, а не из UI)
UID.003.01_(Formal event envelope)_(сделать события единообразными и merge-safe)_(каждое событие должно иметь eventId/sessionId/deviceId/platform/type/uid/timestamp/data/version)
UID.003.02_(Event schema registry)_(не допустить хаоса в payload)_(ввести канонический список event types и допустимых data-полей)
UID.003.03_(Hot/warm/archive event lifecycle)_(эффективно хранить историю)_(держать свежие события в hot, рабочий диапазон в warm, старое в archive backup)
UID.003.04_(Dedupe by eventId)_(не удваивать события при sync/import)_(любое слияние логов должно убирать повторы строго по eventId)
UID.003.05_(Replay-safe rebuild)_(пересчитывать stats честно после merge)_(stats, streaks, achievements и preferences пересчитываются заново из merged event log, а не складываются цифрами)
UID.003.06_(Idempotent backup import)_(не ломать прогресс повторным импортом)_(повторная загрузка одного и того же backup не должна удваивать stats/events/achievements)
UID.003.07_(Append-only event mindset)_(сохранить аудит и честность истории)_(события не редактируются задним числом, а только добавляются/объединяются)
UID.003.08_(Event export boundary)_(развести локальную правду и внешнюю аналитику)_(raw event log остаётся локальным и не уходит наружу без mapper/consent)
UID.003.09_(Event versioning)_(подготовить долгую эволюцию формата)_(payload-version нужен для безболезненных миграций и selective rebuild)
UID.003.10_(Event log audit surface)_(дать пользователю историю активности)_(profile logs и future trust UI должны опираться именно на event log slices)

UID.004_(Stats as cache)_(ускорить интерфейс без потери правды)_(агрегаты считать кэшем над event log)
UID.004.01_(Rebuildable aggregates only)_(не хранить непересчитываемые поля в stats)_(каждое долговременное stats-поле должно выводиться из event log или backup snapshot)
UID.004.02_(Global/per-uid split)_(сохранить ясную структуру аналитики)_(разделять per-track stats, global stats, session stats, cloud stats, trust stats)
UID.004.03_(Stats update isolation)_(не дать UI мутировать truth)_(только агрегатор и rebuild path изменяют stats stores)

UID.005_(Soft-disable intel layer)_(не парализовать плеер при проблемах нового слоя)_(ввести флаг отключения через config/localStorage и no-op bootstrap)
UID.005.01_(Feature gating per layer)_(включать новые подсистемы поэтапно)_(track/listener/recs/providers/community/prize слои должны уметь отключаться независимо)
UID.005.02_(Graceful degradation contract)_(сохранять работу приложения без нового слоя)_(если semantic/recs/providers/prize слои недоступны — приложение должно работать в legacy-режиме)

UID.006_(Lazy full semantic loading)_(не перегружать startup и mobile)_(грузить полные профили только по запросу)
UID.006.01_(Lazy prize/backups panels)_(не нагружать профиль лишним на старте)_(archive/claim/restore details грузить только при входе в соответствующий экран)
UID.006.02_(Lazy community aggregates)_(не тащить глобальную аналитику в bootstrap)_(global stats/cohort/similar listeners грузить только при запросе UI)

UID.007_(Local-first compute)_(снизить зависимость от облака и стоимость)_(максимум вычислений и кэшей держать на устройстве)
UID.007.01_(Offline resilience as first-class)_(не дать сети стать точкой отказа)_(профиль, stats, achievements, favorites, collection и recommendations должны иметь локальный fallback)
UID.007.02_(Cloud only for continuity and validation)_(не превращать Яндекс в runtime dependency)_(Яндекс нужен для backup/claim/global snapshots, а не для обычного воспроизведения)

UID.008_(No playback mutation by intel)_(сохранить стабильность очереди и позиции)_(intel-слой только читает, объясняет, рекомендует и рендерит)
UID.008.01_(Recommendation engine no-autoplay rule)_(не допускать silent rec execution)_(engine возвращает candidates/reasons, но не запускает треки и не перестраивает очередь)
UID.008.02_(Provider actions no-playback-side-effect)_(защитить аудио-ядро от внешних интеграций)_(VK/Yandex/Google actions не должны менять audio state)

UID.009_(GitHub-first additive rollout)_(внедрять живьём без больших рефакторингов)_(добавлять новые файлы и мягкие точки интеграции)
UID.009.01_(Additive migrations only)_(не ломать существующие данные)_(MetaDB/cache-db и storage-слои расширяются только добавлением новых stores/fields)
UID.009.02_(Roadmap-in-files principle)_(сохранить идеи внутри проекта)_(каждый важный файл должен содержать связанные UID-маркеры как встроенное ТЗ)

UID.010_(Manual presentation overrides)_(разрешить править любую карточку трека вручную)_(отделить presentation от raw/final analysis)
UID.010.01_(Card editorial override layer)_(не зависеть полностью от AI/auto-analysis)_(allow manual taglines/quotes/badges/ordering/visibility in presentation)
UID.010.02_(Curated profile correction)_(разрешить редакторскую коррекцию finalProfile)_(support safe curated overrides поверх autogenerated semantic data)

UID.011_(Media variants registry)_(расширить контентную модель трека)_(учитывать audio/minus/stems/clip/short/lossless как системные варианты)
UID.011.01_(Variant identity model)_(не путать вариант и трек)_(all variants share one uid but have separate variant-specific stats/source metadata)
UID.011.02_(Variant capability flags)_(знать что доступно у трека)_(track registry/config should expose hasMinus/hasStems/hasClip/hasShort/hasLossless)
UID.011.03_(Future variants extension)_(подготовить расширение без переделки схем)_(live/acoustic/demo/remix/instrumental/radio_edit подключаются как additive variants)

UID.012_(Quality dimension)_(учитывать Hi/Lo/Lossless в логике и аналитике)_(вести quality stats и quality-aware cache/resolution)
UID.012.01_(Cache quality truth)_(развести playback quality и cache quality)_(R0/R1/R2 use explicit PQ/CQ semantics with rebuild/re-cache rules)
UID.012.02_(Quality fallback semantics)_(не ронять playback при отсутствии нужного качества)_(resolver/offline layer должен корректно падать с hi на lo и обратно по правилам)

UID.013_(Minus mode)_(поддержать караоке и отдельную аналитику)_(считать minus полноправным вариантом трека)
UID.013.01_(Minus full-listen semantics)_(засчитывать минус как полноценное прослушивание)_(minus contributes to valid/full/cloud stats by uid)
UID.013.02_(Minus achievements and collection)_(связать karaoke-use с геймификацией)_(minusUsed/feature achievements/badges should be derived from minus events)

UID.014_(Stems mode)_(поддержать раздельные дорожки и future mix flows)_(хранить stems как feature-capable variant)
UID.014.01_(Stem session semantics)_(не считать каждую дорожку отдельным треком)_(multiple stems actions aggregate into one uid session with stemsUsed/tweaked metrics)
UID.014.02_(Future stem balance analytics)_(подготовить richer feature stats)_(stem tweaks and mix interactions later log into dedicated feature counters)

UID.015_(Clip/short variants)_(отделить просмотр видео от прослушивания)_(вести clip/short как отдельные типы контента и событий)
UID.015.01_(Clip-as-full-listen rule)_(сохранить старую бизнес-логику)_(clip completion may count as full listen for uid but not as cloud trigger)
UID.015.02_(Short-as-preview rule)_(не засчитывать preview как track listen)_(short contributes only to feature usage and discovery metrics)

UID.016_(Feature flags on track)_(быстро понимать возможности трека)_(добавить hasLyrics/hasMinus/hasStems/hasClip/hasShort/hasLossless/profile flags)
UID.016.01_(Track source richness)_(дотянуть TrackRegistry до richer content model)_(track object should expose sources/features/sizes/semantic availability without heavy data)
UID.016.02_(Config optionality invariant)_(не ломать старые релизы)_(любое новое поле в config остаётся optional и безопасно ignored if absent)

UID.017_(Launch source stats)_(понять discovery surface и UX входов)_(собирать fromAlbum/fromFavorites/fromSearch/fromRecommendations/fromPlaylist/fromHistory)
UID.017.01_(Explicit launchSource event field)_(не восстанавливать origin угадыванием)_(LISTEN_START/LISTEN_COMPLETE should carry source context when known)
UID.017.02_(Source-aware profile insights)_(показывать откуда пользователь чаще открывает музыку)_(profile stats later render launch source distribution)
UID.017.03_(Recommendation-origin tracking)_(мерить силу rec surfaces)_(launches from recs/profile/showcase/community must be distinguishable)

UID.018_(Variant and quality stats)_(видеть реальные режимы потребления)_(вести per-uid variantStats и qualityStats)
UID.018.01_(LaunchSource/variant/quality aggregation)_(держать все consumption dimensions вместе)_(stats-aggregator should own aggregation of these dimensions)
UID.018.02_(Session carry-over across variant switch)_(не дробить listen session по переключению режима)_(audio→minus/stems and hi→lo switches continue same uid-session)

UID.019_(Compact TrackProfile index)_(быстро фильтровать и рекомендовать каталог)_(держать легкий index в data/track-profiles-index.json)
UID.019.01_(Index preview contract)_(дать быстрый UI-safe preview)_(uid/title/album/top tags/axes/one-liner/similar should be enough for lists, recs, showcase)
UID.019.02_(Index cache policy)_(не грузить индекс бесконечно)_(memory + session cache + config-url versioning)

UID.020_(Full TrackProfile per uid)_(открывать детальную карточку песни)_(держать по одному JSON на трек в data/track-profiles/)
UID.020.01_(Per-uid lazy fetch contract)_(избежать giant bundle)_(full profile loads only when needed by modal/share/deep recs)
UID.020.02_(Full profile fallback)_(не ломать карточки при отсутствии файла)_(modal/share/presentation gracefully fallback to registry/basic stats)

UID.021_(musicAnalysis block)_(описывать звучание)_(хранить bpm/key/dynamics/timbre/energy/audio-embeddings и audio similarity)
UID.021.01_(Audio embeddings placeholder)_(подготовить similarity-ready audio core)_(store embeddings refs or similarity-derived fields without browser-side heavy compute)
UID.021.02_(Audio-derived genres/moods separation)_(не смешивать звук и текст)_(musicAnalysis may propose tags, but final merge happens only in finalProfile)

UID.022_(lyricAnalysis block)_(описывать смысл текста)_(хранить summary/keywords/quotes/scenes/narrative/entities/tags/axes/warnings)
UID.022.01_(Strict LLM schema)_(получать валидный lyricAnalysis)_(analysis pipeline should enforce taxonomy keys, field lengths, allowed weights and arrays)
UID.022.02_(Lyrics-only interpretation rule)_(не путать музыку и текст)_(lyricAnalysis describes text semantics, not audio mood guessed from production)

UID.023_(finalProfile block)_(иметь единую fused truth для рекомендаций и карточек)_(сливать audio+lyrics+curation в один профиль)
UID.023.01_(Curation-over-auto merge rule)_(не потерять ручную редактуру)_(finalProfile should accept curated corrections above auto-analysis)
UID.023.02_(UI-safe final projection)_(не таскать raw internals в интерфейс)_(presentation/recs/search should consume final normalized fields rather than raw model fragments)

UID.024_(Strict taxonomy-v2)_(избежать зоопарка тегов)_(использовать только канонические keys genres/styles/moods/themes/use_cases/events/axes/warnings)
UID.024.01_(Taxonomy validator)_(не пускать мусор в semantic layer)_(CI/content validators should reject unknown keys and malformed weights)
UID.024.02_(Taxonomy evolution rule)_(развивать словарь без ломки старых профилей)_(new keys are additive with versioned compatibility)

UID.025_(Weighted tags 0..1)_(получить тонкие фильтры и ранжирование)_(хранить веса вместо грубых boolean-тегов)
UID.025.01_(Store-threshold rule)_(снизить размер profile JSON)_(omit near-zero weights and treat unset as default_unset)
UID.025.02_(Dominant-vs-secondary distinction)_(улучшить UI и recs)_(use top weights for badges/chips and full vectors for scoring)

UID.026_(Genres/styles/moods/themes/use_cases/events)_(охватить музыку и жизненный контекст)_(классифицировать трек по нескольким смысловым осям)
UID.026.01_(Life-context tagging)_(делать музыку ситуационно полезной)_(support wedding/family/kids/patriotic/memorial/night/driving etc as first-class recommendation contexts)

UID.027_(Continuous axes)_(строить координаты для реков)_(использовать energy/valence/arousal/melancholy/socialness/humor/storytelling и др.)
UID.027.01_(Axis-based sorting)_(дать новые способ просмотра каталога)_(showcase/profile/recs can sort by selected axis without full semantic recompute)
UID.027.02_(Axis user affinity)_(делать тонкий taste match)_(listener profile should aggregate axis preferences from played tracks)

UID.028_(Content warnings)_(делать безопасные рекомендации и family mode)_(хранить explicit/violence/self_harm/horror/war/psychological_distress)
UID.028.01_(Family-safe filtering)_(не рекомендовать неподходящее детям)_(family_mode and kids flows should respect warnings plus family_friendly axis)

UID.029_(Keywords layer)_(искать и связывать треки по образам)_(извлекать слова и фразы с type+probability)
UID.029.01_(Entity/keyword search bridge)_(усилить semantic search)_(search should later combine lyrics-index and keyword/entity/theme matching)

UID.030_(Quotes layer)_(давать яркие цитаты для UI и sharing)_(хранить 0..3 короткие репрезентативные строки)
UID.030.01_(Hero quote presentation)_(усилить карточки треков)_(presentation layer can choose hero_quote_ru from quotes or editorial override)

UID.031_(Scenes layer)_(показывать сюжет песни)_(хранить последовательность сцен с what_happens и mood)
UID.031.01_(Story-aware recommendation hook)_(связывать песни по типу повествования)_(recs may later compare scene progression/storytelling structure)

UID.032_(Narrative layer)_(понимать кто и как говорит в песне)_(хранить person/addressing/tone profile)
UID.032.01_(Narrative-intimacy hook)_(делать подборки по типу лирического голоса)_(distinguish first-person confession, dialogue, collective chant, etc.)

UID.033_(Entities layer)_(связывать песни по персонажам/местам/символам)_(извлекать characters/places/objects/symbols)
UID.033.01_(Symbol-universe relations)_(строить “одну вселенную” треков)_(entity overlap can power same-universe and fairytale/horror subgraphs)

UID.034_(Track relations graph)_(уметь делать recs не только по similar_tracks)_(развести audio_similarity/theme_similarity/mood_similarity/transition_fit/complementary_pair)
UID.034.01_(Relation type contract)_(не смешивать виды похожести)_(relations store explicit typed edges instead of one flat similar list)
UID.034.02_(Transition-fit layer)_(улучшить playlist flow)_(support “good next track” edges separately from semantic similarity)

UID.035_(Similar tracks)_(дать быстрый блок похожих песен)_(хранить top-related uid list в профиле и индексе)
UID.035.01_(Similar block fallback)_(не ломать UI если relations пусты)_(show top same-album or same-theme safe fallback when no graph exists)

UID.036_(Track presentation layer)_(сделать карточки редактируемыми и стабильными)_(хранить hook/tagline/mini-description/hero-quote/badges/chips отдельно)
UID.036.01_(Card layout hints)_(помочь визуальному рендеру)_(allow accent/visual theme/emotion palette hints in presentation block)
UID.036.02_(Reason snippets for cards)_(сделать rec/share карточки богаче)_(presentation may include short why-listen snippets)

UID.037_(Card overrides)_(разрешить редакторские правки без ломки анализа)_(подмешивать presentation override поверх finalProfile)
UID.037.01_(Per-track manual curation)_(не потерять авторскую подачу)_(allow manual correction of tagline/quote/badges/chips/order without rewriting raw semantic files)

UID.038_(Track profile modal)_(показывать подробный паспорт трека в UI)_(делать отдельную модалку вместо раздувания statistics-modal)
UID.038.01_(Statistics→Profile bridge)_(дать пользователю вход в semantic слой из существующего UI)_(statistics modal should be able to open track-profile-modal when profile exists)
UID.038.02_(Track modal as future action hub)_(собрать в одном месте relations/badges/reasons/share hooks)_(track-profile-modal becomes deep track surface without owning playback)

UID.039_(Share cards from profile)_(делать карточки умными и красивыми)_(ShareGenerator должен уметь брать summary/badges/reasons/presentation)
UID.039.01_(Collectible share card mode)_(делать коллекционный sharing)_(support badges/completion/veteran/favorite state in cards)
UID.039.02_(Profile/prize/share convergence)_(позже объединить social/progress cards)_(achievement/profile/track cards share one rendering philosophy and visual contract)

UID.040_(Semantic search hooks)_(искать по смыслу, а не только по строке)_(использовать keywords/themes/moods/entities/lyrics index и future NL search)
UID.040.01_(Natural-language query preparation)_(подготовить поиск обычным языком)_(future AI/NL assistant can map user phrase into taxonomy filters and keyword search)

UID.041_(Showcase semantic filters)_(сделать витрину центром discovery)_(добавить фильтры по moods/themes/styles/use_cases/events/seasonality)
UID.041.01_(Showcase semantic helper isolation)_(не превращать ShowcaseManager в semantic engine)_(heavy filtering helpers live in scripts/intel/ui/showcase-semantic.js or related intel modules)

UID.042_(Showcase semantic sorting)_(давать новые способы просмотра каталога)_(сортировать по axes: energy/melancholy/humor/storytelling/family_friendly и др.)
UID.042.01_(Stats-aware semantic ranking)_(комбинировать пользовательские и semantic сигналы)_(support hybrid sorts like favorites-first + energy-desc + recent-unplayed)

UID.043_(Smart playlists)_(строить сценарные подборки)_(генерировать блоки типа night/driving/protest/fairytale/wedding/crying/kids)
UID.043.01_(Editorial plus generated playlists)_(развести curated и algorithmic подборки)_(support manual presets and generated smart blocks with same playlist surface)

UID.044_(ListenerProfile core)_(понимать вкус пользователя как сущность)_(строить отдельный профиль слушателя поверх stats/events/favorites)
UID.044.01_(Persistent listener profile store)_(не пересчитывать всё постоянно)_(listener_profile store caches rebuilt portrait with timestamps/version)
UID.044.02_(Listener profile summary surface)_(показывать вкус кратко и красиво)_(profile UI should later render top moods/themes/styles/axes/archetype)

UID.045_(Tag preferences)_(знать любимые жанры/темы/настроения)_(агрегировать preference-веса по taxonomy-группам)
UID.045.01_(Seconds-based preferences)_(держать честный вкус по факту прослушивания)_(preference weights derive from listened seconds/valid/full stats, not likes only)

UID.046_(Axis preferences)_(знать любимую эмоциональную геометрию)_(агрегировать средние и доминирующие axes пользователя)
UID.046.01_(Axis bucket caching)_(ускорить listener rebuild)_(aggregator may later keep lightweight axis buckets for profile engine consumption)

UID.047_(Feature affinity)_(понимать продуктовые привычки пользователя)_(считать склонность к lyrics/stems/minus/clip/lossless/sleep timer и др.)
UID.047.01_(Feature mastery hooks)_(связывать affinity с achievements/collection/recs)_(feature affinity can later influence badges, achievements and feature-based recs)

UID.048_(Time profile)_(учитывать когда пользователь слушает)_(строить morning/day/evening/night и weekday/weekend профили)
UID.048.01_(Temporal rec alignment)_(рекомендовать по времени использования)_(night listeners should get different defaults than morning listeners)

UID.049_(Behavior archetype)_(делать human-readable портрет слушателя)_(выводить repeater/explorer/album-listener/lyrics-focused/background-listener и др.)
UID.049.01_(Archetype confidence)_(избежать фальшивых ярлыков)_(archetype output should later include confidence or multi-tag style, not one forced label)

UID.050_(Session profile)_(понимать контекст текущего прослушивания)_(строить мягкий профиль сессии для next-track рекомендаций)
UID.050.01_(Session context carrier)_(не размазать session intelligence по коду)_(session-tracker + listener-profile + rec-engine must share one clear session context contract)
UID.050.02_(Session persistence TTL)_(не путать текущую сессию с вечным вкусом)_(temporary session profile expires after inactivity or stop)
UID.050.03_(Session mode signals)_(лучше понимать intent текущего слушания)_(driving/sleep/deep-focus/album-run/favorites-run can be derived as soft context states)

UID.051_(Collection state)_(превратить трек в собираемый объект)_(вести per-uid освоение трека пользователем)
UID.051.01_(Collection persistent store)_(сохранить collectible прогресс отдельно)_(collection_state store should cache derived badges/completion/user-track states)
UID.051.02_(Album collection rollup)_(сделать коллекцию крупнее единичных треков)_(support per-album completion/mastery summaries)

UID.052_(Track badges and completion)_(дать коллекционный и геймификационный слой)_(слушал/любимое/lyrics used/clip watched/stems/minus/lossless/veteran/completion percent)
UID.052.01_(Badge truth separation)_(не смешивать favorite truth и badge derivation)_(favorites/stats stay truth, badges are derived collectible projections)
UID.052.02_(Completion formula contract)_(избежать хаоса в процентах освоения)_(define stable completion scoring based on badges/features/listens)

UID.053_(Rediscovery engine)_(возвращать забытые любимые треки)_(сравнивать lastPlayedAt с favorite/full history и строить forgotten_hits)
UID.053.01_(Rediscovery UI hosts)_(не потерять этот класс рекомендаций)_(profile, showcase and maybe album banners should later host rediscovery blocks)
UID.053.02_(Cooldown against spam)_(не раздражать пользователя одинаковыми возвратами)_(rediscovery candidates need hide/dismiss/cooldown memory)

UID.054_(Recommendation engine core)_(перестать рекомендовать случайно)_(собрать единый движок поверх listener+track profiles)
UID.054.01_(Thin UI consumer rule)_(не считать рекомендации в view-файлах)_(profile/showcase/statistics modal only render engine results)
UID.054.02_(Fallback recommendation path)_(не ломать вкладку Для Вас при отсутствии intelligence)_(safe random-unplayed fallback remains until full rec engine ready)

UID.055_(Recommendation strategies)_(легко добавлять новые типы подбора)_(держать отдельные scorer-модули вместо хаотичных if в UI)
UID.055.01_(Strategy breakdown persistence)_(объяснять состав score)_(engine should later preserve per-strategy contributions in result/debug)
UID.055.02_(Strategy extensibility contract)_(не ломать движок новыми scorers)_(each strategy returns score/reason and can be added additively)

UID.056_(Recommendation reasons)_(объяснять почему показан трек)_(возвращать reason codes + human explanation)
UID.056.01_(Reason chips in UI)_(делать рекомендации прозрачными)_(profile/showcase/cards can later render compact reason chips from reason codes)
UID.056.02_(Reason-aware telemetry)_(понять какие reasons реально работают)_(rec interaction events should carry reason codes or rec explanation category)

UID.057_(Audio similarity strategy)_(находить похожее по звуку)_(сравнивать embeddings/tempo/energy/timbre)
UID.057.01_(Safe same-album fallback)_(не оставлять similar пустым)_(until embeddings ready, allow conservative fallback by album/style/energy hints)

UID.058_(Lyric and theme strategy)_(находить похожее по смыслу)_(сравнивать themes/keywords/scenes/narrative/entities)
UID.058.01_(Entity/symbol match hook)_(строить recs по сказочным и образным связям)_(support same-universe recommendations via entities and motifs)

UID.059_(Mood/use-case/event/season strategy)_(подбирать по ситуации и настроению)_(сравнивать moods/use_cases/events/seasonality/time_of_day)
UID.059.01_(Family/sleep safe controls)_(уважать режимы безопасного подбора)_(strategy layer must later honor recommendation_controls and warnings)

UID.060_(Session-aware next-track strategy)_(подбирать следующий трек под текущий поток)_(учитывать session profile, current track, energy curve и sleep/night context)
UID.060.01_(Next suggestion not autoplay)_(сохранять user control)_(session-aware next-track stays advisory until explicit allowed execution path exists)
UID.060.02_(Energy curve management)_(делать переходы мягче)_(support rise/hold/soft-landing curves for long sessions, sleep and album flows)

UID.061_(Community-driven recommendations)_(усилить recs сигналом похожих пользователей)_(использовать cohort/similar listeners/global aggregates)
UID.061.01_(Community placeholder integrity)_(не подменять локальные recs сырой community магией)_(community signal remains optional bonus until remote aggregates are trustworthy)

UID.062_(Recommendation memory and feedback)_(не повторять тупо одни и те же советы)_(хранить shown/clicked/accepted/dismissed/cooldowns)
UID.062.01_(Recommendation state store)_(не терять пользовательскую реакцию между сессиями)_(recommendation_state store should persist feedback and cooldown decisions)
UID.062.02_(Feedback event model)_(сделать recs измеримыми)_(RECOMMENDATION_SHOWN/CLICKED/ACCEPTED/DISMISSED must be formal event types)

UID.063_(Profile recs tab upgrade)_(сделать вкладку Для Вас реально полезной)_(перевести её на recommendation engine и listener profile)
UID.063.01_(Profile insights block)_(добавить вкус и объяснения рядом с рекомендациями)_(profile can host listener summary + reasons + rediscovery + collection goals)
UID.063.02_(Forgotten hits section)_(явно встроить rediscovery)_(profile should later have separate “Забытые хиты” block)

UID.064_(Global track stats)_(понимать жизнь треков в аудитории)_(держать popularity/completion/replay/favorite/share/recommendation metrics)
UID.064.01_(Public global snapshot transport)_(не требовать жирный backend на старте)_(serve aggregated public JSON via Yandex Object Storage snapshots)

UID.065_(Cohort model)_(группировать пользователей по стилю поведения)_(ввести кластеры night listeners, lyrics lovers, collectors и др.)
UID.065.01_(Cohort labels as outer intelligence)_(не считать когорты локальной truth)_(cohorts are derived/aggregated labels, not primary user state)

UID.066_(Similar listeners)_(строить слой похожих пользователей)_(хранить future similarity hooks и cohort affinity)
UID.066.01_(Privacy-safe similar users)_(не раскрывать приватную историю)_(only anonymized compare/group signals are exposed to UI)

UID.067_(User-vs-community compare)_(давать личные инсайты)_(сравнивать профиль слушателя с агрегированной нормой)
UID.067.01_(Compare explanations)_(делать community insights понятными)_(surface human-readable compare statements instead of raw percentiles only)

UID.068_(Public playlist analytics)_(развить социальную часть каталога)_(считать views/saves/share conversions и reuse playlists)
UID.068.01_(Playlist import/share events)_(сделать social surface измеримой)_(playlist shared/imported/saved/viewed actions need event model and later external aggregates)

UID.069_(Internal user identity)_(сделать один профиль на все внешние входы)_(ввести internalUserId как канонический ключ пользователя)
UID.069.01_(Identity local persistence)_(не терять профиль между linked providers)_(provider_identity store should persist internalUserId independently from current auth token)
UID.069.02_(Identity over provider accounts)_(не плодить дубли пользователей)_(all linked Yandex/Google/VK accounts attach to one internal identity)

UID.070_(Linked providers)_(дать пользователю много внешних аккаунтов без конфликтов)_(подключать Yandex/Google/VK к одному internal profile)
UID.070.01_(Primary/linked distinction)_(сохранить понятную роль основного аккаунта)_(one provider may be primary auth while others only extend capabilities)
UID.070.02_(Provider UI shell)_(показать связки в профиле)_(profile screen should expose linked accounts status/link/unlink state without owning identity truth)

UID.071_(Provider capability model)_(понимать что умеет каждый провайдер)_(вести scopes/capabilities/roles вместо жесткого if-provider)
UID.071.01_(Capability-based actions only)_(не обещать несуществующие интеграции)_(provider actions UI should only enable what linked provider explicitly supports)
UID.071.02_(Role separation)_(развести auth/backup/social/AI/media функции)_(provider state stores roles like primaryBackup/social/ai independently)

UID.072_(Provider consents)_(контролировать доступы и приватность)_(хранить analytics/personalization/social/cloud/AI consent flags)
UID.072.01_(Consent UI host in profile)_(дать пользователю контроль)_(profile actions/render shell later host toggles for analytics/cloud/social/AI/personalization)
UID.072.02_(Consent as export gate)_(не выпускать данные без разрешения)_(mapper/provider actions/cloud features must consult consent state before external activity)

UID.073_(Hybrid sync orchestrator)_(объединить несколько провайдеров вокруг одного профиля)_(ввести primary/mirror/social roles и единый sync state)
UID.073.01_(Legacy transport vs orchestration boundary)_(не сломать существующий sync)_(cloud-sync remains transport, hybrid-sync only orchestrates roles and policies)
UID.073.02_(Sync state visibility)_(показать пользователю что происходит)_(profile should later surface last sync/status/primary/mirror roles)
UID.073.03_(Hybrid sync no-startup-dependency)_(не делать облако обязательным для запуска)_(orchestrator init must stay optional and no-op without auth/providers)

UID.074_(Primary backup provider)_(иметь основной источник сохранения)_(по умолчанию делать Yandex основным backup channel)
UID.074.01_(Yandex Disk snapshot path)_(сделать backup предсказуемым)_(store versioned snapshots and latest pointer in Yandex Disk user space)

UID.075_(Secondary mirror backup)_(получить резервную копию и отказоустойчивость)_(держать Google как mirror backup option)
UID.075.01_(Mirror as optional enhancement)_(не усложнять первый релиз)_(mirror backup exists as role/state even before full multi-provider transport is alive)

UID.076_(Restore policy)_(сделать восстановление предсказуемым)_(идти primary -> secondary -> local merge через event logs)
UID.076.01_(Selective restore contract)_(восстанавливать не всё подряд)_(support restore all/current/archive/favorites/playlists/achievements/settings/collection)
UID.076.02_(Smart backup compare)_(не затереть богатый профиль бедным backup)_(compare timestamp/cycles/xp/achievements/checksum/completeness before restore)
UID.076.03_(Restore preview UI)_(сделать восстановление осознанным)_(user should later see local newer/cloud newer/conflict hints before applying)

UID.077_(Yandex auth/backup/AI)_(использовать сильные стороны Яндекса)_(связать login/cloud/assistant/metrics в одном provider role)
UID.077.01_(Yandex ID as claim anchor)_(сделать внешний trust contour вокруг Яндекса)_(claim/backup ownership/global validation should use Yandex ID as primary identity)
UID.077.02_(Yandex Cloud Functions for validation)_(вынести внешнюю проверку из клиента)_(claim validation/integrity checks/global snapshots are server-side Yandex functions)

UID.078_(Google mirror/export)_(использовать сильные стороны Google без конфликта identity)_(дать mirror backup/export/future convenience actions)
UID.078.01_(Google not-primary rule)_(не ломать текущий Yandex-first вектор)_(Google remains linked extension unless explicitly made primary in future)

UID.079_(VK social/media actions)_(связать приложение с сообществом и API VK)_(готовить likes/comments/community/video/audio actions через capability bridge)
UID.079.01_(VK social-only safe mode)_(не делать VK обязательным)_(VK capabilities may be absent and must never block app/profile/recs/offline behavior)
UID.079.02_(VK provider action placeholders)_(не потерять будущие API-use cases)_(comment/like/open-group/open-video/future-audio-api actions stay represented via bridge contracts)

UID.080_(Provider actions bridge)_(не размазывать внешние действия по UI)_(вести единый слой provider-actions с проверкой capability)
UID.080.01_(UI-callback only provider actions)_(не превращать bridge в UI-монолит)_(views pass intent to provider-actions; bridge returns status/result, not HTML)

UID.081_(Telemetry mapper)_(безопасно отправлять внешнюю аналитику)_(маппить локальные события в whitelisted external payloads)
UID.081.01_(Whitelist-only export)_(не дать наружу уйти приватной правде)_(only selected events/screens/actions are exportable via mapper)
UID.081.02_(Mapper over raw events)_(не давать UI слать данные напрямую)_(all future Metrica/provider exports go through telemetry mapper)

UID.082_(Local truth vs external telemetry split)_(не смешивать приватную правду и продуктовые метрики)_(raw data хранить локально, наружу отдавать только mapped layer)
UID.082.01_(Profile/recs/community export boundary)_(не утечь listener profile наружу)_(listener summaries, rec reasons and community data export only in reduced forms and by consent)

UID.083_(Yandex Metrica safe export)_(получать пользу от метрики без утечек)_(отправлять screens/recs/shares/sync/auth/provider events по consent)
UID.083.01_(Metrica as product analytics only)_(не путать её с музыкальной истиной)_(Metrica tracks usage funnels and product behavior, not semantic/taste truth)

UID.084_(AI content analysis)_(автоматизировать построение lyricAnalysis и card copy)_(использовать LLM по строгой taxonomy/schema)
UID.084.01_(Offline-safe AI absence)_(не делать AI обязательным)_(semantic layer can stay partially empty/stubbed and app still fully works)
UID.084.02_(Validation over generation)_(не доверять LLM слепо)_(every generated profile piece passes schema/normalizer/curation pipeline)

UID.085_(AI explanation layer)_(делать рекомендации и профиль понятными)_(строить explanation text поверх reasons и listener/track profile)
UID.085.01_(Deterministic-first explanations)_(сначала rules, потом LLM)_(use fixed reason texts before richer generated explanations)

UID.086_(AI natural-language assistant)_(дать поиск и подборки обычным языком)_(готовить future слой NL search/filter/recommendation)
UID.086.01_(Assistant as optional surface)_(не внедрять AI в core UX насильно)_(assistant layer remains separate and can be disabled without affecting base app)

UID.087_(CI validators for profiles)_(не пускать мусор в semantic слой)_(добавить schema/normalizer/validation hooks для track profiles)
UID.087.01_(Profile generation pipeline separation)_(анализ вне браузера, использование в браузере)_(generation/validation live in CI/tooling, not in runtime player)

UID.088_(Profiles data layout)_(не раздувать старт приложения)_(держать index отдельно от full profile directory)
UID.088.01_(Repo static semantic boundary)_(не класть пользовательскую правду в repo)_(repo stores track semantics only, not listener or sync states)

UID.089_(Future MetaDB stores)_(подготовить persistent контур для intel-слоя)_(добавить listener_profile/provider_identity/hybrid_sync/recommendation_state/collection_state)
UID.089.01_(Prize/backup/trust stores)_(подготовить новый доверительный слой)_(добавить current_journey/prize_profile/prize_cycles/trust_state/claim_state stores additively)
UID.089.02_(Device registry store)_(подготовить multi-device sync truth)_(add device_registry/device_state store for known devices and sync metadata)

UID.090_(Service-worker caching for intel assets)_(сохранить offline resilience и быстрый boot)_(добавить intel scripts + profile index в core static cache)
UID.090.01_(Yandex remote JSON cache strategy)_(экономить запросы к Яндексу)_(profile index/community snapshots use cache-first or SWR depending on volatility)

UID.091_(No-op stubs before full implementation)_(получить безопасный контур без риска для текущего плеера)_(все новые модули сделать валидными и мягкими заглушками)
UID.091.01_(Placeholder honesty rule)_(не путать каркас и готовую функцию)_(empty community/prize/provider modules must clearly remain placeholders until implemented)

UID.092_(Incremental rollout order)_(внедрять по приоритету и без паралича)_(bootstrap -> profiles -> listener -> recs -> providers -> sync -> telemetry -> AI)
UID.092.01_(Priority group A)_(дать быстрый полезный результат)_(track profiles + profile modal + listener profile + profile recs)
UID.092.02_(Priority group B)_(усилить discovery и коллекцию)_(showcase semantic + collection/badges + rediscovery UI)
UID.092.03_(Priority group C)_(ввести identity/cloud/community)_(provider identity + hybrid sync + telemetry + public aggregates)
UID.092.04_(Priority group D)_(ввести prize/trust/claim контур)_(journey/archive/prize cycles/backup compare/selective restore/claim flow)
UID.092.05_(Priority group E)_(добавить AI and advanced community)_(assistant/NL search/explanations/global compare/VIP endgame)

UID.093_(Roadmap markers in touched files)_(не потерять идеи в длинной переписке)_(в начало новых и ключевых старых файлов добавить UID-строки как встроенное ТЗ)
UID.093.01_(One-idea-many-touchpoints rule)_(если идея касается нескольких файлов, marker должен быть в каждом relevant host)_(event-log/sync/playback/profile/showcase/offline/provider files may share same UID markers)

UID.094_(No-paralysis rule)_(оставить текущее приложение рабочим на каждом шаге)_(любой сбой intel-слоя должен только отключать intel-функции, но не ломать плеер)
UID.094.01_(No mandatory cloud rule)_(облако, claim и community не обязательны для музыки)_(base local player/profile/achievements/favorites work without login or network)
UID.094.02_(No hidden runtime ownership switch)_(не подменять legacy core silently)_(legacy modules remain owners until explicit phased replacement)
UID.094.03_(No modal/overlay playback breakage)_(UI окна не влияют на музыку)_(track profile modal, backup dialogs, consent windows, community panels never pause/stop/reset playback)

UID.095_(Ownership boundary: legacy vs intel)_(зафиксировать архитектурные границы ответственности)_(legacy analytics/app/offline/player own runtime truth; intel owns derived intelligence and optional surfaces)
UID.095.01_(Analytics vs intel boundary)_(не смешивать raw behavior и интерпретации)_(analytics keeps events/stats/backup truth, intel builds profiles/recs/community/provider graph over it)
UID.095.02_(App/profile/showcase vs intel-ui boundary)_(не дать helper-слоям захватить основные экраны)_(legacy views remain shells; intel-ui provides optional fragments/widgets only)

UID.096_(Helper-first anti-duplication policy)_(жёстко закрепить курс на упрощение кода)_(общие no-op/state/storage/event helper patterns выносить в shared helpers вместо копипасты)
UID.096.01_(Progressive cleanup rule)_(при каждой реализации вычищать устаревший fallback где он больше не нужен)_(не оставлять старый след после окончательного включения нового слоя)

UID.097_(CloudStats model)_(вынести облачную офлайн-логику в отдельную каноническую сущность)_(cloudFullListenCount/cloudAddedAt/cloudExpiresAt/cloud/isPinned/cachedQuality должны жить как отдельная per-uid модель)
UID.097.01_(Cloud badge integrity)_(значок облака только за реально готовый кэш)_(cloud indicator shown only when policy active and file fully cached at required CQ/PQ)
UID.097.02_(CloudStats rebuild/merge policy)_(не потерять облачную механику при sync/restore)_(cloudStats should merge predictably and not inflate from duplicate imports)

UID.098_(Device identity registry)_(сделать multi-device поведение управляемым)_(хранить known devices/deviceHash/platform/firstSeen/lastSeen/trust/sync participation)
UID.098.01_(Device as trust signal, not truth)_(не конфликтовать с multi-device моделью)_(device identity helps trust/claim/sync but does not override internal user profile)

UID.099_(Multi-device sync model)_(нормально поддерживать два и более устройства пользователя)_(event logs from devices merge by eventId into one profile with deterministic rebuild)
UID.099.01_(Simultaneous devices allowed)_(не ломать реальную жизнь пользователя)_(listening on phone and desktop at once is valid; trust layer may flag anomalies but should not hard-break stats by default)
UID.099.02_(Sync revision markers)_(избежать race conditions в merge)_(store sync revision/hash/watermark to compare local vs remote branches before upload)
UID.099.03_(Conflict classes)_(сделать sync UI и обработку понятными)_(no_conflict/duplicate_overlap/divergent_local/divergent_remote/mixed_merge/suspicious_conflict)
UID.099.04_(Merge lock semantics)_(не дать двум устройствам испортить snapshot одновременно)_(cloud/hybrid sync should use compare-before-write and soft conflict retries)

UID.100_(Backup snapshot as life capsule)_(сделать backup полным слепком профиля, а не набором counters)_(backup includes profile/journey/prize/stats/events/streaks/achievements/favorites/playlists/settings/playerState/collection/listener cache/linked providers/consents/trust)
UID.100.01_(Versioned backup series)_(не ограничиваться одним latest-file)_(store multiple snapshots plus latest pointer in Yandex Disk)
UID.100.02_(Backup export/share-first UX)_(сделать резервирование привычным действием)_(support save-to-disk/download/web-share/send-to-self flows)
UID.100.03_(Backup compare before restore)_(не затереть богатую историю более бедным файлом)_(compare active journey/archive richness/checksum/timestamp before applying restore)
UID.100.04_(Selective restore modes)_(дать пользователю гибкость)_(restore all/current journey/archive/favorites/playlists/achievements/settings/collection selectively)
UID.100.05_(Milestone backup prompts)_(мягко подталкивать к сохранению ценного прогресса)_(show backup suggestion on significant achievement/cycle close/rare unlock)
UID.100.06_(Mobile-first recovery UX)_(учесть PWA/iOS/Android ограничения)_(primary Yandex Disk save plus download/share fallback and clear restore guidance)

UID.101_(Current journey model)_(развести живой путь и архив)_(хранить отдельную сущность currentJourney с active achievements/streak/xp/prize progress/collection progression)
UID.101.01_(Journey snapshot boundaries)_(не смешивать current и archived progress)_(only cycle close promotes active journey snapshot into archive)

UID.102_(Prize cycles archive)_(сделать призовые/achievement loops историческими сущностями)_(вести cycles[] с ordinal/status/snapshots/validation/claim meta)
UID.102.01_(Cycle close snapshot)_(замораживать завершённый путь)_(closing cycle stores summary, stats snapshot, achievements snapshot, streak snapshot, collection snapshot, listener snapshot)
UID.102.02_(Current path vs archive UI)_(сделать профиль историчным и понятным)_(profile achievements/prize UI later split into Текущий путь and Архив cycles)
UID.102.03_(Post-claim branching)_(не делать prize тупиком)_(after claim user may start new cycle, continue normal path or enter advanced/VIP progression)

UID.103_(Prize profile core)_(собрать логику cycle history и claim статусов в одном слое)_(prizeProfile stores currentCycleId/cycles/claimHistory/prizeEligibility/trustFlags/lastValidationAt)
UID.103.01_(Prize profile no-playback ownership)_(не дать призовому слою проломить основной продукт)_(prize logic never affects playback/favorites/offline semantics)

UID.104_(Trust and eligibility state)_(разделить локальный прогресс и внешнюю валидность)_(вести eligibility/trustFlags/reasons/device consistency/backup consistency/lastVerifiedAt)
UID.104.01_(Local progress always survives)_(не наказывать пользователя за отсутствие облака)_(user keeps local achievements even if external eligibility is suspicious or unavailable)
UID.104.02_(External claim requires validation)_(внешний приз/статус only after checks)_(Yandex-based validation decides eligible/suspicious/invalid/manual_review independently from local unlocks)

UID.105_(Claim request model)_(формализовать внешний запрос на приз/статус)_(claimRequest contains internalUserId/yandexAccountId/targetCycleId/backupChecksum/trust signals/device meta/status)
UID.105.01_(Claim only when needed)_(не создавать friction на старте)_(Yandex login and claim flow start only when user really reaches claim threshold)
UID.105.02_(Server-side validation package)_(не проверять финальный приз на клиенте)_(client prepares payload, Yandex Cloud validates integrity/duplicates/continuity/trust)

UID.106_(Yandex ID as primary external identity)_(связать внешний trust contour с Яндексом)_(Yandex ID anchors backup ownership, claim flow, cloud continuity and verified public status)
UID.106.01_(Anonymous-local-first, verified-later)_(сохранить свободу локального использования)_(user may stay local until backup/claim/global features are needed)

UID.107_(Yandex Disk backup topology)_(организовать облачное хранение как user-owned space)_(store /vi3na1bita/backups/*, /latest/latest-backup.json and optional exports)
UID.107.01_(Latest pointer + versioned history)_(сделать быстрый restore и богатый архив)_(latest pointer accelerates restore while older snapshots preserve history)
UID.107.02_(Backup ownership audit)_(понимать кому принадлежит snapshot)_(backup metadata should include internalUserId/yandexAccountId/device meta/version/checksum)

UID.108_(Yandex Object Storage public aggregates)_(питать глобальную витрину дешёвыми снапшотами)_(store public JSON for global stats/cohorts/leaderboards/community snapshots)
UID.108.01_(Public aggregate privacy rule)_(не класть приватную правду в публичное хранилище)_(only anonymized/aggregated datasets go to Object Storage)

UID.109_(Yandex Cloud Functions validation layer)_(вынести внешнюю проверку и агрегирование из клиента)_(functions validate claim requests, backup integrity, duplicates and produce public aggregate snapshots)
UID.109.01_(Claim result standardization)_(сделать ответ внешнего контура предсказуемым)_(success/suspicious/duplicate/invalid/manual_review result model)
UID.109.02_(Scheduled aggregate jobs)_(готовить global snapshots без жирного backend)_(functions can periodically recompute Object Storage JSON aggregates from validated inputs)

UID.110_(Optional YDB/PostgreSQL dynamic global layer)_(подготовить будущее community/prize registry без обязательности сейчас)_(use YDB or Managed PostgreSQL only when dynamic claims/cohorts/leaderboards/moderation truly require it)
UID.110.01_(Delay heavy DB adoption)_(не усложнять ранние фазы)_(prefer Yandex Disk + Object Storage + Cloud Functions until dynamic queries become necessary)

UID.111_(Prize/global achievements distinction)_(не смешивать локальные ачивки и внешние verified статусы)_(local achievements unlock locally; global/prize/public achievements are externally validated overlays)
UID.111.01_(Group/global achievements later)_(оставить место под community-level награды)_(future public milestones/top-percent/cohort achievements are calculated externally and surfaced separately)

UID.112_(Profile as command center for backup/sync/claim)_(сделать Личный кабинет центром доверительного слоя)_(profile hosts backup controls, linked providers, sync status, current journey, archive, claim CTA, trust status)
UID.112.01_(Offline button zone continuity)_(сохранить идею “личного центра” рядом с OFFLINE)_(profile/offline/achievements/stats/global stats should remain logically близко в пользовательском опыте)
UID.112.02_(Archive tabs for cycles)_(не потерять историчность пути)_(profile UI later renders Текущий путь + Цикл 1 + Цикл 2 + ...)

UID.113_(Legacy cloud-sync refactor path)_(плавно перевести текущий cloud-sync в Yandex-first continuity слой)_(cloud-sync evolves from raw upload helper into transport used by hybrid-sync and backup-vault without owning identity)
UID.113.01_(Cloud-sync vs backup-vault vs hybrid-sync boundary)_(не допустить трёх центров истины)_(backup-vault builds snapshots, cloud-sync transports them, hybrid-sync orchestrates roles/policies)

UID.114_(Event-log-backed prize snapshots)_(сделать prize/archive честно восстанавливаемыми)_(current journey and cycle snapshots should be derivable or verifiable against event/stats history where possible)
UID.114.01_(Cycle close proof fields)_(упростить future validation)_(store cycle summary/checksum/source snapshot metadata at close time)

UID.115_(Launch source + claim/sync telemetry bridge)_(связать продуктовую аналитику и trust flows без утечки приватности)_(mapped telemetry may later track backup-created/restore-started/claim-opened/claim-result/provider-linked under consent only)

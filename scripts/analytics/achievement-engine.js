import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';

export class AchievementEngine {
  constructor() {
    this.achievements = this._createList();
    window.addEventListener('stats:updated', () => this.check());
  }

  _createList() {
    return [
      { id: 'first_blood', name: 'Первая кровь', desc: 'Прослушан 1 трек полностью', icon: '🔥', check: s => s.totalFull >= 1 },
      { id: 'listener_50', name: 'Меломан', desc: '50 полных прослушиваний', icon: '🎧', check: s => s.totalFull >= 50 },
      { id: 'listener_500', name: 'Фанат', desc: '500 полных прослушиваний', icon: '🎸', check: s => s.totalFull >= 500 },
      { id: 'streak_3', name: 'Три дня подряд', desc: 'Стрик 3 дня', icon: '⚡', check: s => s.streak >= 3 },
      { id: 'streak_7', name: 'Неделя', desc: 'Стрик 7 дней', icon: '📅', check: s => s.streak >= 7 },
      { id: 'streak_30', name: 'Месяц', desc: 'Стрик 30 дней', icon: '👑', check: s => s.streak >= 30 },
      { id: 'time_10h', name: '10 часов', desc: '10 часов музыки', icon: '⏳', check: s => s.totalSec >= 36000 },
      { id: 'time_100h', name: 'Сотня часов', desc: '100 часов музыки', icon: '🕰️', check: s => s.totalSec >= 360000 },
      { id: 'night_owl', name: 'Ночная сова', desc: '10 треков с 00:00 до 05:00', icon: '🦉', check: s => s.nightPlays >= 10 },
      { id: 'early_bird', name: 'Ранняя пташка', desc: '10 треков с 05:00 до 08:00', icon: '🌅', check: s => s.earlyPlays >= 10 },
      { id: 'quality_snob', name: 'Качество звука', desc: '10 прослушиваний в Hi', icon: '💎', check: s => s.hiPlays >= 10 },
      { id: 'feature_lyrics', name: 'Караоке', desc: 'Использовал лирику', icon: '📝', check: s => s.featLyrics > 0 }
    ];
  }

  async check() {
    const statsArr = await metaDB.getAllStats();
    const streakData = await metaDB.getGlobal('global_streak');
    
    const agg = {
      totalFull: statsArr.reduce((a, b) => a + (b.globalFullListenCount || 0), 0),
      totalSec: statsArr.reduce((a, b) => a + (b.globalListenSeconds || 0), 0),
      featLyrics: statsArr.reduce((a, b) => a + (b.featuresUsed?.lyrics || 0), 0),
      nightPlays: statsArr.reduce((a, b) => a + (b.featuresUsed?.nightPlay || 0), 0),
      earlyPlays: statsArr.reduce((a, b) => a + (b.featuresUsed?.earlyPlay || 0), 0),
      hiPlays: statsArr.reduce((a, b) => a + (b.featuresUsed?.hiQuality || 0), 0),
      streak: streakData?.value?.current || 0
    };

    const unlockedData = await metaDB.getGlobal('unlocked_achievements') || { value: {} };
    const unlocked = unlockedData.value;
    let changed = false;

    for (const ach of this.achievements) {
      if (!unlocked[ach.id] && ach.check(agg)) {
        unlocked[ach.id] = Date.now();
        changed = true;
        eventLogger.log('ACHIEVEMENT_UNLOCK', null, { id: ach.id });
        window.NotificationSystem?.success(`🏆 Достижение: ${ach.name}`);
      }
    }

    if (changed) {
      await metaDB.setGlobal('unlocked_achievements', unlocked);
    }
    this.broadcast(unlocked, agg.streak);
  }

  broadcast(unlocked, streak) {
    window.dispatchEvent(new CustomEvent('achievements:updated', { 
      detail: { total: this.achievements.length, unlocked: Object.keys(unlocked).length, items: unlocked, streak } 
    }));
  }
}

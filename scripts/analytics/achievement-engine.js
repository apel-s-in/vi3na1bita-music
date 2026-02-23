import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';

export class AchievementEngine {
  constructor() {
    this.achievements = this._generateAchievements();
    window.addEventListener('stats:updated', () => this.checkAchievements());
  }
  _generateAchievements() {
    const list = [{ id: 'first_blood', name: 'Первая кровь', desc: 'Первое полное прослушивание', check: (stats) => stats.globalFullListens?.value >= 1 }];
    for(let i=1; i<=50; i++) list.push({ id: `audiophile_${i}`, name: `Аудиофил ур. ${i}`, desc: `${i * 10} прослушиваний`, check: (stats) => stats.globalFullListens?.value >= (i * 10) });
    for(let i=1; i<=30; i++) list.push({ id: `streak_${i}`, name: `Стабильность ур. ${i}`, desc: `${i * 5} дней подряд`, check: (stats) => stats.currentStreak?.value >= (i * 5) });
    list.push({ id: 'night_owl', name: 'Ночная сова', desc: 'Слушать после полуночи', check: (stats) => stats.special?.nightOwl });
    list.push({ id: 'master_feature', name: 'Мастер функций', desc: 'Использовать lyrics, clip, stems', check: (stats) => Object.keys(stats.features?.details || {}).length >= 3 });
    return list;
  }
  async checkAchievements() {
    const unlocked = (await metaDB.getStat('unlocked_achievements'))?.details || {};
    let newlyUnlocked = 0;
    const currentStats = {
      globalFullListens: await metaDB.getStat('globalFullListens'),
      totalListenTime: await metaDB.getStat('totalListenTime'),
      currentStreak: await metaDB.getStat('currentStreak'),
      features: await metaDB.getStat('features'),
      special: await metaDB.getStat('special')
    };
    for (const ach of this.achievements) {
      if (!unlocked[ach.id] && ach.check(currentStats)) {
        unlocked[ach.id] = Date.now(); newlyUnlocked++;
        eventLogger.log('ACHIEVEMENT_UNLOCK', { id: ach.id });
        window.dispatchEvent(new CustomEvent('app:notify', { detail: { title: 'Достижение разблокировано!', message: ach.name, type: 'achievement' } }));
      }
    }
    if (newlyUnlocked > 0) {
      await metaDB.updateStat('unlocked_achievements', (stat) => { stat.details = unlocked; stat.value = Object.keys(unlocked).length; return stat; });
      window.dispatchEvent(new CustomEvent('achievements:updated', { detail: { total: this.achievements.length, unlocked: Object.keys(unlocked).length } }));
    }
  }
}

import { metaDB } from './meta-db.js';
import { eventLogger } from './event-logger.js';

export class AchievementEngine {
  constructor() {
    this.achievements = this._generateAchievements();
    window.addEventListener('stats:updated', () => this.checkAchievements());
  }
  _generateAchievements() {
    const list = [{ id: 'first_blood', name: 'Первая кровь', desc: 'Первое полное прослушивание', icon: '🩸', check: s => s.globalFullListens?.value >= 1 }];
    for(let i=1; i<=60; i++) list.push({ id: `audiophile_${i}`, name: `Аудиофил ур. ${i}`, desc: `${i * 10} прослушиваний`, icon: '🎧', check: s => s.globalFullListens?.value >= (i * 10) });
    for(let i=1; i<=30; i++) list.push({ id: `streak_${i}`, name: `Стабильность ур. ${i}`, desc: `${i * 5} дней подряд`, icon: '🔥', check: s => s.currentStreak?.value >= (i * 5) });
    list.push({ id: 'night_owl', name: 'Ночная сова', desc: 'Слушать после полуночи', icon: '🦉', check: s => s.special?.nightOwl });
    list.push({ id: 'master_feature', name: 'Мастер функций', desc: 'Использовать lyrics, clip, stems', icon: '🎛️', check: s => Object.keys(s.features?.details || {}).length >= 3 });
    list.push({ id: 'time_lord', name: 'Повелитель времени', desc: 'Слушать музыку 24 часа', icon: '⏳', check: s => s.totalListenTime?.value >= 86400 });
    // Итого 94 ачивки
    return list;
  }
  async checkAchievements() {
    const unlocked = (await metaDB.getStat('unlocked_achievements'))?.details || {};
    let newlyUnlocked = 0;
    const currentStats = {
      globalFullListens: await metaDB.getStat('globalFullListens'),
      totalListenTime: await metaDB.getStat('totalListenTime'),
      currentStreak: await metaDB.getStat('currentStreak'),
      features: await metaDB.getStat('features')
    };
    for (const ach of this.achievements) {
      if (!unlocked[ach.id] && ach.check(currentStats)) {
        unlocked[ach.id] = Date.now(); newlyUnlocked++;
        eventLogger.log('ACHIEVEMENT_UNLOCK', { id: ach.id });
        window.NotificationSystem?.success(`🏆 Достижение: ${ach.name}`);
      }
    }
    if (newlyUnlocked > 0 || Object.keys(unlocked).length === 0) {
      await metaDB.updateStat('unlocked_achievements', (stat) => { stat.details = unlocked; stat.value = Object.keys(unlocked).length; return stat; });
    }
    window.dispatchEvent(new CustomEvent('achievements:updated', { detail: { total: this.achievements.length, unlocked: Object.keys(unlocked).length, items: unlocked } }));
  }
}
